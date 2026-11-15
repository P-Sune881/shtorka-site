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
   - Курсор и палец мягко отталкивают ткань; после касания штора сама возвращается в свои складки.
   Подключение: <script type="module" src="curtains.js">; app.js вызывает
   window.Curtains.init({ canvas, onOpenStart, onSettled }).
   ========================================================= */
import * as THREE from './vendor/three.min.js';

/* ---------- НАСТРОЙКИ (меняйте свободно) ---------- */
const SETTINGS = {
  color: '#E3D3B9',        // бежевый бархат (тон ткани; фактура берётся из текстуры)
  sheen: '#FFF1DE',        // отлив ворса
  sheenRoughness: 0.42,    // мягкость отлива: меньше — ярче и уже блик
  normalStrength: 0.7,    // глубина фактуры ворса
  textureMeters: 0.42,     // какой кусок ткани (м) покрывает одна плитка текстуры
  metal: '#A99068',        // карниз, кронштейны и кольца — состаренная латунь

  rings:  { desktop: 18, mobile: 11, lite: 9 },   // колец на одно полотно (больше — больше складок)
  rows:   { desktop: 44, mobile: 32, lite: 26 },  // рядов сетки по высоте
  colsPerWave: 4,          // точек сетки на одну складку
  fullness: 2.2,           // «пышность»: ширина ткани / ширина карниза под ней
  stack: { desktop: 0.14, mobile: 0.12 },        // ширина собранной шторы, доля ширины экрана
  stackMin: 40,            // px
  heightMeters: 2.7,       // какой реальной высоте соответствует экран (для гравитации)

  substepHz: 150,          // шагов физики в секунду
  iterations: { desktop: 5, mobile: 5, lite: 4 },
  damping: 0.9993,         // внутреннее трение ткани (на шаг)
  airDrag: 0.011,          // сопротивление воздуха по нормали (на шаг)
  wind: 0.16,              // сквозняк, м/с
  scrollGust: 0.55,        // порыв от быстрой прокрутки, м/с (максимум)
  selfCollision: true,     // ткань не проходит сквозь себя

  openDelay: 350,          // пауза перед открытием, мс
  openDuration: 2600,      // время открытия, мс (повторный заход за сессию — короче)
  pointerRadius: 90,       // радиус «касания» курсором, px
  pointerForce: 0.5,       // сила касания (мягко: 0.3–0.8)
  shapeMemory: 0.0025,     // как быстро ткань возвращается в свои складки после касания
  rodY: 24,                // высота карниза от верха экрана, px
  shadows: true,           // тени складок (на слабых устройствах выключаются сами)
  dprMax: 2,
};

/* ---------- утилиты ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;   // плавный старт и остановка, как рукой
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ASSETS = new URL('./assets/', import.meta.url).href;

/* ---------- состояние ---------- */
let canvas, hero, opts;
let renderer, scene, camera, clothMesh, clothGeo, rodGroup, ringMesh, eyeMesh, hookMesh, wall, keyLight, material;
let W = 0, H = 0, focal = 2400, pxm = 300, G = 3000;
let running = false, visible = true, raf = 0, last = 0, acc = 0, simTime = 0;
let P, O, Wt, Wbase, NOR, FAB, nPart = 0;
let cA, cB, cR, cS, nC = 0;
let mA, mB, mR, mG1, mG2, nM = 0;
let panels = [];
const cfg = {};
let phase = 'closed', openStart = 0, openDur = 2600, openFired = false, settledFired = false;
const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, active: false, t: 0 };
let REST = null, restAt = 0;
let scrollY0 = 0, scrollV = 0, gust = 0;
let hashHead, hashNext;
const dummy = new THREE.Object3D();

/* =========================================================
   ФИЗИКА
   ========================================================= */
