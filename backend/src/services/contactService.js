const { contactRepo } = require('../repositories');
const AppError = require('../utils/AppError');

class ContactService {
  async sendContactMessage({ name, email, subject = '', message, website }) {
    // Honeypot check: field 'website' adalah jebakan bot, harus kosong
    if (website && typeof website === 'string' && website.trim().length > 0) {
      throw new AppError('Pengiriman pesan ditolak karena terindikasi spam otomatis.', 'VALIDATION_ERROR', 400);
    }

    const record = await contactRepo.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: (subject || 'Pesan Kontak Pelanggan').trim(),
      message: message.trim(),
    });

    return {
      success: true,
      id: record.id,
      message: 'Pesan Anda telah berhasil dikirim. Tim RodaKita akan segera merespons melalui email.',
    };
  }

  async getMessages(paging = {}) {
    return contactRepo.findAll(paging);
  }
}

module.exports = new ContactService();
