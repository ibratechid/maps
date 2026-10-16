// Render video Shorts 1080x1920 @30fps: UI peta dirender per frame oleh Puppeteer (PNG transparan di area footage),
// lalu ffmpeg menyusun footage + musik + overlay menjadi MP4 H.264/AAC.
// Pemakaian: node render.js [file.csv|file.json|folder]   (default: configs)
const fs = require('fs'), path = require('path'), http = require('http');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = __dirname, FPS = 30, W = 1080, H = 1920, TOP = 1344, MH = H - TOP;
const target = process.argv[2] || 'configs';

function listConfigs(p) {
  if (!fs.existsSync(p)) throw new Error('Tidak ditemukan: ' + p);
  if (fs.statSync(p).isDirectory())
    return fs.readdirSync(p).filter(f => /\.(csv|json)$/i.test(f)).sort().map(f => path.join(p, f));
  return [p];
}

function clean(s) { return s.trim().replace(/^"(.*)"$/, '$1').trim(); }

function readMeta(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const meta = { dur: 9, media: [], music: null };
  if (/\.json$/i.test(file)) {
    const c = JSON.parse(txt);
    if (+c.dur >= 1 && +c.dur <= 60) meta.dur = +c.dur;
    meta.media = Array.isArray(c.media) ? c.media : [];
    if (c.music && c.music.file) meta.music = { file: c.music.file, start: +c.music.start || 0, volume: c.music.volume == null ? 0.8 : +c.music.volume, fade: c.music.fade == null ? 1 : +c.music.fade };
    return meta;
  }
  let m = { file: '', start: 0, volume: 0.8, fade: 1 };
  for (const line of txt.split(/\r?\n/)) {
    const r = line.match(/^#\s*([a-z_]+)\s*[,;]\s*(.*)$/i);
    if (!r) continue;
    const k = r[1].toLowerCase(), v = clean(r[2].split(/[,;]/)[0]);
    if (k === 'duration' && +v >= 5 && +v <= 10) meta.dur = +v;
    else if (k === 'media' && v) meta.media.push(v);
    else if (k === 'music') m.file = v;
    else if (k === 'music_start') m.start = +v || 0;
    else if (k === 'music_volume') m.volume = +v;
    else if (k === 'music_fade') m.fade = +v;
  }
  if (m.file) meta.music = m;
  return meta;
}

function startServer() {
  const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

function probeDur(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat(String(r.stdout || '').trim());
  return r.status === 0 && d > 0 ? d : 0;
}

// Decode musik ke WAV bersih (tanpa cover art/tag) supaya bisa di-loop dan di-seek dengan aman
function prepMusic(file, tmp) {
  const wav = path.join(tmp, 'music.wav');
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '2', '-ar', '44100', '-t', '900', wav], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(wav) || fs.statSync(wav).size < 2000) {
    console.log('  PERINGATAN: file musik tidak bisa dibaca, video dibuat tanpa suara. Ukuran file:', fs.statSync(file).size, 'byte.');
    console.log('  Kemungkinan file rusak, terpotong saat upload, atau bukan audio asli. Detail:', String(r.stderr || '').split('\n').slice(0, 3).join(' | '));
    return null;
  }
  return wav;
}

function ff(args) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg gagal (kode ' + r.status + ')');
}

