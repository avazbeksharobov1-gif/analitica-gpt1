const cron = require('node-cron');
const { prisma } = require('../services/db');
const { getCompareStats, getKpi } = require('../services/analytics');
const { aiInsight } = require('../services/ai');

function dateRangeForDay(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
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

function setupAlerts(bot, ADMIN_IDS = []) {
  const AI_DISABLED = process.env.DISABLE_AI === 'true';
  const tz = process.env.CRON_TZ || 'Asia/Tashkent';
  const weeklyCron = process.env.ALERT_WEEKLY_CRON || '*/30 * * * *';
  const dailyCron = process.env.ALERT_DAILY_CRON || '20 6 * * *';
  const profitDropPct = Number(process.env.ALERT_PROFIT_DROP_PCT || 10);
  const revenueDropPct = Number(process.env.ALERT_REVENUE_DROP_PCT || 15);
  const marginMinPct = Number(process.env.ALERT_MARGIN_MIN_PCT || 10);
  const cooldownMin = Number(process.env.ALERT_COOLDOWN_MIN || 360);

  const lastSent = new Map();
  const canSend = (key) => {
    const now = Date.now();
    const last = lastSent.get(key) || 0;
    if (now - last < cooldownMin * 60 * 1000) return false;
    lastSent.set(key, now);
    return true;
  };

  // Weekly compare alert (profit & revenue drop)
  cron.schedule(weeklyCron, async () => {
    try {
      const project = await prisma.project.findFirst({ orderBy: { id: 'asc' } });
      if (!project) return;

      const { thisWeek, lastWeek } = await getCompareStats(project.id);
      if (!lastWeek || lastWeek.revenue === 0) return;

      const profitDrop = lastWeek.profit > 0
        ? ((lastWeek.profit - thisWeek.profit) / lastWeek.profit) * 100
        : 0;
      const revenueDrop = lastWeek.revenue > 0
        ? ((lastWeek.revenue - thisWeek.revenue) / lastWeek.revenue) * 100
        : 0;

      if (profitDrop >= profitDropPct || revenueDrop >= revenueDropPct) {
        if (!canSend(`weekly:${project.id}`)) return;
        const targets = await getTargets(project.id, ADMIN_IDS);
        if (!targets.length) return;

        let insight = '';
        if (!AI_DISABLED) {
          try {
            insight = await aiInsight(lastWeek.revenue, thisWeek.revenue);
          } catch (_) {
            insight = '';
          }
        }

        const msg =
          `⚠️ Haftalik pasayish\nLoyiha: ${project.name}\n\n` +
          `Daromad (otgan hafta): ${lastWeek.revenue}\n` +
          `Daromad (shu hafta): ${thisWeek.revenue}\n` +
          `Daromad pasayishi: ${revenueDrop.toFixed(1)}%\n\n` +
          `Foyda (otgan hafta): ${lastWeek.profit}\n` +
          `Foyda (shu hafta): ${thisWeek.profit}\n` +
          `Foyda pasayishi: ${profitDrop.toFixed(1)}%` +
          (insight ? `\n\nAI tahlil:\n${insight}` : '');

        for (const id of targets) {
          await bot.telegram.sendMessage(id, msg);
        }
      }
    } catch (e) {
      console.error('ALERT WEEKLY ERROR:', e.message);
    }
  }, { timezone: tz });

  // Daily margin/profit alert
  cron.schedule(dailyCron, async () => {
    try {
      const { from, to, label } = dateRangeForDay(-1);
      const projects = await prisma.project.findMany({ where: { isActive: true } });
      for (const p of projects) {
        const s = await getKpi(p.id, from, to);
        if (s.revenue === 0 && s.orders === 0) continue;

        const margin = s.revenue ? (s.profit / s.revenue) * 100 : 0;
        if (s.profit < 0 || margin < marginMinPct) {
          const targets = await getTargets(p.id, ADMIN_IDS);
          if (!targets.length) continue;

          const msg =
            `⚠️ Kunlik marja/foyda ogohlantirish\nLoyiha: ${p.name}\nSana: ${label}\n\n` +
            `Daromad: ${s.revenue}\n` +
            `Buyurtmalar: ${s.orders}\n` +
            `Foyda: ${s.profit}\n` +
            `Marja: ${margin.toFixed(1)}%\n\n` +
            `Mezon: marja < ${marginMinPct}% yoki foyda < 0`;

          for (const id of targets) {
            await bot.telegram.sendMessage(id, msg);
          }
        }
      }
    } catch (e) {
      console.error('ALERT DAILY ERROR:', e.message);
    }
  }, { timezone: tz });
}

module.exports = { setupAlerts };
