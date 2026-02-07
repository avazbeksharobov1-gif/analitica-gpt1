const cron = require('node-cron');
const { getKpi } = require('../services/analytics');
const { prisma } = require('../services/db');

function dateRangeForYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const from = new Date(d);
  from.setHours(0, 0, 0, 0);
  const to = new Date(d);
  to.setHours(23, 59, 59, 999);
  return { from, to, label: d.toISOString().slice(0, 10) };
}

async function getTargets(projectId, adminIds) {
  if (adminIds && adminIds.length) return adminIds;
  const alerts = await prisma.alertSetting.findMany({
    where: { projectId, enabled: true }
  });
  return alerts.map(a => a.chatId);
}

module.exports = function setupCron(bot, ADMIN_IDS = []) {
  if (process.env.DAILY_REPORT_ENABLED === 'false') {
    console.log('Daily report disabled');
    return;
  }

  const tz = process.env.CRON_TZ || 'Asia/Tashkent';
  const schedule = process.env.DAILY_REPORT_CRON || '30 5 * * *';

  cron.schedule(schedule, async () => {
    const { from, to, label } = dateRangeForYesterday();
    const projects = await prisma.project.findMany({ where: { isActive: true } });

    for (const p of projects) {
      const s = await getKpi(p.id, from, to);
      const targets = await getTargets(p.id, ADMIN_IDS);
      if (!targets.length) continue;

      const msg =
        `Daily report (${label})\nProject: ${p.name}\n\n` +
        `Revenue: ${s.revenue}\n` +
        `Orders: ${s.orders}\n` +
        `Fees: ${s.fees}\n` +
        `Acquiring: ${s.acquiring}\n` +
        `Logistics: ${s.logistics}\n` +
        `Returns: ${s.returns}\n` +
        `Expenses: ${s.expenses}\n` +
        `COGS: ${s.cogs}\n` +
        `Profit: ${s.profit}`;

      for (const id of targets) {
        await bot.telegram.sendMessage(id, msg);
      }
    }
  }, { timezone: tz });
};