async function renderOne(browser, port, cfgPath) {
  const name = path.basename(cfgPath).replace(/\.(csv|json)$/i, '');
  const meta = readMeta(cfgPath), dur = meta.dur, N = Math.round(dur * FPS);
  const tmp = path.join(ROOT, 'tmp', name);
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  console.log(`\n=== ${name}: ${dur}s, ${N} frame ===`);

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('Halaman error:', e.message));
  const rel = cfgPath.split(path.sep).join('/');
  await page.goto(`http://127.0.0.1:${port}/index.html?render=1&config=${encodeURIComponent(rel)}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready===true||window.__err', { timeout: 60000 });
  const err = await page.evaluate('window.__err||""');
  if (err) throw new Error('Gagal memuat config: ' + err);

  for (let i = 0; i < N; i++) {
    const b64 = await page.evaluate(t => { window.renderFrame(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, i / FPS);
    fs.writeFileSync(path.join(tmp, `f${String(i).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
    if (i % 60 === 0) console.log(`  frame ${i}/${N}`);
  }
  await page.close();

  // Footage: lewati file yang tidak ada
  const clips = meta.media.filter(f => {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) { console.log('  PERINGATAN: footage tidak ditemukan, dilewati:', f); return false; }
    if (!/\.(jpe?g|png|webp)$/i.test(f) && !probeDur(full)) { console.log('  PERINGATAN: footage tidak bisa dibaca (rusak?), dilewati:', f); return false; }
    return true;
  });
  console.log('  Footage dipakai:', clips.length ? clips.join(', ') : 'TIDAK ADA. Tambahkan baris "# media,assets/footage/nama.mp4" di config.');
  console.log('  Musik:', meta.music ? meta.music.file : 'TIDAK ADA. Tambahkan baris "# music,assets/music/nama.mp3" di config.');
  const L = dur / Math.max(1, clips.length);
  const args = ['-f', 'lavfi', '-i', `color=c=0x0a121b:s=${W}x${H}:r=${FPS}:d=${dur}`, '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png')];
  const fc = [];
  clips.forEach((f, k) => {
    const isImg = /\.(jpe?g|png|webp)$/i.test(f), full = path.join(ROOT, f);
    if (isImg) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(L), '-i', full);
    else args.push('-stream_loop', '-1', '-t', String(L), '-i', full);
    const idx = 2 + k;
    if (isImg) fc.push(`[${idx}:v]scale=${W * 2}:${MH * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${MH * 2},zoompan=z='1+0.08*on/${Math.round(L * FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${MH}:fps=${FPS},setsar=1,format=yuv420p[m${k}]`);
    else fc.push(`[${idx}:v]fps=${FPS},scale=${W}:${MH}:force_original_aspect_ratio=increase,crop=${W}:${MH},setsar=1,format=yuv420p,trim=duration=${L},setpts=PTS-STARTPTS[m${k}]`);
  });
  const post = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
  if (clips.length) {
    fc.push(clips.length > 1 ? clips.map((_, k) => `[m${k}]`).join('') + `concat=n=${clips.length}:v=1:a=0[media]` : '[m0]null[media]');
    fc.push(`[0:v][media]overlay=0:${TOP}:shortest=1[b1]`, `[b1][1:v]overlay=0:0:format=auto:shortest=1,${post}[v]`);
  } else fc.push(`[0:v][1:v]overlay=0:0:format=auto:shortest=1,${post}[v]`);

  let hasAudio = false;
  const musicSrc = meta.music ? path.join(ROOT, meta.music.file) : null;
  const musicWav = musicSrc && fs.existsSync(musicSrc) ? prepMusic(musicSrc, tmp) : null;
  if (musicWav) {
    const m = meta.music, ai = 2 + clips.length; hasAudio = true;
    const md = probeDur(musicWav) || 1, st = m.start >= md ? m.start % md : m.start;
    args.push('-ss', String(st), '-stream_loop', '-1', '-i', musicWav);
    let af = `[${ai}:a]atrim=0:${dur},asetpts=PTS-STARTPTS,volume=${m.volume},afade=t=in:st=0:d=0.15`;
    if (m.fade > 0) af += `,afade=t=out:st=${Math.max(0.2, dur - m.fade)}:d=${m.fade}`;
    fc.push(af + '[a]');
  } else if (meta.music && !fs.existsSync(musicSrc)) console.log('  PERINGATAN: musik tidak ditemukan, video dibuat tanpa suara:', meta.music.file);

  const out = path.join(ROOT, 'out', name + '.mp4');
  args.push('-filter_complex', fc.join(';'), '-map', '[v]');
  if (hasAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k'); else args.push('-an');
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', String(FPS), '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', '-t', String(dur), out);
  ff(args);
  fs.copyFileSync(path.join(tmp, `f${String(Math.round(N * 0.93)).padStart(4, '0')}.png`), path.join(ROOT, 'out', name + '-frame.png'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('  Selesai:', path.relative(ROOT, out));
}

(async () => {
  const files = listConfigs(target);
  if (!files.length) throw new Error('Tidak ada file .csv atau .json di ' + target);
  const srv = await startServer(), port = srv.address().port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'] });
  let failed = 0;
  for (const f of files) { try { await renderOne(browser, port, f); } catch (e) { failed++; console.error('GAGAL', f, '-', e.message); } }
  await browser.close(); srv.close();
  if (failed) process.exit(1);
})();
