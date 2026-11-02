/**
 * Generator berkas kalender iCalendar (.ics) RFC 5545 untuk reservasi sewa motor RodaKita.
 */
function generateBookingICS(booking, motor) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  // Tanggal mulai dan selesai dalam format YYYYMMDD
  const startClean = (booking.startDate || '').replace(/-/g, '');
  const endClean = (booking.endDate || '').replace(/-/g, '');

  const motorName = motor ? motor.name : `Motor ID ${booking.motorId}`;
  const location = booking.pickupLocation || (booking.pickup === 'delivery' ? 'Antar ke Lokasi Pelanggan' : 'Kantor Pusat RodaKita');
  const summary = `Sewa Motor ${motorName} - ${booking.code}`;
  const description = `Pemesanan Rental Motor RodaKita\\nKode Booking: ${booking.code}\\nUnit: ${motorName}\\nDurasi: ${booking.days} hari (${booking.startDate} s/d ${booking.endDate})\\nTotal: Rp ${(booking.total || 0).toLocaleString('id-ID')}\\nStatus: ${(booking.status || '').toUpperCase()}`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RodaKita Rental Motor//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${booking.code}@rodakita.id`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${startClean}`,
    `DTEND;VALUE=DATE:${endClean}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    `STATUS:${booking.status === 'confirmed' || booking.status === 'active' ? 'CONFIRMED' : 'TENTATIVE'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return icsLines.join('\r\n');
}

module.exports = {
  generateBookingICS,
};
