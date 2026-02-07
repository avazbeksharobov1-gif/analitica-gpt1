const fetch = require('node-fetch');

const BASE_URL = process.env.YANDEX_SELLER_BASE_URL || 'https://api.partner.market.yandex.ru';
const API_KEY = process.env.YANDEX_SELLER_API_KEY;
const CAMPAIGN_ID = process.env.YANDEX_SELLER_CAMPAIGN_ID;
const AUTH_MODE = (process.env.YANDEX_SELLER_AUTH_MODE || 'api-key').toLowerCase();

function getCampaignIds() {
  if (process.env.YANDEX_SELLER_CAMPAIGN_IDS) {
    return process.env.YANDEX_SELLER_CAMPAIGN_IDS.split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return CAMPAIGN_ID ? [CAMPAIGN_ID] : [];
}

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
  if (!API_KEY) {
    throw new Error('YANDEX_SELLER_API_KEY missing');
  }

  const url = `${BASE_URL}${path}`;
  const r = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Yandex Seller API error: ${r.status} ${text}`);
  }
  return r.json();
}

async function fetchOrdersByDate(dateFrom, dateTo, campaignId) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/orders?fromDate=${dateFrom}&toDate=${dateTo}`);
}

async function fetchReturnsByDate(dateFrom, dateTo, campaignId) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/returns?fromDate=${dateFrom}&toDate=${dateTo}`);
}

async function fetchPayoutsByDate(dateFrom, dateTo, campaignId) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/payouts?fromDate=${dateFrom}&toDate=${dateTo}`);
}

module.exports = {
  getCampaignIds,
  fetchOrdersByDate,
  fetchReturnsByDate,
  fetchPayoutsByDate
};
