const { prisma } = require('./db');
const {
  getCampaignIds,
  getApiKeys,
  fetchOfferMappingEntries
} = require('./yandexSeller');
const { getSellerConfig } = require('./projectTokens');

async function syncCatalog(projectId) {
  const config = await getSellerConfig(projectId);
  const campaignIds = config?.campaignIds?.length ? config.campaignIds : getCampaignIds();
  const apiKeys = config?.apiKeys?.length ? config.apiKeys : getApiKeys();
  const tokenMap = config?.tokenMap?.length ? config.tokenMap : [];
  const requestOptions = {
    baseUrl: config?.baseUrl,
    authMode: config?.authMode
  };
  const hasTokenMapCampaigns = tokenMap.some((t) => t.campaignIds && t.campaignIds.length);
  if (!campaignIds.length && !hasTokenMapCampaigns) {
    throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  }
  if (!apiKeys.length) throw new Error('YANDEX_SELLER_API_KEY missing');

  const skuMap = new Map();

  const pairs = [];
  if (tokenMap.length) {
    for (const entry of tokenMap) {
      const key = entry.key;
      if (!key) continue;
      const camps = entry.campaignIds && entry.campaignIds.length ? entry.campaignIds : campaignIds;
      for (const campaignId of camps) {
        pairs.push({ campaignId, apiKey: key });
      }
    }
  } else {
    for (const apiKey of apiKeys) {
      for (const campaignId of campaignIds) {
        pairs.push({ campaignId, apiKey });
      }
    }
  }

  for (const { apiKey, campaignId } of pairs) {
    let pageToken = null;
    do {
      try {
        const data = await fetchOfferMappingEntries(campaignId, apiKey, pageToken, requestOptions);
        const result = data.result || data;
        const entries = result.offerMappingEntries || result.offerMappings || [];
        for (const entry of entries) {
          const offer = entry.offer || entry.offerMapping || entry;
          const sku = String(offer.shopSku || offer.offerId || offer.id || '').trim();
          if (!sku) continue;
          const name = String(offer.name || entry.offerName || sku).trim();
          if (!skuMap.has(sku)) {
            skuMap.set(sku, name || sku);
          }
        }

        pageToken =
          result.paging?.nextPageToken ||
          result.nextPageToken ||
          null;
      } catch (e) {
        console.error('Yandex catalog error:', e.message);
        pageToken = null;
      }
    } while (pageToken);
  }

  for (const [sku, name] of skuMap.entries()) {
    const existing = await prisma.product.findUnique({
      where: { projectId_sku: { projectId, sku } }
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { name }
      });
    } else {
      await prisma.product.create({
        data: { projectId, sku, name, costPrice: 0 }
      });
    }
  }

  return { total: skuMap.size };
}

module.exports = { syncCatalog };
