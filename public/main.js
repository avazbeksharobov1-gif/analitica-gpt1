let chart;
let dailyChart;
let skuChart;
let currentSku = '';
let currentRange = '7d';
let currentProjectId = null;
let authReady = false;

function fmt(n) {
  return Math.round(n || 0).toLocaleString();
}

function rangeLabel(range) {
  if (range === '7d') return '7 kun';
  if (range === '30d') return '30 kun';
  if (range === 'today') return 'Bugun';
  return range;
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

async function ensureAuth() {
  if (authReady) return;
  const r = await fetch('/api/auth/me');
  if (r.status === 401) {
    window.location.href = '/login';
    return;
  }
  const data = await r.json();
  if (!data || !data.ok) {
    authReady = true;
    return;
  }
  authReady = true;
  currentProjectId = data.currentProjectId || (data.projects[0] && data.projects[0].id);
  updateProjectSelect(data.projects || [], currentProjectId);
}

function updateProjectSelect(projects, currentId) {
  const select = document.getElementById('projectSelect');
  if (!select) return;
  if (!projects.length) {
    select.innerHTML = "<option value=\"\">Loyiha yo'q</option>";
    return;
  }
  select.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  select.value = String(currentId || projects[0].id);
}

async function loadKpi(range) {
  const { from, to } = rangeToDates(range);
  const r = await fetch(`/api/stats?from=${from.toISOString()}&to=${to.toISOString()}`);
  const s = await r.json();
  const tax1 = s.tax1 || 0;
  const socialTax = s.socialTax || 0;

  document.getElementById('kpi-revenue').innerText = fmt(s.revenue);
  document.getElementById('kpi-orders').innerText = fmt(s.orders);
  const ordersNew = s.ordersCreated || s.ordersNew || 0;
  const ordersWarehouse = s.ordersWarehouse || s.ordersInWarehouse || 0;
  const ordersDelivered = s.ordersDelivered || s.ordersDone || 0;
  const elNew = document.getElementById('kpi-orders-new');
  const elWh = document.getElementById('kpi-orders-warehouse');
  const elDel = document.getElementById('kpi-orders-delivered');
  if (elNew) elNew.innerText = fmt(ordersNew);
  if (elWh) elWh.innerText = fmt(ordersWarehouse);
  if (elDel) elDel.innerText = fmt(ordersDelivered);
  document.getElementById('kpi-expenses').innerText = fmt(
    s.expenses +
      s.fees +
      (s.acquiring || 0) +
      s.logistics +
      s.returns +
      s.cogs +
      tax1 +
      socialTax
  );
  document.getElementById('kpi-profit').innerText = fmt(s.profit);

  const margin = s.revenue ? (s.profit / s.revenue) * 100 : 0;
  document.getElementById('kpi-margin').innerText = `Marja: ${margin.toFixed(1)}%`;
  document.getElementById('kpi-range').innerText = `Davr: ${rangeLabel(range)}`;

  document.getElementById('kpi-fees').innerText = fmt(s.fees);
  document.getElementById('kpi-acquiring').innerText = fmt(s.acquiring || 0);
  document.getElementById('kpi-logistics').innerText = fmt(s.logistics);
  document.getElementById('kpi-returns').innerText = fmt(s.returns);
  document.getElementById('kpi-expenses-break').innerText = fmt(s.expenses);
  document.getElementById('kpi-tax1').innerText = fmt(tax1);
  document.getElementById('kpi-social-tax').innerText = fmt(socialTax);
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
    `Daromad (shu hafta): ${fmt(curr)}\nDaromad (otgan hafta): ${fmt(prev)}\nOzgarish: ${sign}${diff.toFixed(1)}%\n\n` +
    `Foyda (shu hafta): ${fmt(currProfit)}\nFoyda (otgan hafta): ${fmt(prevProfit)}\nOzgarish: ${signP}${diffProfit.toFixed(1)}%`;
}

async function loadForecast() {
  const r = await fetch('/api/forecast-compare');
  const d = await r.json();
  const labels = d.current.map((_, i) => `Kun ${i + 1}`);

  const data = {
    labels,
    datasets: [
      { label: 'Joriy', data: d.current, borderColor: '#22c55e', tension: 0.4 },
      { label: 'Oldingi', data: d.previous, borderColor: '#ef4444', tension: 0.4 }
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
      { label: 'Daromad', data: revenue, borderColor: '#2563eb', tension: 0.35 },
      { label: 'Foyda', data: profit, borderColor: '#16a34a', tension: 0.35 }
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

async function loadExpenseSummary(range) {
  const { from, to } = rangeToDates(range);
  const r = await fetch(`/api/expenses/summary?from=${from.toISOString()}&to=${to.toISOString()}`);
  const items = await r.json();
  const wrap = document.getElementById('expenseSummary');
  if (!wrap) return;
  if (!Array.isArray(items) || !items.length) {
    wrap.innerHTML = '<div><span>Reklama</span><b>0</b></div>';
    return;
  }
  wrap.innerHTML = items
    .map((i) => `<div><span>${i.name}</span><b>${fmt(i.amount)}</b></div>`)
    .join('');
}

async function loadExpenseCategories() {
  const r = await fetch('/api/expense-categories');
  const list = await r.json();
  const select = document.getElementById('expenseCategory');
  if (!select || !Array.isArray(list)) return;
  select.innerHTML = list.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
}

async function loadPlan() {
  const r = await fetch('/api/billing/plan');
  if (!r.ok) return;
  const d = await r.json();
  if (!d || !d.ok) return;
  const plan = d.plan;
  const info = document.getElementById('planInfo');
  const actions = document.getElementById('planActions');
  if (info) {
    info.innerText =
      `Tarif: ${plan.name} (${plan.price} so'm)\n` +
      `Magazin limiti: ${plan.projectLimit} ta\n` +
      `Sizda: ${d.projectCount} ta`;
  }

  if (actions) {
    actions.innerHTML = '';
    if (d.testMode) {
      ['FREE', 'PRO', 'BUSINESS'].forEach((code) => {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.innerText = `${code} (test)`;
        btn.onclick = async () => {
          await fetch('/api/billing/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: code })
          });
          loadPlan();
        };
        actions.appendChild(btn);
      });
    } else {
      actions.innerHTML = '<span class="muted">Payme/Click orqali tolov</span>';
    }
  }
}

async function loadTokenConfig() {
  const r = await fetch('/api/tokens');
  if (!r.ok) return;
  const list = await r.json();
  if (!Array.isArray(list) || !list.length) return;
  const t = list[0];
  const apiKeys = document.getElementById('tokenApiKeys');
  const campaignIds = document.getElementById('tokenCampaignIds');
  const baseUrl = document.getElementById('tokenBaseUrl');
  const authMode = document.getElementById('tokenAuthMode');
  if (apiKeys) apiKeys.value = '';
  if (campaignIds) campaignIds.value = t.campaignIds || '';
  if (baseUrl) baseUrl.value = t.baseUrl || 'https://api.partner.market.yandex.ru';
  if (authMode) authMode.value = t.authMode || 'api-key';
}

async function loadProducts(range) {
  const { from, to } = rangeToDates(range);
  const [productsRes, metricsRes] = await Promise.all([
    fetch('/api/products'),
    fetch(`/api/products/profit?from=${from.toISOString()}&to=${to.toISOString()}`)
  ]);
  const products = await productsRes.json();
  const metrics = await metricsRes.json();

  const tbody = document.getElementById('productTable');
  const count = document.getElementById('productsCount');
  if (!Array.isArray(products) || !Array.isArray(metrics)) {
    tbody.innerHTML = "<tr><td colspan=\"12\">Ma'lumot yo'q</td></tr>";
    count.innerText = '0 ta';
    return [];
  }

  const metricMap = new Map(metrics.map(m => [m.sku, m]));
  const productSkus = new Set(products.map(p => p.sku));

  const items = products.map((p) => {
    const m = metricMap.get(p.sku) || {
      quantity: 0,
      revenue: 0,
      fees: 0,
      acquiring: 0,
      logistics: 0,
      returns: 0,
      cogs: 0,
      profit: 0
    };
    return {
      sku: p.sku,
      name: p.name,
      costPrice: p.costPrice,
      ...m
    };
  });

  for (const m of metrics) {
    if (!productSkus.has(m.sku)) {
      items.push({
        sku: m.sku,
        name: m.name || m.sku,
        costPrice: 0,
        quantity: m.quantity || 0,
        revenue: m.revenue || 0,
        fees: m.fees || 0,
        acquiring: m.acquiring || 0,
        logistics: m.logistics || 0,
        returns: m.returns || 0,
        cogs: m.cogs || 0,
        profit: m.profit || 0
      });
    }
  }

  count.innerText = `${items.length} ta`;
  tbody.innerHTML = items.map((p) => {
    const margin = p.revenue ? (p.profit / p.revenue) * 100 : 0;
    return `
      <tr>
        <td>${p.sku}</td>
        <td>${p.name}</td>
        <td>
          <input class="cost-input" type="number" min="0" step="1"
                 data-sku="${p.sku}" data-name="${p.name}"
                 value="${Math.round(p.costPrice || 0)}" />
        </td>
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

  document.querySelectorAll('.cost-input').forEach((input) => {
    input.addEventListener('change', async () => {
      const sku = input.dataset.sku;
      const name = input.dataset.name;
      const costPrice = Number(input.value || 0);
      await saveCost(sku, name, costPrice);
    });
  });

  return items;
}

async function loadAI() {
  const set = (id, text) => (document.getElementById(id).innerText = text);
  const aiBtn = document.getElementById('aiBtn');
  const aiStatus = document.getElementById('aiStatus');

  if (aiStatus) aiStatus.innerText = 'Yuklanmoqda...';
  if (aiBtn) {
    aiBtn.disabled = false;
    aiBtn.innerText = 'AI yangilash';
  }

  const setDisabled = (note) => {
    const msg = note || "AI vaqtincha o'chirilgan (budjet yo'q)";
    set('aiInsight', msg);
    set('aiRecommend', msg);
    set('aiAnomaly', msg);
    set('aiProduct', msg);
    if (aiStatus) aiStatus.innerText = "AI o'chirilgan";
    if (aiBtn) {
      aiBtn.disabled = true;
      aiBtn.innerText = "AI o'chirilgan";
    }
  };

  try {
    const [insight, recommend, anomaly, product] = await Promise.all([
      fetch('/api/insight').then(r => r.text()),
      fetch('/api/recommend').then(r => r.text()),
      fetch('/api/anomaly').then(r => r.text()),
      fetch('/api/products/insight').then(r => r.text())
    ]);

    const texts = [insight, recommend, anomaly, product].map(t => String(t || '').trim());
    if (texts.some(t => t.toLowerCase().includes('ai disabled'))) {
      setDisabled();
      return;
    }

    set('aiInsight', insight || "Ma'lumot yo'q");
    set('aiRecommend', recommend || "Ma'lumot yo'q");
    set('aiAnomaly', anomaly || "Ma'lumot yo'q");
    set('aiProduct', product || "Ma'lumot yo'q");
    if (aiStatus) aiStatus.innerText = 'Tayyor';
  } catch (e) {
    set('aiInsight', 'AI mavjud emas');
    set('aiRecommend', 'AI mavjud emas');
    set('aiAnomaly', 'AI mavjud emas');
    set('aiProduct', 'AI mavjud emas');
    if (aiStatus) aiStatus.innerText = 'Xato';
  }
}

async function loadAll() {
  await ensureAuth();
  const [_, __, ___, ____, products] = await Promise.all([
    loadKpi(currentRange),
    loadCompare(),
    loadForecast(),
    loadDailySeries(currentRange),
    loadProducts(currentRange)
  ]);
  document.getElementById('lastUpdated').innerText = `Yangilandi: ${new Date().toLocaleString()}`;
  updateExportLinks();
  updateSkuSelect(products || []);
  loadExpenseSummary(currentRange);
  loadPlan();
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

  const projectSelect = document.getElementById('projectSelect');
  if (projectSelect) {
    projectSelect.addEventListener('change', async () => {
      const projectId = Number(projectSelect.value || 0);
      if (!projectId) return;
      await fetch('/api/auth/select-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      currentProjectId = projectId;
      loadAll();
    });
  }

  const syncBtn = document.getElementById('syncSkuBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.innerText = 'Yuklanmoqda...';
      try {
        await fetch('/api/products/sync', { method: 'POST' });
        await loadAll();
      } catch (e) {
        // ignore
      }
      syncBtn.disabled = false;
      syncBtn.innerText = 'SKUlarni yangilash';
    });
  }

  const syncRangeBtn = document.getElementById('syncRangeBtn');
  if (syncRangeBtn) {
    syncRangeBtn.addEventListener('click', async () => {
      syncRangeBtn.disabled = true;
      syncRangeBtn.innerText = 'Sinxronlash...';
      const { from, to } = rangeToDates('30d');
      await fetch('/api/sync/range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from.toISOString(), to: to.toISOString() })
      });
      await loadAll();
      syncRangeBtn.disabled = false;
      syncRangeBtn.innerText = '30 kunlik sinxronlash';
    });
  }

  const expenseForm = document.getElementById('expenseForm');
  if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = document.getElementById('expenseCategory').value;
      const amount = Number(document.getElementById('expenseAmount').value || 0);
      const note = document.getElementById('expenseNote').value || '';
      if (!amount) return;
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, amount, note })
      });
      document.getElementById('expenseAmount').value = '';
      document.getElementById('expenseNote').value = '';
      loadAll();
    });
  }

  const tokenForm = document.getElementById('tokenForm');
  if (tokenForm) {
    tokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const apiKeys = document.getElementById('tokenApiKeys').value;
      const campaignIds = document.getElementById('tokenCampaignIds').value;
      const baseUrl = document.getElementById('tokenBaseUrl').value;
      const authMode = document.getElementById('tokenAuthMode').value;
      const status = document.getElementById('tokenStatus');
      status.innerText = 'Saqlanmoqda...';
      await fetch('/api/tokens/seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeys, campaignIds, baseUrl, authMode })
      });
      status.innerText = 'Saqlandi';
    });
  }
}

async function saveCost(sku, name, costPrice) {
  await fetch('/api/products/cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, name, costPrice })
  });
  loadAll();
}

function updateSkuSelect(items) {
  const select = document.getElementById('skuSelect');
  if (!select) return;
  if (!items.length) {
    select.innerHTML = "<option value=\"\">SKU yo'q</option>";
    return;
  }

  const previous = currentSku || items[0].sku;
  select.innerHTML = items.map(p => `<option value="${p.sku}">${p.sku}</option>`).join('');
  select.value = previous;
  currentSku = select.value;
  loadSkuSeries(currentSku, currentRange);

  if (!select.dataset.bound) {
    select.dataset.bound = '1';
    select.addEventListener('change', () => {
      currentSku = select.value;
      loadSkuSeries(currentSku, currentRange);
    });
  }
}

async function loadSkuSeries(sku, range) {
  if (!sku) return;
  const { from, to } = rangeToDates(range);
  const r = await fetch(`/api/series/sku?sku=${encodeURIComponent(sku)}&from=${from.toISOString()}&to=${to.toISOString()}`);
  const rows = await r.json();
  if (!Array.isArray(rows)) return;

  const labels = rows.map(r => r.date);
  const revenue = rows.map(r => r.revenue || 0);
  const profit = rows.map(r => r.profit || 0);

  const data = {
    labels,
    datasets: [
      { label: 'Daromad', data: revenue, borderColor: '#0ea5e9', tension: 0.35 },
      { label: 'Foyda', data: profit, borderColor: '#16a34a', tension: 0.35 }
    ]
  };

  if (skuChart) {
    skuChart.data = data;
    skuChart.update();
    return;
  }

  skuChart = new Chart(document.getElementById('skuChart'), {
    type: 'line',
    data,
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

setupRangeButtons();
setupActions();
loadAll();
loadAI();
loadExpenseCategories();
