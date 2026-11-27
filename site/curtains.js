/* =========================================================
   curtains.js — тяжёлые бархатные шторы первого экрана (three.js + своя физика ткани)

   Что здесь:
   - ФИЗИКА (своя): 3D-сетка точек со связями по горизонтали, вертикали, диагоналям и изгибу.
     Масштаб реальный (экран = 2,7 м, гравитация 9,8 м/с²) — штора тяжёлая и медленная.
     Низ утяжелён, верх — жёсткая лента на кольцах карниза. Кольца скользят: при открытии
     тянется крайнее, остальные собираются волной. Сопротивление воздуха по нормали,
     сквозняк, порыв от прокрутки. Ткань не проходит сама сквозь себя (простое самостолкновение).
   - ОТРИСОВКА (three.js): физический материал с «sheen» (модель бархата), настоящая текстура
     ворса (assets/velvet: фактура, рельеф, шероховатость), освещение комнатой (assets/room.hdr),
     мягкие тени складок друг на друга и на стену, латунный карниз с кольцами.
   - ОТКРЫТИЕ ПО ЗАПИСИ: пока идёт загрузочный экран, физика заранее считает открытие и покачивание после него
     до полной остановки (SETTINGS.rec); страница только проигрывает кадры — как видео, но посчитанное честной физикой
     под размер этого экрана. После записи шторы стоят, расчёт и отрисовка не работают.
   - Курсор, палец и прокрутка шторы не двигают (SETTINGS.interactive: false). true — включить касание, как раньше.
   - СВЕТ ИЗ ОКНА: пока шторы закрыты, в комнате полумрак; по мере открытия в просвете разгорается
     тёплый свет и ложится на складки, обращённые к окну. Сила света привязана к реальной ширине
     просвета между полотнами, а не к таймеру. Слои свечения за шторами и перед ними — в styles.css
     (раздел 4), сюда они получают три числа: --k (0…1), --gl и --gw (левый край и ширина просвета, px).
   - ЗАГРУЗОЧНЫЙ ЭКРАН (#loader): карниз заполняется кольцами, отсчёт 100 → 1 ровно за SETTINGS.loader.min мс.
     За ним грузятся текстуры и свет, собираются шейдеры и рисуются первые кадры закрытых штор.
     На «1» экран гаснет, и шторы открываются уже без подгрузок.
   - ПОКОЙ: через SETTINGS.restAfter мс без мыши и прокрутки сквозняк стихает, ткань замирает,
     и цикл полностью останавливается (видеокарта и процессор не работают) до следующего движения.
   Подключение: <script type="module" src="curtains.js">; app.js вызывает
   window.Curtains.init({ canvas, onOpenStart, onSettled }).
   ========================================================= */
import * as THREE from './vendor/three.min.js';

/* ---------- НАСТРОЙКИ (меняйте свободно) ---------- */
const IS_WORKER = typeof document === 'undefined';   // этот же файл работает и как отдельный поток расчёта ткани (см. конец файла)

const SETTINGS = {
  color: '#25616A',        // глубокая бирюза (тон ткани; фактура берётся из текстуры)
  sheen: '#6F9EA1',        // отлив ворса (приглушённый: ткань матовая)
  sheenRoughness: 0.62,    // мягкость отлива: меньше — ярче и уже блик; больше — матовее
  normalStrength: 0.7,    // глубина фактуры ворса
  textureMeters: 0.42,     // какой кусок ткани (м) покрывает одна плитка текстуры
  metal: '#B0925F',        // карниз, кронштейны и кольца — состаренная латунь

  // Свет из окна (в просвете между шторами)
  light: {
    color: '#FFE6C8',      // тёплый дневной свет
    rim: 1.6,              // сила света на складках у просвета (0 — выключить)
    reach: 150,            // px: как далеко от кромки стоит источник; больше — свет уходит глубже в складки
    falloff: 1.2,          // как быстро свет гаснет с расстоянием (1 — мягко, 2 — только у самой кромки)
    dim: 0.6,              // сколько обычного света остаётся, пока шторы закрыты (1 — без полумрака)
    fallback: 1.8,         // запасной ровный свет, если room.hdr не успел загрузиться (подобран под яркость с ним)
    height: 0.1,           // высота источника: доля экрана выше середины
  },

  rings:  { desktop: 18, mid: 14, mobile: 11, lite: 9 },   // колец на одно полотно (больше — больше складок)
  rows:   { desktop: 44, mid: 38, mobile: 32, lite: 26 },  // рядов сетки по высоте
  colsPerWave: 4,          // точек сетки на одну складку
  fullness: 2.2,           // «пышность»: ширина ткани / ширина карниза под ней
  stack: { desktop: 0.14, mobile: 0.12 },        // ширина собранной шторы, доля ширины экрана
  stackMin: 40,            // px
  heightMeters: 2.7,       // какой реальной высоте соответствует экран (для гравитации)
  hemGap: { desktop: 96, mobile: 64 },           // px от подола до низа первого экрана: штора видна целиком и стоит на «полу» (--floor в styles.css)

  substepHz: 150,          // шагов физики в секунду
  iterations: { desktop: 5, mid: 5, mobile: 5, lite: 4 },
  // Сетку подбираем по замеру на этом устройстве (во время начальной укладки ткани, до показа штор): если расчёт
  // полной сетки занял бы больше budget (доля одного ядра), берём следующую попроще. worker — расчёт в отдельном потоке
  // (страница от него не зависит, можно больше), main — запасной путь, когда поток недоступен.
  grids: { desktop: ['desktop', 'mid', 'mobile', 'lite'], mobile: ['mobile', 'lite'], lite: ['lite'] },
  budget: { worker: 1.0, main: 0.3 },   // замер идёт на «холодном» коде и завышен примерно на треть: 1.0 здесь ≈ 0.75 ядра в работе
  useWorker: true,         // считать ткань в отдельном потоке (false — как раньше, в основном)
  damping: 0.9993,         // внутреннее трение ткани (на шаг)
  airDrag: 0.011,          // сопротивление воздуха по нормали (на шаг)
  wind: 0.16,              // сквозняк, м/с
  scrollGust: 0.55,        // порыв от быстрой прокрутки, м/с (максимум)
  selfCollision: true,     // ткань не проходит сквозь себя

  openDelay: 260,          // пауза между загрузочным экраном и открытием, мс
  openDuration: 2200,      // время открытия, мс (повторный заход за сессию — короче)
  loader: { min: 4500, minSeen: 2500, warmFrames: 12, warmMs: 1500 },   // загрузочный экран: длительность отсчёта 100 → 1, мс (minSeen — повторный заход за сессию); прогрев — кадры закрытых штор за ним
  restAfter: 7000,         // мс без мыши и прокрутки, после которых сквозняк стихает и шторы «засыпают»
  pointerRadius: 90,       // радиус «касания» курсором, px
  pointerForce: 0.5,       // сила касания (мягко: 0.3–0.8)
  shapeMemory: 0.0025,     // как быстро ткань возвращается в свои складки после касания
  rodY: 24,                // высота карниза от верха экрана, px
  shadows: true,           // тени складок (на слабых устройствах выключаются сами)
  gpuGovernor: true,       // если кадры идут реже 45 в секунду — ступенями снижаем плотность пикселей холста (1.5 → 1.25 → 1), потом размер теней
  dprMax: 1.5,             // плотность пикселей холста: бархат мягкий, разницы с 2 почти не видно, а пикселей на 44% меньше
  shadowMap: 1024,         // размер карты теней (было 2048: в 4 раза больше работы каждый кадр)

  // Экономия видеокарты (картинка и физика не меняются):
  maxFps: 60,              // чаще 60 кадров/с ткань не рисуем: на мониторах 120–240 Гц карта не работает вхолостую
  idleEps: 0.25,           // px: кадр перерисовывается, только если какая-то точка ткани сдвинулась больше чем на 1/4 пикселя
                           // с прошлого нарисованного кадра (физика считается всегда). 0 — рисовать каждый кадр, как раньше

  // Открытие по записи: пока идёт загрузочный экран, поток заранее считает всё открытие и покачивание после него
  // (та же сетка, та же физика) и складывает кадры. Страница их только проигрывает — ровно на любом устройстве.
  // sway — сколько мс шторы покачиваются после полного открытия; settle — за сколько мс сквозняк плавно стихает и
  // ткань замирает. Дальше шторы стоят. Не успела запись к концу отсчёта — открытие считается вживую и так же стихает.
  rec: { enabled: true, sway: 4000, settle: 2500 },
  interactive: false,      // курсор, палец и прокрутка двигают ткань (false — шторы только открываются и покачиваются сами)
};

/* ---------- утилиты ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;   // плавный старт и остановка, как рукой
const reduce = () => !IS_WORKER && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ASSETS = new URL('./assets/', import.meta.url).href;

/* ---------- состояние ---------- */
let canvas, hero, opts;
let renderer, scene, camera, clothMesh, clothGeo, rodGroup, ringMesh, eyeMesh, hookMesh, wall, keyLight, suns = [], material;
let fbLight = null, pendingEnv = null;   // запасной свет комнаты (пока room.hdr не пришёл) и свет, отложенный до остановки штор
let lightEl = null, lightK = -1, lightGl = -1, lightGw = -1;
const KEY_LIGHT = 2.9, ENV_LIGHT = 0.42;
let W = 0, H = 0, focal = 2400, pxm = 300, G = 3000;
let running = false, visible = true, raf = 0, last = 0, acc = 0, simTime = 0;
let P, O, Wt, Wbase, NOR, FAB, nPart = 0;
let cA, cB, cR, cS, cKa, cKb, nC = 0;
let mA, mB, mR, mG1, mG2, mKa, mKb, nM = 0;
let windS, windC, windY, gRow, gCol, gPan, scSkip, cellX, cellY, cellZ, lastSC = -1;
let panels = [];
const cfg = {};
let phase = 'closed', openStart = 0, openDur = 2600, openFired = false, settledFired = false;
const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, active: false, t: 0 };
let REST = null, restAt = 0;
let scrollY0 = 0, scrollV = 0, gust = 0;
let hashHead, hashNext;
let LASTR = null, LASTR2 = null, needRender = true, frameDiv = 1, divN = 0, rafTs = [], lastRx = null;
let wallGeo, wallMesh, wallZ = 0, bounds = { lx: 0, rx: 0, mz: 0 };
const stats = { frames: 0, rendered: 0, skipped: 0, asleep: false };
let lastAct = 0, calm = 1, calmZeroAt = 0, asleep = false, warmN = 0, warmT0 = 0;
let worker = null, wOn = false, wGen = 0, sA = null, sB = null, openCb = false, settledCb = false, lastM = null;
let govT = 0, govN = 0, govLevel = 0, govSkip = 0, lock30 = false, restCb = false;
let play = null;                                  // идёт проигрывание записи: { t0, dur, delay }
const recM = { q: 8, buf: null, rx: null, total: 0, n: 0, rate: 0, done: false, gen: -1, L: 0, N2: 0, sec: 0 };   // записанное открытие (страница)
let frozen = false;                               // запись доиграла: шторы стоят, ничего не считается

