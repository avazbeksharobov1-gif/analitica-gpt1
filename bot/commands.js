const {
  getKpi,
  getCompareStats,
  getForecastCompare,
  listProjects,
  addExpense,
  getDailySeries
} = require('../services/analytics');
const { aiInsight, aiRecommend } = require('../services/ai');
const { syncDay } = require('../services/ingest');
const { prisma } = require('../services/db');
const { generatePDFBuffer } = require('../services/report');
const QuickChart = require('quickchart-js');
const { Markup } = require('telegraf');

const AI_DISABLED = process.env.DISABLE_AI === 'true';

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
  const buttons = list.map((c) => c.name);
  const rows = chunk(buttons, 2).map((row) => row.map((t) => Markup.button.text(t)));
  await ctx.reply('Kategoriya tanlang', Markup.keyboard(rows).oneTime().resize());
}

function setupCommands(bot) {
  bot.start(async (ctx) => {
    const p = await getOrCreateProject();
    projectByChat.set(String(ctx.chat.id), p.id);
    ctx.reply(
      'Analitica Bot\n\n' +
        '/stats - Daily KPI\n' +
        '/month - 30 day KPI\n' +
        '/compare - Week compare\n' +
        '/forecast - 30 day forecast\n' +
        '/report [days] - PDF report (default 7)\n' +
        '/harajat - xarajat kiritish (tugma)\n' +
        '/insight - AI insight\n' +
        '/recommend - AI recommendations\n' +
        '/sync [YYYY-MM-DD] - Sync seller data\n' +
        '/projects - Project list\n' +
        '/project <id> - Select project\n' +
        '/alerts on|off - Profit drop alerts\n' +
        'Expense format: expense svet 150000'
    );
  });

  bot.command('project', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const id = Number(parts[1]);
    if (!id) return ctx.reply('Format: /project 1');
    const p = await prisma.project.findUnique({ where: { id } });
    if (!p) return ctx.reply('Project not found');
    projectByChat.set(String(ctx.chat.id), p.id);
    ctx.reply(`Selected: ${p.name}`);
  });

  bot.command('stats', async (ctx) => {
    const projectId = getProjectId(ctx);
    const today = new Date();
    const s = await getKpi(projectId, today, today);
    ctx.reply(
      `Daily KPI\n\n` +
        `Revenue: ${s.revenue}\n` +
        `Orders: ${s.orders}\n` +
        `Fees (commission): ${s.fees}\n` +
        `Acquiring: ${s.acquiring}\n` +
        `Logistics: ${s.logistics}\n` +
        `Returns: ${s.returns}\n` +
        `Expenses: ${s.expenses}\n` +
        `COGS: ${s.cogs}\n` +
        `Profit: ${s.profit}`
    );
  });

  bot.command('month', async (ctx) => {
    const projectId = getProjectId(ctx);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    const s = await getKpi(projectId, from, to);
    ctx.reply(
      `30-day KPI\n\n` +
        `Revenue: ${s.revenue}\n` +
        `Orders: ${s.orders}\n` +
        `Fees (commission): ${s.fees}\n` +
        `Acquiring: ${s.acquiring}\n` +
        `Logistics: ${s.logistics}\n` +
        `Returns: ${s.returns}\n` +
        `Expenses: ${s.expenses}\n` +
        `COGS: ${s.cogs}\n` +
        `Profit: ${s.profit}`
    );
  });

  bot.command('compare', async (ctx) => {
    const projectId = getProjectId(ctx);
    const { thisWeek, lastWeek } = await getCompareStats(projectId);
    const diff = lastWeek.revenue ? ((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 100 : 0;
    const profitDiff = lastWeek.profit ? ((thisWeek.profit - lastWeek.profit) / lastWeek.profit) * 100 : 0;
    ctx.reply(
      `Week compare\n\n` +
        `Revenue this week: ${thisWeek.revenue}\n` +
        `Revenue last week: ${lastWeek.revenue}\n` +
        `Revenue change: ${diff.toFixed(1)}%\n\n` +
        `Profit this week: ${thisWeek.profit}\n` +
        `Profit last week: ${lastWeek.profit}\n` +
        `Profit change: ${profitDiff.toFixed(1)}%`
    );
  });

  bot.command('forecast', async (ctx) => {
    const projectId = getProjectId(ctx);
    const f = await getForecastCompare(projectId);
    const today = f.current[0] ?? 0;
    const day30 = f.current[f.current.length - 1] ?? 0;
    ctx.reply(
      `30-day forecast\n\n` +
        `Today: ${today}\n` +
        `After 30 days: ${day30}`
    );
  });

  bot.command(['harajat', 'xarajat'], async (ctx) => {
    const chatId = String(ctx.chat.id);
    expenseFlow.set(chatId, { step: 'category', projectId: getProjectId(ctx) });
    await showExpenseCategories(ctx);
  });

  bot.command('cancel', async (ctx) => {
    const chatId = String(ctx.chat.id);
    expenseFlow.delete(chatId);
    ctx.reply('Bekor qilindi', Markup.removeKeyboard());
  });

  bot.command('report', async (ctx) => {
    try {
      const projectId = getProjectId(ctx);
      const parts = ctx.message.text.trim().split(/\s+/);
      let days = parts[1] ? Number(parts[1]) : 7;
      if (Number.isNaN(days) || days < 1) days = 7;
      if (days > 90) days = 90;

      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));

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
              { label: 'Revenue', data: revenue, borderColor: '#2563eb', fill: false },
              { label: 'Profit', data: profit, borderColor: '#16a34a', fill: false }
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
    } catch (e) {
      ctx.reply('Report failed');
    }
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
      ctx.reply(`Synced ${date.toISOString().slice(0, 10)}`);
    } catch (e) {
      ctx.reply('Sync failed');
    }
  });

  bot.command('insight', async (ctx) => {
    if (AI_DISABLED) return ctx.reply('AI vaqtincha o‘chirildi');
    const projectId = getProjectId(ctx);
    const { thisWeek, lastWeek } = await getCompareStats(projectId);
    const text = await aiInsight(lastWeek.revenue, thisWeek.revenue);
    ctx.reply(`AI insight\n\n${text}`);
  });

  bot.command('recommend', async (ctx) => {
    try {
      if (AI_DISABLED) return ctx.reply('AI vaqtincha o‘chirildi');
      const projectId = getProjectId(ctx);
      const today = new Date();
      const text = await aiRecommend(await getKpi(projectId, today, today));
      ctx.reply(`AI recommendations\n\n${text}`);
    } catch (e) {
      ctx.reply('AI not available');
    }
  });

  bot.command('projects', async (ctx) => {
    const list = await listProjects();
    const text = list.map(p => `${p.id}. ${p.name}`).join('\n') || 'Empty';
    ctx.reply(`Projects\n\n${text}`);
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
    ctx.reply(on ? 'Alerts enabled' : 'Alerts disabled');
  });

  bot.hears(/^(expense|harajat|харжат)\s+/i, async (ctx) => {
    try {
      const projectId = getProjectId(ctx);
      const parsed = parseExpense(ctx.message.text);
      if (!parsed) return ctx.reply('Format: expense svet 150000');
      await addExpense(projectId, parsed.category, parsed.amount, parsed.note);
      ctx.reply('Added');
    } catch (e) {
      ctx.reply('Failed to add expense');
    }
  });

  bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const state = expenseFlow.get(chatId);
    if (!state) return;

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

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
      return ctx.reply("Xarajat qo'shildi ✅");
    }
  });
}

module.exports = setupCommands;
