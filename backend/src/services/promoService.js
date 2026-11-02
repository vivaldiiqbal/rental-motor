const { promoRepo, motorRepo } = require('../repositories');
const AppError = require('../utils/AppError');
const { parseDate, toISODate, countDays } = require('../utils/dates');

class PromoService {
  async getActivePromos() {
    return promoRepo.findAll(true);
  }

  async validatePromo(input) {
    const { code } = input;
    let { subtotal, days, start, end, startDate, endDate, motorId } = input;

    const sDate = start || startDate;
    const eDate = end || endDate;

    if (!code) {
      throw new AppError('Kode promo wajib disertakan.', 'PROMO_INVALID', 400);
    }

    if (motorId && sDate && eDate) {
      const motor = await motorRepo.findById(motorId);
      if (motor) {
        days = days || Math.max(1, countDays(sDate, eDate));
        subtotal = subtotal !== undefined ? subtotal : motor.pricePerDay * days;
      }
    }

    days = days || (sDate && eDate ? Math.max(1, countDays(sDate, eDate)) : 1);
    subtotal = subtotal || 0;

    const promo = await promoRepo.findByCode(code);
    if (!promo) {
      throw new AppError(`Kode promo '${code}' tidak ditemukan.`, 'PROMO_INVALID', 400);
    }

    const today = toISODate(new Date());
    if (promo.validUntil < today) {
      throw new AppError(`Kode promo '${code}' sudah kedaluwarsa.`, 'PROMO_INVALID', 400);
    }

    if (promo.quota <= 0) {
      throw new AppError(`Kuota penggunaan kode promo '${code}' telah habis.`, 'PROMO_INVALID', 400);
    }

    if (promo.minDays && days < promo.minDays) {
      throw new AppError(
        `Kode promo '${code}' memerlukan durasi sewa minimal ${promo.minDays} hari (Anda memilih ${days} hari).`,
        'PROMO_INVALID',
        400,
      );
    }

    if (promo.minSubtotal && subtotal < promo.minSubtotal) {
      throw new AppError(
        `Kode promo '${code}' memerlukan nilai sewa minimal Rp ${promo.minSubtotal.toLocaleString('id-ID')}.`,
        'PROMO_INVALID',
        400,
      );
    }

    // Cek jika promo memerlukan hari akhir pekan (Sabtu atau Minggu)
    if (promo.requiresWeekend && sDate && eDate) {
      const s = parseDate(sDate);
      const e = parseDate(eDate);
      let includesWeekend = false;

      if (s && e) {
        const cur = new Date(s);
        while (cur <= e) {
          const dayOfWeek = cur.getDay(); // 0: Minggu, 6: Sabtu
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            includesWeekend = true;
            break;
          }
          cur.setDate(cur.getDate() + 1);
        }
      }

      if (!includesWeekend) {
        throw new AppError(
          `Kode promo '${code}' hanya berlaku untuk masa sewa yang mencakup hari Sabtu atau Minggu.`,
          'PROMO_INVALID',
          400,
        );
      }
    }

    // Hitung potongan diskon
    let discount = 0;
    if (promo.type === 'percent') {
      discount = Math.round((subtotal * promo.value) / 100);
      if (promo.maxDiscount && discount > promo.maxDiscount) {
        discount = promo.maxDiscount;
      }
    } else {
      discount = promo.value;
    }

    discount = Math.min(discount, subtotal);

    return {
      valid: true,
      discount,
      message: `Kode promo ${promo.code} berhasil diterapkan!`,
      promo: {
        code: promo.code,
        type: promo.type,
        value: promo.value,
        description: promo.description,
      },
      finalSubtotal: subtotal - discount,
    };
  }
}

module.exports = new PromoService();
