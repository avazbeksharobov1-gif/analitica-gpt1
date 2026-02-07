require('dotenv').config();
const express = require('express');
const path = require('path');

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
const api = require('./web/api');
const { ensureCategories, ensureProject } = require('./services/bootstrap');

const app = express();
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/dashboard'));

// WEB
const addWebRoutes = () => {
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
  } catch (e) {
    console.error('Bootstrap error:', e.message);
  }

  console.log('Server running on', PORT);

  if (DISABLE_BOT) {
    console.warn('Bot disabled via DISABLE_BOT=true');
    return;
  }

  setupAlerts(bot, ADMIN_IDS);
  setupBotCron(bot, ADMIN_IDS);
  if (setupCron) setupCron(bot);

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
});
