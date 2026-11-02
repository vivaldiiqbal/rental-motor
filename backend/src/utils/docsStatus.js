/**
 * Menurunkan docsStatus agregat pengguna berdasarkan status KTP dan SIM.
 *
 * Aturan Bisnis:
 * - 'verified' bila KTP dan SIM keduanya verified
 * - 'pending' bila ada yang pending dan tidak ada yang rejected
 * - 'rejected' bila ada yang rejected
 * - Selain itu 'not_uploaded'
 *
 * @param {Object} documents - Objek status dokumen pengguna { ktp, sim }
 * @returns {'verified' | 'pending' | 'rejected' | 'not_uploaded'}
 */
function computeDocsStatus(documents = {}) {
  const getStatus = (val) => {
    if (!val) return 'not_uploaded';
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.status) return val.status;
    return 'not_uploaded';
  };

  const ktp = getStatus(documents.ktp);
  const sim = getStatus(documents.sim);

  // 1. Jika ada yang rejected, prioritas status menjadi rejected
  if (ktp === 'rejected' || sim === 'rejected') {
    return 'rejected';
  }

  // 2. Jika keduanya verified, status menjadi verified
  if (ktp === 'verified' && sim === 'verified') {
    return 'verified';
  }

  // 3. Jika ada yang pending dan tidak ada yang rejected, status menjadi pending
  if (ktp === 'pending' || sim === 'pending') {
    return 'pending';
  }

  // 4. Selain itu (keduanya not_uploaded, atau salah satu verified dan lainnya not_uploaded)
  return 'not_uploaded';
}

module.exports = {
  computeDocsStatus,
};
