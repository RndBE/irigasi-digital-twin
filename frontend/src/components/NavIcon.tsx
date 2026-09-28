import type { ReactNode } from 'react';

/** Ikon garis untuk menu samping dan kepala halaman (24 × 24, mengikuti warna teks). */
export type NavIconName = 'dashboard' | 'twin' | 'telemetri' | 'neraca' | 'analisa' | 'data' | 'menu' | 'close' | 'waves' | 'weir' | 'gate' | 'sprout' | 'alert' | 'gauge' | 'info' | 'download' | 'pin';

const PATHS: Record<NavIconName, ReactNode> = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></>,
  analisa: <><path d="M3.5 20.5h17" /><path d="M6.5 17v-4M11 17V8.5M15.5 17v-6M20 17V5" /><path d="M5 10.5l5-4.5 4.5 3 5.5-5" /></>,
  waves: <><path d="M2.5 8c2.4 0 2.4-1.8 4.8-1.8S9.7 8 12 8s2.4-1.8 4.8-1.8S19.1 8 21.5 8" /><path d="M2.5 13c2.4 0 2.4-1.8 4.8-1.8S9.7 13 12 13s2.4-1.8 4.8-1.8S19.1 13 21.5 13" /><path d="M2.5 18c2.4 0 2.4-1.8 4.8-1.8S9.7 18 12 18s2.4-1.8 4.8-1.8S19.1 18 21.5 18" /></>,
  weir: <><path d="M3 20.5h18M5 20.5V9h14v11.5" /><path d="M5 9V5.5h14V9M9.5 9v11.5M14.5 9v11.5" /></>,
  gate: <><path d="M4 21V4h16v17" /><rect x="7" y="9" width="10" height="7" rx="1" /><path d="M12 4v5" /></>,
  sprout: <><path d="M12 21v-8" /><path d="M12 13c0-4-3-6-7.5-6 0 4 3 6 7.5 6z" /><path d="M12 11c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" /></>,
  alert: <><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  gauge: <><path d="M4 17.5a8 8 0 1 1 16 0" /><path d="M12 17.5l4-6" /><circle cx="12" cy="17.5" r="1.3" /><path d="M4 20.5h16" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.1" /></>,
  download: <><path d="M12 3.5v11.5" /><path d="m7 10.5 5 5 5-5" /><path d="M5 20.5h14" /></>,
  pin: <><path d="M12 21s6.5-6.2 6.5-11.2a6.5 6.5 0 0 0-13 0C5.5 14.8 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.4" /></>,
  twin: <><path d="M12 2.5 3.5 7.2v9.6L12 21.5l8.5-4.7V7.2z" /><path d="M3.5 7.2 12 12l8.5-4.8M12 12v9.5" /></>,
  telemetri: <><path d="M2.5 12h4l2.5-6.5 4 13 3-9.5 1.5 3h4" /></>,
  neraca: <><path d="M12 3.2s6.2 6.6 6.2 11a6.2 6.2 0 0 1-12.4 0c0-4.4 6.2-11 6.2-11z" /><path d="M8.6 14.6a3.4 3.4 0 0 0 3.4 3.4" /></>,
  data: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" /><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
};

export function NavIcon({ name }: { name: NavIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}
