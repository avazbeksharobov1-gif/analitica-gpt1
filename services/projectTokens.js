const { prisma } = require('./db');
const { encrypt, decrypt } = require('./crypto');

function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(/[,\s;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parseApiKeys(enc) {
  if (!enc) return [];
  try {
    const raw = decrypt(enc);
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data.filter(Boolean);
    return splitList(raw);
  } catch (e) {
    return splitList(enc);
  }
}

async function getSellerConfig(projectId) {
  const row = await prisma.projectToken.findFirst({
    where: { projectId, type: 'YANDEX_SELLER', isActive: true },
    orderBy: { id: 'desc' }
  });
  if (!row) return null;

  return {
    id: row.id,
    apiKeys: parseApiKeys(row.apiKeysEnc),
    campaignIds: splitList(row.campaignIds),
    baseUrl: row.baseUrl || undefined,
    authMode: row.authMode || undefined
  };
}

async function upsertSellerConfig(projectId, input) {
  const apiKeys = Array.isArray(input.apiKeys) ? input.apiKeys : splitList(input.apiKeys);
  const campaignIds = Array.isArray(input.campaignIds)
    ? input.campaignIds
    : splitList(input.campaignIds);

  const payload = {
    projectId,
    type: 'YANDEX_SELLER',
    name: input.name || 'Seller API',
    apiKeysEnc: encrypt(JSON.stringify(apiKeys)),
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
