import { NavIcon, type NavIconName } from './NavIcon';

/** Judul halaman dengan ikon dan keterangan singkat. */
export function PageHead({ id, icon, title, sub }: { id: string; icon: NavIconName; title: string; sub: string }) {
  return (
    <div className="page-head">
      <span className="page-head__icon"><NavIcon name={icon} /></span>
      <div className="page-head__titles"><h1 id={id}>{title}</h1><span className="page-head__sub">{sub}</span></div>
    </div>
  );
}