/* ---------- загрузочный экран ---------- */
// Идёт ровно по времени: карниз заполняется кольцами, отсчёт 100 → 1 за loader.min мс от начала загрузки страницы.
// Готовность штор (ready) на цифры не влияет; если к «1» шторы ещё не прогрелись, «1» ждёт (не дольше 8 с от начала).
const loader = { el: IS_WORKER ? null : document.getElementById('loader'), num: IS_WORKER ? null : document.getElementById('loader-num'),
  rings: IS_WORKER ? [] : [...document.querySelectorAll('#loader-rings i')], ready: false, min: SETTINGS.loader.min, done: false, raf: 0, onDone: null, lastN: -1, lastR: -1 };
function loaderSet(v, force) { if (v >= 1) { loader.want = true; if (force || !loader.gate || loader.gate()) loader.ready = true; } loaderKick(); }
function loaderTick(now) {
  loader.raf = 0;
  if (loader.done) return;
  const p = clamp((now - loader.t0) / loader.min, 0, 1);
  const n = Math.max(1, 100 - Math.floor(p * 100));
  if (n !== loader.lastN) { loader.lastN = n; if (loader.num && !loader.strip) loader.num.textContent = n; }   // цифры полосой крутит CSS — сами не трогаем
  if (p >= 1) { if (loader.ready) loaderFinish(); return; }   // не готовы — ждём: loaderSet(1) запустит снова
  loaderKick();
}
function loaderKick() { if (!loader.raf && !loader.done) loader.raf = requestAnimationFrame(loaderTick); }
function loaderFinish() {
  if (loader.done) return;
  loader.done = true;
  document.documentElement.classList.add('loaded');
  loader.onDone?.();
}
// заполнение карниза, кольца и цифры ведёт CSS (ровно, независимо от скриптов). Обычно отсчёт уже запущен
// встроенным скриптом в index.html сразу после #loader — тогда длительность и старт берём оттуда и не меняем.
loader.strip = !IS_WORKER && !!document.querySelector('.loader__strip');
loader.t0 = 0;
if (loader.el?.dataset.ms) { loader.min = +loader.el.dataset.ms; loader.t0 = +loader.el.dataset.t0 || 0; }
function loaderCss() {
  if (!loader.el || loader.el.dataset.ms) return;
  loader.el.style.setProperty('--ld', loader.min + 'ms');
  if (!loader.el.classList.contains('run')) { loader.el.style.setProperty('--l0', -Math.round(performance.now()) + 'ms'); loader.el.classList.add('run'); }
}
if (loader.el) { loaderCss(); loaderKick(); } else loader.done = true;
const dummy = IS_WORKER ? null : new THREE.Object3D();

/* =========================================================
   ФИЗИКА
   ========================================================= */
function measureDOM() {
  const r = hero.getBoundingClientRect();
  const w = Math.round(r.width), h = Math.round(r.height);
  const lite = document.documentElement.classList.contains('lite');
  const mobile = w < 720;
  const m = { W: w, H: h, kind: lite ? 'lite' : mobile ? 'mobile' : 'desktop', still: !!cfg.still };
  m.dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : mobile ? 1.75 : SETTINGS.dprMax);
  m.focal = Math.max(w, h) * 1.9;
  m.pxm = Math.max(Math.min(h, window.innerHeight * 1.15), 560) / SETTINGS.heightMeters;
  m.scale = mobile ? 0.72 : 1;
  return m;
}
function applyMeasure(m) {
  lastM = m;
  W = m.W; H = m.H; cfg.kind = m.kind; cfg.dpr = m.dpr; cfg.still = m.still;
  focal = m.focal; pxm = m.pxm; G = 9.81 * pxm; cfg.scale = m.scale;
}
function measure() { applyMeasure(measureDOM()); }

// Сборка с подбором сетки: начинаем с самой подробной для этого экрана; если замер показал, что устройство её не тянет, — попроще
function buildAuto(openNow, budget, from) {
  const order = SETTINGS.grids[cfg.kind];
  cfg.tried = [];
  // from — сетка, уже выбранная раньше (при изменении размера окна не перевыбираем: складок должно остаться столько же)
  if (from && order.includes(from)) { cfg.grid = from; cfg.bail = 0; build(openNow); cfg.tried.push(from + ' ' + cfg.load.toFixed(2)); return; }
  for (let i = 0; i < order.length; i++) {
    cfg.grid = order[i];
    cfg.bail = i < order.length - 1 ? budget * 2.5 : 0;   // явно не тянет — не досчитываем укладку, сразу пробуем сетку попроще
    const ok = build(openNow) !== false;
    (cfg.tried ||= []).push(order[i] + ' ' + cfg.load.toFixed(2));
    if (ok && cfg.load <= budget) break;
  }
  cfg.bail = 0;
}

function build(openNow, noSettle) {
  seed = 11;
  const grid = cfg.grid || cfg.kind;
  const N = SETTINGS.rings[grid];
  const R = SETTINGS.rows[grid];
  cfg.iters = SETTINGS.iterations[grid];
  const K = SETTINGS.colsPerWave;
  const C = K * (N - 1) + 1;
  const rodY = SETTINGS.rodY * (cfg.kind === 'desktop' ? 1 : 0.8);
  const ringR = 6.2 * cfg.scale;                             // кольцо вокруг штанги ⌀28 мм
  cfg.hw = cfg.kind === 'desktop';                            // на компьютере видны наконечники и кронштейны
  const wallInset = cfg.hw ? 66 : 10;                        // первое кольцо — за кронштейном
  const leadClosed = W / 2 + 6;
  const sMax = (leadClosed - wallInset) / (N - 1);
  const stackW = Math.max(SETTINGS.stackMin, W * SETTINGS.stack[cfg.kind === 'desktop' ? 'desktop' : 'mobile']);
  const sMin = stackW / (N - 1);
  const wave = SETTINGS.fullness * sMax;
  const top = rodY + 14 * cfg.scale;                        // верх ткани — на крючках под кольцами
  const header = Math.min(30, 0.09 * pxm) * (cfg.kind === 'desktop' ? 1 : 0.8);   // жёсткая лента
  const len = H - top - SETTINGS.hemGap[cfg.kind === 'desktop' ? 'desktop' : 'mobile'];   // подол выше низа экрана: штора видна целиком
  const dy = (len - header) / (R - 2);
  Object.assign(cfg, { N, R, K, C, rodY, ringR, top, header, sMax, sMin, wave, colW: wave / K, half: wave / 2,
    depthMax: wave * 0.45, hem: len, gapD: new Float32Array(2 * (N - 1)) });

  nPart = 2 * C * R;
  P = new Float64Array(nPart * 3); O = new Float64Array(nPart * 3);   // двойная точность: расчёт без преобразований туда-обратно (быстрее); в видеокарту уходит копия Float32
  NOR = new Float32Array(nPart * 3); FAB = new Float32Array(nPart * 2);
  Wt = new Float32Array(nPart); Wbase = new Float32Array(nPart);

  panels = [0, 1].map((side) => {
    const dir = side === 0 ? 1 : -1;
    const wall = side === 0 ? wallInset : W - wallInset;
    const rx = new Float64Array(N), ro = new Float64Array(N);
    for (let j = 0; j < N; j++) { rx[j] = wall + dir * j * (openNow ? sMin : sMax); ro[j] = rx[j]; }
    const depthF = new Float32Array(N - 1);
    for (let j = 0; j < N - 1; j++) depthF[j] = 0.78 + rnd() * 0.22;   // складки чуть разные — как у настоящей ткани
    return { side, dir, wall, rx, ro, depthF, off: side * C * R,
      leadClosed: side === 0 ? leadClosed : W - leadClosed, leadOpen: wall + dir * (N - 1) * sMin };
  });

  computeGapDepth();
  for (const pn of panels) {
    for (let r = 0; r < R; r++) {
      const fy = r === 0 ? 0 : header + (r - 1) * dy;
      for (let c = 0; c < C; c++) {
        const i = pn.off + r * C + c;
        let [x, z] = headerXZ(pn, c);
        if (openNow && r > 1) {
          // собранная штора: внизу складки шире и мельче — как после настоящего открытия
          const t = r / (R - 1), f = 1 + 0.62 * t * t * (3 - 2 * t);
          const j = Math.floor(c / K), k = c % K, gap = Math.abs(pn.rx[1] - pn.rx[0]) * f;
          const D = waveDepth(Math.min(gap, wave * 0.95)) * pn.depthF[Math.min(j, N - 2)];
          x = pn.wall + pn.dir * (j + k / K) * gap;
          z = k === 0 ? 0 : (j & 1 ? -1 : 1) * D * Math.sin(Math.PI * k / K);
        }
        P[i * 3] = x; P[i * 3 + 1] = top + fy; P[i * 3 + 2] = z;
        FAB[i * 2] = c * cfg.colW; FAB[i * 2 + 1] = fy;
        let w = r < 2 ? 0 : 1;
        if (r === R - 1) w = 0.28;          // грузик в подгибе
        else if (r === R - 2) w = 0.6;
        Wt[i] = w; Wbase[i] = w;
      }
    }
  }
  O.set(P);

  // связи
  const eq = [], mn = [];
  const add = (a, b, s) => eq.push(a, b, s);
  for (const pn of panels) {
    const id = (r, c) => pn.off + r * C + c;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (c < C - 1) add(id(r, c), id(r, c + 1), 1);
        if (r < R - 1) add(id(r, c), id(r + 1, c), 1);
        if (r < R - 1 && c < C - 1) { add(id(r, c), id(r + 1, c + 1), 0.55); add(id(r, c + 1), id(r + 1, c), 0.55); }
        if (r < R - 2) add(id(r, c), id(r + 2, c), r > R - 5 ? 0.9 : 0.42);   // изгиб: тяжёлая ткань висит ровно, подгиб жёсткий
        if (c < C - 2 && r >= 2) mn.push(id(r, c), id(r, c + 2), id(1, c), id(1, c + 2), r, 0);             // складка не схлопывается
        if (c % K === 0 && c < C - K && r >= 2) mn.push(id(r, c), id(r, c + K), id(1, c), id(1, c + K), r, 1 + rnd() * 0.5); // низ веером
      }
    }
  }
  // Связи храним уже «готовыми к расчёту»: пары из двух закреплённых точек выброшены (они ничего не двигают),
  // доли смещения каждой точки (жёсткость × вес / сумма весов) посчитаны один раз — веса во время работы не меняются.
  { let n = 0; for (let k = 0; k < eq.length; k += 3) if (Wt[eq[k]] + Wt[eq[k + 1]] > 0) n++; nC = n; }
  cA = new Int32Array(nC); cB = new Int32Array(nC); cR = new Float32Array(nC); cS = new Float32Array(nC);
  cKa = new Float64Array(nC); cKb = new Float64Array(nC);
  for (let q = 0, k = 0; q < eq.length; q += 3) {
    const a = eq[q], b = eq[q + 1], ws = Wt[a] + Wt[b];
    if (ws === 0) continue;
    cA[k] = a * 3; cB[k] = b * 3; cS[k] = eq[q + 2];
    cKa[k] = eq[q + 2] * Wt[a] / ws; cKb[k] = eq[q + 2] * Wt[b] / ws;
    cR[k] = Math.hypot(FAB[a * 2] - FAB[b * 2], FAB[a * 2 + 1] - FAB[b * 2 + 1]);   // длина по развёрнутой ткани
    k++;
  }
  { let n = 0; for (let q = 0; q < mn.length; q += 6) if (Wt[mn[q]] + Wt[mn[q + 1]] > 0) n++; nM = n; }
  mA = new Int32Array(nM); mB = new Int32Array(nM); mR = new Float32Array(nM); mG1 = new Int32Array(nM); mG2 = new Int32Array(nM);
  mKa = new Float64Array(nM); mKb = new Float64Array(nM);
  cfg.mSm = new Float32Array(nM); cfg.mMode = new Float32Array(nM);
  for (let q = 0, k = 0; q < mn.length; q += 6) {
    const a = mn[q], b = mn[q + 1], ws = Wt[a] + Wt[b];
    if (ws === 0) continue;
    mA[k] = a * 3; mB[k] = b * 3; mG1[k] = mn[q + 2] * 3; mG2[k] = mn[q + 3] * 3;
    mKa[k] = 0.35 * Wt[a] / ws; mKb[k] = 0.35 * Wt[b] / ws;
    const t = mn[q + 4] / (R - 1); cfg.mSm[k] = t * t * (3 - 2 * t); cfg.mMode[k] = mn[q + 5];
    k++;
  }

  // таблицы на точку: фаза и высота для сквозняка (по высоте точки на развёрнутой ткани), ячейка сетки и зона у ленты для самостолкновения
  windS = new Float32Array(nPart); windC = new Float32Array(nPart); windY = new Float32Array(nPart);
  gRow = new Int16Array(nPart); gCol = new Int16Array(nPart); gPan = new Int8Array(nPart); scSkip = new Uint8Array(nPart);
  cellX = new Int32Array(nPart); cellY = new Int32Array(nPart); cellZ = new Int32Array(nPart);
  const topZone = header + cfg.colW * 2.5;
  for (let i = 0; i < nPart; i++) {
    const yN = (top + FAB[i * 2 + 1]) / H;
    windS[i] = Math.sin(yN * 3.1); windC[i] = Math.cos(yN * 3.1); windY[i] = 0.35 + yN;
    const per = C * R, li = i % per;
    gPan[i] = Math.floor(i / per); gRow[i] = Math.floor(li / C); gCol[i] = li % C;
    // сразу под лентой (2,5 ширины складки) форму целиком задают кольца, и складки там по построению теснее радиуса:
    // столкновение там только спорило со связями — точка дрожала на 0,1–1 px каждый кадр
    scSkip[i] = Wt[i] === 0 || FAB[i * 2 + 1] < topZone ? 1 : 0;
  }
  for (const pn of panels) pn.rxPin = new Float64Array(N).fill(NaN);
  lastSC = -1;

  hashHead = new Int32Array(16384); hashNext = new Int32Array(nPart);

  pinHeader();
  if (noSettle) { computeNormals(); return; }       // расчёт идёт в отдельном потоке — здесь нужны только сетка и связи
  const steps = openNow ? 360 : 140;                // ткань «садится» без отрисовки
  const tail = 50; let t0 = 0;                      // последние 50 шагов (код уже «разогрет») — замер скорости расчёта на этом устройстве
  let tb = 0;
  for (let s = 0; s < steps; s++) {
    if (s === steps - tail) t0 = performance.now();
    if (s === 20) tb = performance.now();
    if (s === 60 && cfg.bail && (performance.now() - tb) / 40 * SETTINGS.substepHz / 1000 > cfg.bail) { cfg.load = 9; return false; }
    substep(1 / SETTINGS.substepHz, true);
  }
  const msStep = (performance.now() - t0) / tail;
  let msSC = 0;
  if (SETTINGS.selfCollision) { t0 = performance.now(); selfCollide(); selfCollide(); msSC = (performance.now() - t0) / 2; }
  cfg.load = (msStep * SETTINGS.substepHz + msSC * 60) / 1000;   // доля ядра, которую займёт расчёт в реальном времени
  cfg.msStep = msStep;
  computeNormals();
}

