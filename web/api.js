const {
  getKpi,
  getCompareStats,
  getForecastCompare,
  getProductProfit,
  getDailySeries,
  getSkuSeries
} = require('../services/analytics');
const { authRequired, authOptional, hashPassword, verifyPassword, signToken } = require('../services/auth');
const { aiInsight, aiRecommend, aiAnomalyDetect, aiProductProfit } = require('../services/ai');
const { syncDay } = require('../services/ingest');
const { prisma } = require('../services/db');
const { writeExcel } = require('../exporter');
const { generatePDFStream } = require('../services/report');
const { syncCatalog } = require('../services/catalog');
const { upsertSellerConfig } = require('../services/projectTokens');
const { getUserPlan, setUserPlan } = require('../services/subscription');
const { getPlan } = require('../services/plans');
const { requestOtp, verifyOtp } = require('../services/otp');

module.exports = (app) => {
  const AI_DISABLED = process.env.DISABLE_AI === 'true';
  const AUTH_ENABLED = process.env.ENABLE_AUTH === 'true';

  app.use('/api', authOptional);

  const guard = (req, res, next) => {
    if (!AUTH_ENABLED) return next();
    return authRequired(req, res, next);
  };

  function setAuthCookie(res, token) {
    const secure =
      process.env.COOKIE_SECURE === 'true' ||
      (process.env.WEBHOOK_URL || '').startsWith('https://') ||
      Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);
    res.cookie('auth', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure
    });
  }

  async function resolveProjectId(req) {
    const requested =
      req.query.project || req.body.projectId || req.body.project || req.body.project_id;
    if (!AUTH_ENABLED) return Number(requested || 1);
    if (!req.user) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }

    const tokenProjectId = req.user.projectId;
    if (!requested || Number(requested) === Number(tokenProjectId)) {
      return Number(tokenProjectId);
    }

    const projectId = Number(requested);
    const membership = await prisma.projectUser.findUnique({
      where: { projectId_userId: { projectId, userId: req.user.id } }
    });
    if (!membership) {
      const err = new Error('FORBIDDEN');
      err.status = 403;
      throw err;
    }
    return projectId;
  }

  async function parseRange(req) {
    const projectId = await resolveProjectId(req);
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date();
    return { projectId, from, to };
  }

  function aiFail(res, label, err, debug) {
    const msg = err && err.message ? err.message : String(err || 'Unknown error');
    console.error(`AI ${label} error:`, msg);
    res.status(500).send(debug ? `AI ${label} error: ${msg}` : `AI ${label} not available`);
  }

  app.post('/api/auth/register', async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const phone = req.body.phone ? String(req.body.phone).trim() : null;
      if (!email || !password) return res.status(400).json({ ok: false, error: 'EMAIL_PASSWORD_REQUIRED' });

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ ok: false, error: 'EMAIL_EXISTS' });

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, phone, passwordHash, role: 'USER', isActive: true }
      });

      const project = await prisma.project.create({ data: { name: 'My Project' } });
      await prisma.projectUser.create({ data: { projectId: project.id, userId: user.id, role: 'OWNER' } });

      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'FREE',
          status: 'TRIAL',
          price: 50000,
          currentPeriodStart: now,
          currentPeriodEnd: end
        }
      });

      const token = signToken({ id: user.id, role: user.role, projectId: project.id, email: user.email });
      setAuthCookie(res, token);
      res.json({ ok: true, user: { id: user.id, email: user.email }, projectId: project.id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!email || !password) return res.status(400).json({ ok: false, error: 'EMAIL_PASSWORD_REQUIRED' });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

      let membership = await prisma.projectUser.findFirst({
        where: { userId: user.id },
        orderBy: { id: 'asc' }
      });
      if (!membership) {
        const project = await prisma.project.create({ data: { name: 'My Project' } });
        membership = await prisma.projectUser.create({
          data: { projectId: project.id, userId: user.id, role: 'OWNER' }
        });
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
      const token = signToken({ id: user.id, role: user.role, projectId: membership.projectId, email: user.email });
      setAuthCookie(res, token);
      res.json({ ok: true, user: { id: user.id, email: user.email }, projectId: membership.projectId });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', guard, async (req, res) => {
    try {
      if (!AUTH_ENABLED) return res.json({ ok: false, auth: false });
      const userId = req.user.id;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const memberships = await prisma.projectUser.findMany({
        where: { userId },
        include: { project: true },
        orderBy: { id: 'asc' }
      });
      res.json({
        ok: true,
        user: { id: user.id, email: user.email, role: user.role },
        currentProjectId: req.user.projectId,
        projects: memberships.map(m => ({ id: m.projectId, name: m.project.name, role: m.role }))
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/auth/select-project', guard, async (req, res) => {
    try {
      const projectId = Number(req.body.projectId || 0);
      if (!projectId) return res.status(400).json({ ok: false, error: 'PROJECT_REQUIRED' });
      const membership = await prisma.projectUser.findUnique({
        where: { projectId_userId: { projectId, userId: req.user.id } }
      });
      if (!membership) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

      const token = signToken({
        id: req.user.id,
        role: req.user.role,
        projectId,
        email: req.user.email
      });
      setAuthCookie(res, token);
      res.json({ ok: true, projectId });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/auth/otp/request', guard, async (req, res) => {
    try {
      const phone = String(req.body.phone || '').trim();
      if (!phone) return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      await prisma.user.update({ where: { id: req.user.id }, data: { phone } });
      await requestOtp(phone, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/auth/otp/verify', guard, async (req, res) => {
    try {
      const phone = String(req.body.phone || '').trim();
      const code = String(req.body.code || '').trim();
      if (!phone || !code) return res.status(400).json({ ok: false, error: 'PHONE_CODE_REQUIRED' });
      const ok = await verifyOtp(phone, code);
      if (!ok) return res.status(400).json({ ok: false, error: 'OTP_INVALID' });
      await prisma.user.update({ where: { id: req.user.id }, data: { phoneVerified: true } });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/stats', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      res.json(await getKpi(projectId, from, to));
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/compare', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      res.json(await getCompareStats(projectId));
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/export/excel', guard, async (req, res) => {
    try {
      const { projectId, from, to } = await parseRange(req);
      const [kpi, items, project] = await Promise.all([
        getKpi(projectId, from, to),
        getProductProfit(projectId, from, to),
        prisma.project.findUnique({ where: { id: projectId } })
      ]);

      const name = `analitica-${projectId}-${from.toISOString().slice(0, 10)}-${to
        .toISOString()
        .slice(0, 10)}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);

      await writeExcel(res, {
        kpi,
        items,
        range: { from, to },
        projectName: project ? project.name : null
      });
      res.end();
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/export/pdf', guard, async (req, res) => {
    try {
      const { projectId, from, to } = await parseRange(req);
      const [kpi, project] = await Promise.all([
        getKpi(projectId, from, to),
        prisma.project.findUnique({ where: { id: projectId } })
      ]);

      const name = `analitica-${projectId}-${from.toISOString().slice(0, 10)}-${to
        .toISOString()
        .slice(0, 10)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);

      await generatePDFStream(res, kpi, {
        range: { from, to },
        projectName: project ? project.name : null
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/forecast-compare', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      res.json(await getForecastCompare(projectId));
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/series', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      res.json(await getDailySeries(projectId, from, to));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/series/sku', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const sku = req.query.sku ? String(req.query.sku) : '';
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      res.json(await getSkuSeries(projectId, sku, from, to));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/insight', guard, async (req, res) => {
    try {
      if (AI_DISABLED) return res.send('AI disabled');
      const projectId = await resolveProjectId(req);
      const { thisWeek, lastWeek } = await getCompareStats(projectId);
      const text = await aiInsight(lastWeek.revenue, thisWeek.revenue);
      res.send(text);
    } catch (e) {
      aiFail(res, 'insight', e, req.query.debug === '1');
    }
  });

  app.get('/api/recommend', guard, async (req, res) => {
    try {
      if (AI_DISABLED) return res.send('AI disabled');
      const projectId = await resolveProjectId(req);
      const today = new Date();
      const text = await aiRecommend(await getKpi(projectId, today, today));
      res.send(text);
    } catch (e) {
      aiFail(res, 'recommendation', e, req.query.debug === '1');
    }
  });

  app.get('/api/anomaly', guard, async (req, res) => {
    try {
      if (AI_DISABLED) return res.send('AI disabled');
      const projectId = await resolveProjectId(req);
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

  app.get('/api/products/insight', guard, async (req, res) => {
    try {
      if (AI_DISABLED) return res.send('AI disabled');
      const projectId = await resolveProjectId(req);
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      const items = await getProductProfit(projectId, from, to);
      const text = await aiProductProfit(items);
      res.send(text);
    } catch (e) {
      aiFail(res, 'product', e, req.query.debug === '1');
    }
  });

  app.get('/api/products/profit', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      const items = await getProductProfit(projectId, from, to);
      res.json(items);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/projects', guard, async (req, res) => {
    if (!AUTH_ENABLED) {
      const list = await prisma.project.findMany({ orderBy: { id: 'asc' } });
      return res.json(list);
    }
    const userId = req.user.id;
    const list = await prisma.projectUser.findMany({
      where: { userId },
      include: { project: true },
      orderBy: { id: 'asc' }
    });
    return res.json(list.map(m => ({ id: m.projectId, name: m.project.name })));
  });

  app.post('/api/projects', guard, async (req, res) => {
    const name = req.body.name || 'New Project';
    if (AUTH_ENABLED) {
      const { plan } = await getUserPlan(req.user.id);
      const count = await prisma.projectUser.count({ where: { userId: req.user.id } });
      if (count >= plan.projectLimit) {
        return res.status(403).json({
          ok: false,
          error: 'PLAN_LIMIT',
          message: `Tarif limiti: ${plan.projectLimit} ta magazin`
        });
      }
    }
    const p = await prisma.project.create({ data: { name } });
    if (AUTH_ENABLED) {
      await prisma.projectUser.create({
        data: { projectId: p.id, userId: req.user.id, role: 'OWNER' }
      });
    }
    res.json(p);
  });

  app.get('/api/tokens', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const list = await prisma.projectToken.findMany({
        where: { projectId, isActive: true },
        orderBy: { id: 'asc' }
      });
      res.json(
        list.map(t => ({
          id: t.id,
          type: t.type,
          name: t.name,
          campaignIds: t.campaignIds,
          baseUrl: t.baseUrl,
          authMode: t.authMode
        }))
      );
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/tokens/seller', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const { apiKeys, campaignIds, baseUrl, authMode, name } = req.body;
      const token = await upsertSellerConfig(projectId, {
        apiKeys,
        campaignIds,
        baseUrl,
        authMode,
        name
      });
      res.json({ ok: true, id: token.id });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/billing/plan', guard, async (req, res) => {
    try {
      const userId = req.user.id;
      const { plan, subscription } = await getUserPlan(userId);
      const projectCount = await prisma.projectUser.count({ where: { userId } });
      res.json({
        ok: true,
        plan,
        subscription,
        projectCount,
        testMode: process.env.BILLING_TEST_MODE === 'true'
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/billing/test', guard, async (req, res) => {
    try {
      if (process.env.BILLING_TEST_MODE !== 'true') {
        return res.status(403).json({ ok: false, error: 'TEST_MODE_OFF' });
      }
      const planCode = String(req.body.plan || 'FREE').toUpperCase();
      const plan = getPlan(planCode);
      await setUserPlan(req.user.id, plan.code, 30);
      await prisma.payment.create({
        data: {
          userId: req.user.id,
          provider: 'TEST',
          status: 'PAID',
          amount: plan.price,
          currency: 'UZS',
          externalId: `test-${Date.now()}`
        }
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/products', guard, async (req, res) => {
    const projectId = await resolveProjectId(req);
    const list = await prisma.product.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
    res.json(list);
  });

  app.post('/api/products', guard, async (req, res) => {
    const { sku, name, costPrice } = req.body;
    const projectId = await resolveProjectId(req);
    const p = await prisma.product.create({
      data: {
        projectId,
        sku: String(sku),
        name: String(name || sku),
        costPrice: Number(costPrice || 0)
      }
    });
    res.json(p);
  });

  app.post('/api/products/sync', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const r = await syncCatalog(projectId);
      res.json({ ok: true, data: r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/products/cost', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const sku = req.body.sku ? String(req.body.sku).trim() : '';
      if (!sku) return res.status(400).json({ ok: false, error: 'SKU_REQUIRED' });
      const name = req.body.name ? String(req.body.name) : sku;
      const costPrice = Number(req.body.costPrice || 0);

      const existing = await prisma.product.findUnique({
        where: { projectId_sku: { projectId, sku } }
      });

      const product = existing
        ? await prisma.product.update({
            where: { id: existing.id },
            data: { costPrice, name }
          })
        : await prisma.product.create({
            data: { projectId, sku, name, costPrice }
          });

      res.json({ ok: true, product });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.put('/api/products/:id', guard, async (req, res) => {
    const id = Number(req.params.id);
    const { name, costPrice, isActive } = req.body;
    if (AUTH_ENABLED) {
      const projectId = await resolveProjectId(req);
      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing || existing.projectId !== projectId) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }
    }
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

  app.get('/api/expense-categories', guard, async (_, res) => {
    const list = await prisma.expenseCategory.findMany({ orderBy: { id: 'asc' } });
    res.json(list);
  });

  app.get('/api/expenses/summary', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const from = req.query.from ? new Date(req.query.from) : new Date();
      const to = req.query.to ? new Date(req.query.to) : new Date();
      const list = await prisma.expense.findMany({
        where: { projectId, date: { gte: from, lte: to } },
        include: { category: true }
      });

      const agg = new Map();
      for (const e of list) {
        const code = e.category?.code || 'other';
        const name = e.category?.name || 'Other';
        const prev = agg.get(code) || { code, name, amount: 0 };
        prev.amount += e.amount || 0;
        agg.set(code, prev);
      }

      const kpi = await getKpi(projectId, from, to);
      if (kpi.tax1 && kpi.tax1 > 0) {
        agg.set('tax1', { code: 'tax1', name: 'Soliq 1%', amount: kpi.tax1 });
      }
      if (kpi.socialTax && kpi.socialTax > 0) {
        agg.set('social_tax', { code: 'social_tax', name: 'Ijtimoiy soliq', amount: kpi.socialTax });
      }

      res.json(Array.from(agg.values()));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/expenses', guard, async (req, res) => {
    const projectId = await resolveProjectId(req);
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const list = await prisma.expense.findMany({
      where: { projectId, date: { gte: from, lte: to } },
      orderBy: { date: 'desc' }
    });
    res.json(list);
  });

  app.post('/api/expenses', guard, async (req, res) => {
    const projectId = await resolveProjectId(req);
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

  app.post('/api/sync', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const date = req.body.date ? new Date(req.body.date) : new Date();
      const r = await syncDay(projectId, date);
      res.json({ ok: true, data: r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/sync/range', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const from = req.body.from ? new Date(req.body.from) : new Date();
      const to = req.body.to ? new Date(req.body.to) : new Date();
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return res.status(400).json({ ok: false, error: 'INVALID_DATE' });
      }
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setHours(0, 0, 0, 0);

      const days = [];
      for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
      }

      const results = [];
      for (const d of days) {
        // eslint-disable-next-line no-await-in-loop
        const r = await syncDay(projectId, d);
        results.push({ date: d.toISOString().slice(0, 10), ...r });
      }

      res.json({ ok: true, total: results.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get('/api/sync', guard, async (req, res) => {
    try {
      const projectId = await resolveProjectId(req);
      const date = req.query.date ? new Date(req.query.date) : new Date();
      const r = await syncDay(projectId, date);
      res.json({ ok: true, data: r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
};
