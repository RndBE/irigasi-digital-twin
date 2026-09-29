import type { ScenarioId } from './types';

/** Skenario simulasi: debit dasar Cimanuk (m³/s) dan faktor kebutuhan air sawah. */
export const SCEN: Record<ScenarioId, { label: string; river: number; f: number; desc: string }> = {
  normal: { label: 'Normal', river: 16, f: 1.0, desc: 'Musim tanam padi (FL, tanam Januari). Debit Cimanuk cukup, hujan lokal sore hari. Bukaan pintu belum seimbang: petak dekat hulu kelebihan air, hilir SS Lewo dan SS Citikey kekurangan.' },
  kemarau: { label: 'Kemarau', river: 2.1, f: 1.7, desc: 'Debit Cimanuk turun ke ±2 m³/s dan sungai kecil sumber suplesi hampir kering, sementara kebutuhan air sawah naik. Faktor K jatuh dan pembagian air perlu digilir.' },
  banjir: { label: 'Banjir', river: 150, f: 0.35, desc: 'Hujan lebat di hulu Cimanuk. Debit naik dalam 1–2 jam, tinggi air di atas mercu 50 m naik; pintu pengambilan dan suplesi harus dikurangi agar sedimen tidak masuk.' },
};
export const SCEN_IDX: Record<ScenarioId, number> = { normal: 0, kemarau: 1, banjir: 2 };
export const SCEN_IDS: ScenarioId[] = ['normal', 'kemarau', 'banjir'];
