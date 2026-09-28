import { useEffect, useRef } from 'react';
import { useTwin } from './hooks/useTwin';
import { startClock, ui } from './store/twinStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardPage } from './pages/DashboardPage';
import { TwinPage } from './pages/TwinPage';
import { TelemetryPage } from './pages/TelemetryPage';
import { NeracaPage } from './pages/NeracaPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { NetworkPage } from './pages/NetworkPage';
import { DataPage } from './pages/DataPage';

/**
 * Kerangka aplikasi: menu samping di kiri, bilah status dan konten halaman di kanan (pola dasbor demo Beacon).
 *
 * Bawaannya mode peraga: seluruh angka dibangkitkan mesin simulasi di peramban (`domain/`) dari data jaringan
 * D.I. Leuwigoong, tanpa server. Tiap langkah simulasi menaikkan versi store; komponen digambar ulang dari
 * keadaan terbaru, dan diorama 3D (`three/`) hanya menyalin keadaan itu ke objek yang sudah dibangun.
 */
export default function App() {
  useTwin();
  useEffect(() => { startClock(); }, []);
  // halaman baru dibuka dari atas
  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.scrollTo(0, 0); window.scrollTo(0, 0); }, [ui.tab]);
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <TopBar />
        <main className="shell-content" ref={main}>
          {ui.tab === 'dashboard' && <DashboardPage />}
          <TwinPage />
          {ui.tab === 'telemetri' && <TelemetryPage />}
          {ui.tab === 'neraca' && <NeracaPage />}
          {ui.tab === 'analisa' && <AnalysisPage />}
          {ui.tab === 'evaluasi' && <NetworkPage />}
          {ui.tab === 'konsep' && <DataPage />}
        </main>
      </div>
    </div>
  );
}
