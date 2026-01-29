async function load() {
  const res = await fetch('/api/stats');
  const data = await res.json();

  document.getElementById('revenue').innerText =
    data.revenue.toLocaleString();

  document.getElementById('expenses').innerText =
    data.expenses.toLocaleString();

  document.getElementById('profit').innerText =
    data.profit.toLocaleString();

  document.getElementById('ai').innerText =
    data.ai.map(x => '• ' + x).join('\n');
}

load();

