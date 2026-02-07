const { prisma } = require('./db');
const { hashPassword } = require('./auth');
const { upsertSellerConfig } = require('./projectTokens');

const DEFAULT_CATEGORIES = [
  { code: 'marketing', name: 'Marketing' },
  { code: 'svet', name: 'Svet' },
  { code: 'gaz', name: 'Gaz' },
  { code: 'suv', name: 'Suv' },
  { code: 'ozik', name: 'Ozik-ovqat' },
  { code: 'moshina', name: 'Moshina' },
  { code: 'soliq', name: 'Soliq' },
  { code: 'kvartp', name: 'Kvartplata' }
];

async function ensureCategories() {
  for (const c of DEFAULT_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: c
    });
  }
}

async function ensureProject() {
  const existing = await prisma.project.findFirst({ orderBy: { id: 'asc' } });
  if (existing) return existing;
  return prisma.project.create({ data: { name: 'Main Project' } });
}

async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true
    }
  });
}

async function ensureAdminMemberships(adminUser) {
  if (!adminUser) return;
  const projects = await prisma.project.findMany({ orderBy: { id: 'asc' } });
  for (const p of projects) {
    const existing = await prisma.projectUser.findUnique({
      where: { projectId_userId: { projectId: p.id, userId: adminUser.id } }
    });
    if (!existing) {
      await prisma.projectUser.create({
        data: { projectId: p.id, userId: adminUser.id, role: 'OWNER' }
      });
    }
  }
}

async function ensureAdminSubscription(adminUser) {
  if (!adminUser) return;
  const existing = await prisma.subscription.findFirst({
    where: { userId: adminUser.id },
    orderBy: { id: 'desc' }
  });
  if (existing) return;
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 3650);
  await prisma.subscription.create({
    data: {
      userId: adminUser.id,
      plan: 'BUSINESS',
      status: 'ACTIVE',
      price: 0,
      currentPeriodStart: now,
      currentPeriodEnd: end
    }
  });
}

async function ensureSellerTokenFromEnv() {
  const apiKeys = process.env.YANDEX_SELLER_API_KEYS || process.env.YANDEX_SELLER_API_KEY;
  const campaignIds =
    process.env.YANDEX_SELLER_CAMPAIGN_IDS || process.env.YANDEX_SELLER_CAMPAIGN_ID;
  if (!apiKeys || !campaignIds) return;

  const project = await prisma.project.findFirst({ orderBy: { id: 'asc' } });
  if (!project) return;

  const existing = await prisma.projectToken.findFirst({
    where: { projectId: project.id, type: 'YANDEX_SELLER' }
  });
  if (existing) return;

  await upsertSellerConfig(project.id, {
    apiKeys,
    campaignIds,
    baseUrl: process.env.YANDEX_SELLER_BASE_URL,
    authMode: process.env.YANDEX_SELLER_AUTH_MODE
  });
}

module.exports = {
  ensureCategories,
  ensureProject,
  ensureAdminUser,
  ensureAdminMemberships,
  ensureAdminSubscription,
  ensureSellerTokenFromEnv,
  DEFAULT_CATEGORIES
};
