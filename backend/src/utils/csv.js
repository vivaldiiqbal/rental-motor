/**
 * Utilitas ekspor CSV aman untuk Panel Admin RodaKita.
 * Fitur keamanan:
 * 1. Pencegahan CSV Formula Injection (DDE attacks):
 *    Setiap nilai yang diawali tanda =, +, -, @, \t, atau \r diberi awalan tanda petik tunggal (').
 * 2. UTF-8 BOM (\uFEFF) di awal berkas agar karakter khusus dan Bahasa Indonesia terbuka rapi di Microsoft Excel.
 * 3. Escaping standar RFC 4180 untuk tanda kutip ganda (" -> ""), koma, dan baris baru.
 * 4. Batasan baris maksimal (50.000 baris) untuk mencegah kehabisan memori.
 */

const MAX_CSV_ROWS = 50000;

/**
 * Sanitasi nilai sel agar aman dari formula injection.
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Deteksi karakter pembuka formula injection
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some((char) => str.startsWith(char))) {
    str = `'${str}`;
  }

  // Escape tanda kutip ganda jika mengandung karakter khusus
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Konversi daftar objek menjadi format CSV string ber-BOM UTF-8.
 * @param {Array<Object>} rows - Data yang akan diekspor
 * @param {Array<{ key: string, label: string }>} columns - Definisi kolom dan judul header
 * @returns {string} - String CSV siap stream
 */
function toCsv(rows = [], columns = []) {
  if (!Array.isArray(rows)) {
    throw new Error('Data baris CSV harus berupa array.');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Kolom CSV wajib didefinisikan.');
  }

  const safeRows = rows.slice(0, MAX_CSV_ROWS);

  // 1. Header dengan UTF-8 BOM
  const headerLine = columns.map((col) => sanitizeCsvCell(col.label || col.key)).join(',');

  // 2. Baris Data
  const dataLines = safeRows.map((row) => {
    return columns
      .map((col) => {
        let val;
        if (typeof col.key === 'function') {
          val = col.key(row);
        } else if (col.key.includes('.')) {
          val = col.key.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : ''), row);
        } else {
          val = row[col.key];
        }
        return sanitizeCsvCell(val);
      })
      .join(',');
  });

  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

module.exports = {
  toCsv,
  sanitizeCsvCell,
  MAX_CSV_ROWS,
};
