const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/ai/forecast', (req, res) => {
  res.json({ result: 'AI прогноз тайёр эмас (MVP)' });
});

app.get('/api/ai/ads', (req, res) => {
  res.json({ result: 'AI реклама тайёр эмас (MVP)' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
});



