const cron = require('node-cron');
const { prisma, ensurePrismaConnection } = require('./services/db');
const { syncDay } = require('./services/ingest');

function getYesterdayDate() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function resolveCronProjectId() {
  const fromEnv = Number(process.env.CRON_PROJECT_ID || 0);
  if (fromEnv > 0) return fromEnv;

  const project = await prisma.project.findFirst({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true }
  });
  if (!project) throw new Error('No project found for cron sync');
  return project.id;
}

async function runDailySync() {
  const dbOk = await ensurePrismaConnection();
  if (!dbOk) {
    console.error('[cron] DB is unavailable, skip daily sync');
    return;
  }

  const projectId = await resolveCronProjectId();
  const day = getYesterdayDate();
  const result = await syncDay(projectId, day);
  console.log('[cron] Daily sync done', {
    projectId,
    date: day.toISOString().slice(0, 10),
    revenue: Math.round(result.revenue || 0),
    orders: result.orders || 0
  });
}

function setupCron() {
  cron.schedule(
    '0 3 * * *',
    async () => {
      try {
        await runDailySync();
      } catch (e) {
        console.error('[cron] Daily sync failed:', e.message);
      }
    },
    { timezone: process.env.CRON_TIMEZONE || 'Asia/Tashkent' }
  );
  console.log('[cron] scheduled: 0 3 * * *');
}

module.exports = { setupCron, runDailySync };
