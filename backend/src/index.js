/**
 * API Digital Twin Irigasi (kerangka).
 *
 * Frontend belum memanggil API ini: bawaannya mode peraga, semua angka dibangkitkan mesin simulasi di
 * peramban. Titik akhir di sini disiapkan untuk tahap penyambungan ke telemetri SimHidro (Laravel,
 * repo WMS_AgrinIrigation): data jaringan sudah tersedia, telemetri masih mengembalikan 501.
 */
const express = require('express');
const cors = require('cors');
const network = require('../../frontend/src/data/leuwigoong.json');

// Bendung lokal yang dikeluarkan dari twin, sama dengan DROP_SRC di frontend/src/domain/network.ts: ruas yang
// berakar di sana (beserta cabangnya) tidak ikut diringkas atau dicari.
const DROP_SRC = ['Bendung Cipacing', 'Bendung Genteng Cipacing', 'BD. PANGKALAN'];
const dropped = new Set();
{
  const kids = network.ruas.map(() => []);
  network.ruas.forEach((r, i) => { if (r.p >= 0) kids[r.p].push(i); });
  const walk = i => { dropped.add(i); kids[i].forEach(walk); };
  network.ruas.forEach((r, i) => { if (r.p < 0 && r.src && r.into == null && DROP_SRC.includes(r.src)) walk(i); });
}
const RUAS = network.ruas.filter((_, i) => !dropped.has(i));

const PORT = Number(process.env.PORT) || 5177;
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Digital Twin Irigasi API',
    version: '0.1.0',
    endpoints: {
      health: 'GET /health',
      network: 'GET /api/network',
      ruas: 'GET /api/network/ruas/:kode',
      telemetry: 'GET /api/telemetry (belum tersambung)',
    },
  });
});

// Ringkasan jaringan: data bendung dan daftar ruas tanpa geometri.
app.get('/api/network', (req, res) => {
  const ruas = RUAS.map(r => ({ kode: r.k, nama: r.n, jenis: r.j, hulu: r.p >= 0 ? network.ruas[r.p].k : null, panjangKm: r.L, luasHa: r.A, bangunan: r.s || null }));
  res.json({ success: true, data: { bendung: network.bendung, jumlahRuas: ruas.length, ruas } });
});

app.get('/api/network/ruas/:kode', (req, res) => {
  const r = RUAS.find(x => x.k === req.params.kode);
  if (!r) return res.status(404).json({ success: false, message: `Ruas ${req.params.kode} tidak ditemukan` });
  res.json({ success: true, data: r });
});

app.get('/api/telemetry', (req, res) => {
  res.status(501).json({ success: false, message: 'Telemetri belum tersambung. Tahap berikutnya: ambil dari API SimHidro.' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Rute tidak ditemukan: ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => console.log(`API Digital Twin Irigasi di http://localhost:${PORT}`));
