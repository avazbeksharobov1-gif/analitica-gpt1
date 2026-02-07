const {
  getKpi,
  getCompareStats,
  getForecastCompare,
  getProductProfit
} = require('../services/analytics');
const { aiInsight, aiRecommend, aiAnomalyDetect, aiProductProfit } = require('../services/ai');
const { syncDay } = require('../services/ingest');
const { prisma } = require('../services/db');

module.exports = (app) => {
  function aiFail(res, label, err, debug) {
    const msg = err && err.message ? err.message : String(err || 'Unknown error');
    console.error(`AI ${label} error:`, msg);
    res.status(500).send(debug ? `AI ${label} error: ${msg}` : `AI ${label} not available`);
  }
  app.get('/api/stats', async (req, res) => {
    const projectId = req.query.project ? Number(req.query.project) : 1;
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date();
    res.json(await getKpi(projectId, from, to));
  });

  app.get('/api/compare', async (req, res) => {
    const projectId = req.query.project ? Number(req.query.project) : 1;
    res.json(await getCompareStats(projectId));
  });

  app.get('/api/forecast-compare', async (req, res) => {
    const projectId = req.query.project ? Number(req.query.project) : 1;
    res.json(await getForecastCompare(projectId));
  });

  app.get('/api/insight', async (req, res) => {
    try {
      const projectId = req.query.project ? Number(req.query.project) : 1;
      const { thisWeek, lastWeek } = await getCompareStats(projectId);
      const text = await aiInsight(lastWeek.revenue, thisWeek.revenue);
      res.send(text);
    } catch (e) {
      aiFail(res, 'insight', e, req.query.debug === '1');
    }
  });

  app.get('/api/recommend', async (req, res) => {
    try {
      const projectId = req.query.project ? Number(req.query.project) : 1;
      const today = new Date();
      const text = await aiRecommend(await getKpi(projectId, today, today));
      res.send(text);
    } catch (e) {
      aiFail(res, 'recommendation', e, req.query.debug === '1');
    }
  });

  app.get('/api/anomaly', async (req, res) => {
    try {
      const projectId = req.query.project ? Number(req.query.project) : 1;
      const days = req.query.days ? Number(req.query.days) : 30;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));

      const rows = await prisma.sellerDaily.findMany({
        where: { projectId, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' }
      });

      const series = rows.map(r => ({ date: r.date.toISOString().slice(0, 10), revenue: r.revenue }));
      const text = await aiAnomalyDetect(series);
      res.send(text);
    } catch (e) {
      aiFail(res, 'anomaly', e, req.query.debug === '1');
    }
  });

  app.get('/api/products/insight', async (req, res) => {
    try {
      const projectId = req.query.project ? Number(req.query.project) : 1;
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      const items = await getProductProfit(projectId, from, to);
      const text = await aiProductProfit(items);
      res.send(text);
    } catch (e) {
      aiFail(res, 'product', e, req.query.debug === '1');
    }
  });

  app.get('/api/products/profit', async (req, res) => {
    try {
      const projectId = req.query.project ? Number(req.query.project) : 1;
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      const items = await getProductProfit(projectId, from, to);
      res.json(items);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/projects', async (_, res) => {
    const list = await prisma.project.findMany({ orderBy: { id: 'asc' } });
    res.json(list);
  });

  app.post('/api/projects', async (req, res) => {
    const name = req.body.name || 'New Project';
    const p = await prisma.project.create({ data: { name } });
    res.json(p);
  });

  app.get('/api/products', async (req, res) => {
    const projectId = req.query.project ? Number(req.query.project) : 1;
    const list = await prisma.product.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
    res.json(list);
  });

  app.post('/api/products', async (req, res) => {
    const { projectId, sku, name, costPrice } = req.body;
    const p = await prisma.product.create({
      data: {
        projectId: Number(projectId || 1),
        sku: String(sku),
        name: String(name || sku),
        costPrice: Number(costPrice || 0)
      }
    });
    res.json(p);
  });

  app.put('/api/products/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { name, costPrice, isActive } = req.body;
    const p = await prisma.product.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name) : undefined,
        costPrice: costPrice !== undefined ? Number(costPrice) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined
      }
    });
    res.json(p);
  });

  app.get('/api/expense-categories', async (_, res) => {
    const list = await prisma.expenseCategory.findMany({ orderBy: { id: 'asc' } });
    res.json(list);
  });

  app.get('/api/expenses', async (req, res) => {
    const projectId = req.query.project ? Number(req.query.project) : 1;
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const list = await prisma.expense.findMany({
      where: { projectId, date: { gte: from, lte: to } },
      orderBy: { date: 'desc' }
    });
    res.json(list);
  });

  app.post('/api/expenses', async (req, res) => {
    const projectId = Number(req.body.projectId || 1);
    const category = String(req.body.category);
    const amount = Number(req.body.amount || 0);
    const note = req.body.note ? String(req.body.note) : null;
    const date = req.body.date ? new Date(req.body.date) : new Date();

    const cat = await prisma.expenseCategory.findUnique({ where: { code: category } });
    if (!cat) return res.status(400).json({ ok: false, error: 'CATEGORY_NOT_FOUND' });

    const e = await prisma.expense.create({
      data: { projectId, categoryId: cat.id, amount, date, note }
    });

    res.json({ ok: true, expense: e });
  });

  app.post('/api/sync', async (req, res) => {
    try {
      const projectId = req.body.projectId ? Number(req.body.projectId) : 1;
      const date = req.body.date ? new Date(req.body.date) : new Date();
      const r = await syncDay(projectId, date);
      res.json({ ok: true, data: r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/sync', async (req, res) => {
    try {
      const projectId = req.query.project ? Number(req.query.project) : 1;
      const date = req.query.date ? new Date(req.query.date) : new Date();
      const r = await syncDay(projectId, date);
      res.json({ ok: true, data: r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
};
