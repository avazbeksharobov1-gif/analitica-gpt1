let chart;
let dailyChart;
let currentRange = '7d';

function fmt(n) {
  return Math.round(n || 0).toLocaleString();
}

function rangeToDates(range) {
  const to = new Date();
  const from = new Date();
  if (range === '7d') from.setDate(from.getDate() - 6);
  if (range === '30d') from.setDate(from.getDate() - 29);
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

function updateExportLinks() {
  const { from, to } = rangeToDates(currentRange);
  const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
    to.toISOString()
  )}`;
  const excel = document.getElementById('exportExcel');
  const pdf = document.getElementById('exportPdf');
  if (excel) excel.href = `/api/export/excel?${qs}`;
  if (pdf) pdf.href = `/api/export/pdf?${qs}`;
}

async function loadKpi(range) {
  const { from, to } = rangeToDates(range);
  const r = await fetch(`/api/stats?from=${from.toISOString()}&to=${to.toISOString()}`);
  const s = await r.json();

  document.getElementById('kpi-revenue').innerText = fmt(s.revenue);
  document.getElementById('kpi-orders').innerText = fmt(s.orders);
  document.getElementById('kpi-expenses').innerText = fmt(
    s.expenses + s.fees + (s.acquiring || 0) + s.logistics + s.returns + s.cogs
  );
  document.getElementById('kpi-profit').innerText = fmt(s.profit);

  const margin = s.revenue ? (s.profit / s.revenue) * 100 : 0;
  document.getElementById('kpi-margin').innerText = `Margin: ${margin.toFixed(1)}%`;
  document.getElementById('kpi-range').innerText = `Range: ${range}`;

  document.getElementById('kpi-fees').innerText = fmt(s.fees);
  document.getElementById('kpi-acquiring').innerText = fmt(s.acquiring || 0);
  document.getElementById('kpi-logistics').innerText = fmt(s.logistics);
  document.getElementById('kpi-returns').innerText = fmt(s.returns);
  document.getElementById('kpi-expenses-break').innerText = fmt(s.expenses);
  document.getElementById('kpi-cogs').innerText = fmt(s.cogs);
}

async function loadCompare() {
  const r = await fetch('/api/compare');
  const d = await r.json();
  const curr = d.thisWeek?.revenue || 0;
  const prev = d.lastWeek?.revenue || 0;
  const diff = prev ? ((curr - prev) / prev) * 100 : 0;
  const currProfit = d.thisWeek?.profit || 0;
  const prevProfit = d.lastWeek?.profit || 0;
  const diffProfit = prevProfit ? ((currProfit - prevProfit) / prevProfit) * 100 : 0;
  const sign = diff >= 0 ? '+' : '';
  const signP = diffProfit >= 0 ? '+' : '';
  document.getElementById('compareText').innerText =
    `Revenue this week: ${fmt(curr)}\nRevenue last week: ${fmt(prev)}\nRevenue change: ${sign}${diff.toFixed(1)}%\n\n` +
    `Profit this week: ${fmt(currProfit)}\nProfit last week: ${fmt(prevProfit)}\nProfit change: ${signP}${diffProfit.toFixed(1)}%`;
}

async function loadForecast() {
  const r = await fetch('/api/forecast-compare');
  const d = await r.json();
  const labels = d.current.map((_, i) => `Day ${i + 1}`);

  const data = {
    labels,
    datasets: [
      { label: 'Current', data: d.current, borderColor: '#22c55e', tension: 0.4 },
      { label: 'Previous', data: d.previous, borderColor: '#ef4444', tension: 0.4 }
    ]
  };

  if (chart) {
    chart.data = data;
    chart.update();
    return;
  }

  chart = new Chart(document.getElementById('forecastChart'), {
    type: 'line',
    data,
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

async function loadDailySeries(range) {
  const { from, to } = rangeToDates(range);
  const r = await fetch(`/api/series?from=${from.toISOString()}&to=${to.toISOString()}`);
  const rows = await r.json();
  if (!Array.isArray(rows)) return;

  const labels = rows.map(r => r.date);
  const revenue = rows.map(r => r.revenue || 0);
  const profit = rows.map(r => r.profit || 0);

  const data = {
    labels,
    datasets: [
      { label: 'Revenue', data: revenue, borderColor: '#2563eb', tension: 0.35 },
      { label: 'Profit', data: profit, borderColor: '#16a34a', tension: 0.35 }
    ]
  };

  if (dailyChart) {
    dailyChart.data = data;
    dailyChart.update();
    return;
  }

  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type: 'line',
    data,
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

async function loadProducts(range) {
  const { from, to } = rangeToDates(range);
  const r = await fetch(`/api/products/profit?from=${from.toISOString()}&to=${to.toISOString()}`);
  const items = await r.json();

  const tbody = document.getElementById('productTable');
  const count = document.getElementById('productsCount');
  if (!Array.isArray(items)) {
    tbody.innerHTML = '<tr><td colspan="11">No data</td></tr>';
    count.innerText = '0 items';
    return;
  }

  count.innerText = `${items.length} items`;
  tbody.innerHTML = items.map((p) => {
    const margin = p.revenue ? (p.profit / p.revenue) * 100 : 0;
    return `
      <tr>
        <td>${p.sku}</td>
        <td>${p.name}</td>
        <td>${fmt(p.quantity)}</td>
        <td>${fmt(p.revenue)}</td>
        <td>${fmt(p.fees)}</td>
        <td>${fmt(p.acquiring || 0)}</td>
        <td>${fmt(p.logistics)}</td>
        <td>${fmt(p.returns)}</td>
        <td>${fmt(p.cogs)}</td>
        <td>${fmt(p.profit)}</td>
        <td>${margin.toFixed(1)}%</td>
      </tr>
    `;
  }).join('');
}

async function loadAI() {
  const set = (id, text) => (document.getElementById(id).innerText = text);
  document.getElementById('aiStatus').innerText = 'Loading...';

  try {
    const [insight, recommend, anomaly, product] = await Promise.all([
      fetch('/api/insight').then(r => r.text()),
      fetch('/api/recommend').then(r => r.text()),
      fetch('/api/anomaly').then(r => r.text()),
      fetch('/api/products/insight').then(r => r.text())
    ]);

    set('aiInsight', insight || 'No data');
    set('aiRecommend', recommend || 'No data');
    set('aiAnomaly', anomaly || 'No data');
    set('aiProduct', product || 'No data');
    document.getElementById('aiStatus').innerText = 'Ready';
  } catch (e) {
    set('aiInsight', 'AI not available');
    set('aiRecommend', 'AI not available');
    set('aiAnomaly', 'AI not available');
    set('aiProduct', 'AI not available');
    document.getElementById('aiStatus').innerText = 'Error';
  }
}

async function loadAll() {
  await Promise.all([
    loadKpi(currentRange),
    loadCompare(),
    loadForecast(),
    loadDailySeries(currentRange),
    loadProducts(currentRange)
  ]);
  document.getElementById('lastUpdated').innerText = `Updated: ${new Date().toLocaleString()}`;
  updateExportLinks();
}

function setupRangeButtons() {
  document.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = btn.dataset.range;
      loadAll();
    });
  });
}

function setupActions() {
  document.getElementById('refreshBtn').addEventListener('click', loadAll);
  document.getElementById('aiBtn').addEventListener('click', loadAI);
}

setupRangeButtons();
setupActions();
loadAll();
loadAI();
