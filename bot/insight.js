const { generateGeminiText } = require('../services/gemini');

async function analyzeDrop(prev, curr) {
  const prompt = `
Yesterday: ${prev}
Today: ${curr}
Why did revenue drop?
Give 3 reasons.
`;

  return generateGeminiText(prompt);
}

module.exports = { analyzeDrop };
