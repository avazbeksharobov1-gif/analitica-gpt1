async function load() {
  const r = await fetch('/api/stats');
  const s = await r.json();

  document.getElementById('rev').innerText = '💰 ' + s.revenue;
  document.getElementById('ord').innerText = '📦 ' + s.orders;
  document.getElementById('ads').innerText = '📢 ' + s.ads;

  new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      labels: ['Today'],
      datasets: [{
        label: 'Revenue',
        data: [s.revenue],
        borderColor: '#22c55e'
      }]
    }
  });
}

load();
setInterval(load, 60000);

