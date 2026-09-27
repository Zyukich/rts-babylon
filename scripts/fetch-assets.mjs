// Скачивает бесплатные (CC0) ассеты и сам составляет манифест: какой файл — какой юнит/здание и какие у него анимации.
// Запускается автоматически перед `npm run dev`, если манифеста ещё нет. Вручную: `npm run assets`.
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

const OUT = 'public/assets';
const VERSION = 6; // меняется, когда меняется логика подбора — тогда манифест пересобирается без повторной закачки
const FORCE = process.argv.includes('--force');
// Наборы Quaternius (и любые другие): положи скачанные .zip в папку assets-src — распакуются в public/assets/quaternius
const SRC = 'assets-src', zips = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.zip')) : [];
const zipDir = (z) => path.join(OUT, 'quaternius', z.replace(/\.zip$/i, '').replace(/[^\w-]+/g, '_'));
if (process.argv.includes('--if-missing')) {
  try { if (JSON.parse(fs.readFileSync(`${OUT}/manifest.json`, 'utf8')).version === VERSION && zips.every((z) => fs.existsSync(zipDir(z)))) process.exit(0); } catch {}
}

const PACKS = { // KayKit, лицензия CC0
  adventurers: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/archive/refs/heads/main.zip',
  hexagon: 'https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/archive/refs/heads/main.zip',
};
const TEXTURES = { // Poly Haven, CC0; пробуем по очереди
  grass: ['aerial_grass_rock', 'leafy_grass', 'grass_path_2'],
  rock: ['rocky_terrain_02', 'aerial_rocks_02', 'rock_face'],
  sand: ['coast_sand_01', 'aerial_beach_01', 'sand_01'],
  bark: ['bark_brown_02', 'bark_brown_01', 'bark_willow_02', 'pine_bark'],
  dirt: ['forrest_ground_01', 'brown_mud_leaves_01', 'dry_ground_01', 'rocky_trail'],
  boulder: ['rock_boulder_dry', 'rock_boulder_cracked', 'rock_face', 'rocky_terrain_02'],
};