function measure() {
  const r = hero.getBoundingClientRect();
  W = Math.round(r.width); H = Math.round(r.height);
  const lite = document.documentElement.classList.contains('lite');
  const mobile = W < 720;
  cfg.kind = lite ? 'lite' : mobile ? 'mobile' : 'desktop';
  cfg.dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : mobile ? 1.75 : SETTINGS.dprMax);
  focal = Math.max(W, H) * 1.9;
  pxm = Math.max(Math.min(H, window.innerHeight * 1.15), 560) / SETTINGS.heightMeters;
  G = 9.81 * pxm;
  cfg.scale = mobile ? 0.72 : 1;
}

function build(openNow) {
  seed = 11;
  const N = SETTINGS.rings[cfg.kind];
  const R = SETTINGS.rows[cfg.kind];
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
  const len = H - top + 4;                                   // до пола
  const dy = (len - header) / (R - 2);
  Object.assign(cfg, { N, R, K, C, rodY, ringR, top, header, sMax, sMin, wave, colW: wave / K, half: wave / 2,
    depthMax: wave * 0.45, hem: len, gapD: new Float32Array(2 * (N - 1)) });

  nPart = 2 * C * R;
  P = new Float32Array(nPart * 3); O = new Float32Array(nPart * 3);
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
  nC = eq.length / 3;
  cA = new Int32Array(nC); cB = new Int32Array(nC); cR = new Float32Array(nC); cS = new Float32Array(nC);
  for (let k = 0; k < nC; k++) {
    const a = eq[k * 3], b = eq[k * 3 + 1];
    cA[k] = a; cB[k] = b; cS[k] = eq[k * 3 + 2];
    cR[k] = Math.hypot(FAB[a * 2] - FAB[b * 2], FAB[a * 2 + 1] - FAB[b * 2 + 1]);   // длина по развёрнутой ткани
  }
  nM = mn.length / 6;
  mA = new Int32Array(nM); mB = new Int32Array(nM); mR = new Float32Array(nM); mG1 = new Int32Array(nM); mG2 = new Int32Array(nM);
  cfg.mRow = new Float32Array(nM); cfg.mMode = new Float32Array(nM);
  for (let k = 0; k < nM; k++) { const q = k * 6; mA[k] = mn[q]; mB[k] = mn[q + 1]; mG1[k] = mn[q + 2]; mG2[k] = mn[q + 3]; cfg.mRow[k] = mn[q + 4] / (R - 1); cfg.mMode[k] = mn[q + 5]; }

  hashHead = new Int32Array(16384); hashNext = new Int32Array(nPart);

  pinHeader();
  const steps = openNow ? 360 : 140;                // ткань «садится» без отрисовки
  for (let s = 0; s < steps; s++) substep(1 / SETTINGS.substepHz, true);
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
  const C = cfg.C;
  computeGapDepth();
  for (const pn of panels) {
    for (let c = 0; c < C; c++) {
      const [x, z] = headerXZ(pn, c);
      for (let r = 0; r < 2; r++) {
        const i = pn.off + r * C + c, y = cfg.top + (r === 0 ? 0 : cfg.header);
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
        O[i * 3] = x; O[i * 3 + 1] = y; O[i * 3 + 2] = z;
      }
    }
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
  pinHeader();

  // складки не слипаются; внизу собранная штора расходится веером
  const cap = cfg.colW * 1.96;
  for (let k = 0; k < nM; k++) {
    const h3 = mG1[k] * 3, g3 = mG2[k] * 3;
    const d0 = Math.hypot(P[g3] - P[h3], P[g3 + 2] - P[h3 + 2]);
    const t = cfg.mRow[k], sm = t * t * (3 - 2 * t), mode = cfg.mMode[k];
    if (mode === 0) mR[k] = Math.min(d0 * 0.85, cap);
    else mR[k] = Math.min(d0 * (1 + (0.04 + 0.7 * (1 - Math.min(1, d0 / cfg.sMax))) * mode * sm), cfg.wave * 0.8);
  }

  // интеграция + воздух (ветер к зрителю)
  const t = simTime;
  const windBase = silent || cfg.still ? 0 : SETTINGS.wind * (0.55 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.83 + 1.3) + 0.2 * Math.sin(t * 1.9 + 0.4));
  const g2 = G * h * h, damp = SETTINGS.damping, drag = SETTINGS.airDrag;
  for (let i = 0; i < nPart; i++) {
    const w = Wt[i];
    if (w === 0) continue;
    const i3 = i * 3;
    let vx = (P[i3] - O[i3]) * damp, vy = (P[i3 + 1] - O[i3 + 1]) * damp, vz = (P[i3 + 2] - O[i3 + 2]) * damp;
    const yN = P[i3 + 1] / H;
    const wz = (windBase * (0.55 + 0.45 * Math.sin(yN * 3.1 + t * 0.6)) + gust) * pxm * h * (0.35 + yN);
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
    for (let i = 0; i < nPart; i++) {
      if (Wt[i] === 0) continue;
      const i3 = i * 3;
      const dx = P[i3] - pointer.x, dy = P[i3 + 1] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2) continue;
      const d = Math.sqrt(d2) || 1, f = 1 - d / R, ff = f * f * (3 - 2 * f);
      P[i3] += (dx / d) * ff * F * 0.5 + bx * ff; P[i3 + 1] += by * ff; P[i3 + 2] -= ff * F;
    }
  }
  // память формы: после касаний ткань медленно возвращается в свои складки
  if (REST && !silent) {
    const k = SETTINGS.shapeMemory;
    for (let i = 0; i < nPart; i++) {
      if (Wt[i] === 0) continue;
      const i3 = i * 3;
      P[i3] += (REST[i3] - P[i3]) * k; P[i3 + 1] += (REST[i3 + 1] - P[i3 + 1]) * k; P[i3 + 2] += (REST[i3 + 2] - P[i3 + 2]) * k;
    }
  }

  // связи
  const iters = SETTINGS.iterations[cfg.kind];
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < nC; k++) {
      const a = cA[k], b = cB[k], wa = Wt[a], wb = Wt[b], ws = wa + wb;
      if (ws === 0) continue;
      const a3 = a * 3, b3 = b * 3;
      const dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1], dz = P[b3 + 2] - P[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-6) continue;
      const s = ((d - cR[k]) / (d * ws)) * cS[k];
      P[a3] += dx * s * wa; P[a3 + 1] += dy * s * wa; P[a3 + 2] += dz * s * wa;
      P[b3] -= dx * s * wb; P[b3 + 1] -= dy * s * wb; P[b3 + 2] -= dz * s * wb;
    }
    for (let k = 0; k < nM; k++) {
      const a = mA[k], b = mB[k], wa = Wt[a], wb = Wt[b], ws = wa + wb;
      if (ws === 0) continue;
      const a3 = a * 3, b3 = b * 3;
      const dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1], dz = P[b3 + 2] - P[a3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= mR[k] || d < 1e-6) continue;
      const s = ((d - mR[k]) / (d * ws)) * 0.35;
      P[a3] += dx * s * wa; P[a3 + 1] += dy * s * wa; P[a3 + 2] += dz * s * wa;
      P[b3] -= dx * s * wb; P[b3 + 1] -= dy * s * wb; P[b3 + 2] -= dz * s * wb;
    }
  }
  const wallZ = -cfg.depthMax * 1.35;
  for (let i = 0; i < nPart; i++) { const z = i * 3 + 2; if (P[z] < wallZ) P[z] = wallZ; }   // стена за шторой
  simTime += h;
}

