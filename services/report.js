const PDFDocument = require('pdfkit');

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function renderReport(doc, stats, opts = {}) {
  doc.fontSize(18).text('Analitica Hisobot', { underline: true });
  doc.moveDown();

  const rangeLabel = opts.range ? `${fmtDate(opts.range.from)} - ${fmtDate(opts.range.to)}` : '';
  if (opts.projectName) doc.fontSize(12).text(`Loyiha: ${opts.projectName}`);
  if (rangeLabel) doc.fontSize(12).text(`Davr: ${rangeLabel}`);
  doc.fontSize(12).text(`Yaratilgan: ${new Date().toLocaleString()}`);
  doc.moveDown();

  doc.fontSize(12)
    .text(`Daromad: ${stats.revenue}`)
    .text(`Buyurtmalar: ${stats.orders}`)
    .text(`Yangi buyurtmalar: ${stats.ordersCreated || 0}`)
    .text(`Omborga topshirilgan: ${stats.ordersWarehouse || 0}`)
    .text(`Yetkazilgan: ${stats.ordersDelivered || 0}`)
    .text(`Komissiya: ${stats.fees}`)
    .text(`Ekvayring: ${stats.acquiring}`)
    .text(`Logistika: ${stats.logistics}`)
    .text(`Qaytarish: ${stats.returns}`)
    .text(`Xarajat: ${stats.expenses}`)
    .text(`Soliq 1%: ${stats.tax1 || 0}`)
    .text(`Ijtimoiy soliq: ${stats.socialTax || 0}`)
    .text(`COGS: ${stats.cogs}`)
    .text(`Foyda: ${stats.profit}`);

  if (opts.chartImage) {
    doc.addPage();
    doc.fontSize(14).text('Kunlik daromad va foyda', { underline: true });
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
