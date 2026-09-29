# Digital Twin Irigasi — D.I. Leuwigoong

Situs pemantauan jaringan irigasi D.I. Leuwigoong (Bendung Copong, Kab. Garut).

Isinya:

- **Diorama 3D:** jaringan dari Sungai Cimanuk sampai petak tersier.
- **Model 3D tiap pintu:** pintu banjir, penguras, pengambilan, dan pintu sadap.
- **Telemetri simulasi:** AWLR, debit, dan hujan.
- **Neraca air:** Faktor K per kelompok.
- **Rekomendasi bukaan pintu:** termasuk kendali pintu bendung yang mengatur muka air hulu.

```
irigasi-digital-twin/
├── frontend/   Vite + React 18 + TypeScript + three.js
└── backend/    Express — data jaringan; telemetri SimHidro menyusul
```

## Menjalankan

Bawaannya **mode peraga**. Semua angka dibangkitkan mesin simulasi di peramban dari data jaringan, tanpa server.

```bash
npm install
npm run dev:web
```

Antarmuka: <http://localhost:5176>

Untuk menyalakan API Express sekaligus:

```bash
npm run dev
```

- Antarmuka: <http://localhost:5176>
- API: <http://localhost:5177>. Ada `/health`, `/api/network`, dan `/api/network/ruas/:kode`. `/api/telemetry` masih mengembalikan 501.

Port 5176/5177 dipilih supaya bisa jalan bersamaan dengan Digital Twin Jembatan (5174/5175).

`npm run build` menghasilkan berkas statis di `frontend/dist`, yang bisa disajikan server web apa pun.

## Struktur frontend

```
frontend/src/
├── main.tsx              titik masuk React
├── App.tsx               kerangka: menu samping kiri + bilah status + halaman (pola dasbor demo Beacon)
├── domain/               model twin tanpa DOM dan tanpa three.js
│   ├── network.ts        jaringan 176 ruas, sumber air, kelompok layanan
│   ├── weir.ts           hidrolika Bendung Copong (muka air hulu dari bukaan pintu banjir/penguras)
│   ├── gates.ts          daftar pintu yang bisa diatur
│   ├── stations.ts       16 stasiun telemetri dan cara bacanya
│   ├── simulation.ts     langkah 10 menit, model tunak, rekomendasi bukaan, pratinjau "jika"
│   ├── state.ts          keadaan simulasi bersama (waktu, debit, bukaan, riwayat 24 jam)
│   ├── analysis.ts       neraca volume 24 jam, keandalan kelompok, pembagian per cabang, kepekaan debit sungai
│   ├── loggers.ts        logger untuk Analisa: 16 stasiun + tiap pintu (AWGC) beserta parameternya
│   ├── history.ts        riwayat per jam/hari/bulan: simulasi berjalan + riwayat sintetis berpola musim
│   ├── alarms.ts, status.ts, scenarios.ts, gateSpec.ts, profile.ts, terrain.ts, geometry.ts
│   └── types.ts
├── store/twinStore.ts    keadaan antarmuka + aksi (pilih objek, pratinjau, terapkan, skenario, tab)
├── hooks/useTwin.ts      langganan React ke store
├── three/                diorama 3D dan model pintu 3D
│   ├── twinScene.ts      bangun adegan, kamera, loop bingkai, klik objek
│   ├── TwinView.tsx      pembungkus React + tombol sudut pandang dan lapisan
│   ├── weir.ts, canals.ts, river.ts, terrain.ts, sensors.ts, roads.ts, villages.ts, vegetation.ts
│   ├── labels.ts, sync.ts   label HTML di adegan; salin keadaan simulasi ke adegan
│   ├── weather.ts        riak Sungai Cimanuk menurut debit, hujan (garis miring, percikan di sungai), badai dan kilat
│   ├── gateModel.ts, gateViewer.ts   model 3D satu pintu untuk jendela detail
│   └── context.ts, layout.ts, geometry.ts, textures.ts, materials.ts, occupancy.ts, props.ts
├── components/           Sidebar, TopBar, PageHead, Kpi, Rail, DetailPanel, GateControl, GateModal, CrossSection, Ui
├── pages/                DashboardPage, TwinPage, TelemetryPage, NeracaPage, AnalysisPage (konsol analisa ala mini-stesy), NetworkPage (evaluasi jaringan), DataPage
├── lib/                  format angka/waktu, grafik SVG, pembangkit acak berbenih
├── styles/               tokens.css (palet navy + font demo Beacon) dan app.css (menu samping, bilah status, jendela pintu)
├── assets/logo-beacon.png  logo Beacon Engineering putih (dari `D:\BE Software\logo\logo_beacon.png`); favicon = `public/favicon.ico` dari be-inventory
└── data/leuwigoong.json  jaringan: bendung, 176 ruas, bangunan, sungai, DEM
```