// глубина складки между кольцами: ткань длиной wave ложится полуволной над хордой gap
function waveDepth(gap) {
  const q = gap / 4, L = cfg.wave;
  let lo = 0, hi = L / 2;
  for (let k = 0; k < 16; k++) {
    const D = (lo + hi) / 2;
    if (2 * (Math.hypot(q, 0.7071 * D) + Math.hypot(q, 0.2929 * D)) > L) hi = D; else lo = D;
  }
  return lo;
}
function computeGapDepth() {
  for (const pn of panels) for (let j = 0; j < cfg.N - 1; j++) cfg.gapD[pn.side * (cfg.N - 1) + j] = waveDepth(Math.abs(pn.rx[j + 1] - pn.rx[j])) * pn.depthF[j];
}
// точка верхней ленты: у колец z = 0, между ними — круглая складка вперёд/назад
function headerXZ(pn, c) {
  const K = cfg.K, j = Math.floor(c / K), k = c % K;
  if (k === 0) return [pn.rx[j], 0];
  const t = k / K, a = pn.rx[j], b = pn.rx[j + 1];
  return [a + (b - a) * t, (j & 1 ? -1 : 1) * cfg.gapD[pn.side * (cfg.N - 1) + j] * Math.sin(Math.PI * t)];
}
function pinHeader() {
  const C = cfg.C, K = cfg.K, N1 = cfg.N - 1, y0 = cfg.top, y1 = cfg.top + cfg.header;
  computeGapDepth();
  for (const pn of panels) {
    const rx = pn.rx, gd = pn.side * N1;
    for (let c = 0; c < C; c++) {
      const j = Math.floor(c / K), k = c % K;
      let x = rx[j], z = 0;
      if (k !== 0) { const t = k / K; x += (rx[j + 1] - x) * t; z = (j & 1 ? -1 : 1) * cfg.gapD[gd + j] * Math.sin(Math.PI * t); }
      const i0 = (pn.off + c) * 3, i1 = (pn.off + C + c) * 3;
      P[i0] = x; P[i0 + 1] = y0; P[i0 + 2] = z; O[i0] = x; O[i0 + 1] = y0; O[i0 + 2] = z;
      P[i1] = x; P[i1 + 1] = y1; P[i1 + 2] = z; O[i1] = x; O[i1 + 1] = y1; O[i1 + 2] = z;
    }
  }
}
// кольца сдвинулись с прошлого шага? (в покое — нет, и тогда ленту и минимальные расстояния складок пересчитывать незачем)
function ringsMoved() {
  let moved = false;
  for (const pn of panels) {
    const rx = pn.rx, rp = pn.rxPin;
    for (let j = 0; j < rx.length; j++) if (!(Math.abs(rx[j] - rp[j]) < 1e-5)) { moved = true; rp[j] = rx[j]; }
  }
  return moved;
}
// складки не слипаются; внизу собранная штора расходится веером (зависит только от положения ленты)
function updateMinDist() {
  const cap = cfg.colW * 1.96, wmax = cfg.wave * 0.8, sMax = cfg.sMax, sm = cfg.mSm, md = cfg.mMode;
  for (let k = 0; k < nM; k++) {
    const h3 = mG1[k], g3 = mG2[k];
    const dx = P[g3] - P[h3], dz = P[g3 + 2] - P[h3 + 2];
    const d0 = Math.sqrt(dx * dx + dz * dz), mode = md[k];
    if (mode === 0) mR[k] = Math.min(d0 * 0.85, cap);
    else mR[k] = Math.min(d0 * (1 + (0.04 + 0.7 * (1 - Math.min(1, d0 / sMax))) * mode * sm[k]), wmax);
  }
}

function updateRings(now) {
  const N = cfg.N;
  for (const pn of panels) {
    const { rx, ro, dir } = pn;
    let lead = pn.leadClosed;                         // крайнее кольцо ведёт «рука»
    if (phase === 'opening') lead = pn.leadClosed + (pn.leadOpen - pn.leadClosed) * easeInOut(clamp((now - openStart) / openDur, 0, 1));
    else if (phase === 'open') lead = pn.leadOpen;
    rx[N - 1] = lead; ro[N - 1] = lead;
    for (let j = 1; j < N - 1; j++) { const v = (rx[j] - ro[j]) * 0.86; ro[j] = rx[j]; rx[j] += v; }  // трение колец о карниз
    for (let j = N - 2; j >= 1; j--) {               // от руки к стене: кольца толкают/тянут соседей
      const d = (rx[j + 1] - rx[j]) * dir;
      if (d < cfg.sMin) rx[j] = rx[j + 1] - cfg.sMin * dir; else if (d > cfg.sMax) rx[j] = rx[j + 1] - cfg.sMax * dir;
    }
    for (let j = 1; j < N - 1; j++) {                // от стены: не заходят за стену и не слипаются
      const d = (rx[j] - rx[j - 1]) * dir;
      if (d < cfg.sMin) rx[j] = rx[j - 1] + cfg.sMin * dir; else if (d > cfg.sMax) rx[j] = rx[j - 1] + cfg.sMax * dir;
    }
  }
}