// самостолкновение: точки, не соседние по сетке, не подходят ближе толщины складки
function selfCollide() {
  const C = cfg.C, R = cfg.R, rad = cfg.colW * 0.6, r2 = rad * rad, inv = 1 / rad;
  hashHead.fill(-1);
  const key = (x, y, z) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & 16383;
  for (let i = 0; i < nPart; i++) {
    const k = key(Math.floor(P[i * 3] * inv), Math.floor(P[i * 3 + 1] * inv), Math.floor(P[i * 3 + 2] * inv));
    hashNext[i] = hashHead[k]; hashHead[k] = i;
  }
  const per = C * R;
  for (let i = 0; i < nPart; i++) {
    if (Wt[i] === 0) continue;
    const i3 = i * 3, cx = Math.floor(P[i3] * inv), cy = Math.floor(P[i3 + 1] * inv), cz = Math.floor(P[i3 + 2] * inv);
    const pi = Math.floor(i / per), ri = Math.floor((i % per) / C), ci = i % C;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
      for (let j = hashHead[key(cx + ox, cy + oy, cz + oz)]; j !== -1; j = hashNext[j]) {
        if (j <= i) continue;
        if (Math.floor(j / per) === pi && Math.abs(Math.floor((j % per) / C) - ri) <= 2 && Math.abs((j % C) - ci) <= 2) continue;
        const j3 = j * 3, dx = P[j3] - P[i3], dy = P[j3 + 1] - P[i3 + 1], dz = P[j3 + 2] - P[i3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2 || d2 < 1e-8) continue;
        const wa = Wt[i], wb = Wt[j], ws = wa + wb;
        if (ws === 0) continue;
        const d = Math.sqrt(d2), s = ((d - rad) / (d * ws)) * 0.5;
        P[i3] += dx * s * wa; P[i3 + 1] += dy * s * wa; P[i3 + 2] += dz * s * wa;
        P[j3] -= dx * s * wb; P[j3 + 1] -= dy * s * wb; P[j3 + 2] -= dz * s * wb;
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
  keyLight = new THREE.DirectionalLight(0xfff1df, 2.9);
  keyLight.castShadow = cfg.shadows;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight, keyLight.target);

  const loader = new THREE.TextureLoader(opts.manager);
  const tex = (name, srgb) => {
    const t = loader.load(ASSETS + 'velvet/' + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(SETTINGS.color),
    map: tex('velvet_detail.jpg', true),
    normalMap: tex('velvet_normal.jpg', false),
    normalScale: new THREE.Vector2(SETTINGS.normalStrength, SETTINGS.normalStrength),
    roughnessMap: tex('velvet_rough.jpg', false),
    roughness: 1, metalness: 0,
    specularIntensity: 0.25,
    sheen: 1, sheenColor: new THREE.Color(SETTINGS.sheen), sheenRoughness: SETTINGS.sheenRoughness,
    side: THREE.DoubleSide,
  });

  new THREE.HDRLoader(opts.manager).load(ASSETS + 'room.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.42;
    hdr.dispose(); pm.dispose();
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

  // стена: только принимает тень от штор
  wall = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.4, H * 1.4), new THREE.ShadowMaterial({ color: 0x3a2a1c, opacity: 0.2 }));
  wall.position.z = -cfg.depthMax * 1.5 - 4;
  wall.receiveShadow = cfg.shadows;
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

function render() {
  computeNormals();
  const pos = clothGeo.attributes.position.array, nor = clothGeo.attributes.normal.array;
  const hx = W / 2, hy = H / 2;
  for (let i = 0; i < nPart; i++) {
    const i3 = i * 3;
    pos[i3] = P[i3] - hx; pos[i3 + 1] = hy - P[i3 + 1]; pos[i3 + 2] = P[i3 + 2];
    nor[i3] = NOR[i3]; nor[i3 + 1] = -NOR[i3 + 1]; nor[i3 + 2] = NOR[i3 + 2];
  }
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
function frame(ts) {
  raf = 0;
  if (!running) return;
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
  last = ts;

  const sy = window.scrollY;                       // порыв от прокрутки
  const v = (sy - scrollY0) / Math.max(dt, 0.001);
  scrollY0 = sy;
  scrollV += (v - scrollV) * 0.2;
  const target = clamp(Math.abs(scrollV) / 1800, 0, 1) * SETTINGS.scrollGust;
  gust += (target - gust) * (target > gust ? 0.12 : 0.03);
  if (performance.now() - pointer.t > 120) { pointer.vx *= 0.8; pointer.vy *= 0.8; }

  const h = 1 / SETTINGS.substepHz;
  acc += dt;
  let n = 0;
  while (acc >= h && n < 5) { substep(h, false); acc -= h; n++; }
  if (n === 5) acc = 0;
  if (SETTINGS.selfCollision && n) selfCollide();

  const now = simTime * 1000;
  if (phase === 'opening' && now >= openStart + openDur) phase = 'open';
  if (phase === 'opening' && !openFired && now > openStart + openDur * 0.32) { openFired = true; opts.onOpenStart?.(); }
  if (!settledFired && phase === 'open' && now > openStart + openDur + 1600) { settledFired = true; opts.onSettled?.(); }
  if (!REST && phase === 'open' && now > restAt) REST = P.slice();   // запоминаем спокойную форму ткани

  render();
  schedule();
}
const schedule = () => { if (running && visible && !document.hidden && !raf) raf = requestAnimationFrame(frame); };

/* ---------- ввод ---------- */
function toLocal(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function bindInput() {
  const move = (e) => {
    const [x, y] = toLocal(e);
    const now = performance.now(), dt = Math.max(8, now - pointer.t) / 1000;
    if (pointer.active) { pointer.vx = (x - pointer.x) / dt; pointer.vy = (y - pointer.y) / dt; }
    pointer.x = x; pointer.y = y; pointer.t = now;
    pointer.active = y > -50 && y < H + 50;
    schedule();
  };
  window.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
}

/* ---------- запуск ---------- */
function init(o) {
  opts = o || {};
  canvas = opts.canvas;
  hero = canvas.closest('section') || canvas.parentElement;
  const fail = (err) => { if (err) console.warn('[curtains]', err); hero.classList.add('curtains-ready', 'curtains-off'); opts.onOpenStart?.(); opts.onSettled?.(); };

  const still = reduce();
  let seen = false;
  try { seen = sessionStorage.getItem('curtains-seen') === '1'; sessionStorage.setItem('curtains-seen', '1'); } catch (e) { /* приватный режим */ }

  cfg.still = still;
  phase = still ? 'open' : 'closed';
  measure();

  // стартуем, когда загрузились текстуры и свет (или через 4 с — без них)
  let started = false;
  const start = () => {
    if (started) return; started = true;
    try { render(); } catch (err) { return fail(err); }
    hero.classList.add('curtains-ready');
    if (still) { REST = P.slice(); openFired = settledFired = true; opts.onOpenStart?.(); opts.onSettled?.(); return; }
    openDur = seen ? 1500 : SETTINGS.openDuration;
    openStart = simTime * 1000 + (seen ? 120 : SETTINGS.openDelay);
    restAt = openStart + openDur + 3500;
    phase = 'opening';
    running = true; last = 0;
    scrollY0 = window.scrollY;
    bindInput();
    schedule();
  };
  opts.manager = new THREE.LoadingManager(start, undefined, () => {});
  try {
    initThree();
    build(still);
    buildScene();
  } catch (err) { return fail(err); }
  setTimeout(start, 4000);

  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) { last = 0; schedule(); } }).observe(hero);
  document.addEventListener('visibilitychange', () => { last = 0; schedule(); });

  // пересборка при заметном изменении размера (не на каждое скрытие адресной строки)
  let rt = 0, w0 = W, h0 = H;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const r = hero.getBoundingClientRect();
      if (Math.abs(r.width - w0) < 40 && Math.abs(r.height - h0) < 160) return;
      w0 = r.width; h0 = r.height;
      const wasOpen = phase !== 'closed';
      if (wasOpen) phase = 'open';
      measure(); build(wasOpen); buildScene();
      if (wasOpen) { openStart = simTime * 1000 - openDur; REST = null; restAt = simTime * 1000 + 2500; }
      if (started) render();
    }, 180);
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; });
}

window.Curtains = { init, settings: SETTINGS };
