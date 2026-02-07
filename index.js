require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const bot = require('./bot');
const { setupAlerts } = require('./bot/alerts');
const setupBotCron = require('./bot/cron');
let setupCron;
try {
  ({ setupCron } = require('./cron'));
} catch (e) {
  setupCron = null;
}

const dashboard = require('./web/dashboard');
const admin = require('./web/admin');
const authPages = require('./web/auth');
const api = require('./web/api');
const {
  ensureCategories,
  ensureProject,
  ensureAdminUser,
  ensureAdminMemberships,
  ensureAdminSubscription,
  ensureSellerTokenFromEnv
} = require('./services/bootstrap');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : '');
const DISABLE_BOT = process.env.DISABLE_BOT === 'true';
const IS_RAILWAY = Boolean(
  process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT
);
const ENABLE_POLLING = process.env.ENABLE_POLLING === 'true';

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(String)
  : [];

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => res.redirect('/dashboard'));

// Yandex API notifications (public webhook) - accept any content-type
const YANDEX_NOTIFY_SECRET = process.env.YANDEX_NOTIFY_SECRET;
app.use('/yandex/notify', express.text({ type: '*/*' }));
app.all('/yandex/notify/:secret?', async (req, res) => {
  const secret = req.params.secret || req.query.secret || req.headers['x-notify-secret'];
  if (YANDEX_NOTIFY_SECRET && String(secret) !== String(YANDEX_NOTIFY_SECRET)) {
    return res.status(401).send('Unauthorized');
  }

  res.status(200).send('OK');

  try {
    const bodyText =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const msg = `Yandex notify: ${bodyText}`.slice(0, 3500);
    if (!DISABLE_BOT && ADMIN_IDS.length) {
      for (const chatId of ADMIN_IDS) {
        // eslint-disable-next-line no-await-in-loop
        await bot.telegram.sendMessage(chatId, msg);
      }
    }
  } catch (e) {
    console.error('Yandex notify error:', e.message);
  }
});

app.use(express.json());

// WEB
const addWebRoutes = () => {
  authPages(app);
  dashboard(app);
  admin(app);
  api(app);
};
addWebRoutes();

// TELEGRAM WEBHOOK
app.post('/telegram', (req, res) => {
  if (DISABLE_BOT) return res.status(200).send('Bot disabled');
  bot.handleUpdate(req.body, res);
});

// START
app.listen(PORT, async () => {
  try {
    await ensureCategories();
    await ensureProject();
    const admin = await ensureAdminUser();
    await ensureAdminMemberships(admin);
    await ensureAdminSubscription(admin);
    await ensureSellerTokenFromEnv();
  } catch (e) {
    console.error('Bootstrap error:', e.message);
  }

  console.log('Server running on', PORT);

  if (setupCron) setupCron();

  if (DISABLE_BOT) {
    console.warn('Bot disabled via DISABLE_BOT=true');
    return;
  }

  setupAlerts(bot, ADMIN_IDS);
  setupBotCron(bot, ADMIN_IDS);

  try {
    console.log('Webhook mode:', WEBHOOK_URL ? 'ON' : 'OFF');
    if (WEBHOOK_URL) {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
      console.log('Webhook connected');
    } else if (IS_RAILWAY && !ENABLE_POLLING) {
      console.warn('Polling disabled on Railway (set WEBHOOK_URL or ENABLE_POLLING=true).');
    } else {
      await bot.telegram.deleteWebhook();
      await bot.launch();
      console.log('Bot launched (long polling)');
    }
  } catch (e) {
    console.error('Bot init failed:', e.message);
  }
});
