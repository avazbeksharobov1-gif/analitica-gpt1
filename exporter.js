const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

async function exportExcel({ kpi, items, range, projectName }) {
  const wb = new ExcelJS.Workbook();

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 20 },
    { header: 'Value', key: 'value', width: 24 }
  ];

  const rangeLabel = range ? `${fmtDate(range.from)} - ${fmtDate(range.to)}` : '';
  summary.addRow({ metric: 'Project', value: projectName || 'Main Project' });
  summary.addRow({ metric: 'Range', value: rangeLabel });
  summary.addRow({ metric: 'Revenue', value: Math.round(kpi.revenue || 0) });
  summary.addRow({ metric: 'Orders', value: Math.round(kpi.orders || 0) });
  summary.addRow({ metric: 'Fees', value: Math.round(kpi.fees || 0) });
  summary.addRow({ metric: 'Acquiring', value: Math.round(kpi.acquiring || 0) });
  summary.addRow({ metric: 'Logistics', value: Math.round(kpi.logistics || 0) });
  summary.addRow({ metric: 'Returns', value: Math.round(kpi.returns || 0) });
  summary.addRow({ metric: 'Expenses', value: Math.round(kpi.expenses || 0) });
  summary.addRow({ metric: 'COGS', value: Math.round(kpi.cogs || 0) });
  summary.addRow({ metric: 'Profit', value: Math.round(kpi.profit || 0) });

  const ws = wb.addWorksheet('Products');
  ws.columns = [
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Qty', key: 'quantity', width: 8 },
    { header: 'Revenue', key: 'revenue', width: 14 },
    { header: 'Fees', key: 'fees', width: 12 },
    { header: 'Acquiring', key: 'acquiring', width: 12 },
    { header: 'Logistics', key: 'logistics', width: 12 },
    { header: 'Returns', key: 'returns', width: 12 },
    { header: 'COGS', key: 'cogs', width: 12 },
    { header: 'Profit', key: 'profit', width: 14 },
    { header: 'Margin %', key: 'margin', width: 10 }
  ];

  (items || []).forEach((p) => {
    const margin = p.revenue ? (p.profit / p.revenue) * 100 : 0;
    ws.addRow({
      sku: p.sku,
      name: p.name,
      quantity: Math.round(p.quantity || 0),
      revenue: Math.round(p.revenue || 0),
      fees: Math.round(p.fees || 0),
      acquiring: Math.round(p.acquiring || 0),
      logistics: Math.round(p.logistics || 0),
      returns: Math.round(p.returns || 0),
      cogs: Math.round(p.cogs || 0),
      profit: Math.round(p.profit || 0),
      margin: Number(margin.toFixed(2))
    });
  });

  const file = path.join(os.tmpdir(), `analitica-report-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

module.exports = { exportExcel };
