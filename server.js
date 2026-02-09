const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const { exportExcel } = require('./exporter');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Telegram (optional)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// Yandex Market campaigns
const DEFAULT_CAMPAIGNS = [
  { id: 'CAMPAIGN_ID_1', token: 'YANDEX_TOKEN_1' },
  { id: 'CAMPAIGN_ID_2', token: 'YANDEX_TOKEN_2' }
];

let CAMPAIGNS = DEFAULT_CAMPAIGNS;
if (process.env.YANDEX_CAMPAIGNS) {
  try {
    const parsed = JSON.parse(process.env.YANDEX_CAMPAIGNS);
    if (Array.isArray(parsed) && parsed.length) CAMPAIGNS = parsed;
  } catch (e) {
    console.warn('Invalid YANDEX_CAMPAIGNS JSON, using defaults');
  }
}

const COSTS_FILE = path.join(__dirname, 'costs.json');

function loadCosts() {
  if (!fs.existsSync(COSTS_FILE)) {
    fs.writeFileSync(COSTS_FILE, JSON.stringify({ itemCosts: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(COSTS_FILE));
}

function dateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function inPeriod(d, now, period) {
  if (period === 'day') return d.toDateString() === now.toDateString();
  if (period === 'week') return (now - d) <= 7 * 86400000;
  if (period === 'month') return (now - d) <= 30 * 86400000;
  return true;
}

async function fetchOrders(campaign) {
  const url = `https://api.partner.market.yandex.ru/v2/campaigns/${campaign.id}/orders.json?page_size=50`;
  const res = await axios.get(url, { headers: { 'Api-Key': campaign.token } });
  return res.data.orders || [];
}

async function getStats(period = 'all') {
  const now = new Date();
  const costs = loadCosts();

  const result = {
    delivered: {
      revenue: 0,
      marketing: 0,
      logistics: 0,
      acquiring: 0,
      totalItemCost: 0
    },
    productDetails: {},
    timeSeries: {
      daily: {},
      monthly: {}
    }
  };

  for (const camp of CAMPAIGNS) {
    try {
      const orders = await fetchOrders(camp);
      for (const order of orders) {
        const d = new Date(order.creationDate);
        if (!inPeriod(d, now, period)) continue;
        if (['CANCELLED', 'REJECTED'].includes(order.status)) continue;

        for (const item of order.items) {
          const sku = item.offerId;
          const count = Number(item.count) || 0;
          const price = Number(item.price) || 0;
          const cost = Number(costs.itemCosts[sku] || 0);

          const marketing = price * 0.10 * count;
          const acquiring = price * 0.01 * count;
          const logistics = 20000 * count;

          if (!result.productDetails[sku]) {
            result.productDetails[sku] = {
              name: item.offerName || sku,
              count: 0,
              revenue: 0,
              marketing: 0,
              logistics: 0,
              acquiring: 0,
              cost
            };
          }

          const p = result.productDetails[sku];
          p.count += count;
          p.revenue += price * count;
          p.marketing += marketing;
          p.logistics += logistics;
          p.acquiring += acquiring;
          p.cost = cost;

          result.delivered.revenue += price * count;
          result.delivered.marketing += marketing;
          result.delivered.logistics += logistics;
          result.delivered.acquiring += acquiring;
          result.delivered.totalItemCost += cost * count;

          const dayKey = dateKey(d);
          if (!result.timeSeries.daily[dayKey]) {
            result.timeSeries.daily[dayKey] = { revenue: 0, expenses: 0, profit: 0 };
          }
          const daily = result.timeSeries.daily[dayKey];
          daily.revenue += price * count;
          daily.expenses += marketing + logistics + acquiring + cost * count;
          daily.profit = daily.revenue - daily.expenses;

          const mKey = monthKey(d);
          if (!result.timeSeries.monthly[mKey]) {
            result.timeSeries.monthly[mKey] = { revenue: 0, expenses: 0, profit: 0 };
          }
          const monthly = result.timeSeries.monthly[mKey];
          monthly.revenue += price * count;
          monthly.expenses += marketing + logistics + acquiring + cost * count;
          monthly.profit = monthly.revenue - monthly.expenses;
        }
      }
    } catch (e) {
      console.log(`API ERROR ${camp.id}:`, e.message);
    }
  }

  result.timeSeries.daily = Object.keys(result.timeSeries.daily)
    .sort()
    .map(k => ({ date: k, ...result.timeSeries.daily[k] }));

  result.timeSeries.monthly = Object.keys(result.timeSeries.monthly)
    .sort()
    .map(k => ({ month: k, ...result.timeSeries.monthly[k] }));

  return result;
}

// API
app.get('/api/stats', async (req, res) => {
  const stats = await getStats(req.query.period || 'all');
  res.json(stats);
});

app.post('/api/save-cost', (req, res) => {
  const data = loadCosts();
  data.itemCosts[req.body.sku] = Number(req.body.cost);
  fs.writeFileSync(COSTS_FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// Excel export
app.get('/api/export/excel', async (req, res) => {
  const stats = await getStats(req.query.period || 'all');
  const file = await exportExcel(stats);
  res.download(file);
});

// Telegram daily report
if (bot && TELEGRAM_CHAT_ID) {
  setInterval(async () => {
    const s = await getStats('day');
    const profit =
      s.delivered.revenue -
      s.delivered.marketing -
      s.delivered.logistics -
      s.delivered.acquiring -
      s.delivered.totalItemCost;

    bot.telegram.sendMessage(
      TELEGRAM_CHAT_ID,
      `KUNLIK HISOBOT\nSavdo: ${Math.round(s.delivered.revenue)}\nChiqim: ${Math.round(
        s.delivered.marketing + s.delivered.logistics + s.delivered.acquiring
      )}\nFoyda: ${Math.round(profit)}`
    );
  }, 86400000);

  bot.launch();
} else {
  console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing)');
}

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Server running on', PORT));
