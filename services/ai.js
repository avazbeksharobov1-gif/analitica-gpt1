const OpenAI = require('openai');
const fetch = require('node-fetch');
const { generateGeminiText } = require('./gemini');

const AI_PROVIDER = String(process.env.AI_PROVIDER || 'auto').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function resolveProvider() {
  if (AI_PROVIDER === 'gemini' || AI_PROVIDER === 'openai') return AI_PROVIDER;
  if (GEMINI_API_KEY) return 'gemini';
  return 'openai';
}

function withRules(taskPrompt) {
  return `
Siz e-commerce analitik assistentsiz.
Qoidalar:
- Faqat ozbek tilida (lotin) yozing.
- Javob juda aniq va qisqa bolsin.
- Taxmin bo'lsa "taxmin" deb yozing.
- Har doim oxirida "Keyingi qadam" bolimi bo'lsin (1-2 aniq action).

${taskPrompt}
`;
}

function fmtNum(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(2);
}

async function generateWithOpenAI(prompt) {
  if (!openai) throw new Error('OPENAI_API_KEY missing');

  const r = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4
  });

  return r.choices?.[0]?.message?.content?.trim() || '';
}

async function generateWithGemini(prompt) {
  try {
    return await generateGeminiText(prompt);
  } catch (sdkErr) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent` +
      `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 700
        }
      })
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Gemini API error: ${r.status} ${text}`);
    }

    const data = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text || '')
        .join('')
        .trim() || '';

    if (!text) throw new Error('Gemini empty response');
    return text;
  }
}

async function askAI(prompt) {
  const provider = resolveProvider();
  if (provider === 'gemini') return generateWithGemini(prompt);
  return generateWithOpenAI(prompt);
}

async function aiInsight(prev, curr) {
  const p = Number(prev || 0);
  const c = Number(curr || 0);
  const delta = c - p;
  const pct = p > 0 ? (delta / p) * 100 : 0;

  const prompt = withRules(`
Haftalik daromad tahlili:
- Oldingi hafta: ${fmtNum(p)}
- Joriy hafta: ${fmtNum(c)}
- Farq: ${fmtNum(delta)} (${fmtNum(pct)}%)

Format:
1) Xulosa (1-2 gap)
2) Sabablar (aniq 3 ta punkt)
3) Keyingi qadam (aniq 2 ta punkt)
`);

  return askAI(prompt);
}

async function aiRecommend(stats) {
  const prompt = withRules(`
KPI:
- Daromad: ${fmtNum(stats.revenue)}
- Buyurtmalar: ${fmtNum(stats.orders)}
- Komissiya: ${fmtNum(stats.fees)}
- Ekvayring: ${fmtNum(stats.acquiring)}
- Logistika: ${fmtNum(stats.logistics)}
- Qaytarish: ${fmtNum(stats.returns)}
- Xarajat: ${fmtNum(stats.expenses)}
- COGS: ${fmtNum(stats.cogs)}
- Foyda: ${fmtNum(stats.profit)}

Format:
1) Marketing bo'yicha 2 ta tavsiya
2) Narx bo'yicha 2 ta tavsiya
3) Tezkor yaxshilash bo'yicha 2 ta tavsiya
4) Keyingi qadam (1-2 punkt)
`);

  return askAI(prompt);
}

async function aiAnomalyDetect(series) {
  const safeSeries = Array.isArray(series) ? series.slice(-90) : [];

  const prompt = withRules(`
Kunlik seriya (oxirgi ${safeSeries.length} nuqta):
${JSON.stringify(safeSeries)}

Vazifa:
- Anomaliya bo'lgan 3 tagacha nuqtani toping.
- Har biri uchun: sana, qiymat, taxminiy sabab.
- Oxirida "Keyingi qadam" bolimi yozing.
`);

  return askAI(prompt);
}

async function aiProductProfit(items) {
  const safeItems = Array.isArray(items) ? items.slice(0, 120) : [];

  const prompt = withRules(`
Mahsulotlar foydasi (JSON):
${JSON.stringify(safeItems)}

Vazifa:
1) Top-3 foydali mahsulot
2) Top-3 zararli mahsulot
3) Marja oshirish uchun 3 ta aniq tavsiya
4) Keyingi qadam (1-2 punkt)
`);

  return askAI(prompt);
}

module.exports = { aiRecommend, aiInsight, aiAnomalyDetect, aiProductProfit };
