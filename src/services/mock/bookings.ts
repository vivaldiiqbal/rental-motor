import { addDays } from 'date-fns';
import type { Booking, BookingStatus } from '../../types';
import { toISODate } from '../../lib/format';
import { motors } from './motors';
import { DEMO_EMAIL, demoUser } from './users';

/** [motorId, mulai (hari dari hari ini), durasi, status] - relatif agar selalu relevan. */
type Row = [motorId: string, startOffset: number, days: number, status: BookingStatus];

const rows: Row[] = [
  ['m4', -40, 3, 'completed'],
  ['m1', -21, 2, 'completed'],
  ['m6', -10, 4, 'completed'],
  ['m2', -1, 3, 'active'],
  ['m14', 4, 2, 'confirmed'],
  ['m3', 9, 5, 'pending'],
  ['m5', -15, 2, 'cancelled'],
  ['m8', 20, 3, 'confirmed'],
  ['m12', 2, 3, 'confirmed'],
];

export const seedBookings: Booking[] = rows.map(([motorId, offset, days, status], i) => {
  const motor = motors.find((m) => m.id === motorId) ?? motors[0];
  const start = addDays(new Date(), offset);
  const subtotal = motor.pricePerDay * days;
  return {
    id: `b${i + 1}`,
    code: `RK-${String(24100 + i * 7).padStart(5, '0')}`,
    motorId: motor.id,
    // Sebagian booking milik akun demo, sisanya milik pengguna lain (memblokir tanggal).
    userId: i < 7 ? demoUser.id : 'other',
    startDate: toISODate(start),
    endDate: toISODate(addDays(start, days)),
    days,
    pricePerDay: motor.pricePerDay,
    subtotal,
    deposit: motor.deposit,
    total: subtotal,
    status,
    createdAt: toISODate(addDays(start, -3)),
    pickup: i % 2 === 0 ? 'store' : 'delivery',
    payment: i % 3 === 0 ? 'transfer' : 'ewallet',
    renter: {
      name: demoUser.name,
      phone: demoUser.phone,
      email: DEMO_EMAIL,
      idNumber: '5171012345670001',
    },
  };
});
