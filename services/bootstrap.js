const { prisma } = require('./db');

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

module.exports = { ensureCategories, ensureProject, DEFAULT_CATEGORIES };
