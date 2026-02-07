const PDFDocument = require('pdfkit');

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function renderReport(doc, stats, opts = {}) {
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

  if (opts.chartImage) {
    doc.addPage();
    doc.fontSize(14).text('Daily revenue & profit', { underline: true });
    doc.moveDown();
    doc.image(opts.chartImage, { fit: [520, 280], align: 'center' });
  }
}

async function generatePDFStream(res, stats, opts = {}) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  renderReport(doc, stats, opts);
  doc.end();
}

function generatePDFBuffer(stats, opts = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on('data', (d) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    renderReport(doc, stats, opts);
    doc.end();
  });
}

module.exports = { generatePDFStream, generatePDFBuffer };
