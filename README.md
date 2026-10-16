# Map Shorts Studio

Generator Shorts peta dunia 9:16 (1080x1920): atas 70% peta animasi, bawah 30% footage, CTA di pembatas.
Render MP4 Full HD dilakukan di GitHub Actions (Puppeteer + ffmpeg), jadi tidak bergantung pada PC kamu.

## Isi repo
| Path | Fungsi |
|---|---|
| `index.html` | Generator (UI). Buka lewat Vercel, GitHub Pages, atau klik dua kali di komputer. |
| `render.js` | Merender config menjadi MP4 (H.264 + AAC, 30 fps, 1080x1920). |
| `.github/workflows/render.yml` | Workflow manual "Render videos". |
| `configs/` | Satu file `.csv` atau `.json` per video. Contoh: `roblox-banned.csv`. |
| `assets/footage/` | Video atau foto untuk bagian bawah. |
| `assets/music/` | Musik berlisensi jelas. |
| `out/` | Hasil render lokal. |

## Upload ke GitHub
1. Buat repo baru di GitHub, lalu upload semua isi zip ini (termasuk folder `.github`).
   Kalau folder `.github` tidak ikut terupload lewat web, buat manual: Add file > Create new file, ketik nama
   `.github/workflows/render.yml`, lalu tempel isi file itu. Atau pakai GitHub Desktop atau git.
2. Tab **Settings > Actions > General**: pastikan Actions aktif.

## Cara membuat satu video
1. Buka `index.html`. Muat CSV data (tombol Upload CSV) atau isi grup manual. Atur judul, CTA, durasi.
2. Letakkan footage di `assets/footage/` dan musik di `assets/music/`. Ukuran file maksimal 100 MB per file di GitHub,
   jadi kecilkan klip ke 1080p, sekitar 10 detik.
3. Buat config, pilih salah satu cara:
   - **CSV:** tambahkan baris pengaturan di bagian atas file CSV (lihat bawah), simpan ke `configs/nama-video.csv`.
   - **JSON:** di generator, unggah footage dan musik, atur, lalu klik **Simpan config JSON**.
     Simpan ke `configs/nama-video.json`. Nama file footage dan musik harus sama dengan yang ada di folder assets.
4. Commit dan push. Buka tab **Actions > Render videos > Run workflow**.
   Isi `configs` untuk merender semua file, atau isi satu file, misalnya `configs/roblox-banned.csv`.
5. Setelah selesai, unduh artifact **videos** (berlaku 7 hari): `nama.mp4` dan `nama-frame.png` (frame untuk thumbnail).

## Baris pengaturan CSV
Baris berawalan `#`, semuanya opsional:
```
# title,Is Roblox *Banned* in Your Country?
# sub,Status as of October 2026
# handle,@TopRankDaily
# cta,Comment your country
# duration,9
# highlight,#E53935
# cta_color,#FFD23F
# media,assets/footage/klip1.mp4
# media,assets/footage/foto1.jpg
# music,assets/music/lagu.mp3
# music_start,12
# music_volume,0.8
# music_fade,1
country,group,color,name
TR,Banned,#E53935,Turkey
```
- `# media` boleh diulang. Footage dibagi rata sepanjang durasi. Video diulang jika lebih pendek, foto diberi zoom pelan.
- Footage atau musik yang file-nya tidak ditemukan akan dilewati dengan peringatan di log. Render tidak berhenti.
- Durasi di CSV dibatasi 5 sampai 10 detik. Kalau tidak ada musik, video dibuat tanpa suara.
- Kolom `country` boleh kode ISO (ID) atau nama Inggris. Maksimal 6 grup.

## Render lokal (opsional)
Butuh Node 18+ dan ffmpeg.
```
npm install
node render.js configs/roblox-banned.csv
```

## Catatan penting
- Lisensi: pakai footage dan musik yang jelas lisensinya (misalnya Pixabay). Simpan bukti lisensi dan tautan sumbernya.
- Data peta: cek ulang status data sebelum upload. Preset hanya contoh.
- Pembatasan teknis: peta memuat 176 negara, jadi beberapa negara kecil tidak muncul.
- Font Bricolage Grotesque dimuat dari Google Fonts saat render, jadi runner perlu akses internet (default aktif).
