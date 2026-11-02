/**
 * Format mata uang Rupiah integer tanpa desimal.
 */
function formatRupiah(amount) {
  const safe = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(safe);
}

/**
 * Pastikan nilai uang adalah integer bulat positif / non-negatif.
 */
function toIntegerMoney(amount) {
  const num = Math.round(Number(amount) || 0);
  return num < 0 ? 0 : num;
}

module.exports = {
  formatRupiah,
  toIntegerMoney,
};
