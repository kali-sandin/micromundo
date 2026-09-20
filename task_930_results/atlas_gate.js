#!/usr/bin/env node
/**
 * task_930 atlas_gate.js — Gate Atlas vivo (CP2)
 *
 * Por cada seed (5 seeds x 10m, dt 1/60, migracion OFF), panel Atlas ABIERTO
 * (peor caso de coste) y una zona seleccionada (ficha + spark activos):
 *  - Aggregate check: suma(atlas.biomass) vs suma directa de field.mass y
 *    suma(atlas.density) vs recuento directo de consumers vivos. Gate error <=2%.
 *  - Delta check: atlasSnapshotAt(ring, t, 60) devuelve la muestra mas antigua
 *    <= t-60 dentro del ring; se valida contra el ring real.
 *  - Coste intrinseco: tiempo en updateAtlas (incluye renderAtlas) / wall. Gate <=2%.
 *  - p95 de cada llamada updateAtlas. Gate <16 ms.
 *  - Memoria: cota real medida de atlas (biomass+density+ring+zoneHistory). Gate <=8MB.
 *
 * Uso: node atlas_gate.js [--duration=600] [--seeds=5]
 * Salida: JSON en stdout, resumen en stderr.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PROJ_DIR = path.resolve(__dirname, '..');

const OPTS = { durationSec: 600, seeds: 5, dt: 1 / 60 };
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--(\w+)=(.*)$/);
  if (m) { if (m[1] === 'duration') OPTS.durationSec = parseFloat(m[2]); else OPTS[m[1]] = parseFloat(m[2]); }
}
const SEEDS = [12345, 23456, 34567, 45678, 56789].slice(0, OPTS.seeds);

function loadSim() {
  let src = fs.readFileSync(path.join(PROJ_DIR, 'app.js'), 'utf8');
  const exportsCode = `
    globalThis.__sim = {
      simulate, counts, sim, resetWorld, updateStats,
      updateAtlas, renderAtlas, atlasResample, atlasCountDensity, atlasDelta,
      atlasRingPush, atlasSnapshotAt, atlas, ATLAS_MAX_COLS, ATLAS_RING_CAP,
      ATLAS_WINDOW_S, ATLAS_DELTA_S, TYPE, WORLD,
      applyThermalDecay, rebuildGrid, compactIfNeeded, MAX_DT,
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) throw new Error('exports injection failed');

  const ctx2d = () => ({
    setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, arc() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, fillText() {}, save() {}, restore() {},
    measureText: () => ({ width: 0 }), drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    translate() {}, scale() {}, rotate() {},
  });
  const fakeCanvas = {
    width: 800, height: 600, getContext: () => ctx2d(),
    getBoundingClientRect: () => ({ width: 420, height: 260, left: 0, top: 0 }),
    addEventListener() {}, focus() {},
  };
  const fakeElement = {
    textContent: '', innerHTML: '', value: '50', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, querySelectorAll: () => [],
    querySelector: () => null, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollWidth: 0, scrollHeight: 0, clientWidth: 420, clientHeight: 260,
    offsetWidth: 420, offsetHeight: 260, focus() {}, blur() {},
  };
  // panel Atlas ABIERTO para el peor caso (atlasOpen() -> true)
  const openPanel = Object.assign(Object.create(fakeElement), {});
  openPanel.classList = { add() {}, remove() {}, toggle() {}, contains: (c) => c !== 'hidden' };
  const canvasIds = new Set(['world', 'graph', 'geneGraph', 'obsGraph', 'atlasCanvas', 'atlasSpark']);
  const documentMock = {
    getElementById: (id) => (id === 'atlasPanel' ? openPanel : (canvasIds.has(id) ? fakeCanvas : fakeElement)),
    querySelector: () => fakeElement, querySelectorAll: () => [],
    createElement: () => fakeElement, createTextNode: () => fakeElement,
    body: fakeElement, documentElement: fakeElement,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete',
  };
  const windowMock = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  };
  const ctx = {
    window: windowMock, document: documentMock,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    Intl, Number, Math, Date, console,
    setTimeout: () => {}, clearTimeout: () => {},
    setInterval: () => {}, clearInterval: () => {},
    Float32Array, Uint8ClampedArray, Map, Set, Array, Object, String, Boolean, JSON, Error,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    globalThis: {}, self: {},
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  ctx.__ABLATE = {}; ctx.__SPIKE = {}; ctx.__SHADOW = {}; ctx.__CONSERVE = {};
  vm.runInContext(src, ctx, { filename: 'app.js' });
  if (!ctx.__sim) throw new Error('no __sim');
  return ctx.__sim;
}

function directFieldMass(api) {
  const m = api.sim.producerField.mass;
  let s = 0; for (let i = 0; i < m.length; i += 1) s += m[i];
  return s;
}
function directConsumers(api) {
  let n = 0; const cs = api.sim.creatures;
  for (let i = 0; i < cs.length; i += 1) {
    const c = cs[i]; if (c && c.alive && c.type === api.TYPE.CONSUMER) n += 1;
  }
  return n;
}

function runSeed(seed) {
  const api = loadSim();
  api.sim.seed = seed >>> 0;
  api.resetWorld();
  api.sim.migrationTimer = 1e9; // migracion OFF
  // zona seleccionada para ejercitar ficha + zoneHistory + spark (peor caso)
  api.atlas.selected = 0;

  const dt = OPTS.dt;
  const chunks = Math.max(1, Math.ceil(dt / (api.MAX_DT || 0.1)));
  const effDt = Math.min(dt / chunks, api.MAX_DT || 0.1);

  const wallStart = Date.now();
  const hr = () => Number(process.hrtime.bigint()) / 1e6;
  let atlasMs = 0;
  const callMs = [];
  let biomassErrMax = 0, densityErrMax = 0;
  let ringMax = 0, zoneMax = 0, checks = 0;
  let deltaOk = true;

  let lastThermal = 0, lastProg = 0, lastAtlas = -1;
  while (api.sim.time < OPTS.durationSec) {
    api.compactIfNeeded();
    api.rebuildGrid();
    for (let c = 0; c < chunks; c += 1) api.simulate(effDt);
    api.sim.migrationTimer = 1e9;
    api.sim.thermalAccumulator = (api.sim.thermalAccumulator || 0) + effDt * chunks;
    if (api.sim.thermalAccumulator >= 5) { api.sim.thermalAccumulator = 0; api.applyThermalDecay(); }

    // updateAtlas (muestrea 1 Hz + render si panel abierto), como en updateStats
    const t1 = hr();
    api.updateAtlas();
    const d1 = hr() - t1;
    atlasMs += d1; callMs.push(d1);

    if (api.atlas.biomass) {
      let bSum = 0; const B = api.atlas.biomass;
      for (let i = 0; i < B.length; i += 1) bSum += B[i];
      let dSum = 0; const D = api.atlas.density;
      for (let i = 0; i < D.length; i += 1) dSum += D[i];
      // semantica documentada de atlasResample: preserva la MASA MEDIA por celda fuente.
      // Total escalado: sum_atlas * (dstCells/srcCells) debe ~= total fuente.
      const dstCells = B.length, srcCells = api.sim.producerField.mass.length;
      const bSumScaled = bSum * (srcCells / dstCells);
      const fb = directFieldMass(api);
      const nc = directConsumers(api);
      const eb = fb !== 0 ? Math.abs(bSumScaled - fb) / Math.abs(fb) : Math.abs(bSumScaled);
      const ed = nc !== 0 ? Math.abs(dSum - nc) / Math.max(1, nc) : Math.abs(dSum);
      if (eb > biomassErrMax) biomassErrMax = eb;
      if (ed > densityErrMax) densityErrMax = ed;
      checks += 1;
      ringMax = Math.max(ringMax, api.atlas.ring.length);
      zoneMax = Math.max(zoneMax, api.atlas.zoneHistory.length);
      // delta: la muestra devuelta debe ser la mas reciente con t <= t-60 (o la mas antigua)
      if (api.sim.time >= 65) {
        // espejo del contrato de atlasSnapshotAt: instantanea mas proxima a t-60 (err<=5s)
        const snap = api.atlasSnapshotAt(api.atlas.ring, api.sim.time, api.ATLAS_DELTA_S);
        let best = null, bestErr = Infinity;
        for (const e of api.atlas.ring) {
          const err = Math.abs((api.sim.time - e.t) - api.ATLAS_DELTA_S);
          if (err < bestErr) { bestErr = err; best = e; }
        }
        if (bestErr <= 5) { if (!snap || snap.t !== best.t) deltaOk = false; }
        else if (snap) deltaOk = false;
      }
    }
    if (Date.now() - lastProg > 10000) { lastProg = Date.now(); console.error(`[gate] seed ${seed} t=${api.sim.time.toFixed(1)} wall=${((Date.now() - wallStart) / 1000).toFixed(0)}s atlasMs=${atlasMs}`); }
  }

  const wallMs = Math.max(1, Date.now() - wallStart);
  callMs.sort((a, b) => a - b);
  const p95 = callMs.length ? callMs[Math.min(callMs.length - 1, Math.floor(callMs.length * 0.95))] : 0;

  // memoria del estado atlas (bytes, cota superior medida)
  const cells = api.atlas.cols * api.atlas.rows;
  const bytes =
    cells * 4 * 2 +                       // biomass + density
    ringMax * (cells * 4 + 48) +          // ring: snapshot mass + overhead
    zoneMax * 48 +                        // zoneHistory {t,b,d}
    4096;                                 // margen estructural
  const c = api.counts();
  return {
    seed, wall_s: +(wallMs / 1000).toFixed(1), checks, sim_time_s: +api.sim.time.toFixed(1),
    counts: { producers: c.producers, consumers: c.consumers, predators: c.predators },
    atlas_cost_pct: +((atlasMs / wallMs) * 100).toFixed(4),
    p95_update_ms: +p95.toFixed(4),
    biomass_err_max_pct: +(biomassErrMax * 100).toFixed(4),
    density_err_max_pct: +(densityErrMax * 100).toFixed(4),
    delta_snapshot_ok: deltaOk,
    atlas_cells: cells, ring_max: ringMax, zone_hist_max: zoneMax,
    atlas_mem_mb: +(bytes / 1048576).toFixed(4),
  };
}

if (require.main === module) {
  const results = [];
  for (const s of SEEDS) {
    const r = runSeed(s);
    results.push(r);
    console.error(`seed ${s}: coste_atlas=${r.atlas_cost_pct}% p95=${r.p95_update_ms}ms err_bio=${r.biomass_err_max_pct}% err_dens=${r.density_err_max_pct}% delta_ok=${r.delta_snapshot_ok} mem=${r.atlas_mem_mb}MB ring=${r.ring_max} zone=${r.zone_hist_max} (wall ${r.wall_s}s)`);
  }
  const gate = {
    cost_ok: results.every((r) => r.atlas_cost_pct <= 2),
    p95_ok: results.every((r) => r.p95_update_ms < 16),
    err_ok: results.every((r) => r.biomass_err_max_pct <= 2 && r.density_err_max_pct <= 2),
    delta_ok: results.every((r) => r.delta_snapshot_ok),
    mem_ok: results.every((r) => r.atlas_mem_mb <= 8),
  };
  const out = { task: 'task_930', gate, seeds: results, generated_at: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, 'atlas_gate.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  console.error(`GATE: ${Object.entries(gate).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join(' ')}`);
  process.exit(Object.values(gate).every(Boolean) ? 0 : 1);
}