function substep(h, silent) {
  updateRings(simTime * 1000);
  if (ringsMoved()) { pinHeader(); updateMinDist(); }

  // интеграция + воздух (ветер к зрителю)
  const t = simTime;
  const windBase = silent || cfg.still ? 0 : calm * SETTINGS.wind * (0.55 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.83 + 1.3) + 0.2 * Math.sin(t * 1.9 + 0.4));
  const g2 = G * h * h, damp = SETTINGS.damping * (1 - 0.02 * (1 - calm)), drag = SETTINGS.airDrag;   // без сквозняка трение выше: ткань быстро замирает
  // sin(y·3,1 + t·0,6) раскладываем по таблицам на точку: один синус и косинус на шаг вместо синуса на каждую точку
  const ws = 0.45 * windBase * Math.cos(t * 0.6), wc = 0.45 * windBase * Math.sin(t * 0.6), w0 = 0.55 * windBase + gust, wk = pxm * h;
  for (let i = 0, i3 = 0; i < nPart; i++, i3 += 3) {
    const w = Wt[i];
    if (w === 0) continue;
    let vx = (P[i3] - O[i3]) * damp, vy = (P[i3 + 1] - O[i3 + 1]) * damp, vz = (P[i3 + 2] - O[i3 + 2]) * damp;
    const wz = (w0 + ws * windS[i] + wc * windC[i]) * wk * windY[i];
    const nx = NOR[i3], ny = NOR[i3 + 1], nz = NOR[i3 + 2];
    const dk = drag * (-vx * nx - vy * ny + (wz - vz) * nz) * (w < 1 ? 0.5 : 1);
    vx += nx * dk; vy += ny * dk; vz += nz * dk;
    O[i3] = P[i3]; O[i3 + 1] = P[i3 + 1]; O[i3 + 2] = P[i3 + 2];
    P[i3] += vx; P[i3 + 1] += vy + g2; P[i3 + 2] += vz;
  }

  // курсор / палец: мягкое касание — ткань чуть отходит назад и в сторону, без рывков
  if (pointer.active && !silent) {
    const R = SETTINGS.pointerRadius * cfg.scale, R2 = R * R, F = SETTINGS.pointerForce * cfg.scale;
    const bx = clamp(pointer.vx, -1200, 1200) * h * 0.04, by = clamp(pointer.vy, -1200, 1200) * h * 0.02;
    const px = pointer.x, py = pointer.y;
    for (let i = 0, i3 = 0; i < nPart; i++, i3 += 3) {
      const dx = P[i3] - px;
      if (dx >= R || dx <= -R || Wt[i] === 0) continue;
      const dy = P[i3 + 1] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2) continue;
      const d = Math.sqrt(d2) || 1, f = 1 - d / R, ff = f * f * (3 - 2 * f);
      P[i3] += (dx / d) * ff * F * 0.5 + bx * ff; P[i3 + 1] += by * ff; P[i3 + 2] -= ff * F;
    }
  }
  // память формы: после касаний ткань медленно возвращается в свои складки
  if (REST && !silent) {
    const k = SETTINGS.shapeMemory;
    for (let i = 0, i3 = 0; i < nPart; i++, i3 += 3) {
      if (Wt[i] === 0) continue;
      P[i3] += (REST[i3] - P[i3]) * k; P[i3 + 1] += (REST[i3 + 1] - P[i3 + 1]) * k; P[i3 + 2] += (REST[i3 + 2] - P[i3 + 2]) * k;
    }
  }

  // связи
  const iters = cfg.iters;
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < nC; k++) {
      const a3 = cA[k], b3 = cB[k];
      const dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1], dz = P[b3 + 2] - P[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-6) continue;
      const e = (d - cR[k]) / d, sa = e * cKa[k], sb = e * cKb[k];
      P[a3] += dx * sa; P[a3 + 1] += dy * sa; P[a3 + 2] += dz * sa;
      P[b3] -= dx * sb; P[b3 + 1] -= dy * sb; P[b3 + 2] -= dz * sb;
    }
    for (let k = 0; k < nM; k++) {
      const a3 = mA[k], b3 = mB[k];
      const dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1], dz = P[b3 + 2] - P[a3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz, r = mR[k];
      if (d2 >= r * r || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), e = (d - r) / d, sa = e * mKa[k], sb = e * mKb[k];
      P[a3] += dx * sa; P[a3 + 1] += dy * sa; P[a3 + 2] += dz * sa;
      P[b3] -= dx * sb; P[b3 + 1] -= dy * sb; P[b3 + 2] -= dz * sb;
    }
  }
  const wallZ = -cfg.depthMax * 1.35;
  for (let z = 2, n3 = nPart * 3; z < n3; z += 3) if (P[z] < wallZ) P[z] = wallZ;   // стена за шторой
  simTime += h;
}

// самостолкновение: точки, не соседние по сетке, не подходят ближе толщины складки
function selfCollide() {
  const rad = cfg.colW * 0.6, r2 = rad * rad, inv = 1 / rad;
  hashHead.fill(-1);
  for (let i = 0, i3 = 0; i < nPart; i++, i3 += 3) {
    if (scSkip[i]) continue;                          // закреплённые и точки у ленты в столкновениях не участвуют
    const x = cellX[i] = Math.floor(P[i3] * inv), y = cellY[i] = Math.floor(P[i3 + 1] * inv), z = cellZ[i] = Math.floor(P[i3 + 2] * inv);
    const k = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & 16383;
    hashNext[i] = hashHead[k]; hashHead[k] = i;
  }
  for (let i = 0, i3 = 0; i < nPart; i++, i3 += 3) {
    if (scSkip[i]) continue;
    const cx = cellX[i], cy = cellY[i], cz = cellZ[i], pi = gPan[i], ri = gRow[i], ci = gCol[i], wa = Wt[i];
    for (let ox = -1; ox <= 1; ox++) { const hx = (cx + ox) * 73856093;
      for (let oy = -1; oy <= 1; oy++) { const hy = hx ^ ((cy + oy) * 19349663);
        for (let oz = -1; oz <= 1; oz++) {
          for (let j = hashHead[((hy ^ ((cz + oz) * 83492791)) >>> 0) & 16383]; j !== -1; j = hashNext[j]) {
            if (j <= i) continue;
            if (gPan[j] === pi) { const dr = gRow[j] - ri, dc = gCol[j] - ci; if (dr <= 2 && dr >= -2 && dc <= 2 && dc >= -2) continue; }
            const j3 = j * 3, dx = P[j3] - P[i3], dy = P[j3 + 1] - P[i3 + 1], dz = P[j3 + 2] - P[i3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2 || d2 < 1e-8) continue;
            const wb = Wt[j], d = Math.sqrt(d2), s = ((d - rad) / (d * (wa + wb))) * 0.5;
            P[i3] += dx * s * wa; P[i3 + 1] += dy * s * wa; P[i3 + 2] += dz * s * wa;
            P[j3] -= dx * s * wb; P[j3 + 1] -= dy * s * wb; P[j3 + 2] -= dz * s * wb;
          }
        }
      }
    }
  }
}

function computeNormals() {
  const C = cfg.C, R = cfg.R;
  for (const pn of panels) {
    const sg = pn.dir;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = pn.off + r * C + c;
      const l = pn.off + r * C + Math.max(0, c - 1), rr = pn.off + r * C + Math.min(C - 1, c + 1);
      const u = pn.off + Math.max(0, r - 1) * C + c, d = pn.off + Math.min(R - 1, r + 1) * C + c;
      const ux = P[rr * 3] - P[l * 3], uy = P[rr * 3 + 1] - P[l * 3 + 1], uz = P[rr * 3 + 2] - P[l * 3 + 2];
      const vx = P[d * 3] - P[u * 3], vy = P[d * 3 + 1] - P[u * 3 + 1], vz = P[d * 3 + 2] - P[u * 3 + 2];
      const nx = (uy * vz - uz * vy) * sg, ny = (uz * vx - ux * vz) * sg, nz = (ux * vy - uy * vx) * sg;
      const L = Math.hypot(nx, ny, nz) || 1;
      NOR[i * 3] = nx / L; NOR[i * 3 + 1] = ny / L; NOR[i * 3 + 2] = nz / L;
    }
  }
}

/* =========================================================
   ОТРИСОВКА (three.js)
   ========================================================= */
function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.08;
  cfg.shadows = SETTINGS.shadows && cfg.kind !== 'lite';
  renderer.shadowMap.enabled = cfg.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);

  // свет: комната из HDRI + тёплый «оконный» свет слева сверху с мягкими тенями
  keyLight = new THREE.DirectionalLight(0xfff1df, KEY_LIGHT);
  keyLight.castShadow = cfg.shadows;
  keyLight.shadow.mapSize.set(SETTINGS.shadowMap, SETTINGS.shadowMap);
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight, keyLight.target);
  // запасной ровный свет комнаты: горит, только если room.hdr так и не догрузился к открытию (медленный интернет).
  // Без него шторы на первом заходе открывались почти чёрными.
  fbLight = new THREE.AmbientLight(0xfff4e8, 0); scene.add(fbLight);

  // свет из окна: два точечных источника в просвете — по одному у кромки каждого полотна, чтобы светились
  // именно ближние к окну складки, а дальние уходили в тень. В нашей сборке three.js класса PointLight нет
  // (оставлены только нужные части), поэтому берём базовый класс света и помечаем его как точечный —
  // отрисовка точечных источников в сборке есть.
  const Light = Object.getPrototypeOf(THREE.DirectionalLight);
  suns = [0, 1].map(() => {
    const l = new Light(SETTINGS.light.color, 0);
    l.isPointLight = true; l.type = 'PointLight';
    l.distance = 0; l.decay = SETTINGS.light.falloff;
    scene.add(l);
    return l;
  });

  const loader = new THREE.TextureLoader(opts.manager);
  const tex = (name, srgb) => {
    const t = loader.load(ASSETS + 'velvet/' + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const small = cfg.kind === 'desktop' ? '' : '_s';   // телефон и слабый уровень: текстуры 512 px вместо 768 — на их экране разницы нет
  material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(SETTINGS.color),
    map: tex('velvet_detail' + small + '.webp', true),
    normalMap: tex('velvet_normal' + small + '.webp', false),
    normalScale: new THREE.Vector2(SETTINGS.normalStrength, SETTINGS.normalStrength),
    roughnessMap: tex('velvet_rough.webp', false),
    roughness: 1, metalness: 0,
    specularIntensity: 0.08,                    // почти без зеркального блика — бархат не блестит
    sheen: 1, sheenColor: new THREE.Color(SETTINGS.sheen), sheenRoughness: SETTINGS.sheenRoughness,
    side: THREE.DoubleSide,
  });

  new THREE.HDRLoader(opts.manager).load(ASSETS + 'room.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(hdr).texture;
    hdr.dispose(); pm.dispose();
    // Свет комнаты меняет шейдеры всех материалов — это пауза в работе видеокарты. Посреди открытия она даёт
    // рывок и скачок яркости, поэтому, если шторы уже движутся, включаем его, когда они замрут.
    if (phase === 'closed' && !play) applyEnv(env); else pendingEnv = env;
  });
}

