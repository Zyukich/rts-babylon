// Сборщик ассетов: читает assets/catalog.json, скачивает/распаковывает паки, копирует свои файлы,
// проверяет, что модели и анимации на месте, и пишет public/assets/manifest.json для игры.
//
//   npm run assets               собрать (скачает только то, чего нет)
//   npm run assets -- --force    перекачать и пересобрать всё
//   npm run assets:check         только проверить каталог (без скачивания), код 1 при ошибках
//   npm run assets:list -- <пак или файл>   какие модели в паке и какие у них анимации
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'assets');            // исходники: catalog.json, models/, textures/, sounds/, packs/
const OUT = path.join(ROOT, 'public/assets');     // собранное (в git не хранится)
const CACHE = path.join(SRC, '.cache');           // скачанные архивы паков
const VERSION = 1;
const argv = process.argv.slice(2), has = (f) => argv.includes(f);
const FORCE = has('--force'), CHECK = has('--check'), IF_MISSING = has('--if-missing');
const KEEP = /\.(gltf|glb|bin|png|jpe?g|webp|ktx2)$/i;
const OWN = ['models', 'textures', 'sounds'];     // свои папки копируются как есть

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const readCatalog = () => JSON.parse(fs.readFileSync(path.join(SRC, 'catalog.json'), 'utf8'));
const strip = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !k.startsWith('$')));
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

/** "пак:путь/в/архиве" → путь относительно public/assets; "models/x.glb" — свой файл */
function resolveRef(ref, packs) {
  const i = ref.indexOf(':');
  if (i > 0 && packs[ref.slice(0, i)]) return `${ref.slice(0, i)}/${ref.slice(i + 1)}`;
  if (i > 0) { err(`неизвестный пак «${ref.slice(0, i)}» в ${ref}`); return null; }
  return ref;
}

// ---------- glTF: анимации и внешние файлы ----------
function readGltf(file) {
  const buf = fs.readFileSync(file);
  if (/\.gltf$/i.test(file)) return JSON.parse(buf.toString('utf8'));
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('не GLB');
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}
const gltfCache = new Map();
function gltfInfo(relPath) {
  if (gltfCache.has(relPath)) return gltfCache.get(relPath);
  const abs = path.join(OUT, relPath);
  let info = null;
  if (fs.existsSync(abs)) {
    try {
      const j = readGltf(abs), dir = path.dirname(abs);
      const uris = [...(j.buffers ?? []), ...(j.images ?? [])].map((x) => x.uri).filter((u) => u && !u.startsWith('data:'));
      info = { anims: (j.animations ?? []).map((a) => a.name ?? ''), skinned: !!j.skins?.length, parts: (j.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? ''), missing: uris.filter((u) => !fs.existsSync(path.join(dir, decodeURIComponent(u)))) };
    } catch (e) { info = { error: e.message }; }
  }
  gltfCache.set(relPath, info);
  return info;
}
/** Проверить модель; вернуть путь для манифеста или null */
function model(ref, packs, where) {
  const p = resolveRef(ref, packs);
  if (!p) return null;
  const info = gltfInfo(p);
  if (!info) { (CHECK ? warn : err)(`${where}: нет файла ${p}${CHECK ? ' (пак не скачан?)' : ''}`); return null; }
  if (info.error) { err(`${where}: не читается ${p}: ${info.error}`); return null; }
  if (info.missing.length) err(`${where}: у ${p} нет файлов ${info.missing.join(', ')}`);
  return p;
}

