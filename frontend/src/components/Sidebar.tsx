import logo from '../assets/logo-beacon.png';
import { STATIONS } from '../domain/stations';
import { setNav, showTab, ui, type TabId } from '../store/twinStore';
import { NavIcon, type NavIconName } from './NavIcon';

/**
 * Menu samping, mengikuti dasbor demo Beacon (be-jogja.com/demo): logo, menu berkelompok dengan penanda halaman
 * aktif, kartu daerah irigasi, dan status stasiun. Di layar sempit menu ini menjadi laci yang dibuka dari tombol ☰.
 */
interface NavItem { tab: TabId; label: string; icon: NavIconName; tag?: string; badge?: number }

export function Sidebar() {
  const offline = STATIONS.filter(s => s.offline).length, online = STATIONS.length - offline;
  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Pemantauan', items: [
      { tab: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { tab: 'twin', label: 'Digital twin', icon: 'twin', tag: '3D' },
      { tab: 'telemetri', label: 'Telemetri', icon: 'telemetri', badge: offline || undefined },
    ] },
    { label: 'Analisis', items: [
      { tab: 'neraca', label: 'Neraca air', icon: 'neraca' },
      { tab: 'analisa', label: 'Analisa', icon: 'analisa' },
      { tab: 'evaluasi', label: 'Evaluasi jaringan', icon: 'gauge' },
    ] },
    { label: 'Referensi', items: [{ tab: 'konsep', label: 'Data & referensi', icon: 'data' }] },
  ];
  return (
    <>
      {ui.navOpen && <button className="sidenav__scrim" type="button" aria-label="Tutup menu" onClick={() => setNav(false)} />}
      <aside className={`sidenav${ui.navOpen ? ' is-open' : ''}`} aria-label="Menu utama">
        <div className="sidenav__brand">
          <BrandMark />
          <button className="sidenav__close" type="button" aria-label="Tutup menu" onClick={() => setNav(false)}><NavIcon name="close" /></button>
        </div>
        <nav className="sidenav__nav">
          {groups.map(g => (
            <div key={g.label} className="sidenav__sect">
              <span className="sidenav__group">{g.label}</span>
              {g.items.map(it => (
                <a key={it.tab} href={`#${it.tab}`} className="sidenav__item" aria-current={ui.tab === it.tab ? 'page' : undefined}
                  onClick={e => { e.preventDefault(); showTab(it.tab); }}>
                  <NavIcon name={it.icon} />
                  <span>{it.label}</span>
                  {it.badge ? <span className="sidenav__badge" title={`${it.badge} stasiun offline`}>{it.badge}</span> : null}
                  {it.tag && <span className="sidenav__tag">{it.tag}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidenav__region">
          <span className="sidenav__region-k">Daerah irigasi</span>
          <span className="sidenav__region-v">D.I. Leuwigoong</span>
          <span className="sidenav__region-m">5.313 ha baku · Bendung Copong (gerak, mercu 50 m) · S. Cimanuk · Kab. Garut</span>
          <span className="sidenav__region-s"><span className="live-dot" />{online}/{STATIONS.length} stasiun online</span>
        </div>
      </aside>
    </>
  );
}

/** Logo Beacon Engineering (putih, latar transparan) dengan nama aplikasi di bawahnya. */
function BrandMark() {
  return (
    <div className="brandmark">
      <img className="brandmark__logo" src={logo} alt="Beacon Engineering" width="118" height="35" />
      <span className="brandmark__text">
        <span className="brandmark__title">Digital Twin Irigasi</span>
        <span className="brandmark__eyebrow">D.I. Leuwigoong</span>
      </span>
    </div>
  );
}
