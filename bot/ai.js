const { generateGeminiText } = require('../services/gemini');

async function aiInsight(prev, curr) {
  const prompt = `
Oldingi daromad: ${prev.revenue}
Hozirgi daromad: ${curr.revenue}

Daromad pasayishiga sabablarni va qisqa tavsiyalarni yozing.
Javobni ozbek tilida (lotin) yozing.
`;

  return generateGeminiText(prompt);
}

module.exports = { aiInsight };


