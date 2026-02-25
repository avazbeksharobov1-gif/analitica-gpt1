const {
  getKpi,
  getCompareStats,
  getForecastCompare,
  listProjects,
  addExpense,
  getDailySeries,
  getProductProfit
} = require('../services/analytics');
const { aiInsight, aiRecommend } = require('../services/ai');
const { buildMarketReport } = require('../services/insightLocal');
const { syncDay } = require('../services/ingest');
const { prisma } = require('../services/db');
const { generatePDFBuffer } = require('../services/report');
const QuickChart = require('quickchart-js');
const { Markup } = require('telegraf');

const AI_DISABLED = process.env.DISABLE_AI === 'true';
const BASE_URL =
  process.env.WEBHOOK_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
const DASHBOARD_URL = process.env.DASHBOARD_URL || process.env.PUBLIC_BASE_URL || BASE_URL;

const BUTTON_DASHBOARD = '📊 Boshqaruv';
const BUTTON_SYNC = '🔄 Sinxron';
const BUTTON_EXPENSE = '💸 Xarajat';
const BUTTON_REPORT = '📄 Hisobot';
const BUTTON_SETTINGS = '⚙️ Sozlamalar';

const projectByChat = new Map();
const expenseFlow = new Map();

const CATEGORY_ALIASES = {
  marketing: 'marketing',
  reklama: 'marketing',
  svet: 'svet',
  gaz: 'gaz',
  suv: 'suv',
  ozik: 'ozik',
  ovqat: 'ozik',
  moshina: 'moshina',
  soliq: 'soliq',
  kvartplata: 'kvartp'
};

function parseExpense(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const [, categoryRaw, amountStr, ...noteParts] = parts;
  const amount = Number(amountStr);
  if (!categoryRaw || Number.isNaN(amount)) return null;
  const category = CATEGORY_ALIASES[categoryRaw.toLowerCase()] || categoryRaw.toLowerCase();
  return { category, amount, note: noteParts.join(' ') || null };
}

function fmtNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0';
}

function statsText(title, s) {
  return (
    `${title}\n\n` +
    `Daromad: ${fmtNum(s.revenue)}\n` +
    `Buyurtmalar: ${fmtNum(s.orders)}\n` +
    `Yangi buyurtmalar: ${fmtNum(s.ordersCreated || 0)}\n` +
    `Omborga topshirilgan: ${fmtNum(s.ordersWarehouse || 0)}\n` +
    `Yetkazilgan: ${fmtNum(s.ordersDelivered || 0)}\n` +
    `Komissiya: ${fmtNum(s.fees)}\n` +
    `Ekvayring: ${fmtNum(s.acquiring)}\n` +
    `Logistika: ${fmtNum(s.logistics)}\n` +
    `Qaytarish: ${fmtNum(s.returns)}\n` +
    `Xarajat: ${fmtNum(s.expenses)}\n` +
    `COGS: ${fmtNum(s.cogs)}\n` +
    `Foyda: ${fmtNum(s.profit)}`
  );
}

async function sendTodayStats(ctx) {
  const projectId = getProjectId(ctx);
  const today = new Date();
  const s = await getKpi(projectId, today, today);
  return ctx.reply(statsText('Kunlik KPI', s));
}

async function sendMonthStats(ctx) {
  const projectId = getProjectId(ctx);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  const s = await getKpi(projectId, from, to);
  return ctx.reply(statsText('30 kunlik KPI', s));
}

