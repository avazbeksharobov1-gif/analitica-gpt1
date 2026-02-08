const { prisma } = require('./db');
const { encrypt, decrypt } = require('./crypto');

function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(/[,\s;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeApiKeysInput(input) {
  if (Array.isArray(input)) {
    return JSON.stringify(input);
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return JSON.stringify([]);
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return trimmed;
    }
    return JSON.stringify(splitList(trimmed));
  }
  return JSON.stringify([]);
}

function parseApiKeyConfig(enc) {
  if (!enc) return { apiKeys: [], tokenMap: [] };
  let raw = enc;
  try {
    raw = decrypt(enc);
  } catch (e) {
    raw = enc;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const tokenMap = parsed
        .map((item) => {
          if (!item) return null;
          if (typeof item === 'string') return { key: item, campaignIds: [] };
          if (typeof item === 'object') {
            const key = item.key || item.token || item.apiKey;
            const campaignIds = splitList(item.campaignIds || item.campaigns || item.campaign_ids);
            if (!key) return null;
            return { key: String(key), campaignIds };
          }
          return null;
        })
        .filter(Boolean);
      return { apiKeys: tokenMap.map(t => t.key), tokenMap };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tokens)) {
      const tokenMap = parsed.tokens
        .map((item) => {
          if (!item) return null;
          const key = item.key || item.token || item.apiKey;
          const campaignIds = splitList(item.campaignIds || item.campaigns || item.campaign_ids);
          if (!key) return null;
          return { key: String(key), campaignIds };
        })
        .filter(Boolean);
      return { apiKeys: tokenMap.map(t => t.key), tokenMap };
    }
  } catch (e) {
    // ignore, fallback to list
  }

  const apiKeys = splitList(raw);
  return { apiKeys, tokenMap: apiKeys.map(k => ({ key: k, campaignIds: [] })) };
}

async function getSellerConfig(projectId) {
  const row = await prisma.projectToken.findFirst({
    where: { projectId, type: 'YANDEX_SELLER', isActive: true },
    orderBy: { id: 'desc' }
  });
  if (!row) return null;

  const parsed = parseApiKeyConfig(row.apiKeysEnc);
  return {
    id: row.id,
    apiKeys: parsed.apiKeys,
    tokenMap: parsed.tokenMap,
    campaignIds: splitList(row.campaignIds),
    baseUrl: row.baseUrl || undefined,
    authMode: row.authMode || undefined
  };
}

async function upsertSellerConfig(projectId, input) {
  const apiKeysEnc = normalizeApiKeysInput(input.apiKeys);
  const campaignIds = Array.isArray(input.campaignIds)
    ? input.campaignIds
    : splitList(input.campaignIds);

  const payload = {
    projectId,
    type: 'YANDEX_SELLER',
    name: input.name || 'Seller API',
    apiKeysEnc: encrypt(apiKeysEnc),
    campaignIds: campaignIds.join(','),
    baseUrl: input.baseUrl || null,
    authMode: input.authMode || null,
    isActive: true
  };

  const existing = await prisma.projectToken.findFirst({
    where: { projectId, type: 'YANDEX_SELLER', isActive: true }
  });
  if (existing) {
    return prisma.projectToken.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.projectToken.create({ data: payload });
}

module.exports = { getSellerConfig, upsertSellerConfig, splitList };
