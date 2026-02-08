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

function headers(apiKey, authMode) {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (!apiKey) return h;

  const mode = (authMode || AUTH_MODE).toLowerCase();
  if (mode === 'bearer' || mode === 'oauth') {
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

  const baseUrl = options.baseUrl || BASE_URL;
  const authMode = options.authMode || AUTH_MODE;
  const url = `${baseUrl}${path}`;
  const r = await fetch(url, {
    ...options,
    headers: { ...headers(apiKey, authMode), ...(options.headers || {}) }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Yandex Seller API error: ${r.status} ${text}`);
  }
  return r.json();
}

async function fetchOrdersByDate(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }

  const orders = [];
  let pageToken = null;
  do {
    const params = pageToken ? `?page_token=${encodeURIComponent(pageToken)}` : '';
    const data = await request(`/campaigns/${campaignId}/stats/orders${params}`, apiKey, {
      ...options,
      method: 'POST',
      body: JSON.stringify({ dateFrom, dateTo })
    });
    const result = data.result || data;
    orders.push(...(result.orders || []));
    pageToken = result.paging?.nextPageToken || result.nextPageToken || null;
  } while (pageToken);

  return { orders };
}

async function fetchReturnsByDate(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/returns?fromDate=${dateFrom}&toDate=${dateTo}`, apiKey, options);
}

async function fetchPayoutsByDate(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  return request(`/campaigns/${campaignId}/payouts?fromDate=${dateFrom}&toDate=${dateTo}`, apiKey, options);
}

async function fetchOfferMappingEntries(campaignId, apiKey, pageToken, options = {}) {
  if (!campaignId) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  const params = new URLSearchParams();
  params.set('limit', '200');
  params.set('mapping_kind', 'ALL');
  if (pageToken) params.set('page_token', pageToken);
  return request(`/campaigns/${campaignId}/offer-mapping-entries?${params.toString()}`, apiKey, options);
}

module.exports = {
  getCampaignIds,
  getApiKeys,
  fetchOrdersByDate,
  fetchReturnsByDate,
  fetchPayoutsByDate,
  fetchOfferMappingEntries
};