// ---------- Скачивание и распаковка ----------
async function download(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function preparePack(id, p) {
  const dst = path.join(OUT, id);
  if (!FORCE && fs.existsSync(dst)) return;
  let data;
  if (p.zip) {
    const z = path.join(SRC, p.zip);
    if (!fs.existsSync(z)) return err(`пак ${id}: нет архива assets/${p.zip}`);
    data = new Uint8Array(fs.readFileSync(z));
  } else if (p.url) {
    const cached = path.join(CACHE, `${id}.zip`);
    if (!FORCE && fs.existsSync(cached)) data = new Uint8Array(fs.readFileSync(cached));
    else {
      process.stdout.write(`  ⬇ ${id}… `);
      try { data = await download(p.url); } catch (e) { console.log('не удалось'); return warn(`пак ${id} не скачался (${e.message}) — будет процедурная замена`); }
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(cached, data);
      console.log(`${(data.length / 1e6).toFixed(1)} МБ`);
    }
  } else return err(`пак ${id}: нужен url или zip`);
  const files = unzipSync(data, { filter: (f) => KEEP.test(f.name) && !/\/(fbx|obj|blend|previews?|screenshots?)\//i.test(f.name) });
  fs.rmSync(dst, { recursive: true, force: true });
  for (const [name, bytes] of Object.entries(files)) {
    const inner = p.stripRoot ? name.split('/').slice(1).join('/') : name; // github-архивы: без корневой папки
    if (!inner) continue;
    const f = path.join(dst, inner);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, bytes);
  }
  console.log(`  📦 ${id}: ${Object.keys(files).length} файлов`);
}
function copyOwn() { // assets/models|textures|sounds → public/assets/… (только новые и изменённые)
  let n = 0;
  for (const dir of OWN) for (const f of walk(path.join(SRC, dir))) {
    if (path.basename(f).startsWith('.')) continue;
    const dst = path.join(OUT, path.relative(SRC, f));
    if (!FORCE && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(f).mtimeMs) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f, dst);
    n++;
  }
  if (n) console.log(`  📁 свои файлы: ${n}`);
}
async function prepareTexture(key, t) {
  if (t.file) return; // свой файл — уже скопирован
  const dst = path.join(OUT, 'textures', `${key}.jpg`);
  if (!FORCE && fs.existsSync(dst)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  for (const slug of t.polyhaven ?? []) {
    try {
      let url = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${slug}/${slug}_diff_1k.jpg`;
      try { url = (await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json())?.Diffuse?.['1k']?.jpg?.url ?? url; } catch { /* API недоступен — прямая ссылка */ }
      fs.writeFileSync(dst, await download(url));
      return console.log(`  🖼 текстура ${key}: ${slug}`);
    } catch (e) { console.log(`  · ${key}/${slug}: ${e.message}`); }
  }
  warn(`текстура ${key} не скачалась — земля будет цветами палитры`);
}

// ---------- Манифест ----------
function buildManifest(cat, hash) {
  const packs = strip(cat.packs), man = { version: VERSION, catalog: hash, units: {}, buildings: {}, textures: {}, sounds: {} };
  const globRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  for (const [type, u] of Object.entries(strip(cat.units))) {
    if (!u.model) continue;
    const file = model(u.model, packs, `юнит ${type}`);
    if (!file) continue;
    const info = gltfInfo(file), anims = {};
    for (const [key, a] of Object.entries(u.anims ?? {})) {
      const spec = typeof a === 'string' ? { file, name: a } : { file: a.file ? model(a.file, packs, `юнит ${type}.${key}`) : file, name: a.name };
      if (!spec.file) continue;
      const ai = gltfInfo(spec.file);
      if (ai?.anims && !ai.anims.includes(spec.name)) { err(`юнит ${type}: в ${spec.file} нет анимации «${spec.name}» (есть: ${ai.anims.slice(0, 12).join(', ')}${ai.anims.length > 12 ? '…' : ''})`); continue; }
      anims[key] = spec;
    }
    if (u.anims && Object.keys(u.anims).length && !anims.idle && !anims.walk) { warn(`юнит ${type}: нет ни idle, ни walk — будет процедурная модель`); continue; }
    for (const p of [...(u.parts ?? []), ...(u.team ?? [])]) // части модели: опечатка в имени — ошибка
      if (info?.parts && !info.parts.some((n) => globRe(p).test(n))) err(`юнит ${type}: в ${file} нет части «${p}» (есть: ${info.parts.join(', ')})`);
    const spec = { file, anims };
    for (const k of ['parts', 'team', 'scale', 'length', 'rotate']) if (u[k] !== undefined) spec[k] = u[k];
    man.units[type] = spec;
  }
  for (const [type, b] of Object.entries(strip(cat.buildings))) {
    const out = {};
    if (b.ages) {
      const ages = b.ages.map((tier, ti) => tier.map((stages, vi) => stages.map((f, si) => model(f, packs, `здание ${type} [эпоха ${ti}][вариант ${vi}][стадия ${si}]`)).filter(Boolean)).filter((s) => s.length)).filter((t) => t.length);
      if (ages.length) out.ages = ages;
    }
    if (b.colors) { const c = b.colors.map((f, i) => model(f, packs, `здание ${type} [цвет ${i}]`)).filter(Boolean); if (c.length) out.colors = c; }
    if (out.ages || out.colors) man.buildings[type] = out;
  }
  for (const [key, t] of Object.entries(strip(cat.textures))) {
    const p = t.file ? t.file : `textures/${key}.jpg`;
    if (fs.existsSync(path.join(OUT, p))) man.textures[key] = p; else if (t.file) err(`текстура ${key}: нет файла assets/${t.file}`);
  }
  for (const [key, s] of Object.entries(strip(cat.sounds))) {
    if (!s?.file) continue;
    if (fs.existsSync(path.join(OUT, s.file))) man.sounds[key] = { file: s.file, volume: s.volume ?? 1 }; else err(`звук ${key}: нет файла assets/${s.file}`);
  }
  return man;
}

// ---------- Список моделей пака ----------
function list(target) {
  const dir = fs.existsSync(path.join(OUT, target)) ? path.join(OUT, target) : fs.existsSync(target) ? target : null;
  if (!dir) { console.log(`Нет ${target}. Паки: ${fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory()).join(', ')}`); process.exit(1); }
  const files = fs.statSync(dir).isDirectory() ? walk(dir).filter((f) => /\.(gltf|glb)$/i.test(f)) : [dir];
  for (const f of files.sort()) {
    const r = path.relative(OUT, path.resolve(f)).split(path.sep).join('/'), i = r.indexOf('/'), info = gltfInfo(r);
    console.log(`${r.slice(0, i)}:${r.slice(i + 1)}${info?.skinned ? '  [скелет]' : ''}`);
    if (info?.anims?.length) console.log(`    анимации: ${info.anims.join(', ')}`);
  }
}

// ---------- Запуск ----------
const li = argv.indexOf('--list');
if (li >= 0) { list(argv[li + 1] ?? ''); process.exit(0); }
const raw = fs.readFileSync(path.join(SRC, 'catalog.json'));
const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
if (IF_MISSING) {
  try { const m = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); if (m.version === VERSION && m.catalog === hash) process.exit(0); } catch { /* собираем */ }
}
const cat = readCatalog();
console.log(CHECK ? 'ЭПОХИ: проверка каталога ассетов…' : 'ЭПОХИ: сборка ассетов…');
if (!CHECK) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [id, p] of Object.entries(strip(cat.packs))) await preparePack(id, p);
  copyOwn();
  for (const [k, t] of Object.entries(strip(cat.textures))) await prepareTexture(k, t);
}
const man = buildManifest(cat, hash);
if (!CHECK) fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(man, null, 1));
const total = (o) => Object.keys(strip(o)).length;
console.log(`  Юниты с моделями: ${Object.keys(man.units).length}/${total(cat.units)} · здания: ${Object.keys(man.buildings).length}/${total(cat.buildings)} · текстуры: ${Object.keys(man.textures).join(', ') || '—'} · звуки: ${Object.keys(man.sounds).length}/${total(cat.sounds)} (остальные — синтез)`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✖ ${e}`);
console.log(errors.length ? `Ошибок: ${errors.length}. Исправьте assets/catalog.json` : `Готово${CHECK ? '' : ` → ${rel(path.join(OUT, 'manifest.json'))}`}. Чего нет — рисуется процедурно.`);
if (errors.length) process.exitCode = 1;
