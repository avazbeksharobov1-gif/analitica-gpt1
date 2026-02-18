const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

function getModel() {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY missing');
  }
  let GoogleGenerativeAI;
  try {
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
  } catch (e) {
    throw new Error('Gemini SDK missing: run npm install @google/generative-ai');
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

async function generateGeminiText(prompt) {
  const model = getModel();
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function getBusinessInsight(data) {
  const prompt = `
Сен профессионал бизнес таҳлилчисан. Қуйидаги Yandex Market сотув маълумотларини таҳлил қил:
${JSON.stringify(data)}

Жавобни ўзбек тилида, қисқа ва лўнда бер:
1. Энг кўп фойда келтирган 3 та товар.
2. Зарарга ишлаётган ёки маржаси паст товарлар.
3. Реклама ва логистика харажатларини камайтириш бўйича 2 та маслаҳат.
`;

  return generateGeminiText(prompt);
}

module.exports = { generateGeminiText, getBusinessInsight };
