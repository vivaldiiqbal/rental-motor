const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

/**
 * Kebijakan sanitasi: hanya tag teks/struktur dasar. TIDAK ada img, script,
 * iframe, style, form, maupun atribut event handler. Skema URL dibatasi
 * http, https, mailto, tel (javascript:/data: dibuang).
 */
const SANITIZE_OPTIONS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'del', 's',
    'ul', 'ol', 'li',
    'blockquote', 'code', 'pre',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    th: ['align'],
    td: ['align'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs, rel: 'noopener noreferrer nofollow' };
      if (out.target && out.target !== '_blank') delete out.target;
      return { tagName, attribs: out };
    },
  },
};

const PLACEHOLDER_KEYS = [
  'brandName',
  'minDays',
  'maxDays',
  'lateFeePercentPerHour',
  'lateFeeToleranceMinutes',
  'minRenterAge',
  'bookingExpireMinutes',
  'operatingHours',
  'whatsappNumber',
  'contactEmail',
  'address',
  'cancellationPolicy',
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function describeCancellationPolicy(policy) {
  if (!Array.isArray(policy) || policy.length === 0) return '';
  const tiers = policy
    .map((t) => ({ h: Number(t.thresholdHours), p: Number(t.refundPercent) }))
    .filter((t) => Number.isFinite(t.h) && Number.isFinite(t.p))
    .sort((a, b) => b.h - a.h);
  if (tiers.length === 0) return '';
  const parts = tiers.map((t) => `paling lambat ${t.h} jam sebelum sewa dimulai: pengembalian ${t.p}%`);
  return `Kebijakan pembatalan - ${parts.join('; ')}. Di luar ketentuan tersebut tidak ada pengembalian.`;
}

/** Ubah objek pengaturan menjadi peta placeholder (nilai mentah, belum di-escape). */
function buildPlaceholderVars(settings = {}) {
  const s = settings || {};
  return {
    brandName: s.brandName,
    minDays: s.minRentalDays,
    maxDays: s.maxRentalDays,
    lateFeePercentPerHour: s.lateFeePercentPerHour,
    lateFeeToleranceMinutes: s.lateFeeToleranceMinutes,
    minRenterAge: s.minRenterAge,
    bookingExpireMinutes: s.bookingExpireMinutes ?? s.paymentExpiryMinutes,
    operatingHours: s.operatingHours,
    whatsappNumber: s.whatsappNumber,
    contactEmail: s.contactEmail,
    address: s.address,
    cancellationPolicy: describeCancellationPolicy(s.cancellationPolicy),
  };
}

/**
 * Render Markdown -> HTML aman.
 * Urutan: marked -> sanitize-html -> substitusi placeholder (nilai di-escape).
 * Substitusi dilakukan SETELAH sanitasi dengan escaping, sehingga nilai
 * pengaturan tidak pernah bisa menyisipkan markup.
 *
 * @param {string} markdown
 * @param {object} [vars] peta placeholder (lihat buildPlaceholderVars)
 */
function renderMarkdown(markdown, vars = {}) {
  const source = typeof markdown === 'string' ? markdown : '';
  let rawHtml;
  try {
    rawHtml = marked.parse(source, { async: false, gfm: true, breaks: false });
  } catch {
    rawHtml = '';
  }
  const clean = sanitizeHtml(String(rawHtml), SANITIZE_OPTIONS);

  return clean.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key) => {
    if (!PLACEHOLDER_KEYS.includes(key)) return match;
    const v = vars[key];
    if (v === undefined || v === null || v === '') return '';
    return escapeHtml(v);
  });
}

/** Sanitasi teks tanpa markup sama sekali (mis. untuk judul). */
function stripAllTags(text) {
  return sanitizeHtml(String(text ?? ''), { allowedTags: [], allowedAttributes: {} });
}

module.exports = {
  renderMarkdown,
  buildPlaceholderVars,
  stripAllTags,
  PLACEHOLDER_KEYS,
  SANITIZE_OPTIONS,
};