async function sendExpenseSummary(ctx, days = 30) {
  const period = Number(days);
  const safeDays = Number.isFinite(period) && period > 0 ? Math.min(period, 365) : 30;
  const projectId = getProjectId(ctx);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (safeDays - 1));

  const [kpi, rows] = await Promise.all([
    getKpi(projectId, from, to),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: { projectId, date: { gte: from, lte: to } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } }
    })
  ]);
  const ids = rows.map((r) => r.categoryId);
  const cats = ids.length
    ? await prisma.expenseCategory.findMany({ where: { id: { in: ids } } })
    : [];
  const catMap = new Map(cats.map((c) => [c.id, c.name]));
  const lines = rows
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${catMap.get(r.categoryId) || r.categoryId}: ${fmtNum(r._sum.amount || 0)}`);

  const msg =
    `Xarajatlar (${safeDays} kun)\n\n` +
    `Jami xarajat: ${fmtNum(kpi.expenses)}\n` +
    `Jami foyda: ${fmtNum(kpi.profit)}\n` +
    (lines.length ? `\nTop kategoriyalar:\n${lines.join('\n')}` : `\nXarajat topilmadi`);
  return ctx.reply(msg);
}

async function sendTopProducts(ctx, days = 30) {
  const period = Number(days);
  const safeDays = Number.isFinite(period) && period > 0 ? Math.min(period, 365) : 30;
  const projectId = getProjectId(ctx);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (safeDays - 1));
  const items = await getProductProfit(projectId, from, to);
  if (!items.length) return ctx.reply(`Top SKU (${safeDays} kun): ma'lumot topilmadi`);

  const top = items
    .slice()
    .sort((a, b) => Number(b.profit || 0) - Number(a.profit || 0))
    .slice(0, 5)
    .map((it, i) => `${i + 1}. ${it.name || it.sku} | Foyda: ${fmtNum(it.profit)} | Tushum: ${fmtNum(it.revenue)}`);
  return ctx.reply(`Top SKU (${safeDays} kun)\n\n${top.join('\n')}`);
}

async function sendInsight(ctx) {
  const projectId = getProjectId(ctx);
  if (AI_DISABLED) {
    const today = new Date();
    const stats = await getKpi(projectId, today, today);
    const text = buildMarketReport(stats);
    return ctx.reply(text);
  }
  const { thisWeek, lastWeek } = await getCompareStats(projectId);
  const text = await aiInsight(lastWeek.revenue, thisWeek.revenue);
  return ctx.reply(`AI tahlil\n\n${text}`);
}

async function sendRecommend(ctx) {
  if (AI_DISABLED) return ctx.reply("AI vaqtincha o'chirilgan");
  const projectId = getProjectId(ctx);
  const today = new Date();
  const text = await aiRecommend(await getKpi(projectId, today, today));
  return ctx.reply(`AI tavsiya\n\n${text}`);
}

async function sendHelp(ctx) {
  return ctx.reply(
    "Yordam:\n" +
      "/stats - bugungi sotuv\n" +
      "/month - 30 kun KPI\n" +
      "/xarajatlar [kun] - xarajat tahlili\n" +
      "/top [kun] - top SKU\n" +
      "/recommend - AI maslahat\n" +
      "/sync [YYYY-MM-DD] - Yandex sync\n" +
      "Matn orqali ham so'rashingiz mumkin: bugungi sotuv, xarajatlar, maslahat, hisobot"
  );
}

function detectIntent(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  if (/(yordam|help|nima qila olasan|komanda)/i.test(t)) return 'help';
  if (/(sinxron|sync|yangila)/i.test(t)) return 'sync';
  if (/(maslahat|tavsiya|recommend)/i.test(t)) return 'recommend';
  if (/(insight|tahlil|analiz)/i.test(t)) return 'insight';
  if (/(hisobot|report|pdf)/i.test(t)) return 'report';
  if (/(top sku|top mahsulot|top product)/i.test(t)) return 'top';
  if (/(xarajatlar|xarajat haqida|harajatlar|rasxod)/i.test(t)) return 'expenses';
  if (/(oylik|30 kun|month)/i.test(t)) return 'month';
  if (/(sotuv|savdo|daromad|kpi|bugun)/i.test(t)) return 'stats';
  return null;
}

async function getOrCreateProject() {
  const existing = await prisma.project.findFirst({ orderBy: { id: 'asc' } });
  if (existing) return existing;
  return prisma.project.create({ data: { name: 'Main Project' } });
}

