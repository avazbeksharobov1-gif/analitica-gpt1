const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function aiInsight(prev, curr) {
  const prompt = `
Oldingi daromad: ${prev}
Hozirgi daromad: ${curr}

Daromad pasayishiga 3 ta qisqa sabab va 2 ta amaliy tavsiya yozing.
Javobni ozbek tilida (lotin) yozing.
`;

  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  return r.choices[0].message.content;
}

async function aiRecommend(stats) {
  const prompt = `
Daromad: ${stats.revenue}
Buyurtmalar: ${stats.orders}
Komissiya: ${stats.fees}
Ekvayring: ${stats.acquiring}
Logistika: ${stats.logistics}
Qaytarish: ${stats.returns}
Xarajat: ${stats.expenses}
COGS: ${stats.cogs}
Foyda: ${stats.profit}

Quyidagilar bo'yicha qisqa tavsiyalar bering:
1) Marketing
2) Narx
3) Tezkor yaxshilashlar
Javobni ozbek tilida (lotin) yozing.
`;

  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  return r.choices[0].message.content;
}

async function aiAnomalyDetect(series) {
  const prompt = `
Seriya: ${JSON.stringify(series)}

Anomaliyalarni toping. Sana/indeks va sababini qisqa punktlar bilan yozing.
Javobni ozbek tilida (lotin) yozing.
`;

  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  return r.choices[0].message.content;
}

async function aiProductProfit(items) {
  const prompt = `
Mahsulot foydasi (JSON): ${JSON.stringify(items)}

Qaysi mahsulotlar foydali, qaysilari zarar ekanini tahlil qiling.
3-5 ta asosiy xulosa va amaliy tavsiya bering.
Javobni ozbek tilida (lotin) yozing.
`;

  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  return r.choices[0].message.content;
}

module.exports = { aiRecommend, aiInsight, aiAnomalyDetect, aiProductProfit };
