const { prisma } = require('./db');
const {
  getCampaignIds,
  getApiKeys,
  fetchOfferMappingEntries
} = require('./yandexSeller');

async function syncCatalog(projectId) {
  const campaignIds = getCampaignIds();
  const apiKeys = getApiKeys();
  if (!campaignIds.length) throw new Error('YANDEX_SELLER_CAMPAIGN_ID(S) missing');
  if (!apiKeys.length) throw new Error('YANDEX_SELLER_API_KEY missing');

  const skuMap = new Map();

  for (const apiKey of apiKeys) {
    for (const campaignId of campaignIds) {
      let pageToken = null;
      do {
        const data = await fetchOfferMappingEntries(campaignId, apiKey, pageToken);
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
      } while (pageToken);
    }
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
