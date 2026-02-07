const { prisma } = require('./db');

const DEFAULT_CATEGORIES = [
  { code: 'svet', name: 'Свет' },
  { code: 'gaz', name: 'Газ' },
  { code: 'suv', name: 'Сув' },
  { code: 'ozik', name: 'Озиқ-овқат' },
  { code: 'moshina', name: 'Мошина' },
  { code: 'soliq', name: 'Солиқ' },
  { code: 'kvartp', name: 'Квартплата' }
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

module.exports = { ensureCategories, ensureProject, DEFAULT_CATEGORIES };