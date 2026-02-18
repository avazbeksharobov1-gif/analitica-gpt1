const { generateGeminiText } = require('./gemini');

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

async function generateWithGemini(prompt) {
  return generateGeminiText(prompt);
}

async function askAI(prompt) {
  return generateWithGemini(prompt);
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

async function getInsight(prev, curr) {
  return aiInsight(prev, curr);
}

async function getRecommendation(stats) {
  return aiRecommend(stats);
}

async function getAnomaly(series) {
  return aiAnomalyDetect(series);
}

module.exports = {
  aiRecommend,
  aiInsight,
  aiAnomalyDetect,
  aiProductProfit,
  getInsight,
  getRecommendation,
  getAnomaly
};
