import type { Fix, Status } from './types';

/** Pola pemberian air menurut Faktor K (pedoman O&P irigasi). */
export function pola(K: number): Status {
  if (K >= 1.1) return ['warn', 'Menerus · berlebih'];
  if (K >= 0.95) return ['good', 'Menerus'];
  if (K >= 0.75) return ['warn', 'Menerus, dikurangi'];
  if (K >= 0.5) return ['crit', 'Giliran antar tersier'];
  return ['crit', 'Giliran antar sekunder'];
}

export const kStatus = (K: number): Status => K < 0.75 ? ['crit', 'K < 0,75'] : K < 0.9 ? ['warn', 'Kurang air'] : K > 1.1 ? ['warn', 'Berlebih'] : ['good', 'Normal'];

/** Status perbaikan topologi sebuah ruas, untuk chip di panel ruas. */
export const fixStatus = (f: Fix): Status =>
  f.st === 'perlu verifikasi' ? ['warn', `Sambungan asumsi, celah ${f.gap} m`] : f.st === 'sumber lokal' ? ['good', 'Akar sistem bendung lokal']
    : f.st === 'suplesi' ? ['good', 'Saluran suplesi'] : ['good', `Disambung ulang, celah ${f.gap} m`];
