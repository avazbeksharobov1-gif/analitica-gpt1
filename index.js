require('dotenv').config();

const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const { getStats } = require('./yandex');

const app = express();

/* ---------- EXPRESS ---------- */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'alive' });
});

/* ---------- TELEGRAM ---------- */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

console.log('BOT TOKEN:', BOT_TOKEN ? 'OK' : 'MISSING');

if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);

  bot.start((ctx) =>
    ctx.reply(
      '✅ Analitica GPT ишлаяпти!\n\n' +
      '/ping — текшириш\n' +
      '/status — ҳолат\n' +
      '/stats — Яндекс ҳисобот'
    )
  );

  bot.command('ping', (ctx) => ctx.reply('🏓 Pong!'));
  bot.command('status', (ctx) => ctx.reply('🟢 Сервер ишлаяпти'));

  bot.command('stats', async (ctx) => {
    const s = await getStats();
    ctx.reply(
      `📊 Яндекс ҳисобот:\n` +
      `💰 Даромад: ${s.revenue}\n` +
      `📦 Буюртма: ${s.orders}\n` +
      `📢 Реклама: ${s.ads}`
    );
  });

  bot.launch()
    .then(() => console.log('🤖 Telegram bot started'))
    .catch(err => console.error('❌ Bot error:', err));
} else {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing');
}

/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
});