async function get(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

console.log('ЭПОХИ: загрузка моделей и текстур (один раз)…');
const KEEP = /\.(gltf|glb|bin|png|jpe?g)$/i;
for (const [name, url] of Object.entries(PACKS)) {
  if (!FORCE && fs.existsSync(path.join(OUT, name))) continue; // уже скачано
  process.stdout.write(`  ⬇ ${name}… `);
  try {
    const files = unzipSync(await get(url), { filter: (f) => KEEP.test(f.name) && !/\/(fbx|obj|blend|previews?|screenshots?)\//i.test(f.name) });
    for (const [p, data] of Object.entries(files)) {
      const dst = path.join(OUT, name, p.split('/').slice(1).join('/')); // без корневой папки архива
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, data);
    }
    console.log(`${Object.keys(files).length} файлов`);
  } catch (e) { console.log(`не удалось (${e.message})`); }
}

for (const z of zips) {
  if (!FORCE && fs.existsSync(zipDir(z))) continue;
  process.stdout.write(`  📦 ${z}… `);
  try {
    const files = unzipSync(new Uint8Array(fs.readFileSync(path.join(SRC, z))), { filter: (f) => /\.(gltf|glb|bin|png|jpe?g)$/i.test(f.name) && !/\/(fbx|obj|blend)\//i.test(f.name) });
    for (const [p, data] of Object.entries(files)) { const dst = path.join(zipDir(z), p); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, data); }
    console.log(`${Object.keys(files).length} файлов`);
  } catch (e) { console.log(`не удалось (${e.message})`); }
}
fs.mkdirSync(`${OUT}/textures`, { recursive: true });
for (const [kind, slugs] of Object.entries(TEXTURES)) {
  if (!FORCE && fs.existsSync(`${OUT}/textures/${kind}.jpg`) && fs.existsSync(`${OUT}/textures/${kind}_n.jpg`)) continue;
  for (const slug of slugs) {
    try {
      const base = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${slug}/${slug}`;
      let info = null;
      try { info = await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json(); } catch {}
      fs.writeFileSync(`${OUT}/textures/${kind}.jpg`, await get(info?.Diffuse?.['1k']?.jpg?.url ?? `${base}_diff_1k.jpg`));
      try { fs.writeFileSync(`${OUT}/textures/${kind}_n.jpg`, await get(info?.nor_gl?.['1k']?.jpg?.url ?? `${base}_nor_gl_1k.jpg`)); } catch {} // рельеф поверхности
      console.log(`  ✓ текстура ${kind}: ${slug}`);
      break;
    } catch (e) { console.log(`  · ${slug}: ${e.message}`); }
  }
}

// ---------- Манифест: читаем glTF (JSON или GLB) и подбираем файлы по именам ----------
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
function readJson(file) {
  const buf = fs.readFileSync(file);
  if (file.toLowerCase().endsWith('.gltf')) return JSON.parse(buf.toString('utf8'));
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}
const seen = new Set();
const all = walk(OUT).filter((f) => /\.(glb|gltf)$/i.test(f)).sort((a, b) => Number(/gltf$/i.test(a)) - Number(/gltf$/i.test(b))) // .glb раньше
  .map((f) => {
    try {
      const j = readJson(f), base = path.basename(f).replace(/\.(gltf|glb)$/i, '').toLowerCase();
      if (seen.has(base)) return null;
      seen.add(base);
      return { file: path.relative(OUT, f).split(path.sep).join('/'), base, anims: (j.animations ?? []).map((a) => a.name ?? ''), skinned: !!j.skins?.length };
    } catch { return null; }
  }).filter(Boolean);

const pick = (list, keys, exclude = []) => {
  for (const k of keys) {
    const exact = list.find((a) => a.base === k);
    if (exact) return exact;
    const inc = list.filter((a) => a.base.includes(k) && !exclude.some((x) => a.base.includes(x)))
      .sort((a, b) => Number(!a.base.startsWith('building')) - Number(!b.base.startsWith('building')) || a.base.length - b.base.length)[0]; // настоящие здания — вперёд
    if (inc) return inc;
  }
  return null;
};

const statics = all.filter((a) => !a.skinned && !a.anims.length);
const COLORS = ['blue', 'red', 'yellow', 'green']; // порядок = цвета игроков P0..P3
const BAD = ['destroyed', 'scaffold', 'tile', 'hex', 'ruin'];
const B_PICK = { // [ключи по приоритету, исключения]
  town_center: [['castle', 'townhall', 'town_hall', 'church'], []],
  house: [['home_a', 'home', 'house'], []],
  barracks: [['barracks'], []],
  archery: [['archeryrange', 'archery_range', 'archery'], []],
  stable: [['stable'], []],
  workshop: [['workshop', 'blacksmith'], []],
  market: [['market'], []],
  camp: [['lumbermill', 'mine', 'tent'], []],
  tower: [['watchtower', 'tower'], ['wall']],
  wall: [['wall_straight', 'wall'], ['gate', 'corner', 'tower']],
  gate: [['gate'], []],
};
const buildings = {};
for (const [type, [keys, ex]] of Object.entries(B_PICK)) {
  const plain = pick(statics, keys, [...BAD, ...ex, ...COLORS]) ?? pick(statics, keys, [...BAD, ...ex]);
  const files = COLORS.map((c) => (pick(statics.filter((a) => a.base.includes(c)), keys, [...BAD, ...ex]) ?? plain)?.file).filter(Boolean);
  if (files.length) buildings[type] = files;
}
// Пак Quaternius «Ultimate Fantasy RTS» (положить .zip в assets-src): здания по эпохам пака (дерево → камень),
// у каждого 3 стадии стройки (Level1 — каркас, Level3 — готово). Формат: тип → [эпоха][вариант][стадия]
const byBase = new Map(all.map((a) => [a.base, a.file]));
const stages = (p) => {
  const l = [1, 2, 3].map((n) => byBase.get(`${p}_level${n}`) ?? (n === 3 ? byBase.get(`${p}_leve3`) : undefined)).filter(Boolean); // в паке опечатка: Storage_FirstAge_Leve3
  return l.length ? l : [byBase.get(p)].filter(Boolean);
};
const Q_PICK = {
  town_center: [['towerhouse_firstage'], ['towerhouse_secondage']],
  house: [['houses_firstage_1', 'houses_firstage_2', 'houses_firstage_3'], ['houses_secondage_1', 'houses_secondage_2', 'houses_secondage_3']],
  barracks: [['barracks_firstage'], ['barracks_secondage']],
  archery: [['archery_firstage'], ['archery_secondage']],
  camp: [['mine'], ['mine']],                                 // лагерь добытчиков — шахта с тележками
  market: [['market_firstage'], ['market_secondage']],
  pasture: [['windmill_firstage'], ['windmill_secondage']],  // ферма: мельница
  stable: [['storage_firstage'], ['storage_secondage']],     // конюшня — большой амбар
  workshop: [['temple_firstage'], ['temple_secondage']],
  tower: [['watchtower_firstage'], ['watchtower_secondage']],
};
const staged = {};
for (const [type, tiers] of Object.entries(Q_PICK)) {
  const t = tiers.map((vs) => vs.map(stages).filter((l) => l.length)).filter((vs) => vs.length);
  if (t.length) staged[type] = t;
}
const NAT_BAD = ['dead', 'tile', 'hex', 'mountain', 'hill', 'cloud', 'base'];
const trees = statics.filter((a) => a.base.includes('tree') && !NAT_BAD.some((x) => a.base.includes(x)))
  .sort((a, b) => Number(!a.base.includes('single')) - Number(!b.base.includes('single')) || a.base.length - b.base.length).slice(0, 3).map((a) => a.file);
const nature = {
  trees, // до трёх видов деревьев для разнообразия
  rock: pick(statics, ['rock_single', 'rocks_a', 'rock'], NAT_BAD)?.file ?? null,
  bush: pick(statics, ['bush', 'shrub'], NAT_BAD)?.file ?? null,
};

const ANIM = {
  idle: [/^idle$/i, /idle/i],
  walk: [/walking_a/i, /walk/i, /running_a/i, /run/i],
  attack: [/1h_melee_attack_chop/i, /melee.*attack/i, /attack/i, /chop/i, /slash/i],
  shoot: [/2h_ranged_shoot/i, /ranged.*shoot/i, /shoot/i, /bow/i],
  work: [/interact/i, /pickup/i, /use_item/i, /gather/i, /chop/i],
  die: [/death_a/i, /death/i, /die/i],
};
const libs = all.filter((a) => a.anims.length).sort((a, b) => b.anims.length - a.anims.length);
const findAnim = (key, prefer) => {
  for (const src of [prefer, ...libs]) for (const re of ANIM[key]) { const n = src.anims.find((x) => re.test(x)); if (n) return { file: src.file, name: n }; }
  return null;
};
const U_PICK = { villager: ['rogue_hooded', 'mage'], clubman: ['barbarian'], spearman: ['knight'], archer: ['rogue'], swordsman: ['knight'], hunter: ['barbarian'], legionary: ['knight'], crossbowman: ['rogue'] };
const units = {};
for (const [type, keys] of Object.entries(U_PICK)) {
  const c = pick(all.filter((a) => a.skinned), keys);
  if (!c) continue;
  const anims = Object.fromEntries(Object.keys(ANIM).map((k) => [k, findAnim(k, c)]));
  if (anims.idle || anims.walk) units[type] = { file: c.file, anims };
}

const textures = Object.fromEntries(Object.keys(TEXTURES).flatMap((k) => [k, k + '_n']).filter((k) => fs.existsSync(`${OUT}/textures/${k}.jpg`)).map((k) => [k, `textures/${k}.jpg`]));
// Список всех моделей — пришли этот файл, чтобы подключить новые наборы
fs.writeFileSync(`${OUT}/models-list.txt`, all.map((a) => `${a.file}${a.skinned ? ' [скелет]' : ''}${a.anims.length ? ` [анимаций: ${a.anims.length}: ${a.anims.slice(0, 40).join(', ')}]` : ''}`).join('\n'));
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ version: VERSION, units, buildings, staged, nature, textures }, null, 2));
console.log(`  Модели юнитов: ${Object.keys(units).join(', ') || '—'}`);
console.log(`  Здания: ${Object.keys(buildings).join(', ') || '—'}`);
console.log(`  Здания Quaternius (по эпохам, со стадиями стройки): ${Object.keys(staged).join(", ") || "— (нет архива в assets-src)"}`);
console.log(`  Природа: деревьев ${trees.length}, камни ${nature.rock ? 'да' : 'нет'}, кусты ${nature.bush ? 'да' : 'нет'}; текстуры: ${Object.keys(textures).join(', ') || '—'}`);
console.log('Готово. Чего нет — будет нарисовано процедурно.');