function buildScene() {
  renderer.setPixelRatio(cfg.dpr);
  renderer.setSize(W, H, false);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  camera.aspect = W / H;
  camera.fov = (2 * Math.atan(H / 2 / focal) * 180) / Math.PI;
  camera.position.set(0, 0, focal);
  camera.far = focal * 3;
  camera.updateProjectionMatrix();

  [clothMesh, rodGroup, wall].forEach((o) => { if (o) { scene.remove(o); o.traverse?.((m) => m.geometry?.dispose()); } });

  // ткань
  const C = cfg.C, R = cfg.R, tile = SETTINGS.textureMeters * pxm;
  clothGeo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(nPart * 3), 3).setUsage(35048);   // DYNAMIC_DRAW
  const nor = new THREE.BufferAttribute(new Float32Array(nPart * 3), 3).setUsage(35048);
  const uv = new Float32Array(nPart * 2);
  for (let i = 0; i < nPart; i++) { uv[i * 2] = FAB[i * 2] / tile; uv[i * 2 + 1] = -FAB[i * 2 + 1] / tile; }
  const idx = [];
  for (const pn of panels) {
    for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
      const a = pn.off + r * C + c, b = a + 1, d = a + C, e = d + 1;
      if (pn.dir > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);   // лицевая сторона — к зрителю
    }
  }
  clothGeo.setAttribute('position', pos);
  clothGeo.setAttribute('normal', nor);
  clothGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  clothGeo.setIndex(idx);
  clothMesh = new THREE.Mesh(clothGeo, material);
  clothMesh.castShadow = clothMesh.receiveShadow = cfg.shadows;
  clothMesh.frustumCulled = false;
  scene.add(clothMesh);

  // стена: только принимает тень от штор. Раньше это был один лист на весь экран, и видеокарта
  // считала тень в каждом пикселе, даже посередине, где тени нет. Теперь три куска (полоса под карнизом,
  // левый и правый участки до края штор + запас на сдвиг тени) — их границы обновляются каждый кадр.
  // Куски не перекрываются (иначе тень удвоилась бы) и имеют общие вершины (нет щелей).
  wallZ = -cfg.depthMax * 1.5 - 4;
  wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3).setUsage(35048));
  wallGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(12 * 3).map((v, i) => (i % 3 === 2 ? 1 : 0)), 3));
  wallGeo.setIndex([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7, 8, 10, 9, 9, 10, 11]);
  wall = new THREE.Mesh(wallGeo, new THREE.ShadowMaterial({ color: 0x3a2a1c, opacity: 0.2 }));
  wall.position.z = wallZ;
  wall.receiveShadow = cfg.shadows;
  wall.frustumCulled = false;
  wallMesh = wall;
  scene.add(wall);

  // карниз как на фото: штанга ⌀28 мм из состаренной латуни, точёные наконечники-шары с воротничком,
  // настенные кронштейны с розеткой и обоймой, круглые кольца с ушком и крючком в ленту шторы
  rodGroup = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(SETTINGS.metal), metalness: 1, roughness: 0.3,
    anisotropy: 0.55, anisotropyRotation: Math.PI / 2, envMapIntensity: 1.9,   // шлифовка вдоль штанги
  });
  const metalDark = metal.clone(); metalDark.roughness = 0.42; metalDark.color.multiplyScalar(0.78);
  const s = cfg.scale, rodR = 4.7 * s, yRod = H / 2 - cfg.rodY, hx = W / 2;
  const finX = cfg.hw ? 22 : -30, brX = 52;
  const shadowy = (m) => { m.castShadow = cfg.shadows; return m; };

  const rodLen = W - 2 * (finX + 6 * s);
  const rod = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(rodR, rodR, rodLen, 32, 1, true), metal));
  rod.rotation.z = Math.PI / 2; rod.position.set(0, yRod, 0);
  rodGroup.add(rod);

  if (cfg.hw) {
    // наконечник: профиль вращения (воротничок → шейка → шар)
    const R0 = rodR, ball = rodR * 1.9, pts = [];
    [[0, 0], [R0 * 1.42, 0], [R0 * 1.42, 1.6], [R0 * 1.12, 2.3], [R0 * 1.12, 3.2], [R0 * 1.55, 3.9], [R0 * 1.55, 5.0], [R0 * 1.18, 5.8], [R0 * 0.72, 7.2]]
      .forEach(([r, y]) => pts.push(new THREE.Vector2(r, y * s)));
    const cy = 7.2 * s + ball * 0.93;
    for (let k = 0; k <= 18; k++) { const a = -1.19 + (k / 18) * (Math.PI / 2 + 1.19); pts.push(new THREE.Vector2(Math.max(0.001, ball * Math.cos(a)), cy + ball * Math.sin(a))); }
    const finGeo = new THREE.LatheGeometry(pts, 40);
    [-1, 1].forEach((side) => {
      const f = shadowy(new THREE.Mesh(finGeo, metal));
      f.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      f.position.set(side * (hx - finX - 6 * s), yRod, 0);
      rodGroup.add(f);
    });
    // кронштейн: розетка на стене, кронштейн-трубка, обойма вокруг штанги
    const wz = wall.position.z;
    const rose = new THREE.CylinderGeometry(9 * s, 10 * s, 3 * s, 36);
    const arm = new THREE.CylinderGeometry(2.3 * s, 2.6 * s, Math.abs(wz) - rodR, 20);
    const cup = new THREE.TorusGeometry(rodR + 1.3 * s, 1.5 * s, 10, 32);
    [-1, 1].forEach((side) => {
      const x = side * (hx - brX);
      const r1 = shadowy(new THREE.Mesh(rose, metalDark)); r1.rotation.x = Math.PI / 2; r1.position.set(x, yRod, wz + 1.5 * s);
      const a1 = shadowy(new THREE.Mesh(arm, metal)); a1.rotation.x = Math.PI / 2; a1.position.set(x, yRod - rodR * 0.2, (wz - rodR) / 2);
      const c1 = shadowy(new THREE.Mesh(cup, metal)); c1.rotation.y = Math.PI / 2; c1.position.set(x, yRod, 0);
      rodGroup.add(r1, a1, c1);
    });
  }

  // кольца (вокруг штанги), ушки и крючки — по одному на каждое кольцо, двигаются вместе с ним
  const nR = 2 * cfg.N;
  ringMesh = shadowy(new THREE.InstancedMesh(new THREE.TorusGeometry(cfg.ringR, 1.15 * s, 10, 28), metal, nR));
  eyeMesh = shadowy(new THREE.InstancedMesh(new THREE.TorusGeometry(1.7 * s, 0.6 * s, 6, 14), metal, nR));
  const hookLen = cfg.top - (cfg.rodY + cfg.ringR + 3 * s) + 2 * s;
  hookMesh = shadowy(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55 * s, 0.55 * s, hookLen, 6), metalDark, nR));
  cfg.hookLen = hookLen;
  rodGroup.add(ringMesh, eyeMesh, hookMesh);
  scene.add(rodGroup);

  // свет и тени — по размеру сцены
  keyLight.position.set(-W * 0.55, H * 0.75, W * 1.1);
  keyLight.target.position.set(0, 0, 0);
  const sc = keyLight.shadow.camera, ext = Math.max(W, H) * 0.75;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = W * 4;
  sc.updateProjectionMatrix();
  keyLight.shadow.normalBias = 1.2;
  keyLight.shadow.radius = 4;
}

// границы кусков стены по фактическому положению ткани (сцена: x вправо от центра, y вверх)
function updateWall() {
  const a = wallGeo.attributes.position.array;
  const hx = W / 2, hy = H / 2;
  const L = keyLight.position, lz = Math.max(1, L.z);
  const kx = -L.x / lz, ky = L.y / lz;                           // сдвиг тени на единицу глубины
  const pad = 32;                                                // размытие тени (PCF) + запас
  const depth = bounds.mz - wallZ;                               // самая выступающая точка → самый дальний сдвиг
  const X0 = -W * 0.7, X1 = W * 0.7, Y0 = -H * 0.7, Y1 = H * 0.7;
  // полоса под карнизом во всю ширину: штанга, кольца, крючки, наконечники, кронштейны
  const yTop = hy - (cfg.top + cfg.header + (cfg.depthMax * 2.5 + 8) * Math.max(0, ky) + pad);
  let xl = bounds.lx - hx + Math.max(0, kx) * depth + pad;       // левый кусок: от края до левой шторы + сдвиг тени
  let xr = bounds.rx - hx + Math.min(0, kx) * depth - pad;       // правый кусок: от правой шторы до края
  xl = clamp(xl, X0, X1); xr = clamp(xr, X0, X1);
  if (xl >= xr) { xl = X1; xr = X1; }                           // шторы закрыты — левый кусок на всю ширину, правый пустой
  const q = (o, x0, y0, x1, y1) => {                             // 0 — левый верх, 1 — правый верх, 2 — левый низ, 3 — правый низ
    const v = [x0, y1, x1, y1, x0, y0, x1, y0];
    for (let k = 0; k < 4; k++) { a[(o + k) * 3] = v[k * 2]; a[(o + k) * 3 + 1] = v[k * 2 + 1]; a[(o + k) * 3 + 2] = 0; }
  };
  q(0, X0, yTop, X1, Y1);          // полоса под карнизом
  q(4, X0, Y0, xl, yTop);          // левый
  q(8, xr, Y0, X1, yTop);          // правый
  wallGeo.attributes.position.needsUpdate = true;
}

// Свет из окна по фактическому просвету между полотнами (вызывается перед каждым нарисованным кадром)
function updateLight() {
  const L = SETTINGS.light;
  // просвет меряем по ведущим кольцам: низ ткани качается и расходится веером, кольца — нет,
  // поэтому свет не дрожит вместе с подолом и в конце открытия k равно ровно 1
  const N = cfg.N, lx = panels[0].rx[N - 1], rx = panels[1].rx[N - 1];
  const full = Math.max(1, panels[1].leadOpen - panels[0].leadOpen);
  const gap = clamp(rx - lx, 0, full);
  const k = gap / full, e = k * k * (3 - 2 * k);
  const room = L.dim + (1 - L.dim) * e;           // полумрак → обычный свет комнаты
  keyLight.intensity = KEY_LIGHT * room;
  scene.environmentIntensity = ENV_LIGHT * room;
  if (fbLight) fbLight.intensity = scene.environment ? 0 : SETTINGS.light.fallback * room;
  // источники стоят в просвете, на расстоянии reach от кромок (в узкой щели — оба посередине), чуть впереди ткани:
  // освещают бока складок, обращённые к окну. Сила подобрана так, что освещённость ведущей кромки
  // почти постоянна всё открытие — без вспышки в первой щели.
  const off = Math.min(L.reach * cfg.scale, gap / 2), z = cfg.depthMax * 1.4;
  const power = L.rim * Math.pow(Math.max(off, 1), L.falloff) * Math.min(1, k * 6);
  suns[0].position.set(lx + off - W / 2, H * L.height, z);
  suns[1].position.set(rx - off - W / 2, H * L.height, z);
  suns[0].intensity = suns[1].intensity = power;
  stats.light = +k.toFixed(3);

  // слои свечения в CSS: пишем числа, только когда они заметно изменились
  if (!lightEl) return;
  const gl = Math.min(lx, rx), st = lightEl.style;
  if (Math.abs(k - lightK) > 0.002 || (k !== lightK && (k === 0 || k === 1))) { lightK = k; st.setProperty('--k', k.toFixed(3)); }
  const gStep = phase === 'open' ? 3 : 0.5;          // после открытия — реже: мягкий градиент сдвиг в 3 px не выдаёт, а перерисовка всего экрана каждый кадр дорогая
  if (Math.abs(gl - lightGl) > gStep || Math.abs(gap - lightGw) > gStep) {
    lightGl = gl; lightGw = gap;
    st.setProperty('--gl', gl.toFixed(1) + 'px'); st.setProperty('--gw', gap.toFixed(1) + 'px');
  }
}

function render() {
  computeNormals();
  const pos = clothGeo.attributes.position.array, nor = clothGeo.attributes.normal.array;
  const hx = W / 2, hy = H / 2, half = nPart / 2;
  let lx = -1e9, rx = 1e9, mz = -1e9;
  for (let i = 0; i < nPart; i++) {
    const i3 = i * 3, x = P[i3], z = P[i3 + 2];
    pos[i3] = x - hx; pos[i3 + 1] = hy - P[i3 + 1]; pos[i3 + 2] = z;
    nor[i3] = NOR[i3]; nor[i3 + 1] = -NOR[i3 + 1]; nor[i3 + 2] = NOR[i3 + 2];
    if (i < half) { if (x > lx) lx = x; } else if (x < rx) rx = x;
    if (z > mz) mz = z;
  }
  bounds.lx = lx; bounds.rx = rx; bounds.mz = mz;
  updateWall();
  updateLight();
  if (!LASTR || LASTR.length !== P.length) { LASTR = new Float32Array(P.length); LASTR2 = new Float32Array(P.length); LASTR2.set(P); }
  else LASTR2.set(LASTR);
  LASTR.set(P);
  if (!lastRx || lastRx.length !== 2 * cfg.N) lastRx = new Float64Array(2 * cfg.N);
  for (const pn of panels) lastRx.set(pn.rx, pn.side * cfg.N);
  needRender = false;
  stats.rendered++;
  clothGeo.attributes.position.needsUpdate = true;
  clothGeo.attributes.normal.needsUpdate = true;
  let k = 0;
  const s = cfg.scale, yR = hy - cfg.rodY, yEye = yR - cfg.ringR - 1.6 * s, yHook = yEye - 1.4 * s - cfg.hookLen / 2;
  for (const pn of panels) for (let j = 0; j < cfg.N; j++) {
    const x = pn.rx[j] - hx;
    dummy.position.set(x, yR, 0); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); ringMesh.setMatrixAt(k, dummy.matrix);
    dummy.position.set(x, yEye, 0); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); eyeMesh.setMatrixAt(k, dummy.matrix);
    dummy.position.set(x, yHook, 0); dummy.updateMatrix(); hookMesh.setMatrixAt(k, dummy.matrix);
    k++;
  }
  ringMesh.instanceMatrix.needsUpdate = eyeMesh.instanceMatrix.needsUpdate = hookMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

