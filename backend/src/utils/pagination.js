/**
 * Hitung metadata pagination standar.
 */
function getPaginationMeta(total, page = 1, limit = 10) {
  const safeTotal = Math.max(0, parseInt(total, 10) || 0);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 10);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
  };
}

module.exports = {
  getPaginationMeta,
};
