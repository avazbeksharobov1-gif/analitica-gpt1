const fetch = require('node-fetch');

const BASE_URL = process.env.YANDEX_SELLER_BASE_URL || 'https://api.partner.market.yandex.ru';
const API_KEY = process.env.YANDEX_SELLER_API_KEY;
const CAMPAIGN_ID = process.env.YANDEX_SELLER_CAMPAIGN_ID;
const AUTH_MODE = (process.env.YANDEX_SELLER_AUTH_MODE || 'api-key').toLowerCase();

function headers() {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (!API_KEY) return h;

  if (AUTH_MODE === 'bearer' || AUTH_MODE === 'oauth') {
    h.Authorization = `Bearer ${API_KEY}`;
  } else {
    h['Api-Key'] = API_KEY;
  }
  return h;
}

async function request(path, options = {}) {
  if (!API_KEY || !CAMPAIGN_ID) {
    throw new Error('YANDEX_SELLER_API_KEY or YANDEX_SELLER_CAMPAIGN_ID missing');
  }

  const url = `${BASE_URL}${path}`;
  const r = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Yandex Seller API error: ${r.status} ${text}`);
  }
  return r.json();
}

async function fetchOrdersByDate(dateFrom, dateTo) {
  return request(`/campaigns/${CAMPAIGN_ID}/orders?fromDate=${dateFrom}&toDate=${dateTo}`);
}

async function fetchReturnsByDate(dateFrom, dateTo) {
  return request(`/campaigns/${CAMPAIGN_ID}/returns?fromDate=${dateFrom}&toDate=${dateTo}`);
}

async function fetchPayoutsByDate(dateFrom, dateTo) {
  return request(`/campaigns/${CAMPAIGN_ID}/payouts?fromDate=${dateFrom}&toDate=${dateTo}`);
}

module.exports = {
  fetchOrdersByDate,
  fetchReturnsByDate,
  fetchPayoutsByDate
};