/* ---------- цикл ---------- */
// сдвинулось ли что-то заметно с последнего нарисованного кадра (ткань или кольца)
const differs = (A) => { const e = SETTINGS.idleEps; for (let i = 0; i < P.length; i++) { const d = P[i] - A[i]; if (d > e || d < -e) return true; } return false; };
function moved() {
  if (needRender || !LASTR || LASTR.length !== P.length) return true;
  const e = SETTINGS.idleEps;
  for (const pn of panels) for (let j = 0; j < cfg.N; j++) { const d = pn.rx[j] - lastRx[pn.side * cfg.N + j]; if (d > e || d < -e) return true; }
  if (!differs(LASTR)) return false;
  // облегчённый режим: грубая сетка, ткань может дрожать между двумя положениями на долю пикселя —
  // если она вернулась в одно из двух последних нарисованных положений, перерисовывать нечего
  if (cfg.kind === 'lite' && LASTR2 && LASTR2.length === P.length && !differs(LASTR2)) return false;
  return true;
}

// делитель кадров: на 120 Гц рисуем каждый 2-й кадр, на 144 Гц — каждый 2-й (72), на 240 Гц — каждый 4-й.
// Ровный шаг без рывков; физика при этом считается по реальному времени, как и раньше.
function measureRefresh(ts) {
  if (rafTs.length >= 40) return;
  rafTs.push(ts);
  if (rafTs.length === 40) {
    const d = []; for (let i = 1; i < rafTs.length; i++) d.push(rafTs[i] - rafTs[i - 1]);
    d.sort((a, b) => a - b);
    const hz = 1000 / d[d.length >> 1];
    frameDiv = Math.max(1, Math.round(hz / SETTINGS.maxFps));
  }
}

// Продвинуть ткань на dt секунд: шаги физики, самостолкновение, смена фаз. Общий код для страницы и отдельного потока.
function simAdvance(dt) {
  const h = 1 / SETTINGS.substepHz;
  acc += dt;
  let n = 0;
  while (acc >= h && n < 8) { substep(h, false); acc -= h; n++; }
  if (n === 8) acc = 0;
  if (SETTINGS.selfCollision && n) selfCollide();

  const now = simTime * 1000;
  if (phase === 'opening' && now >= openStart + openDur) phase = 'open';
  if (phase === 'opening' && !openFired && now > openStart + openDur * 0.4) openFired = true;
  if (!settledFired && phase === 'open' && now > openStart + openDur + 1600) settledFired = true;
  if (!REST && phase === 'open' && now > restAt) REST = P.slice();   // запоминаем спокойную форму ткани
}

// Состояние из потока расчёта: между двумя последними кадрами расчёта плавно интерполируем по времени экрана —
// движение ровное на любом мониторе, даже если расчёт идёт реже отрисовки.
function applyWorkerState(nowMs) {
  if (!sB) return;
  const B = sB.P, N2 = 2 * cfg.N;
  if (B.length !== P.length) return;
  let a = 1;
  if (sA && sA.P.length === B.length) a = clamp((nowMs - sB.at) / clamp(sB.at - sA.at, 8, 80), 0, 1);
  if (a >= 1 || !sA) P.set(B);
  else { const A = sA.P; for (let i = 0; i < B.length; i++) P[i] = A[i] + (B[i] - A[i]) * a; }
  for (const pn of panels) for (let j = 0; j < cfg.N; j++) {
    const k = pn.side * cfg.N + j, b = sB.rx[k];
    pn.rx[j] = a >= 1 || !sA || sA.rx.length !== N2 ? b : sA.rx[k] + (b - sA.rx[k]) * a;
  }
  phase = sB.phase; openFired = sB.openFired; settledFired = sB.settledFired; simTime = sB.simTime;
  REST = sB.rest ? P : null;
}
/* ---------- открытие по записи ---------- */
// запись готова к показу: досчитана целиком или поток успеет досчитать её раньше, чем до конца дойдёт проигрывание
function recReady() {
  const R = recM;
  return R.gen === wGen && R.n > 0 && (R.done || (R.n >= 20 && R.n - 20 >= R.total * (1 - Math.min(1, R.rate / 60))));
}
function playFrame(nowMs) {
  const L = P.length, N2 = 2 * cfg.N, R = recM;
  if (!R.buf || R.L !== L || R.N2 !== N2) { endPlay(); return; }
  const lastF = (R.done ? R.total : R.n) - 1;
  const f = clamp((nowMs - play.t0) * 0.06, 0, lastF);          // 60 кадров записи в секунду, между ними — плавно
  if (!R.done && f >= lastF) stats.recWait = (stats.recWait || 0) + 1;
  const i0 = Math.floor(f), i1 = Math.min(i0 + 1, lastF), a = f - i0, A = R.buf, o0 = i0 * L, o1 = i1 * L, iq = 1 / R.q;
  for (let i = 0; i < L; i++) P[i] = (A[o0 + i] + (A[o1 + i] - A[o0 + i]) * a) * iq;
  const X = R.rx, r0 = i0 * N2, r1 = i1 * N2;
  for (const pn of panels) for (let j = 0; j < cfg.N; j++) { const k = pn.side * cfg.N + j; pn.rx[j] = X[r0 + k] + (X[r1 + k] - X[r0 + k]) * a; }
  const t = f / 0.06;
  phase = t < play.delay ? 'closed' : t < play.delay + play.dur ? 'opening' : 'open';
  if (!openFired && t > play.delay + play.dur * 0.4) openFired = true;
  if (!settledFired && t > play.delay + play.dur + 1600) settledFired = true;
  REST = null; needRender = true;
  if (R.done && f >= lastF) endPlay();
}
// запись кончилась: поток продолжает физику ровно с последнего кадра
// запись доиграла: последний кадр остаётся на экране, расчёт не возобновляется, цикл засыпает
function endPlay() { play = null; frozen = true; sA = sB = null; recM.buf = recM.rx = null; if (worker) worker.postMessage({ t: 'play-end' }); }

// поток считает только пока шторы на экране и не «спят»
function syncWorker() {
  if (!worker) return;
  const on = running && visible && !asleep && !document.hidden;
  if (on !== wOn) { wOn = on; worker.postMessage({ t: 'run', on }); }
}

// Регулятор видеокарты. Качество выбираем ТОЛЬКО на загрузочном экране, пока рисуются закрытые шторы (прогрев):
// считаем, как часто реально приходят кадры. Реже 45 в секунду — снижаем то, что глаз почти не замечает: плотность
// пикселей холста, потом размер теней; совсем не тянет — проигрываем открытие ровно на 30 кадрах вместо скачущих 60/20.
// Во время открытия и покачивания ничего не переключаем: пересоздание буферов посреди движения само даёт рывок.
function gpuGovernor(dtMs, rendered) {
  if (!SETTINGS.gpuGovernor || !rendered || dtMs > 250) return;
  if (loader.done || phase !== 'closed' || lock30) return;
  if (++govSkip <= 8) return;                        // первые кадры — сборка шейдеров, не в счёт
  govT += dtMs; govN++;
  if (govN < 24 && !(govN >= 6 && govT > 1500)) return;   // 24 кадра или, на совсем слабом железе, полторы секунды
  const avg = govT / govN; govT = 0; govN = 0;
  stats.govAvg = +avg.toFixed(1);
  if (avg < 1000 / 45) return;
  const bad = avg > 1000 / 28;                       // совсем тяжело — снижаем сразу всё, прогрев короткий
  let changed = false;
  if (cfg.dpr > 1.01) { cfg.dpr = bad || cfg.dpr <= 1.26 ? 1 : 1.25; changed = true; }
  if ((bad || !changed) && cfg.shadows && keyLight.shadow.mapSize.x > 512) {
    keyLight.shadow.mapSize.set(512, 512); keyLight.shadow.map?.dispose(); keyLight.shadow.map = null; changed = true;
  }
  if (!changed) { lock30 = true; stats.gov = (govLevel ? govLevel + ', ' : '') + '30 к/с'; return; }
  govLevel++; stats.gov = govLevel + ' (dpr ' + cfg.dpr + ', тени ' + keyLight.shadow.mapSize.x + ')';
  renderer.setPixelRatio(cfg.dpr); renderer.setSize(W, H, false);
  render();   // setSize очищает холст: рисуем сразу в этом же кадре, иначе браузер покажет пустой холст — экран «мигнёт»
}
// свет комнаты из room.hdr
function applyEnv(env) {
  scene.environment = env; scene.environmentIntensity = ENV_LIGHT;
  if (fbLight) fbLight.intensity = 0;
  lightK = -1; needRender = true;                  // пересчитать полумрак
}
// шторы окончательно замерли (запись доиграла / сквозняк стих) — сообщаем странице один раз
function restNow() {
  if (pendingEnv) { applyEnv(pendingEnv); pendingEnv = null; updateLight(); render(); }   // отложенный свет комнаты — один кадр, уже в покое
  if (!restCb) { restCb = true; opts.onRest?.(); }
}

