require('dotenv').config();

const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const QuickChart = require('quickchart-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

/* ================== ENV ================== */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 8080;

if (!BOT_TOKEN || !WEBHOOK_URL) {
  console.error('❌ TELEGRAM_BOT_TOKEN ёки WEBHOOK_URL йўқ');
  process.exit(1);
}

/* ================== EXPRESS ================== */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_, res) =>
  res.json({ ok: true, status: 'alive' })
);

/* ================== TELEGRAM ================== */
const bot = new Telegraf(BOT_TOKEN);

/* ---------- ADMIN ---------- */
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(String)
  : [];

const isAdmin = (ctx) =>
  ADMIN_IDS.includes(String(ctx.from.id));

/* ---------- USERS ---------- */
async function ensureUser(ctx) {
  await prisma.user.upsert({
    where: { tgId: String(ctx.from.id) },
    update: {},
    create: { tgId: String(ctx.from.id), plan: 'free' }
  });
}

/* ================== COMMANDS ================== */
bot.start(async (ctx) => {
  await ensureUser(ctx);
  ctx.reply(
    '✅ <b>Analitica GPT</b>\n\n' +
    '/stats — ҳисобот\n' +
    '/chart — PNG график\n' +
    '/forecast — AI прогноз\n' +
    '/pdf — PDF ҳисобот',
    { parse_mode: 'HTML' }
  );
});

bot.command('stats', async (ctx) => {
  await ensureUser(ctx);
  const s = await prisma.stats.findFirst({ orderBy: { id: 'desc' } });
  if (!s) return ctx.reply('Маълумот йўқ');

  ctx.reply(
    `📊 <b>Ҳисобот</b>\n\n` +
    `💰 Даромад: <b>${s.revenue}</b>\n` +
    `📦 Буюртма: <b>${s.orders}</b>\n` +
    `📢 Реклама: <b>${s.ads}</b>`,
    { parse_mode: 'HTML' }
  );
});

bot.command('chart', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only');

  const s = await prisma.stats.findFirst({ orderBy: { id: 'desc' } });
  const chart = new QuickChart();

  chart.setConfig({
    type: 'bar',
    data: {
      labels: ['Revenue', 'Orders', 'Ads'],
      datasets: [{
        label: 'Yandex Stats',
        data: [s.revenue, s.orders, s.ads],
        backgroundColor: ['#22c55e', '#3b82f6', '#f97316']
      }]
    }
  });

  await ctx.replyWithPhoto(chart.getUrl(), { caption: '📈 PNG график' });
});

bot.command('forecast', async (ctx) => {
  const s = await prisma.stats.findFirst({ orderBy: { id: 'desc' } });
  const grow = (n) => Math.round(n * 1.1);

  ctx.reply(
    `🧠 <b>AI прогноз</b>\n\n` +
    `💰 ${grow(s.revenue)}\n` +
    `📦 ${grow(s.orders)}\n` +
    `📢 ${grow(s.ads)}`,
    { parse_mode: 'HTML' }
  );
});

bot.command('pdf', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only');

  const s = await prisma.stats.findFirst({ orderBy: { id: 'desc' } });
  const file = '/tmp/report.pdf';
  const doc = new PDFDocument();

  doc.pipe(fs.createWriteStream(file));
  doc.fontSize(18).text('Analitica Report\n\n');
  doc.fontSize(12)
    .text(`Revenue: ${s.revenue}`)
    .text(`Orders: ${s.orders}`)
    .text(`Ads: ${s.ads}`)
    .text(`Date: ${new Date().toLocaleString()}`);
  doc.end();

  await ctx.replyWithDocument({ source: file, filename: 'report.pdf' });
});

/* ================== CRON (05:00) ================== */
cron.schedule('0 5 * * *', async () => {
  const s = await prisma.stats.findFirst({ orderBy: { id: 'desc' } });
  if (!s) return;

  for (const id of ADMIN_IDS) {
    await bot.telegram.sendMessage(
      id,
      `⏰ <b>Авто ҳисобот</b>\n\n` +
      `💰 ${s.revenue}\n📦 ${s.orders}\n📢 ${s.ads}`,
      { parse_mode: 'HTML' }
    );
  }
});

/* ================== WEBHOOK ================== */
app.post('/telegram', (req, res) => {
  bot.handleUpdate(req.body, res);
});

/* ================== START ================== */
app.listen(PORT, async () => {
  console.log('🚀 Server running on', PORT);

  try {
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
    console.log('✅ Webhook уланди');
  } catch (e) {
    console.error('❌ Webhook хатоси:', e.message);
  }
});

























