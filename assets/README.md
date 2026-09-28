# Ассеты: модели, анимации, текстуры, звуки

```
assets/
  catalog.json   что к чему подключено (редактируете здесь)
  models/        свои модели (.glb / .gltf + файлы рядом)
  textures/      свои текстуры
  sounds/        свои звуки (.ogg / .mp3 / .wav)
  packs/         архивы наборов (.zip), которые не скачиваются по ссылке
  .cache/        скачанные архивы (не в git)
public/assets/   собранное для игры + manifest.json (не в git, собирается `npm run assets`)
```

После правок: `npm run assets` (или просто `npm run dev` — пересоберёт, если каталог изменился). Проверка без сборки: `npm run assets:check`.
Чего нет или что не загрузилось — игра рисует процедурной моделью / синтезированным звуком, так что ломать нечего.

## Как указывать файл

- `"models/knight.glb"` — свой файл из `assets/models/`
- `"quaternius-rts:glTF/Barracks_FirstAge_Level3.gltf"` — файл из пака (`id-пака:путь внутри архива`)

Какие файлы и анимации есть в паке: `npm run assets:list -- quaternius-rts` (или путь к файлу).

## Добавить модель юниту

```json
"units": {
  "knight": {
    "height": 1.6,
    "model": "models/knight.glb",
    "anims": {
      "idle": "Idle",
      "walk": "Walk",
      "attack": "Attack",
      "die": "Death",
      "work": { "file": "kaykit-adventurers:addons/.../Rogue_Hooded.glb", "name": "Interact" }
    }
  }
}
```

- `parts` — какие части модели показывать (шаблоны имён, `*` — что угодно). В паках персонажей часто лежит весь арсенал сразу (у рыцаря KayKit — три меча и четыре щита): оставьте нужное — и из одного персонажа выйдет копейщик, мечник и легионер. Имена частей покажет `npm run assets:list -- <файл>` и ошибка сборщика.
- `team` — что красить в цвет игрока: части (плащ, знамя) или материалы (у персонажей Quaternius форма — материал `Character_Main`).
- `anims` — имя клипа в файле модели, или `{ file, name }`, чтобы взять клип из другого файла (кости сопоставляются по именам).
- Ключи: `idle`, `walk`, `attack`, `shoot` (стрелки), `work` (добыча/стройка), `die`. Обязателен хотя бы `idle` или `walk`.
- Анимации «запекаются» в позы (кадров на клип — `style.animFrames`), поэтому сотни юнитов стоят дёшево.
- `height` — рост в «ростах» для полоски здоровья и рамки выделения. Модель сама масштабируется до `style.unitHeight` (× `scale`, если задан).

Всадник — персонаж, который едет на кости коня:
```json
"knight": {
  "model": "quaternius-animals:glTF/Horse_White.gltf", "length": 1.3,
  "anims": { "idle": "Idle", "walk": "Gallop", "attack": "Attack_Kick", "die": "Death" },
  "rider": { "file": "kaykit-adventurers:…/Knight.glb", "anim": "Sit_Chair_Idle", "bone": "Back",
             "parts": ["Knight_*", "1H_Sword"], "team": ["Knight_Cape"], "offset": [0, -0.04, 0.14], "scale": 0.55 }
}
```
`offset` — сдвиг от кости в долях длины коня [вправо, вверх, вперёд], `scale` — рост всадника в долях длины коня. Подбирается на `/models` (вид сбоку).

Техника и прочее без скелета: `anims` не нужны — модель стоит в одной позе.
```json
"apc": { "height": 0.9, "model": "kaykit-space:addons/.../spacetruck.gltf", "length": 1.3, "rotate": 0 }
```
`length` — длина по земле в клетках, `rotate` — довернуть (градусы), если модель смотрит не вперёд (+Z).

**Проверить, как выглядит:** `npm run dev` → http://localhost:3000/models — все юниты и здания рядами, анимации и цвет игрока переключаются.

## Добавить модель зданию

```json
"barracks": {
  "height": 2.2,
  "props": ["crate", "barrel", "fence"],
  "ages": [
    [["pack:Barracks_A_Level1.gltf", "pack:Barracks_A_Level2.gltf", "pack:Barracks_A_Level3.gltf"]],
    [["pack:Barracks_B_Level3.gltf"]]
  ],
  "colors": ["models/barracks_blue.glb", "models/barracks_red.glb"]
}
```

- `ages` — `[набор][вариант][стадия стройки]`. Какой набор на какой эпохе — `style.ageTier` (по эпохам игры). Варианты выбираются по зданию (деревня разнообразнее), стадии — по ходу стройки (последняя — готовое).
- `colors` — модели по цветам игроков (если `ages` нет).
- `height` — высота «корпуса» для клика и полоски; `scale` — `[ширина, высота]`; `flag: false` — без флага владельца; `props` — быт вокруг (ящики, бочки, стога…).
- Модель масштабируется под размер здания из `game/data/buildings.json`.

## Текстуры земли

`"grass": { "polyhaven": ["aerial_grass_rock", "leafy_grass"] }` — скачать с polyhaven.com (первый доступный), или `{ "file": "textures/my_grass.jpg" }` — свой файл. Ключи: `grass`, `rock`, `sand`, `dirt`.

## Звуки

`"move": { "file": "sounds/move.ogg", "volume": 0.8 }`. `null` — синтезированная заглушка. События: `move`, `attack`, `train`, `built`, `age`, `hit`, `die`, `alert`, `news`.

## Новый пак

```json
"packs": {
  "my-pack": { "url": "https://…/pack.zip", "stripRoot": true },
  "other": { "zip": "packs/Other.zip" }
}
```
`stripRoot` — отрезать корневую папку архива (у архивов GitHub). Распаковываются только glTF/GLB и картинки.