function frame(ts) {
  raf = 0;
  if (!running) return;
  stats.frames++;
  measureRefresh(ts);
  if (frameDiv > 1 && last && ++divN % frameDiv !== 0) { schedule(); return; }
  if (lock30 && last && ts - last < 1000 / 30 - 4) { schedule(); return; }   // слабая видеокарта: ровно 30 кадров, запись между ними плавная   // лишний кадр монитора — пропускаем целиком
  const dtMs = last ? ts - last : 16;
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
  last = ts;

  const sy = window.scrollY;                       // порыв от прокрутки
  const v = (sy - scrollY0) / Math.max(dt, 0.001);
  scrollY0 = sy;
  scrollV += (v - scrollV) * 0.2;
  const target = SETTINGS.interactive ? clamp(Math.abs(scrollV) / 1800, 0, 1) * SETTINGS.scrollGust : 0;
  gust += (target - gust) * (target > gust ? 0.12 : 0.03);
  if (performance.now() - pointer.t > 120) { pointer.vx *= 0.8; pointer.vy *= 0.8; }

  if (worker) {
    if (!frozen) worker.postMessage({ t: 'in', x: pointer.x, y: pointer.y, vx: pointer.vx, vy: pointer.vy, on: pointer.active, gust, calm });
    if (play) playFrame(performance.now()); else applyWorkerState(performance.now());
  } else simAdvance(dt);
  if (openFired && !openCb) { openCb = true; opts.onOpenStart?.(); }
  if (settledFired && !settledCb) { settledCb = true; opts.onSettled?.(); }

  // прогрев за загрузочным экраном: рисуем закрытые шторы каждый кадр — шейдеры, текстуры и тени готовы до открытия
  if (phase === 'closed' && !loader.done) {
    needRender = true; warmN++;
    const L = SETTINGS.loader;
    loaderSet(0.8 + 0.2 * Math.min(1, Math.max(warmN / L.warmFrames, (ts - warmT0) / L.warmMs)));
  }

  // покой: без мыши и прокрутки сквозняк плавно стихает; ткань замерла — останавливаем цикл совсем
  const tNow = performance.now();
  if (phase !== 'open' || !REST) lastAct = tNow;
  const active = tNow - lastAct < SETTINGS.restAfter;
  calm += ((active ? 1 : 0) - calm) * (1 - Math.exp(-dt / (active ? 0.4 : 1.3)));
  if (active) calmZeroAt = 0;
  else if (calm < 0.02) { calm = 0; if (!calmZeroAt) calmZeroAt = tNow; }

  const draw = moved();
  if (draw) render(); else stats.skipped++;   // ткань замерла — картинка та же, видеокарта отдыхает
  gpuGovernor(dtMs, draw);
  if (frozen) { asleep = stats.asleep = true; syncWorker(); restNow(); return; }   // запись доиграла — кадр на месте, цикл спит до пересборки
  // сквозняка нет уже 2,5 с, ткань успокоена усиленным трением — останавливаем цикл (остаточная дрожь в доли пикселя не в счёт)
  if (calmZeroAt && tNow - calmZeroAt > 2500) { asleep = stats.asleep = true; syncWorker(); restNow(); return; }
  schedule();
}
const schedule = () => { syncWorker(); if (running && visible && !asleep && !document.hidden && !raf) raf = requestAnimationFrame(frame); };
// любое движение будит шторы: возвращается сквозняк и цикл
const wake = () => { lastAct = performance.now(); calmZeroAt = 0; if (asleep) { asleep = stats.asleep = false; last = 0; schedule(); } };

/* ---------- ввод ---------- */
function toLocal(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function bindInput() {
  if (!SETTINGS.interactive) return;                // шторы на курсор и прокрутку не реагируют
  const move = (e) => {
    const [x, y] = toLocal(e);
    const now = performance.now(), dt = Math.max(8, now - pointer.t) / 1000;
    if (pointer.active) { pointer.vx = (x - pointer.x) / dt; pointer.vy = (y - pointer.y) / dt; }
    pointer.x = x; pointer.y = y; pointer.t = now;
    pointer.active = y > -50 && y < H + 50;
    if (pointer.active) wake();
    schedule();
  };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('scroll', () => { if (visible) wake(); }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
}

/* ---------- запуск ---------- */
function init(o) {
  opts = o || {};
  canvas = opts.canvas;
  hero = canvas.closest('section') || canvas.parentElement;
  lightEl = canvas.parentElement;                  // .hero__window: сюда пишем --k, --gl, --gw для слоёв света
  let failed = false;
  const fail = (err) => { failed = true; if (err) console.warn('[curtains]', err); hero.classList.add('curtains-ready', 'curtains-off'); loader.onDone = null; loaderSet(1, true); opts.onOpenStart?.(); opts.onSettled?.(); restNow(); };

  const still = reduce() || document.documentElement.classList.contains('soft-gpu');   // без видеокарты — шторы сразу открыты, без анимации
  let seen = false;
  try { seen = sessionStorage.getItem('curtains-seen') === '1'; sessionStorage.setItem('curtains-seen', '1'); } catch (e) { /* приватный режим */ }

  cfg.still = still;
  phase = still ? 'open' : 'closed';
  measure();

  // Порядок: 1) грузятся текстуры и свет (или 12 с — без них, тогда горит запасной свет), параллельно собирается и укладывается ткань (в отдельном потоке)
  // → 2) первый кадр и прогрев закрытых штор за загрузочным экраном → 3) отсчёт дошёл до 1, экран гаснет → 4) шторы открываются.
  if (!loader.el?.dataset.ms) loader.min = still ? 400 : seen ? SETTINGS.loader.minSeen : SETTINGS.loader.min;
  loaderCss();
  let started = false, built = false, assets = false, opened = false;
  const openSpec = { dur: seen ? 1500 : SETTINGS.openDuration, delay: seen ? 120 : SETTINGS.openDelay };
  loader.gate = () => !worker || opened || !SETTINGS.rec.enabled || recReady();
  const open = () => {
    if (!started || opened || phase !== 'closed') return;
    opened = true;
    const { dur, delay } = openSpec;
    if (worker && SETTINGS.rec.enabled) {
      // Открытие ТОЛЬКО по записи. Не успела — закрытые шторы спокойно стоят и ждут, пока поток досчитает
      // достаточно кадров, и открываются ровно. Вживую больше не переключаемся: этот путь давал «взлетевшую» ткань.
      const t0 = performance.now();
      const go = () => {
        if (phase !== 'closed' || play) return;
        if (!recReady()) {
          if (performance.now() - t0 > 20000) { fail('запись открытия не досчиталась за 20 с — показан снимок'); return; }
          stats.opening = 'ждём запись: ' + recM.n + '/' + recM.total; setTimeout(go, 100); return;
        }
        play = { t0: performance.now(), dur, delay }; sA = sB = null; openDur = dur;
        stats.opening = 'по записи (' + recM.total + ' кадров' + (recM.done ? ', посчитано за ' + recM.sec.toFixed(1) + ' с)' : ', досчитывается)')
          + (performance.now() - t0 > 150 ? ', ждали ' + ((performance.now() - t0) / 1000).toFixed(1) + ' с' : '');
        needRender = true; last = 0; wake(); schedule();
      };
      go(); return;
    } else if (worker) {
      worker.postMessage({ t: 'open', dur, delay });
      stats.opening = 'вживую (запись выключена)';
    } else { openDur = dur; openStart = simTime * 1000 + delay; restAt = openStart + openDur + 3500; phase = 'opening'; }
    needRender = true; last = 0; wake(); schedule();
  };
  loader.onDone = open;
  const start = () => {
    if (started || failed || !built || !assets) return; started = true;
    try { render(); } catch (err) { return fail(err); }
    hero.classList.add('curtains-ready');
    if (still) { REST = P.slice(); openFired = settledFired = openCb = settledCb = true; loader.onDone = null; loaderSet(1, true); opts.onOpenStart?.(); opts.onSettled?.(); restNow(); return; }
    loaderSet(0.8);
    running = true; last = 0; warmN = 0; warmT0 = performance.now();
    scrollY0 = window.scrollY;
    bindInput();
    schedule();
    if (loader.done) open();
  };
  // сборка сцены под выбранную сетку (в потоке сетку выбирает поток и сообщает сюда)
  const assemble = (openNow, inWorker) => {
    try {
      if (inWorker) build(openNow, true); else buildAuto(openNow, SETTINGS.budget.main);
      buildScene();
    } catch (err) { fail(err); return false; }
    stats.grid = cfg.grid; stats.worker = !!worker;
    needRender = true; LASTR = null; lightK = lightGl = lightGw = -1; sA = sB = null;
    return true;
  };
  let pendingM = null, wTimer = 0;
  const noWorker = () => {                           // поток недоступен или не ответил — считаем в основном потоке, как раньше
    clearTimeout(wTimer);
    if (worker) { try { worker.terminate(); } catch (e) { /* уже остановлен */ } }
    const first = !built;
    worker = null; wOn = false; play = null;
    if (first) { if (assemble(still, false)) { built = true; loaderSet(0.12); start(); } }
    else { const wasOpen = phase !== 'closed'; if (assemble(wasOpen, false)) { if (wasOpen) { phase = 'open'; openStart = simTime * 1000 - openDur; REST = null; restAt = simTime * 1000 + 2500; } render(); wake(); } }
  };
  const askBuild = (m, openNow) => {
    pendingM = m; wGen++;
    play = null; recM.gen = -1; recM.n = 0; recM.done = false; recM.buf = recM.rx = null;
    if (!opened && !loader.done) loader.ready = false;   // размер сменился во время отсчёта — «1» снова ждёт новую запись (не дольше 8 с)
    worker.postMessage({ t: 'build', gen: wGen, m, openNow, budget: SETTINGS.budget.worker, dur: openDur, rec: opened ? null : openSpec });
    clearTimeout(wTimer); wTimer = setTimeout(noWorker, 12000);
  };
  opts.manager = new THREE.LoadingManager(() => { assets = true; start(); }, (url, n, total) => loaderSet(0.12 + 0.62 * n / Math.max(1, total)), () => {});
  try { initThree(); } catch (err) { return fail(err); }
  let wPending = false;
  const mainBuild = () => { wPending = false; worker = null; if (!assemble(still, false)) return; built = true; loaderSet(0.12); start(); };
  const startWorker = (url) => {
    wPending = false;
    worker = new Worker(url, { type: 'module' });
    worker.onerror = (e) => { console.warn('[curtains] поток расчёта недоступен, считаем в основном:', e.message || ''); noWorker(); };
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.gen !== wGen) return;                  // ответ на устаревшую сборку (размер окна уже другой)
      if (d.t === 's') {
        if (play) return;
        d.at = performance.now();
        if (frozen) { sA = null; sB = d; needRender = true; wake(); return; }   // после пересборки (размер окна) — одна новая поза
        sA = sB; sB = d; stats.simMs = d.ms; return;
      }
      if (d.t === 'rec') {                         // кадры записанного открытия приходят пачками, пока идёт загрузочный экран
        if (d.from === 0) Object.assign(recM, { q: d.q, buf: new Int16Array(d.total * d.L), rx: new Float32Array(d.total * d.N2), total: d.total, gen: d.gen, L: d.L, N2: d.N2 });
        if (recM.gen !== d.gen || !recM.buf) return;
        recM.buf.set(d.P.subarray(0, d.n * d.L), d.from * d.L); recM.rx.set(d.rx.subarray(0, d.n * d.N2), d.from * d.N2);
        recM.n = d.from + d.n; recM.rate = d.rate; recM.done = d.done; recM.sec = d.sec;
        stats.rec = recM.n + '/' + recM.total + (d.done ? ', готово за ' + d.sec.toFixed(1) + ' с' : '');
        if (loader.want && !loader.ready) loaderSet(1);
        return;
      }
      if (d.t === 'slow') { stats.slow = 'расчёт ' + d.ms.toFixed(1) + ' мс/шаг, сетка не менялась'; return; }
      if (d.t === 'built') {
        clearTimeout(wTimer);
        const first = !built;
        if (!first) applyMeasure(pendingM);
        cfg.grid = d.grid; stats.load = d.load;
        if (!assemble(d.openNow, true)) return;
        if (first) { built = true; loaderSet(0.12); start(); }
        else if (started) { render(); wake(); }
      }
    };
    askBuild(lastM, false);
  };
  if (SETTINGS.useWorker && !still && typeof Worker !== 'undefined') {
    // Потоку three.js не нужен. Чтобы он не скачивал и не разбирал его второй раз, отдаём потоку текст этого же файла
    // без строки импорта (сам файл уже в кэше браузера). Не получилось — запускаем файл как есть; и это не вышло — считаем здесь.
    wPending = true;
    fetch(import.meta.url).then((r) => r.text()).then((src) => {
      const here = import.meta.url;
      let cut = src.replace(/^import \* as THREE from [^\n]*\n/m, 'const THREE = null;\n');
      if (cut === src) return here;
      cut = cut.split('import.meta' + '.url').join(JSON.stringify(here));   // у копии нет своего адреса — подставляем адрес файла
      const blob = URL.createObjectURL(new Blob([cut], { type: 'text/javascript' }));
      setTimeout(() => URL.revokeObjectURL(blob), 20000);
      return blob;
    }).catch(() => import.meta.url).then((url) => { try { startWorker(url); } catch (err) { mainBuild(); } });
  } else mainBuild();
  // свет и фактуры ждём до 12 с (раньше 4): на первом заходе через медленный интернет без них шторы открывались тёмными
  setTimeout(() => { assets = true; start(); }, 12000);
  // Страховка. «1» ждёт запись не дольше 1,5 с после конца отсчёта: дальше загрузочный экран уходит, закрытые шторы
  // стоят на месте и открываются, как только запись готова (см. open).
  // Но загрузочный экран не убираем, пока шторы не нарисованы: иначе на экране мелькнёт пустой фон.
  // Если и к 20 с шторы не готовы (очень медленный интернет или слабое устройство) — запасной снимок штор и текст.
  const safety = () => {
    if (started) { loaderSet(1, true); return; }
    if (failed) return;
    if (performance.now() > 20000) { fail('шторы не успели загрузиться за 20 с — показан снимок'); return; }
    setTimeout(safety, 250);
  };
  setTimeout(safety, Math.max(0, (loader.t0 || 0) + loader.min + 1500 - performance.now()));

  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) { last = 0; needRender = true; rafTs = []; wake(); schedule(); } else syncWorker(); }).observe(hero);
  document.addEventListener('visibilitychange', () => { last = 0; needRender = true; rafTs = []; wake(); schedule(); });

  // пересборка при заметном изменении размера (не на каждое скрытие адресной строки)
  let rt = 0, w0 = W, h0 = H;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const r = hero.getBoundingClientRect();
      if (Math.abs(r.width - w0) < 40 && Math.abs(r.height - h0) < 160) return;
      w0 = r.width; h0 = r.height;
      const wasOpen = phase !== 'closed' || !!play;
      if (wPending) return;
      if (worker) { askBuild(measureDOM(), wasOpen); return; }   // поток пересоберёт ткань и пришлёт сетку; до тех пор на экране прежний кадр
      if (wasOpen) phase = 'open';
      measure();
      if (!assemble(wasOpen, false)) return;
      if (wasOpen) { openStart = simTime * 1000 - openDur; REST = null; restAt = simTime * 1000 + 2500; }
      if (started) { render(); wake(); }
    }, 180);
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; });
}

