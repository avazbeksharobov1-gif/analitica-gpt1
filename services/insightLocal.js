function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v) {
  return Math.round(num(v)).toLocaleString('en-US');
}

function buildMarketReport(stats) {
  const revenue = num(stats.revenue);
  const orders = num(stats.orders);
  const returns = num(stats.returns);
  const acquiring = num(stats.acquiring);
  const fees = num(stats.fees);
  const logistics = num(stats.logistics);

  const returnRate = revenue > 0 ? (returns / revenue) * 100 : 0;
  const netRevenue = revenue - returns - acquiring - fees - logistics;

  let report = '';
  report += 'Yandex Market hisobot:\n';
  report += `Umumiy tushum: ${fmt(revenue)} so'm\n`;
  report += `Buyurtmalar: ${fmt(orders)} ta\n`;
  report += `Qaytarishlar: ${fmt(returns)} so'm (${returnRate.toFixed(1)}%)\n`;
  report += `Komissiya: ${fmt(fees)} so'm\n`;
  report += `Logistika: ${fmt(logistics)} so'm\n`;
  report += `Ekvayring: ${fmt(acquiring)} (1%)\n`;
  report += '---\n';
  report += `Sof tushum: ${fmt(netRevenue)} so'm\n`;

  if (returnRate > 20) {
    report += '\nOgohlantirish: Qaytarish darajasi yuqori (20%+).';
  }
  if (logistics === 0) {
    report += "\nDiqqat: Logistika xarajatlari hali hisoblanmagan bo'lishi mumkin.";
  }

  return report;
}

module.exports = { buildMarketReport };
