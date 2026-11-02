export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Nomor HP Indonesia: 08xx / +628xx / 628xx, 9-13 digit total. */
export const isPhone = (v: string) => /^(\+62|62|0)8[0-9]{8,11}$/.test(v.replace(/[\s-]/g, ''));

export const isNik = (v: string) => /^[0-9]{16}$/.test(v.trim());

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tips: string[];
}

export function passwordStrength(pw: string): PasswordStrength {
  const checks = [
    { ok: pw.length >= 8, tip: 'Minimal 8 karakter' },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), tip: 'Campuran huruf besar dan kecil' },
    { ok: /[0-9]/.test(pw), tip: 'Mengandung angka' },
    { ok: /[^A-Za-z0-9]/.test(pw), tip: 'Mengandung simbol' },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const score = (pw.length === 0 ? 0 : Math.max(1, passed)) as PasswordStrength['score'];
  const labels = ['', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];
  return { score, label: labels[score], tips: checks.filter((c) => !c.ok).map((c) => c.tip) };
}

/** Kata sandi dianggap memenuhi syarat minimal jika >= 8 karakter, ada huruf dan angka. */
export const isPasswordAcceptable = (pw: string) =>
  pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
