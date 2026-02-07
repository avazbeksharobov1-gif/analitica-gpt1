const PDFDocument = require('pdfkit');

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

async function generatePDFStream(res, stats, opts = {}) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  doc.fontSize(18).text('Analitica Report', { underline: true });
  doc.moveDown();

  const rangeLabel = opts.range ? `${fmtDate(opts.range.from)} - ${fmtDate(opts.range.to)}` : '';
  if (opts.projectName) doc.fontSize(12).text(`Project: ${opts.projectName}`);
  if (rangeLabel) doc.fontSize(12).text(`Range: ${rangeLabel}`);
  doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();

  doc.fontSize(12)
    .text(`Revenue: ${stats.revenue}`)
    .text(`Orders: ${stats.orders}`)
    .text(`Fees: ${stats.fees}`)
    .text(`Acquiring: ${stats.acquiring}`)
    .text(`Logistics: ${stats.logistics}`)
    .text(`Returns: ${stats.returns}`)
    .text(`Expenses: ${stats.expenses}`)
    .text(`COGS: ${stats.cogs}`)
    .text(`Profit: ${stats.profit}`);
  doc.end();
}

module.exports = { generatePDFStream };