if (!IS_WORKER) window.Curtains = { init, settings: SETTINGS, stats };   // stats: сколько кадров нарисовано / пропущено (для проверки в консоли)   // stats: сколько кадров нарисовано / пропущено (для проверки в консоли)

/* =========================================================
   ОТДЕЛЬНЫЙ ПОТОК РАСЧЁТА ТКАНИ
   Страница запускает этот же файл как Worker. Здесь нет ни страницы, ни three.js-сцены: только сборка сетки,
   шаги физики 60 раз в секунду и отправка положений точек и колец обратно. Страница их только рисует,
   поэтому прокрутка, кнопки и анимации сайта не зависят от того, сколько времени занял расчёт.
   ========================================================= */
if (IS_WORKER) {
  let gen = 0, on = false, timer = 0, wLast = 0, ms = 0, slow = 0, lastBuild = null;
  let rec = null, recTok = 0, inp = null, frozenW = false;   // frozenW: запись доиграла — живой расчёт больше не идёт
  const chosen = {};                                // выбранная сетка для каждого вида экрана
  const applyIn = () => { if (!inp) return; const d = inp; pointer.x = d.x; pointer.y = d.y; pointer.vx = d.vx; pointer.vy = d.vy; pointer.active = d.on; gust = d.gust; calm = d.calm; };
  const rebuild = (d, from) => {
    recTok++; rec = null;
    applyMeasure(d.m);
    const openNow = d.openNow || phase !== 'closed';
    if (openNow) { phase = 'open'; openDur = d.dur || openDur; }
    buildAuto(openNow, d.budget, from);
    chosen[cfg.kind] = cfg.grid;
    if (openNow) { openFired = settledFired = true; openStart = simTime * 1000 - openDur; REST = null; restAt = simTime * 1000 + 2500; }
    ms = 0; slow = 0; wLast = 0;
    self.postMessage({ t: 'built', gen, grid: cfg.grid, load: cfg.tried.join(', '), openNow });
    post();
    if (frozenW) return;
    if (!openNow && d.rec && SETTINGS.rec.enabled) recStart(d.rec);
  };
  const post = () => {
    const p = new Float32Array(P), rx = new Float64Array(2 * cfg.N);
    for (const pn of panels) rx.set(pn.rx, pn.side * cfg.N);
    self.postMessage({ t: 's', gen, P: p, rx, phase, openFired, settledFired, simTime, rest: !!REST, ms }, [p.buffer, rx.buffer]);
  };
  // ЗАПИСЬ ОТКРЫТИЯ. Сразу после сборки закрытых штор поток считает вперёд открытие, покачивание и затухание
  // (60 кадров в секунду записи) пачками по ~12 мс, чтобы успевать отвечать странице, и отправляет кадры
  // (Int16, 1/8 px). Живой расчёт не идёт; после проигрывания (play-end) шторы стоят. Отмена (abort) возвращает
  // ткань в состояние до записи — и открытие идёт вживую, как раньше.
  const recSnap = () => ({ P: P.slice(), O: O.slice(), rx: panels.map((p) => p.rx.slice()), ro: panels.map((p) => p.ro.slice()),
    pin: panels.map((p) => p.rxPin.slice()), mR: mR.slice(), gapD: cfg.gapD.slice(), simTime, acc, phase, openStart, openDur, restAt,
    openFired, settledFired, REST: REST && REST.slice(), lastSC });
  const recRestore = (q) => {
    P.set(q.P); O.set(q.O); mR.set(q.mR); cfg.gapD.set(q.gapD);
    panels.forEach((p, i) => { p.rx.set(q.rx[i]); p.ro.set(q.ro[i]); p.rxPin.set(q.pin[i]); });
    ({ simTime, acc, phase, openStart, openDur, restAt, openFired, settledFired, lastSC } = q); REST = q.REST;
  };
  const recStart = (spec) => {
    const tok = ++recTok, L = P.length, N2 = 2 * cfg.N, CH = 48;
    const S = SETTINGS.rec, openEnd = spec.delay + spec.dur;
    const total = Math.ceil((openEnd + S.sway + S.settle + 400) * 0.06) + 1;   // +0,4 с полного покоя в конце
    const q = Math.max(W, H) > 4000 ? 4 : 8;         // точность записи: 1/8 px (на огромных экранах 1/4)
    rec = { s0: recSnap(), total, done: 0, t0: performance.now(), ready: false };
    openDur = spec.dur; openStart = simTime * 1000 + spec.delay; restAt = openStart + openDur + 3500; phase = 'opening';
    const chunk = () => {
      if (tok !== recTok || !rec) return;
      const t0 = performance.now(), from = rec.done;
      const pb = new Int16Array(CH * L), rb = new Float32Array(CH * N2);
      gust = 0; pointer.active = false;              // запись — без курсора и порывов прокрутки
      let n = 0;
      while (rec.done < total && n < CH && (n === 0 || performance.now() - t0 < 12)) {
        // сквозняк: полный при открытии и sway мс после; потом плавно стихает за settle мс (трение растёт — ткань замирает)
        const tm = rec.done * 1000 / 60 - openEnd - S.sway;
        calm = tm <= 0 ? 1 : 1 - easeInOut(clamp(tm / S.settle, 0, 1));
        if (rec.done > 0) { computeNormals(); simAdvance(1 / 60); }
        const o = n * L;
        for (let i = 0; i < L; i++) { const v = Math.round(P[i] * q); pb[o + i] = v > 32767 ? 32767 : v < -32767 ? -32767 : v; }
        for (const pn of panels) for (let j = 0; j < cfg.N; j++) rb[n * N2 + pn.side * cfg.N + j] = pn.rx[j];
        rec.done++; n++;
      }
      const sec = (performance.now() - rec.t0) / 1000, done = rec.done >= total;
      if (done) rec.ready = true;
      self.postMessage({ t: 'rec', gen, from, n, total, L, N2, q, P: pb, rx: rb, rate: rec.done / Math.max(0.001, sec), done, sec }, [pb.buffer, rb.buffer]);
      if (!done) setTimeout(chunk, 0);
    };
    chunk();
  };
  const recAbort = () => { if (!rec) return; recTok++; recRestore(rec.s0); rec = null; applyIn(); };

  const tick = () => {
    timer = 0;
    if (!on || rec || frozenW) return;
    applyIn();
    const t0 = performance.now();
    const dt = Math.min(0.05, wLast ? (t0 - wLast) / 1000 : 0.016);
    wLast = t0;
    computeNormals();                               // нормали нужны сопротивлению воздуха
    simAdvance(dt);
    post();
    const used = performance.now() - t0;
    ms += (used - ms) * 0.1;
    // Страховка: расчёт стабильно не укладывается в реальное время (устройство оказалось слабее замера, перегрев, фоновые задачи).
    // Три секунды подряд — переходим на сетку попроще. Только пока шторы закрыты (за загрузочным экраном): пересборка
    // укладывает ткань заново, и на открытых шторах это выглядело как стоп, мигание и «перезапуск» физики с начала.
    slow = ms > 15 ? slow + dt : 0;
    if (slow > 3 && phase !== 'closed') { self.postMessage({ t: 'slow', gen, ms }); slow = -1e9; }
    if (slow > 3 && phase === 'closed' && lastBuild) {
      const order = SETTINGS.grids[cfg.kind], next = order[order.indexOf(cfg.grid) + 1];
      if (next) { rebuild(lastBuild, next); }
      slow = 0;
    }
    if (!rec && !frozenW) timer = setTimeout(tick, Math.max(0, 1000 / 60 - used));
  };
  const kick = () => { if (on && !timer && !rec && !frozenW) tick(); };
  self.onmessage = (e) => {
    const d = e.data;
    if (d.t === 'in') { inp = d; if (!rec) applyIn(); }
    else if (d.t === 'run') { on = d.on; wLast = 0; kick(); }
    else if (d.t === 'open') { recAbort(); openDur = d.dur; openStart = simTime * 1000 + d.delay; restAt = openStart + openDur + 3500; phase = 'opening'; kick(); }
    else if (d.t === 'abort') { recAbort(); kick(); }
    else if (d.t === 'play-end') { if (rec && rec.ready) { rec = null; frozenW = true; } }
    else if (d.t === 'build') { gen = d.gen; lastBuild = d; rebuild(d, chosen[d.m.kind]); kick(); }
  };
}
