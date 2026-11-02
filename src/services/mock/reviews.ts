import { addDays } from 'date-fns';
import type { Review } from '../../types';
import { toISODate } from '../../lib/format';

type Row = [motorId: string, author: string, rating: number, comment: string, daysAgo: number];

const rows: Row[] = [
  ['m1', 'Rina A.', 5, 'Motor bersih dan irit. Proses ambil motor cepat, tidak ribet.', 5],
  ['m1', 'Dimas P.', 4, 'Enak dipakai keliling kota. Rem sedikit perlu disetel tapi aman.', 14],
  ['m1', 'Wayan S.', 5, 'Harga murah, motor terawat. Pasti sewa lagi.', 30],
  ['m2', 'Citra L.', 5, 'Lucu dan nyaman, banyak yang tanya sewa di mana.', 3],
  ['m2', 'Bagas R.', 5, 'Bagasinya lega, muat tas belanja. Sangat puas.', 21],
  ['m2', 'Made D.', 4, 'Bagus, tapi warna krem cepat terlihat kotor. Selebihnya mantap.', 40],
  ['m3', 'Alvin H.', 5, 'Tenaganya terasa saat nanjak ke Kintamani. Mantap.', 9],
  ['m3', 'Sari N.', 4, 'Nyaman untuk jarak jauh. Port USB berguna.', 25],
  ['m4', 'Kevin T.', 5, 'Paling nyaman dari semua motor yang pernah saya sewa.', 7],
  ['m4', 'Laras W.', 5, 'Bagasi besar, jok empuk. Layak dengan harganya.', 18],
  ['m4', 'Yoga F.', 5, 'Smart key praktis. Pelayanan ramah dan cepat.', 35],
  ['m5', 'Anita K.', 5, 'Gagah dan nyaman di jalan rusak. Suka sekali.', 11],
  ['m5', 'Rizky M.', 4, 'Agak tinggi untuk saya, tapi stabil dan enak.', 28],
  ['m6', 'Putu E.', 5, 'Stabil di kecepatan tinggi, bagasi besar. Rekomendasi.', 4],
  ['m6', 'Dewi S.', 5, 'Motor sangat terawat dan bersih saat diterima.', 16],
  ['m6', 'Hendra G.', 4, 'Bagus. Pengembalian motor juga mudah.', 33],
  ['m7', 'Fajar B.', 4, 'Akselerasi enak, tampilan keren.', 8],
  ['m7', 'Nia C.', 5, 'Seru dipakai, ringan dan lincah.', 22],
  ['m8', 'Tari O.', 5, 'Halus dan irit, cocok untuk harian.', 6],
  ['m8', 'Agus Y.', 4, 'Nyaman, desain klasik. Bagasi cukup.', 19],
  ['m9', 'Reza V.', 5, 'Tangguh di jalan berbatu, suspensi empuk.', 13],
  ['m9', 'Gita Z.', 4, 'Jok agak tinggi, tapi performa memuaskan.', 27],
  ['m10', 'Bayu J.', 4, 'Ringan dan lincah untuk offroad ringan.', 15],
  ['m11', 'Ari Q.', 5, 'Tenaga besar, rem pakem. Petualangan seru.', 10],
  ['m11', 'Dian U.', 5, 'Motor luar biasa. Sayang sedang sering penuh.', 31],
  ['m12', 'Yusuf I.', 5, 'Handling tajam dan nyaman di jalan raya.', 12],
  ['m12', 'Maya R.', 4, 'Enak dikendarai, tampilannya bagus.', 24],
  ['m13', 'Bima X.', 4, 'Tenaga bawah galak, irit untuk bebek sport.', 20],
  ['m14', 'Selvi H.', 5, 'Cantik sekali untuk foto. Pelayanan ramah.', 2],
  ['m14', 'Gede A.', 5, 'Gaya klasik, nyaman dipakai santai.', 17],
];

export const reviews: Review[] = rows.map(([motorId, author, rating, comment, daysAgo], i) => ({
  id: `r${i + 1}`,
  motorId,
  author,
  rating,
  comment,
  date: toISODate(addDays(new Date(), -daysAgo)),
}));
