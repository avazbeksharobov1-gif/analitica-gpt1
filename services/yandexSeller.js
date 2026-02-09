const fetch = require('node-fetch');

const BASE_URL = process.env.YANDEX_SELLER_BASE_URL || 'https://api.partner.market.yandex.ru';
const API_KEY = process.env.YANDEX_SELLER_API_KEY;
const AUTH_MODE = (process.env.YANDEX_SELLER_AUTH_MODE || 'api-key').toLowerCase();

/**
 * ID-larni massiv ko'rinishiga keltirish (vergul yoki bo'sh joy bilan bo'lsa ham)
 */
function normalizeIds(list = []) {
  return list
    .flatMap((v) => String(v || '').split(/[,\s;]+/))
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Environment'dan barcha kampaniya ID-larini yig'ib olish
 */
function getCampaignIds() {
  const singleId = process.env.YANDEX_SELLER_CAMPAIGN_ID;
  const multipleIds = process.env.YANDEX_SELLER_CAMPAIGN_IDS;
  
  if (singleId || multipleIds) {
    return normalizeIds([singleId, multipleIds]);
  }
  return [];
}

/**
 * API Key-larni massiv ko'rinishida olish
 */
function getApiKeys() {
  if (process.env.YANDEX_SELLER_API_KEYS) {
    return process.env.YANDEX_SELLER_API_KEYS
      .split(/[,\s;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return API_KEY ? [API_KEY] : [];
}

/**
 * Headerlarni shakllantirish
 */
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

/**
 * Asosiy Request funksiyasi - URL-ni avtomatik to'g'irlaydi
 */
async function request(path, apiKey, options = {}) {
  if (!apiKey) throw new Error('YANDEX_SELLER_API_KEY missing');

  const baseUrl = options.baseUrl || BASE_URL;
  const authMode = options.authMode || AUTH_MODE;
  
  // URL formatini to'g'irlash (v2 va .json qo'shish)
  let fullPath = path.startsWith('/v') ? path : `/v2${path}`;
  
  // .json qo'shish (agar bo'lmasa)
  if (!fullPath.includes('.json')) {
    if (fullPath.includes('?')) {
      fullPath = fullPath.replace('?', '.json?');
    } else {
      fullPath += '.json';
    }
  }

  const url = `${baseUrl}${fullPath}`;
  
  const r = await fetch(url, {
    ...options,
    headers: { ...headers(apiKey, authMode), ...(options.headers || {}) }
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Yandex API Error: ${r.status} ${text} URL: ${url}`);
  }
  return r.json();
}

/**
 * Buyurtmalar statistikasini olish (Loop bilan)
 */
async function fetchOrdersByDate(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  const ids = normalizeIds([campaignId]);
  if (!ids.length) throw new Error('CAMPAIGN_ID missing');

  if (ids.length > 1) {
    const all = [];
    for (const id of ids) {
      try {
        const part = await fetchOrdersByDate(dateFrom, dateTo, id, apiKey, options);
        all.push(...(part.orders || []));
      } catch (e) {
        console.error(`Error for campaign ${id}:`, e.message);
      }
    }
    return { orders: all };
  }

  const singleId = ids[0];
  const orders = [];
  let pageToken = null;

  do {
    const params = pageToken ? `?page_token=${encodeURIComponent(pageToken)}` : '';
    const data = await request(`/campaigns/${singleId}/stats/orders${params}`, apiKey, {
      ...options,
      method: 'POST',
      body: JSON.stringify({ dateFrom, dateTo })
    });
    const result = data.result || data;
    orders.push(...(result.orders || []));
    pageToken = result.paging?.nextPageToken || null;
  } while (pageToken);

  return { orders };
}

/**
 * Qolgan barcha funksiyalar (request funksiyasi orqali ishlaydi)
 */
async function fetchOrdersList(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  const ids = normalizeIds([campaignId]);
  const singleId = ids[0];
  const params = new URLSearchParams({ fromDate: dateFrom, toDate: dateTo, limit: '50' });
  const data = await request(`/campaigns/${singleId}/orders?${params.toString()}`, apiKey, options);
  return { orders: (data.result || data).orders || [] };
}

async function fetchReturnsByDate(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  const ids = normalizeIds([campaignId]);
  const singleId = ids[0];
  const params = new URLSearchParams({ fromDate: dateFrom, toDate: dateTo });
  const data = await request(`/campaigns/${singleId}/returns?${params.toString()}`, apiKey, options);
  return { returns: (data.result || data).returns || [] };
}

async function fetchPayoutsByDate(dateFrom, dateTo, campaignId, apiKey, options = {}) {
  const ids = normalizeIds([campaignId]);
  const singleId = ids[0];
  const data = await request(`/campaigns/${singleId}/payouts?fromDate=${dateFrom}&toDate=${dateTo}`, apiKey, options);
  return { payouts: (data.result || data).payouts || [] };
}

async function fetchReturnById(campaignId, orderId, returnId, apiKey, options = {}) {
  return request(`/campaigns/${campaignId}/orders/${orderId}/returns/${returnId}`, apiKey, options);
}

async function fetchOfferMappingEntries(campaignId, apiKey, pageToken, options = {}) {
  const params = new URLSearchParams({ limit: '200', mapping_kind: 'ALL' });
  if (pageToken) params.set('page_token', pageToken);
  return request(`/campaigns/${campaignId}/offer-mapping-entries?${params.toString()}`, apiKey, options);
}

module.exports = {
  getCampaignIds,
  getApiKeys,
  fetchOrdersByDate,
  fetchOrdersList,
  fetchReturnsByDate,
  fetchPayoutsByDate,
  fetchReturnById,
  fetchOfferMappingEntries
};