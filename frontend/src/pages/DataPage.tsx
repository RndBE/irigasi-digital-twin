import { nf } from '../lib/format';
import { AREA_T, B, DATA, GROUPS, R, SOURCES } from '../domain/network';
import { STATIONS } from '../domain/stations';
import { Chip } from '../components/Ui';
import { PageHead } from '../components/PageHead';
import { RowLink } from './TelemetryPage';

const FIX_KIND = { ruas: 'Sambung ke ruas', src: 'Akar bendung lokal', sup: 'Saluran suplesi' };
const REFS: { src: string; href: string; title: string; text: string; take: string }[] = [
  { src: 'Produk · Australia', href: 'https://rubiconwater.com/control-gates-and-flow-meters-home/network-control-solution/', title: 'Rubicon Water, Total Channel Control', text: 'Pintu otomatis, radio antar pintu, SCADAConnect untuk alarm dan tren, NeuroFlo untuk kendali jaringan kanal terbuka.', take: 'kendali otomatis berbasis target debit, panel rekomendasi bukaan.' },
  { src: 'Proyek · Amerika Serikat', href: 'https://www.tid.org/current-projects/total-channel-control-pilot-project/', title: 'TID, Total Channel Control Pilot', text: 'Pintu manual diganti pintu otomatis, dikendalikan lewat sistem pemesanan dan penjadwalan air online.', take: 'alur dari kebutuhan air ke perintah pintu.' },
  { src: 'Pemerintah · Mesir, Agustus 2026', href: 'https://www.dailynewsegypt.com/2026/08/12/irrigation-ministry-set-to-begin-trial-operation-of-digital-twin-for-ismailia-canal/', title: 'Digital twin Kanal Ismailia', text: 'Pos duga air dan telemetri di banyak titik kanal dan cabang, termasuk titik pengambilan, menjadi masukan twin.', take: 'sebaran sensor di intake, bagi, dan ujung saluran.' },
  { src: 'Pemerintah · Tiongkok', href: 'https://en.qstheory.cn/2025-01/16/c_1064820.htm', title: '49 daerah irigasi digital twin (2023–2025)', text: 'Program percontohan nasional. Operasi pintu manual diotomasi agar air dilepas sesuai kebutuhan.', take: 'twin sebagai dasar operasi harian.' },
  { src: 'Lembaga riset · IWMI', href: 'https://digitaltwins.iwmi.org/', title: 'IWMI Digital Twins', text: 'Akuntansi air, produktivitas air, perbandingan model dengan pengamatan hampir real-time, asisten WaterCopilot.', take: 'tab neraca air.' },
  { src: 'Platform · Deltares', href: 'https://www.deltares.nl/en/software-and-data/products/delft-fews-platform', title: 'Delft-FEWS', text: 'Platform gratis untuk menggabungkan data pengamatan, prakiraan cuaca, dan model secara real-time.', take: 'prakiraan debit sungai di bendung (Fase 2).' },
  { src: 'Perangkat lunak · Autodesk', href: 'https://www.autodesk.com/blogs/water/2023/11/14/designing-sustainable-irrigation-networks-with-infoworks-ws-pro/', title: 'InfoWorks WS Pro untuk jaringan irigasi', text: 'Model hidrolik saluran terbuka digabung telemetri dan prakiraan kebutuhan menjadi twin real-time.', take: 'model jaringan + telemetri = twin.' },
  { src: 'Aplikasi PUPR · Indonesia', href: 'https://sda.pu.go.id/balai/bbwsnt1/berita/tingkatkan-kinerja-irigasi-dengan-e-paksi-untuk-ketahanan-pangan-nasional-1098', title: 'e-PAKSI, Ditjen SDA', text: 'Pengelolaan aset irigasi dan penilaian Indeks Kinerja Sistem Irigasi (IKSI).', take: 'kode bangunan dan ruas yang sama supaya bisa diintegrasikan.' },
  { src: 'Riset · UGM, April 2026', href: 'https://tpb.tp.ugm.ac.id/en/2026/04/13/sipasi-2-irrigation-modernization-indonesia.xhtml', title: 'SIPASI 2.0', text: 'Pembagian air berbasis data di D.I. Tabo-tabo: pembagian lebih efisien, pola tanam lebih terencana.', take: 'kebutuhan air per petak sebagai dasar pembagian.' },
  { src: 'Riset · UGM', href: 'https://etd.repository.ugm.ac.id/penelitian/detail/220671', title: 'Telemetri D.I. Rawa Dadahup', text: 'Telemetri debit, hujan, pH, dan bukaan pintu primer/sekunder; aturan buka-tutup berdasarkan elevasi muka air.', take: 'alarm berbasis ambang elevasi.' },
  { src: 'Tinjauan pustaka · Springer, 2026', href: 'https://link.springer.com/article/10.1007/s41101-026-00492-2', title: 'Prospects of Digital Twin Systems for Smart Irrigation', text: 'Ulasan arsitektur, sensor, dan model digital twin untuk irigasi.', take: 'pembagian lapisan fisik, data, model, dan layanan.' },
];

