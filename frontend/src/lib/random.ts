/**
 * Pembangkit acak berbenih, satu aliran untuk seluruh twin.
 *
 * Domain (baterai stasiun, hujan, riak debit) dan adegan 3D (tekstur, pohon, rumah) memakai aliran yang sama
 * dengan urutan panggil yang sama seperti demo satu berkas: stasiun dibuat, simulasi dipanaskan 24 jam, baru
 * adegan dibangun. Karena urutannya tetap, letak pohon dan rumah selalu sama tiap kali halaman dibuka.
 */
let seed = 918273;

export const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
export const jitter = (a: number) => (rnd() * 2 - 1) * a;
