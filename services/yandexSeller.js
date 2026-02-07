const fetch = require('node-fetch');

const BASE_URL = process.env.YANDEX_SELLER_BASE_URL || 'https://api.partner.market.yandex.ru';
const API_KEY = process.env.YANDEX_SELLER_API_KEY;
const CAMPAIGN_ID = process.env.YANDEX_SELLER_CAMPAIGN_ID;
const AUTH_MODE = (process.env.YANDEX_SELLER_AUTH_MODE || 'api-key').toLowerCase();

function getCampaignIds() {
  const fromIds = process.env.YANDEX_SELLER_CAMPAIGN_IDS;
  if (fromIds) {
    return fromIds
      .split(/[,\s;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (CAMPAIGN_ID) {
    return CAMPAIGN_ID
      .split(/[,\s;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function getApiKeys() {
  if (process.env.YANDEX_SELLER_API_KEYS) {
    return process.env.YANDEX_SELLER_API_KEYS
      .split(/[,\s;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return API_KEY ? [API_KEY] : [];
}

function headers(apiKey) {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (!apiKey) return h;

  if (AUTH_MODE === 'bearer' || AUTH_MODE === 'oauth') {
    h.Authorization = `Bearer ${apiKey}`;
  } else {
    h['Api-Key'] = apiKey;
  }
  return h;
}

async function request(path, apiKey, options = {}) {
  if (!apiKey) {
    throw new Error('YANDEX_SELLER_API_KEY missing');
  }

  const url = `${BASE_URL}${path}`;
  const r = await fetch(url, { ...options, headers: { ...headers(apiKey), ...(options.headers || {}) } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Yandex Seller API error: ${r.status} ${text}`);
  }
  return r.json();
}

async function fetchOrdersByDate(dateFrom, dateTo, campaignId, apiKey) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/orders?fromDate=${dateFrom}&toDate=${dateTo}`, apiKey);
}

async function fetchReturnsByDate(dateFrom, dateTo, campaignId, apiKey) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/returns?fromDate=${dateFrom}&toDate=${dateTo}`, apiKey);
}

async function fetchPayoutsByDate(dateFrom, dateTo, campaignId, apiKey) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/payouts?fromDate=${dateFrom}&toDate=${dateTo}`, apiKey);
}

module.exports = {
  getCampaignIds,
  getApiKeys,
  fetchOrdersByDate,
  fetchReturnsByDate,
  fetchPayoutsByDate
};