/** Tab Data & referensi: sumber data, perbaikan topologi, alur sistem, tahapan, dan referensi. */
export function DataPage() {
  const tot = R.length, km = R.reduce((a, r) => a + r.L, 0), fx = DATA.fixes;
  const cnt = (k: string) => fx.filter(f => f.st === k).length;
  return (
    <section id="tab-konsep" className="view konsep" aria-labelledby="h-konsep">
      <PageHead id="h-konsep" icon="data" title="Data & referensi" sub="Sumber data twin, perbaikan topologi jaringan, alur sistem, dan acuan" />
      <div>
        <div className="sect-h"><h2>Data yang dipakai twin ini</h2><p>Semua geometri dan angka kebutuhan air diambil dari data proyek WMS Agrin Irigasi. Yang disimulasikan hanya debit sungai, pembacaan sensor, dan hujan.</p></div>
        <div className="facts">
          <div className="panel"><h3>Dari data nyata</h3><ul className="srcs">
            <li><b>Jaringan:</b> {tot} ruas, {nf(km, 1)} km (primer, sekunder, suplesi, tersier) dari layer SISDA BBWS Cimanuk-Cisanggarung. Topologi dirapikan: {fx.length - 1} ruas yang terputus di data notebook kini tersambung, dan arah Suplesi Citameng III dibalik.</li>
            <li><b>Bendung Copong:</b> bendung {B.tipe.toLowerCase()} di S. Cimanuk, Ds. {B.desa}, Kec. {B.kec}; mercu {nf(B.mercu_m, 0)} m, tinggi {nf(B.tinggi_m, 1)} m, elevasi mercu +{nf(B.el_mercu, 2)} mdpl, intake {B.intake}, Q rencana {nf(B.q_rencana)} m³/s, kantong lumpur {nf(B.kantong_lumpur_m, 0)} m, luas baku {nf(B.luas_baku, 0)} ha.</li>
            <li><b>Sumber air lain:</b> {SOURCES.some(s => s.kind === 'lokal') ? <>{SOURCES.filter(s => s.kind === 'lokal').map(s => s.name).join(', ')} (sistem sendiri) dan </> : null}suplesi dari {SOURCES.filter(s => s.kind === 'suplesi').map(s => s.name).join(' dan ')}; titiknya dari layer bangunan SISDA. Sistem Bendung Cipacing, Genteng Cipacing, dan Pangkalan tidak dimasukkan karena berdiri sendiri di luar layanan Bendung Copong.</li>
            <li><b>Kebutuhan air:</b> per ruas tersier dari notebook WMS (FAO-56 Penman-Monteith, cuaca ERA5-Land 2015–2025, rezim FL, tanam Januari). Luas terlayani {nf(AREA_T, 0)} ha dalam {GROUPS.length} kelompok layanan.</li>
            <li><b>Hidraulik per ruas:</b> dimensi rencana b × h, talud, Manning n, kemiringan, kecepatan, bilangan Froude, dan waktu tempuh air dari notebook.</li>
            <li><b>Sawah:</b> poligon BIG RBI 25K (Agrikultur Sawah), dipetak 200 m; petak ≤ 750 m dari tersier dihitung terlayani.</li>
            <li><b>Sungai, situ, dan {DATA.bangunan.length} titik bangunan irigasi:</b> layer SISDA. <b>Medan:</b> Copernicus DEM GLO-90 (Open-Meteo), grid {DATA.dem.n} × {DATA.dem.n}.</li>
          </ul></div>
          <div className="panel"><h3>Simulasi untuk demo</h3><ul className="srcs">
            <li>Debit Sungai Cimanuk dan sungai kecil sumber suplesi (Citameng) per skenario.</li>
            <li>Bukaan pintu awal (dibuat tidak seimbang supaya terlihat masalah hulu-hilir).</li>
            <li>Model pembagian air: proporsional terhadap kapasitas dan bukaan pintu, dengan jeda waktu tempuh air per ruas.</li>
            <li>Lokasi {STATIONS.length} stasiun telemetri (dipilih di titik bangunan nyata), nilai baterai, sinyal, dan alarm.</li>
          </ul></div>
        </div>
      </div>

      <div>
        <div className="sect-h"><h2>Perbaikan topologi jaringan</h2><p>Di data notebook, {fx.length - 1} ruas tidak tersambung ke SI Copong. Tiap ruas dicek terhadap geometri dan titik bangunan SISDA, lalu disambung. Klik baris untuk melihat ruasnya di twin.</p></div>
        <div className="fixsum">
          <Chip lvl="good">{cnt('tersambung')} disambung, celah ≤ 40 m</Chip><Chip lvl="warn">{cnt('perlu verifikasi')} perlu cek lapangan</Chip>
          {cnt('sumber lokal') > 0 && <Chip lvl="good">{cnt('sumber lokal')} akar sistem bendung lokal</Chip>}<Chip lvl="good">{cnt('suplesi')} saluran suplesi</Chip>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Kode</th><th>Ruas</th><th>Perbaikan</th><th>Disambung ke</th><th className="num">Celah</th><th>Status</th><th>Dasar</th></tr></thead>
            <tbody>
              {fx.map(f => <RowLink key={f.k} sel={{ kind: 'ruas', id: f.k }}>
                <td className="id">{f.k}</td><td><span className="nm">{f.n}</span><div className="ds">{f.j}</div></td><td>{FIX_KIND[f.kind]}</td><td>{f.to}{f.into ? ' → ' + f.into : ''}</td>
                <td className="num">{f.gap} m</td><td><Chip lvl={f.st === 'perlu verifikasi' ? 'warn' : 'good'}>{f.st}</Chip></td><td className="why">{f.why}</td>
              </RowLink>)}
            </tbody>
          </table>
        </div>
        <p className="fine">Daftar lengkap juga tersimpan sebagai CSV (perbaikan_topologi_ruas.csv) untuk tim WMS. Celah di atas 40 m ditandai perlu cek lapangan.</p>
      </div>

      <div>
        <div className="sect-h"><h2>Alur data dari pintu air ke layar</h2><p>Urutan komponen sistem telemetri irigasi yang menjadi dasar digital twin.</p></div>
        <div className="arch">
          <div className="step"><span className="no">1</span><h4>Sensor lapangan</h4><p>AWLR radar di bendung, BCP.3, sadap sekunder utama, dan ujung saluran. Flowmeter, sensor posisi pintu, penakar hujan.</p></div>
          <div className="step"><span className="no">2</span><h4>Data logger</h4><p>Merekam tiap 10 menit, menyimpan data saat sinyal putus, catu panel surya dan baterai.</p></div>
          <div className="step"><span className="no">3</span><h4>Komunikasi</h4><p>4G di area bersinyal, satelit untuk Bendung Copong dan hulu Cimanuk bila sinyal lemah.</p></div>
          <div className="step"><span className="no">4</span><h4>Server &amp; basis data</h4><p>Validasi data (lonjakan, nilai macet), simpan deret waktu, picu alarm.</p></div>
          <div className="step"><span className="no">5</span><h4>Mesin digital twin</h4><p>Jaringan 176 ruas, kebutuhan air per tersier, waktu tempuh air, faktor K, uji skenario bukaan pintu.</p></div>
          <div className="step"><span className="no">6</span><h4>Dasbor &amp; kendali</h4><p>Tampilan 3D, telemetri, laporan O&amp;P, perintah pintu dengan otorisasi dan konfirmasi dua langkah.</p></div>
        </div>
      </div>

      <div>
        <div className="sect-h"><h2>Tahapan pengembangan</h2><p>Bisa dibangun bertahap; tiap fase sudah berguna sendiri.</p></div>
        <div className="phases">
          <div className="phase"><span className="no">Fase 1</span><h4>Monitoring</h4><ul><li>Sensor + logger di Bendung Copong, BCP.3, sadap SS Copong Kanan, SS Tegal Buah, SS Ciduga, dan ujung saluran.</li><li>Dasbor telemetri, grafik 24 jam, status stasiun.</li><li>Alarm TMA rendah/tinggi dan stasiun offline.</li></ul></div>
          <div className="phase"><span className="no">Fase 2</span><h4>Digital twin</h4><ul><li>Rapikan topologi: sambungkan ruas yang masih terputus di data SISDA.</li><li>Kalibrasi model dengan data sensor (lengkung debit, kehilangan air).</li><li>Neraca air dan faktor K otomatis per kelompok layanan.</li><li>Prakiraan debit Cimanuk dari hujan hulu.</li></ul></div>
          <div className="phase"><span className="no">Fase 3</span><h4>Kendali</h4><ul><li>Aktuator pada pintu pengambilan dan pintu bagi BCP.3.</li><li>Jadwal giliran otomatis saat K turun.</li><li>Integrasi aset dan kinerja dengan e-PAKSI.</li></ul></div>
        </div>
      </div>

      <div>
        <div className="sect-h"><h2>Referensi yang dipakai</h2><p>Sistem dan proyek nyata yang menjadi acuan fitur di demo ini.</p></div>
        <div className="refs">
          {REFS.map(r => <div key={r.href} className="ref"><span className="src">{r.src}</span><a href={r.href} target="_blank" rel="noopener">{r.title}</a><p>{r.text}</p><div className="take"><b>Diambil:</b> {r.take}</div></div>)}
        </div>
      </div>
      <p className="foot">Twin 3D disusun dari topologi jaringan (urutan sadap sesuai posisi asli), tapi tidak berskala. Model 3D tiap pintu memakai ukuran rencana saluran (b × h). Pintu banjir dan pintu penguras Bendung Copong mengatur muka air hulu; muka air itu menentukan debit yang bisa masuk intake. Bendung Copong mengikuti data teknis bendung gerak: 3 pintu banjir 12,5 × 3,5 m, 1 pintu penguras 5 × 8 m, 3 pintu pengambilan 3 × 1,15 m, dan kantong lumpur 3 × 10 m. Profil muka tanah di panel ruas memakai Copernicus DEM GLO-90 lewat Open-Meteo.</p>
    </section>
  );
}
