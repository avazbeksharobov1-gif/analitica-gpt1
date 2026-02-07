const cron = require('node-cron');
const { prisma } = require('../services/db');
const { syncDay } = require('../services/ingest');

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

async function syncForAllProjects(date) {
  const projects = await prisma.project.findMany({ where: { isActive: true } });
  for (const p of projects) {
    try {
      await syncDay(p.id, date);
    } catch (e) {
      console.error('SYNC ERROR:', p.id, e.message);
    }
  }
}

function setupCron() {
  if (String(process.env.CRON_SYNC_ENABLED || 'true') !== 'true') {
    console.log('CRON sync disabled');
    return;
  }

  const tz = process.env.CRON_TZ || 'Asia/Tashkent';

  // Hourly sync for today
  cron.schedule('15 * * * *', async () => {
    await syncForAllProjects(new Date());
  }, { timezone: tz });

  // Daily sync for yesterday (finalize)
  cron.schedule('10 5 * * *', async () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    await syncForAllProjects(toDateOnly(d));
  }, { timezone: tz });
}

module.exports = { setupCron };
