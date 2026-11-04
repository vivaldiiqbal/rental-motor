const clock = require('./clock');

/**
 * Menghitung kemampuan/hak aksi (capabilities) dari sebuah booking secara terpusat di server.
 * Frontend hanya membaca dan menampilkan aksi berdasarkan capabilities ini.
 *
 * @param {object} booking - Data pemesanan
 * @param {object|null} [payment] - Data pembayaran terkait booking (bisa null)
 * @param {object} actor - Pengguna aktif: { id, role, name }
 * @param {Date} [now] - Waktu acuan
 * @returns {object} capabilities
 */
function bookingCapabilities(booking, payment = null, actor = {}, now = clock.now()) {
  if (!booking) {
    return {
      canCancel: false,
      cancelBlockedReason: 'Data pemesanan tidak ditemukan.',
      canPay: false,
      canUploadProof: false,
      canRequestHelp: true,
      canHandover: false,
      canReturn: false,
      paymentMethod: null,
      paymentStatus: 'unpaid',
      version: 1,
    };
  }

  const role = actor.role || 'customer';
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';
  const isStaffOrAdmin = isAdmin || isStaff;

  const rawMethod = booking.paymentMethod || payment?.method || 'bank_transfer';
  const isCash = rawMethod === 'cash';
  const status = booking.status;

  const paymentStatus = payment?.status || (booking.paidAt ? 'paid' : (isCash ? 'unpaid' : 'pending'));
  const isPaid = paymentStatus === 'paid' || Boolean(booking.paidAt) || ['confirmed', 'active', 'return_requested', 'completed'].includes(status);
  const hasProofUploaded = Boolean(payment?.proofUploadedAt || payment?.proofPath);
  const isProofVerified = Boolean(payment?.proofVerifiedAt);
  const isProofPendingVerification = hasProofUploaded && !isProofVerified;

  let canCancel = false;
  let cancelBlockedReason = null;

  if (isStaffOrAdmin) {
    // ----------------------------------------------------
    // MATRIKS ADMIN / STAFF
    // ----------------------------------------------------
    if (['cancelled', 'completed', 'expired'].includes(status)) {
      canCancel = false;
      cancelBlockedReason = `Pemesanan dengan status '${status}' tidak dapat dibatalkan.`;
    } else if (status === 'active' || status === 'return_requested') {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan yang sedang berjalan tidak dapat dibatalkan (lakukan proses pengembalian/return).';
    } else if (['pending', 'confirmed'].includes(status)) {
      if (isStaff && (status === 'confirmed' || isPaid)) {
        // Staf dilarang membatalkan booking berbayar (hanya admin)
        canCancel = false;
        cancelBlockedReason = 'Hanya admin yang berhak membatalkan pemesanan berbayar.';
      } else {
        canCancel = true;
        cancelBlockedReason = null;
      }
    }
  } else {
    // ----------------------------------------------------
    // MATRIKS PELANGGAN (CUSTOMER)
    // ----------------------------------------------------
    if (status === 'pending') {
      if (isCash) {
        // Tunai: boleh membatalkan sampai admin melakukan serah terima (yaitu selama masih pending)
        canCancel = true;
        cancelBlockedReason = null;
      } else {
        // Metode Online: boleh membatalkan SEBELUM membayar
        if (isPaid) {
          canCancel = false;
          cancelBlockedReason = 'Pemesanan yang sudah dibayar tidak dapat dibatalkan oleh pelanggan. Hubungi admin untuk bantuan.';
        } else if (isProofPendingVerification) {
          canCancel = false;
          cancelBlockedReason = 'Bukti pembayaran sedang diverifikasi. Hubungi admin bila ingin membatalkan.';
        } else {
          canCancel = true;
          cancelBlockedReason = null;
        }
      }
    } else if (status === 'confirmed') {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan sudah dibayar/dikonfirmasi. Pelanggan tidak dapat membatalkan setelah pembayaran. Hubungi admin untuk bantuan.';
    } else if (status === 'active' || status === 'return_requested') {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan sedang berjalan dan tidak dapat dibatalkan.';
    } else if (status === 'completed') {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan sudah selesai.';
    } else if (status === 'cancelled') {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan sudah dibatalkan.';
    } else if (status === 'expired') {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan sudah kedaluwarsa.';
    } else {
      canCancel = false;
      cancelBlockedReason = 'Pemesanan tidak dapat dibatalkan.';
    }
  }

  // Capability Pembayaran Online
  const canPay = !isCash && status === 'pending' && !isPaid && !isProofPendingVerification;

  // Capability Unggah Bukti Bayar (khusus bank_transfer online)
  const canUploadProof = !isCash && status === 'pending' && rawMethod === 'bank_transfer' && !isPaid && !isProofPendingVerification;

  // Capability Serah Terima (Admin / Staff)
  const canHandover = isStaffOrAdmin && ((isCash && (status === 'pending' || status === 'confirmed')) || (!isCash && status === 'confirmed'));

  // Capability Pengajuan Pengembalian oleh Pelanggan
  const canRequestReturn = !isStaffOrAdmin && status === 'active';

  // Capability Verifikasi Pengembalian (Admin / Staff)
  const canReturn = isStaffOrAdmin && (status === 'active' || status === 'return_requested');

  return {
    canCancel,
    cancelBlockedReason,
    canPay,
    canUploadProof,
    canRequestHelp: true,
    canHandover,
    canRequestReturn,
    canReturn,
    paymentMethod: rawMethod,
    paymentStatus,
    version: Number(booking.version || 1),
  };
}

module.exports = {
  bookingCapabilities,
};