Alur datanya satu arah:

1. **Simulasi melangkah.** Jam simulasi (`startClock`) menjalankan `step()` tiap 1,5 detik (6× lebih cepat bila dipilih).
2. **Store memberi tahu.** Tiap langkah atau aksi pengguna menaikkan versi store.
3. **Komponen digambar ulang.** Komponen React membaca keadaan terbaru langsung dari `domain/state.ts` dan `store/twinStore.ts`.
4. **Adegan 3D diperbarui.** `TwinView` menyalin keadaan ke adegan lewat `update()`. Adegan dibangun sekali saja, jadi langkah simulasi tidak membangun ulang geometri.

Tampilan awal:

- tab Digital twin;
- kamera dari hulu sisi barat, menghadap Bendung Copong, intake, dan kantong lumpur (`VIEWS.awal`);
- AWLR Cimanuk (CMK-01) terpilih.

Menu samping mengubah alamat halaman (`#dashboard`, `#twin`, `#telemetri`, `#neraca`, `#analisa`, `#evaluasi`, `#konsep`), jadi tombol kembali peramban dan muat ulang tetap di halaman yang sama. Di layar ≤ 760 px menu samping menjadi laci yang dibuka dari tombol ☰ di bilah status.

Letak pohon, rumah, dan tekstur selalu sama tiap kali halaman dibuka. Alasannya, semuanya memakai satu aliran acak berbenih (`lib/random.ts`) dengan urutan panggil tetap: stasiun dibuat, simulasi dipanaskan 24 jam, baru adegan dibangun.

Saat pengembangan, `window.__twin` di konsol peramban memberi akses ke adegan (`S`), simulasi (`sim`), dan store.

## Tahapan pemindahan

1. **Selesai.** Demo satu berkas dipindah utuh ke proyek Vite, dengan three.js dari npm (r169, bukan CDN r128).
2. **Selesai.** Mesin dipecah mengikuti pola Digital Twin Jembatan:
   - `domain/` untuk model;
   - `three/` untuk adegan dan model pintu;
   - komponen React untuk panel.

   Semua dalam TypeScript strict. Tampilan dan perilakunya sama dengan tahap 1. Tata letak kini selebar layar, dan tampilan awal menghadap Bendung Copong.
3. **Sambung data asli.** Telemetri dan bukaan pintu diambil dari API SimHidro (Laravel, repo `WMS_AgrinIrigation`), lewat `backend/` atau langsung.
   - Titik sambungnya adalah `main.get`/`sub.get` di `domain/stations.ts` dan `step()` di `domain/simulation.ts`.
   - Mode peraga tetap ada sebagai cadangan.

## Catatan teknis

- **Riwayat untuk Analisa.** Halaman Analisa meniru Konsol Analisa mini-stesy: pilih logger, parameter, lalu hari, bulan, tahun, atau rentang tanggal. Hasilnya grafik dan tabel rerata/minimum/maksimum, atau akumulasi untuk curah hujan, dan bisa diunduh sebagai CSV.
  - 24 jam terakhir diambil dari simulasi berjalan.
  - Waktu sebelum itu diisi riwayat sintetis yang selalu sama untuk tanggal yang sama (`domain/history.ts`): debit Cimanuk mengikuti pola musim, hujan harian acak berbenih, dan jaringan dihitung tunak dengan bukaan awal.
  - Saat tersambung ke SimHidro, riwayat sintetis diganti riwayat logger asli dari API.
  - Mode **Multi parameter** (seperti mini-stesy) menumpuk beberapa parameter dari logger yang sama dalam satu grafik. Tiap parameter jadi satu garis rerata, atau jumlah untuk curah hujan. Satuan pertama memakai sumbu kiri, satuan kedua sumbu kanan, dan satuan ketiga dan seterusnya ikut sumbu kiri. Mode ini juga punya tabel dan unduhan CSV sendiri.
  - Kedua mode bisa mengunduh grafik sebagai PNG (`downloadChartPng` di `lib/chart.ts`), dengan kepala berisi nama pos, parameter, dan periode.
  - Suhu logger (°C) adalah parameter peraga: nilainya mengikuti siklus harian dan turun saat hujan.

