const { prisma } = require('./db');
const { forecast30DaysCompare } = require('./forecast');

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function rangeDates(from, to) {
  const start = toDateOnly(from);
  const end = toDateOnly(to);
  return { start, end };
}

function dateKey(d) {
  return toDateOnly(d).toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

async function sumExpenses(projectId, from, to) {
  const { start, end } = rangeDates(from, to);
  const r = await prisma.expense.aggregate({
    where: { projectId, date: { gte: start, lte: end } },
    _sum: { amount: true }
  });
  return r._sum.amount || 0;
}

async function sumDaily(projectId, from, to) {
  const { start, end } = rangeDates(from, to);
  const rows = await prisma.sellerDaily.findMany({
    where: { projectId, date: { gte: start, lte: end } }
  });
  return rows.reduce(
    (a, b) => ({
      revenue: a.revenue + b.revenue,
      orders: a.orders + b.orders,
      fees: a.fees + b.fees,
      acquiring: a.acquiring + b.acquiring,
      logistics: a.logistics + b.logistics,
      returns: a.returns + b.returns
    }),
    { revenue: 0, orders: 0, fees: 0, acquiring: 0, logistics: 0, returns: 0 }
  );
}

async function cogsByItems(projectId, from, to) {
  const { start, end } = rangeDates(from, to);
  const items = await prisma.sellerItemDaily.findMany({
    where: { projectId, date: { gte: start, lte: end } }
  });
  if (!items.length) return 0;

  const skus = [...new Set(items.map(i => i.sku))];
  const products = await prisma.product.findMany({
    where: { projectId, sku: { in: skus } }
  });
  const costMap = new Map(products.map(p => [p.sku, p.costPrice]));

  return items.reduce((sum, it) => {
    const cost = costMap.get(it.sku) || 0;
    return sum + it.quantity * cost;
  }, 0);
}

async function getKpi(projectId, from, to) {
  const [sales, expenses, cogs] = await Promise.all([
    sumDaily(projectId, from, to),
    sumExpenses(projectId, from, to),
    cogsByItems(projectId, from, to)
  ]);

  const profit =
    sales.revenue -
    expenses -
    sales.fees -
    sales.acquiring -
    sales.logistics -
    sales.returns -
    cogs;

  return {
    revenue: sales.revenue,
    orders: sales.orders,
    fees: sales.fees,
    acquiring: sales.acquiring,
    logistics: sales.logistics,
    returns: sales.returns,
    expenses,
    cogs,
    profit
  };
}

async function getCompareStats(projectId) {
  const today = new Date();
  const end = toDateOnly(today);
  const startThis = new Date(end);
  startThis.setDate(startThis.getDate() - 6);
  const startPrev = new Date(startThis);
  startPrev.setDate(startPrev.getDate() - 7);
  const endPrev = new Date(startThis);
  endPrev.setDate(endPrev.getDate() - 1);

  const [thisWeek, lastWeek] = await Promise.all([
    getKpi(projectId, startThis, end),
    getKpi(projectId, startPrev, endPrev)
  ]);

  return { thisWeek, lastWeek };
}

async function getForecastCompare(projectId) {
  const { thisWeek, lastWeek } = await getCompareStats(projectId);
  return forecast30DaysCompare(thisWeek.revenue, lastWeek.revenue);
}

async function listProjects() {
  return prisma.project.findMany({ orderBy: { id: 'asc' } });
}

async function getProject(projectId) {
  return prisma.project.findUnique({ where: { id: projectId } });
}

async function addExpense(projectId, categoryCode, amount, note) {
  const category = await prisma.expenseCategory.findUnique({
    where: { code: categoryCode }
  });
  if (!category) throw new Error('CATEGORY_NOT_FOUND');

  return prisma.expense.create({
    data: {
      projectId,
      categoryId: category.id,
      amount,
      date: toDateOnly(new Date()),
      note
    }
  });
}

async function getProductProfit(projectId, from, to) {
  const { start, end } = rangeDates(from, to);
  const items = await prisma.sellerItemDaily.findMany({
    where: { projectId, date: { gte: start, lte: end } }
  });
  if (!items.length) return [];

  const skus = [...new Set(items.map(i => i.sku))];
  const products = await prisma.product.findMany({
    where: { projectId, sku: { in: skus } }
  });
  const productMap = new Map(products.map(p => [p.sku, p]));

  const agg = new Map();
  for (const it of items) {
    const prev = agg.get(it.sku) || {
      sku: it.sku,
      quantity: 0,
      revenue: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0
    };
    prev.quantity += it.quantity;
    prev.revenue += it.revenue;
    prev.fees += it.fees || 0;
    prev.acquiring += it.acquiring || 0;
    prev.logistics += it.logistics || 0;
    prev.returns += it.returns || 0;
    agg.set(it.sku, prev);
  }

  const result = [];
  for (const row of agg.values()) {
    const p = productMap.get(row.sku);
    const costPrice = p ? p.costPrice : 0;
    const cogs = row.quantity * costPrice;
    const profit =
      row.revenue - cogs - row.fees - row.acquiring - row.logistics - row.returns;
    const margin = row.revenue ? (profit / row.revenue) * 100 : 0;
    result.push({
      sku: row.sku,
      name: p ? p.name : row.sku,
      quantity: row.quantity,
      revenue: row.revenue,
      costPrice,
      cogs,
      fees: row.fees,
      acquiring: row.acquiring,
      logistics: row.logistics,
      returns: row.returns,
      profit,
      margin
    });
  }

  return result.sort((a, b) => b.profit - a.profit);
}

async function getDailySeries(projectId, from, to) {
  const { start, end } = rangeDates(from, to);

  const [dailyRows, expenseRows, itemRows, products] = await Promise.all([
    prisma.sellerDaily.findMany({
      where: { projectId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' }
    }),
    prisma.expense.findMany({
      where: { projectId, date: { gte: start, lte: end } }
    }),
    prisma.sellerItemDaily.findMany({
      where: { projectId, date: { gte: start, lte: end } }
    }),
    prisma.product.findMany({ where: { projectId } })
  ]);

  const costMap = new Map(products.map(p => [p.sku, p.costPrice]));
  const dailyMap = new Map();

  for (const r of dailyRows) {
    dailyMap.set(dateKey(r.date), {
      revenue: r.revenue || 0,
      orders: r.orders || 0,
      fees: r.fees || 0,
      acquiring: r.acquiring || 0,
      logistics: r.logistics || 0,
      returns: r.returns || 0,
      expenses: 0,
      cogs: 0
    });
  }

  for (const e of expenseRows) {
    const key = dateKey(e.date);
    const row = dailyMap.get(key) || {
      revenue: 0,
      orders: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0,
      expenses: 0,
      cogs: 0
    };
    row.expenses += e.amount || 0;
    dailyMap.set(key, row);
  }

  for (const it of itemRows) {
    const key = dateKey(it.date);
    const row = dailyMap.get(key) || {
      revenue: 0,
      orders: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0,
      expenses: 0,
      cogs: 0
    };
    const cost = costMap.get(it.sku) || 0;
    row.cogs += (it.quantity || 0) * cost;
    dailyMap.set(key, row);
  }

  const result = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = dateKey(d);
    const row = dailyMap.get(key) || {
      revenue: 0,
      orders: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0,
      expenses: 0,
      cogs: 0
    };
    const profit =
      row.revenue -
      row.fees -
      row.acquiring -
      row.logistics -
      row.returns -
      row.expenses -
      row.cogs;
    result.push({
      date: key,
      ...row,
      profit
    });
  }

  return result;
}

async function getSkuSeries(projectId, sku, from, to) {
  if (!sku) return [];
  const { start, end } = rangeDates(from, to);

  const [rows, product] = await Promise.all([
    prisma.sellerItemDaily.findMany({
      where: { projectId, sku, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' }
    }),
    prisma.product.findUnique({ where: { projectId_sku: { projectId, sku } } })
  ]);

  const costPrice = product ? product.costPrice : 0;
  const map = new Map();

  for (const r of rows) {
    const key = dateKey(r.date);
    const prev = map.get(key) || {
      quantity: 0,
      revenue: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0
    };
    prev.quantity += r.quantity || 0;
    prev.revenue += r.revenue || 0;
    prev.fees += r.fees || 0;
    prev.acquiring += r.acquiring || 0;
    prev.logistics += r.logistics || 0;
    prev.returns += r.returns || 0;
    map.set(key, prev);
  }

  const result = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = dateKey(d);
    const row = map.get(key) || {
      quantity: 0,
      revenue: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0
    };
    const cogs = (row.quantity || 0) * costPrice;
    const profit =
      row.revenue -
      row.fees -
      row.acquiring -
      row.logistics -
      row.returns -
      cogs;
    result.push({
      date: key,
      ...row,
      cogs,
      profit
    });
  }

  return result;
}

module.exports = {
  getKpi,
  getCompareStats,
  getForecastCompare,
  listProjects,
  getProject,
  addExpense,
  getProductProfit,
  getDailySeries,
  getSkuSeries
};