function getProjectId(ctx) {
  return projectByChat.get(String(ctx.chat.id)) || 1;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function showExpenseCategories(ctx) {
  const list = await prisma.expenseCategory.findMany({ orderBy: { id: 'asc' } });
  if (!list.length) {
    await ctx.reply('Kategoriya topilmadi. Format: xarajat svet 150000', Markup.removeKeyboard());
    return;
  }
  const buttons = list.map((c) => c.name);
  const rows = chunk(buttons, 2).map((row) => row.map((t) => Markup.button.text(t)));
  await ctx.reply('Kategoriya tanlang', Markup.keyboard(rows).oneTime().resize());
}

async function startExpenseFlow(ctx) {
  const chatId = String(ctx.chat.id);
  expenseFlow.set(chatId, { step: 'category', projectId: getProjectId(ctx) });
  await showExpenseCategories(ctx);
}

async function sendDashboard(ctx) {
  if (!DASHBOARD_URL) {
    return ctx.reply('Boshqaruv paneli URL topilmadi. Railway domainni tekshiring.');
  }
  return ctx.reply(
    '📊 Boshqaruv paneli havolasi:',
    Markup.inlineKeyboard([Markup.button.url('Boshqaruv paneli', `${DASHBOARD_URL}/dashboard`)])
  );
}

function mainMenu() {
  return Markup.keyboard([
    [BUTTON_DASHBOARD, BUTTON_SYNC, BUTTON_EXPENSE],
    [BUTTON_REPORT, BUTTON_SETTINGS]
  ]).resize();
}

function sendMainMenu(ctx, text) {
  return ctx.reply(text || '📋 Asosiy menyu', mainMenu());
}

async function sendReport(ctx, days) {
  const projectId = getProjectId(ctx);
  let period = Number(days || 7);
  if (Number.isNaN(period) || period < 1) period = 7;
  if (period > 90) period = 90;

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (period - 1));

  const [stats, project, series] = await Promise.all([
    getKpi(projectId, from, to),
    prisma.project.findUnique({ where: { id: projectId } }),
    getDailySeries(projectId, from, to)
  ]);

  let chartImage = null;
  try {
    const labels = series.map(r => r.date);
    const revenue = series.map(r => r.revenue || 0);
    const profit = series.map(r => r.profit || 0);

    const qc = new QuickChart();
    qc.setConfig({
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Daromad', data: revenue, borderColor: '#2563eb', fill: false },
          { label: 'Foyda', data: profit, borderColor: '#16a34a', fill: false }
        ]
      }
    });
    qc.setWidth(800);
    qc.setHeight(400);
    qc.setBackgroundColor('white');
    chartImage = await qc.toBinary();
  } catch (e) {
    chartImage = null;
  }

  const buffer = await generatePDFBuffer(stats, {
    range: { from, to },
    projectName: project ? project.name : null,
    chartImage
  });

  const name = `report-${from.toISOString().slice(0, 10)}-${to
    .toISOString()
    .slice(0, 10)}.pdf`;
  await ctx.replyWithDocument({ source: buffer, filename: name });
}

async function syncToday(ctx) {
  try {
    const projectId = getProjectId(ctx);
    const date = new Date();
    await syncDay(projectId, date);
    ctx.reply(`Sinxronlash tugadi: ${date.toISOString().slice(0, 10)}`);
  } catch (e) {
    ctx.reply('Sinxronlash xato');
  }
}

