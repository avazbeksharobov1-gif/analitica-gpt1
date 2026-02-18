const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-002'];

function createClient() {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY missing');
  }
  let GoogleGenerativeAI;
  try {
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
  } catch (e) {
    throw new Error('Gemini SDK missing: run npm install @google/generative-ai');
  }
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

function isModelNotFoundError(err) {
  const msg = String(err && err.message ? err.message : '').toLowerCase();
  return msg.includes('404') || (msg.includes('model') && msg.includes('not found'));
}

async function generateGeminiText(prompt) {
  const genAI = createClient();
  const modelQueue = [GEMINI_MODEL, ...FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL)];
  let lastErr;

  for (const modelName of modelQueue) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      lastErr = err;
      if (!isModelNotFoundError(err)) break;
    }
  }

  throw lastErr || new Error('Gemini request failed');
}

async function getBusinessInsight(data) {
  const prompt = `
Sen professional biznes tahlilchisan. Quyidagi Yandex Market sotuv malumotlarini tahlil qil:
${JSON.stringify(data)}

Javobni ozbek tilida, qisqa va lunda ber:
1. Eng kop foyda keltirgan 3 ta tovar.
2. Zararga ishlayotgan yoki marjasi past tovarlar.
3. Reklama va logistika xarajatlarini kamaytirish boyicha 2 ta maslahat.
`;

  return generateGeminiText(prompt);
}

module.exports = { generateGeminiText, getBusinessInsight };
