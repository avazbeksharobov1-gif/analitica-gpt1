const fetch = require('node-fetch');

const BASE_URL = process.env.YANDEX_SELLER_BASE_URL || 'https://api.partner.market.yandex.ru';
const API_KEY = process.env.YANDEX_SELLER_API_KEY;
const CAMPAIGN_ID = process.env.YANDEX_SELLER_CAMPAIGN_ID;
const AUTH_MODE = (process.env.YANDEX_SELLER_AUTH_MODE || 'api-key').toLowerCase();

function normalizeIds(list = []) {
  return list
    .flatMap((v) => String(v || '').split(/[,\s;]+/))
    .map((v) => v.trim())
    .filter(Boolean);
}

function getCampaignIds() {
  // Avval bitta ID ni tekshiramiz, keyin ko'plikni
  const singleId = process.env.YANDEX_SELLER_CAMPAIGN_ID;
  const multipleIds = process.env.YANDEX_SELLER_CAMPAIGN_IDS;
  
  if (singleId || multipleIds) {
    return normalizeIds([singleId, multipleIds]);
  }
  return [];
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
  if (!apiKey) throw new Error('YANDEX_SELLER_API_KEY missing');

  const baseUrl = options.baseUrl || BASE_URL;
  const authMode = options.authMode || AUTH_MODE;
  
  // URL ni to'g'ri shakllantirish (v2 va .json qo'shildi)
  let fullPath = path.startsWith('/v') ? path : `/v2${path}`;
  if (!fullPath.includes('.json') && !fullPath.includes('?')) {
      fullPath += '.json';
  } else if (fullPath.includes('?') && !fullPath.includes('.json')) {
      fullPath = fullPath.replace('?', '.json?');
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
    // PowerShell dagi kabi /stats/orders.json ishlatamiz
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

// Qolgan funksiyalar (fetchReturnsByDate va hokazo) o'zgarishsiz qolishi mumkin, 
// chunki request() funksiyasi URL-ni avtomatik to'g'irlaydi.

module.exports = {
  getCampaignIds,
  fetchOrdersByDate,
  // ... qolganlarini ham export qiling
};