- **Halaman rumah operasi bendung.** Di tepi intake, hilir kantong lumpur, pelataran bendung hanya rata sampai 7,5 unit dari as sungai. Setelah itu tanahnya melandai ke muka tanah (`platY` di `three/terrain.ts`), sehingga rumah operasi, jalan masuk, parkir, dan papan nama berdiri di tanah rata.
  - Di belakang tembok sayap hilir, timbunan pelataran ikut melandai, jadi tidak ada tebing tegak lagi.
  - Jalan menapak pada tanah tertinggi di sepanjang lebarnya, jadi tidak tertembus lereng.

- **Persilangan jalan dengan saluran.** Di tiap persilangan dibangun jembatan pelat pendek dan timbunan oprit (`three/roads.ts`):
  - pelat dan balok tepi di atas saluran, tembok sandaran dengan tiang ujung di atas tanggul;
  - timbunan berumput dengan bahu kerikil yang membawa jalan naik ke tanggul dan turun lagi sampai muka tanah;
  - mobil tidak diletakkan di jembatan atau oprit, dan berdiri di permukaan aspal.

- **Riak sungai dan hujan.** `three/weather.ts` mengatur permukaan Sungai Cimanuk dari debitnya:
  - **kemarau:** tenang seperti kaca, lambat, dan agak jernih;
  - **normal:** beriak sedang;
  - **banjir:** ombak lebar dan kasar, deras, keruh kecokelatan, dan buih makin tebal.

  Riak memakai dua lapis peta normal ombak yang bergerak dengan kecepatan dan arah berbeda. Nilainya berpindah pelan saat skenario diganti.
  - Hujan digambar sebagai garis jatuh yang miring tertiup angin. Makin lebat, makin rapat dan panjang garisnya, dan tiap tetes memercik lingkaran di muka sungai.
  - Hujan lebat menggelapkan langit dan merapatkan kabut. Pada hujan tersebut, sesekali ada kilat.
  - Dari kamera jauh, garis hujan ditipiskan supaya jaringan tetap terbaca.
  - Skenario banjir kini hujan lebat sepanjang waktu, sekitar 8–32 mm/jam.

- **Tampilan.** Mengikuti dasbor demo Beacon (be-jogja.com/demo): palet navy (selalu gelap), font Plus Jakarta Sans dan JetBrains Mono, logo Beacon Engineering putih langsung di atas navy. Diorama 3D tetap mengikuti preferensi terang/gelap sistem operasi: gelap menjadi suasana senja dengan lampu menyala, terang menjadi siang.

- **Manajemen warna.** Scene disusun dengan alur warna three r128: warna sRGB dikonversi manual lewat `C()`. Karena itu `THREE.ColorManagement.enabled = false`.
- **Intensitas cahaya.** Intensitas cahaya lama dikali π (`LIGHT`), karena sejak r155 three memakai satuan cahaya fisik. Kalau kelak ColorManagement dinyalakan, `C()` dan konversi `convertSRGBToLinear()` harus dilepas bersamaan.
- **Ukuran tidak berskala.** Diorama disusun dari topologi jaringan (urutan sadap sesuai posisi asli), tapi tidak berskala.
- **Sumber ukuran bangunan.** Ukuran Bendung Copong berasal dari Aprilia & Permana (2021) dan data SISDA. Ukuran pintu sadap berasal dari rencana saluran (b × h).
- **Asal data dan kode.** Data jaringan dibangun dari notebook SimHidro, ditambah perbaikan topologi 27 ruas. Pipeline lamanya (`build_data.py`, skrip patch, artifact) ada di `D:\be-server\tmp\twin-irigasi-demo`. Mulai sekarang, perubahan dilakukan langsung di proyek ini.
