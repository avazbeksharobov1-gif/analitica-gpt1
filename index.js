require('dotenv').config();
const { getStats } = require('./yandex');

const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();

/* ---------- EXPRESS ---------- */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'alive' });
});

/* ---------- TELEGRAM BOT ---------- */
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    '✅ Analitica GPT ишлаяпти!\n\n' +
    'Командалар:\n' +
    '/status — сервер ҳолати\n' +
    '/ping — текшириш'
  );
});

bot.command('ping', (ctx) => {
  ctx.reply('🏓 Pong!');
});

bot.command('status', (ctx) => {
  ctx.reply('🟢 Сервер ва бот ишлаяпти');
});

bot.launch()
  .then(() => console.log('🤖 Telegram bot started'))
  .catch(err => console.error('❌ Bot error:', err));

/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
});
bot.command('stats', async (ctx) => {
  const s = await getStats();
  ctx.reply(
    `📊 Яндекс ҳисобот:\n` +
    `💰 Даромад: ${s.revenue}\n` +
    `📦 Буюртма: ${s.orders}\n` +
    `📢 Реклама: ${s.ads}`
  );
});