function setupCommands(bot) {
  bot.start(async (ctx) => {
    const p = await getOrCreateProject();
    projectByChat.set(String(ctx.chat.id), p.id);
    sendMainMenu(
      ctx,
      "Assalomu alaykum! Analitica Bot.\n\n" +
        "Buyruqlar:\n" +
        "📊 /dashboard - Boshqaruv paneli havolasi\n" +
        "📈 /stats - Bugungi KPI\n" +
        "📆 /month - 30 kun KPI\n" +
        "🔁 /compare - Haftalik taqqoslash\n" +
        "📉 /forecast - 30 kun prognoz\n" +
        "📄 /report [kun] - PDF hisobot (standart 7)\n" +
        "💸 /xarajat - Xarajat kiritish (tugma)\n" +
        "💰 /xarajatlar [kun] - Xarajatlar kesimi\n" +
        "🏆 /top [kun] - Top SKU\n" +
        "🤖 /insight - AI tahlil\n" +
        "💡 /recommend - AI tavsiya\n" +
        "🔄 /sync [YYYY-MM-DD] - Yandex sinxronlash\n" +
        "📚 /projects - Loyihalar ro'yxati\n" +
        "🧩 /project <id> - Loyihani tanlash\n" +
        "🔔 /alerts on|off - Foyda pasaysa ogohlantirish\n" +
        "❌ /cancel - Bekor qilish\n\n" +
        "Xarajat formati: xarajat svet 150000\n" +
        "ℹ️ /help - Qo'llanma"
    );
  });

  bot.command('menu', (ctx) => sendMainMenu(ctx, '📋 Asosiy menyu'));
  bot.command('help', sendHelp);

  bot.command('dashboard', sendDashboard);
  bot.hears(/dashboard|dash|panel/i, sendDashboard);
  bot.hears(BUTTON_DASHBOARD, sendDashboard);
  bot.hears(BUTTON_SYNC, syncToday);
  bot.hears(BUTTON_EXPENSE, startExpenseFlow);
  bot.hears(BUTTON_REPORT, async (ctx) => sendReport(ctx, 7));
  bot.hears(BUTTON_SETTINGS, (ctx) => ctx.reply('Sozlamalar: /project, /alerts'));
  bot.hears(/^(xarajat|harajat)$/i, startExpenseFlow);

  bot.command(['harajat', 'xarajat'], startExpenseFlow);

  bot.command('cancel', async (ctx) => {
    const chatId = String(ctx.chat.id);
    expenseFlow.delete(chatId);
    sendMainMenu(ctx, "Bekor qilindi");
  });

  bot.command('project', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const id = Number(parts[1]);
    if (!id) return ctx.reply('Format: /project 1');
    const p = await prisma.project.findUnique({ where: { id } });
    if (!p) return ctx.reply('Loyiha topilmadi');
    projectByChat.set(String(ctx.chat.id), p.id);
    ctx.reply(`Tanlandi: ${p.name}`);
  });

  bot.command('stats', sendTodayStats);
  bot.command('sales', sendTodayStats);

  bot.command('month', sendMonthStats);

  bot.command('compare', async (ctx) => {
    const projectId = getProjectId(ctx);
    const { thisWeek, lastWeek } = await getCompareStats(projectId);
    const diff = lastWeek.revenue ? ((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 100 : 0;
    const profitDiff = lastWeek.profit ? ((thisWeek.profit - lastWeek.profit) / lastWeek.profit) * 100 : 0;
    ctx.reply(
      `Hafta taqqoslash\n\n` +
        `Daromad (shu hafta): ${thisWeek.revenue}\n` +
        `Daromad (otgan hafta): ${lastWeek.revenue}\n` +
        `O'zgarish: ${diff.toFixed(1)}%\n\n` +
        `Foyda (shu hafta): ${thisWeek.profit}\n` +
        `Foyda (otgan hafta): ${lastWeek.profit}\n` +
        `O'zgarish: ${profitDiff.toFixed(1)}%`
    );
  });

  bot.command('forecast', async (ctx) => {
    const projectId = getProjectId(ctx);
    const f = await getForecastCompare(projectId);
    const today = f.current[0] ?? 0;
    const day30 = f.current[f.current.length - 1] ?? 0;
    ctx.reply(
      `30 kunlik prognoz\n\n` +
        `Bugun: ${today}\n` +
        `30 kundan keyin: ${day30}`
    );
  });

  bot.command('report', async (ctx) => {
    try {
      const parts = ctx.message.text.trim().split(/\s+/);
      const days = parts[1] ? Number(parts[1]) : 7;
      await sendReport(ctx, days);
    } catch (e) {
      ctx.reply('Hisobotda xato');
    }
  });

  bot.command('xarajatlar', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const days = parts[1] ? Number(parts[1]) : 30;
    await sendExpenseSummary(ctx, days);
  });

  bot.command('top', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const days = parts[1] ? Number(parts[1]) : 30;
    await sendTopProducts(ctx, days);
  });

  bot.command('sync', async (ctx) => {
    try {
      const projectId = getProjectId(ctx);
      const parts = ctx.message.text.trim().split(/\s+/);
      const date = parts[1] ? new Date(parts[1]) : new Date();
      if (Number.isNaN(date.getTime())) {
        return ctx.reply('Format: /sync 2026-02-07');
      }
      await syncDay(projectId, date);
      ctx.reply(`Sinxronlash tugadi: ${date.toISOString().slice(0, 10)}`);
    } catch (e) {
      ctx.reply('Sinxronlashda xato');
    }
  });

  bot.command('insight', async (ctx) => {
    try {
      await sendInsight(ctx);
    } catch (e) {
      ctx.reply('AI tahlilda xato');
    }
  });

  bot.command('recommend', async (ctx) => {
    try {
      await sendRecommend(ctx);
    } catch (e) {
      ctx.reply('AI mavjud emas');
    }
  });

  bot.command('projects', async (ctx) => {
    const list = await listProjects();
    const text = list.map(p => `${p.id}. ${p.name}`).join('\n') || "Bo'sh";
    ctx.reply(`Loyihalar\n\n${text}`);
  });

  bot.command('alerts', async (ctx) => {
    const on = ctx.message.text.includes('on');
    const projectId = getProjectId(ctx);
    const chatId = String(ctx.chat.id);
    await prisma.alertSetting.upsert({
      where: { projectId_chatId: { projectId, chatId } },
      update: { enabled: on },
      create: { projectId, chatId, enabled: on }
    });
    ctx.reply(on ? 'Ogohlantirish yoqildi' : "Ogohlantirish o'chirildi");
  });

  bot.hears(/^(expense|harajat|xarajat)\s+/i, async (ctx) => {
    try {
      const projectId = getProjectId(ctx);
      const parsed = parseExpense(ctx.message.text);
      if (!parsed) return ctx.reply('Format: xarajat svet 150000');
      await addExpense(projectId, parsed.category, parsed.amount, parsed.note);
      ctx.reply("Qo'shildi");
    } catch (e) {
      ctx.reply("Xarajatni qo'shib bo'lmadi");
    }
  });

  bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const state = expenseFlow.get(chatId);
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    if (!state) {
      const intent = detectIntent(text);
      if (!intent) return;
      try {
        if (intent === 'help') return sendHelp(ctx);
        if (intent === 'sync') return syncToday(ctx);
        if (intent === 'recommend') return sendRecommend(ctx);
        if (intent === 'insight') return sendInsight(ctx);
        if (intent === 'report') return sendReport(ctx, 7);
        if (intent === 'top') return sendTopProducts(ctx, 30);
        if (intent === 'expenses') return sendExpenseSummary(ctx, 30);
        if (intent === 'month') return sendMonthStats(ctx);
        if (intent === 'stats') return sendTodayStats(ctx);
      } catch (e) {
        return ctx.reply("So'rovni bajarishda xato bo'ldi");
      }
      return;
    }

    if (state.step === 'category') {
      const key = text.toLowerCase();
      const cat = await prisma.expenseCategory.findFirst({
        where: {
          OR: [{ code: key }, { name: text }]
        }
      });
      if (!cat) {
        return ctx.reply('Kategoriya topilmadi. Qayta tanlang.');
      }
      expenseFlow.set(chatId, { step: 'amount', projectId: state.projectId, categoryCode: cat.code });
      return ctx.reply('Summani kiriting (masalan: 150000 Izoh)', Markup.removeKeyboard());
    }

    if (state.step === 'amount') {
      const parts = text.split(/\s+/);
      const amount = Number(parts[0]);
      if (Number.isNaN(amount)) {
        return ctx.reply('Summa xato. Faqat raqam kiriting.');
      }
      const note = parts.slice(1).join(' ') || null;
      await addExpense(state.projectId, state.categoryCode, amount, note);
      expenseFlow.delete(chatId);
      return sendMainMenu(ctx, "Xarajat qo'shildi");
    }
  });
}

module.exports = setupCommands;


