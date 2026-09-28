import { Rail } from '../components/Rail';
import { DetailPanel } from '../components/DetailPanel';
import { TwinView } from '../three/TwinView';
import { ui } from '../store/twinStore';

/**
 * Tab Digital twin: kondisi dan rekomendasi di kiri, diorama 3D di tengah, rincian objek terpilih di kanan.
 * Tab ini tidak pernah dilepas dari halaman (hanya disembunyikan) supaya adegan 3D tidak dibangun ulang.
 */
export function TwinPage() {
  return (
    <section id="tab-twin" className="view twin" aria-label="Digital twin" hidden={ui.tab !== 'twin'}>
      <Rail />
      <TwinView />
      <DetailPanel />
    </section>
  );
}
