async function loadAI() {
  const forecastEl = document.getElementById('ai-forecast');
  const adsEl = document.getElementById('ai-ads');

  if (!forecastEl || !adsEl) return;

  try {
    forecastEl.textContent = '⏳ Юкланяпти...';
    adsEl.textContent = '⏳ Юкланяпти...';

    // Backendда мавжуд маршрутлардан фойдаланиш:
    // /api/insight  – умумий AI таҳлил
    // /api/recommend – тавсиялар
    const forecastRes = await fetch('/api/insight');
    const adsRes = await fetch('/api/recommend');

    if (forecastRes.ok) {
      const text = (await forecastRes.text()).trim();
      forecastEl.textContent = text || 'Маълумот йўқ';
    } else {
      forecastEl.textContent = 'AI прогноз уланмаган';
    }

    if (adsRes.ok) {
      const text = (await adsRes.text()).trim();
      adsEl.textContent = text || 'Маълумот йўқ';
    } else {
      adsEl.textContent = 'AI реклама уланмаган';
    }

  } catch (e) {
    forecastEl.textContent = 'AI ҳозирча фаол эмас';
    adsEl.textContent = 'AI ҳозирча фаол эмас';
  }
}

document.addEventListener('DOMContentLoaded', loadAI);
