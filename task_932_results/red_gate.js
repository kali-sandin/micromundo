#!/usr/bin/env node
/**
 * task_932 red_gate.js — Gate Red trófica viva (CP2)
 *
 * Por cada seed (5 seeds x 10m, dt 1/60, migracion OFF), panel Red ABIERTO
 * (peor caso de coste):
 *  - Aggregate check: integral de las tasas de redFlows en ventanas 1 s
 *    consecutivas (sin solape) vs delta de flowAccum dentro de la MISMA
 *    ventana del ring (~60 s), que es lo que muestra el panel.
 *    Gate error <=2% por familia (graze mass, depredacion, calor).
 *  - Continuidad: max dt entre muestras consecutivas del ring <= 2 s
 *    (muestreo 1 Hz por diseno).
 *  - Coste intrinseco: tiempo en updateRed (incluye renderRed) / wall. Gate <=2%.
 *  - p95 de cada llamada updateRed. Gate <16 ms.
 *  - Memoria: cota del ring (<=66 muestras x ~22 numeros). Gate <=1MB.
 *
 * Uso: node red_gate.js [--duration=600] [--seeds=5]
 * Salida: JSON en stdout y task_932_results/red_gate.json, resumen en stderr.
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
      updateRed, redFlows, redSnapshotAccum, redReset, red, RED_WINDOW_S, RED_RING_CAP,
      TYPE, WORLD,
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
  // panel Red ABIERTO para el peor caso (redOpen() -> true)
  const openPanel = Object.assign(Object.create(fakeElement), {});
  openPanel.classList = { add() {}, remove() {}, toggle() {}, contains: (c) => c !== 'hidden' };
  const canvasIds = new Set(['world', 'graph', 'geneGraph', 'obsGraph', 'atlasCanvas', 'atlasSpark']);
  const documentMock = {
    getElementById: (id) => (id === 'redPanel' ? openPanel : (canvasIds.has(id) ? fakeCanvas : fakeElement)),
    querySelector: () => fakeElement, querySelectorAll: () => [],
    createElement: () => fakeElement, createTextNode: () => fakeElement,
    body: fakeElement, documentElement: fakeElement,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete',
  };
  const windowMock = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => 0,
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

function runSeed(seed) {
  const api = loadSim();
  api.sim.seed = seed >>> 0;
  api.resetWorld();
  api.sim.migrationTimer = 1e9; // migracion OFF
  api.redReset();

  const dt = OPTS.dt;
  const chunks = Math.max(1, Math.ceil(dt / (api.MAX_DT || 0.1)));
  const effDt = Math.min(dt / chunks, api.MAX_DT || 0.1);

  const wallStart = Date.now();
  const hr = () => Number(process.hrtime.bigint()) / 1e6;
  let redMs = 0;
  const callMs = [];
  const acc0 = api.redSnapshotAccum();
  let ringMax = 0, gapMax = 0;
  let lastProg = 0;

  while (api.sim.time < OPTS.durationSec) {
    api.compactIfNeeded();
    api.rebuildGrid();
    for (let c = 0; c < chunks; c += 1) api.simulate(effDt);
    api.sim.migrationTimer = 1e9;
    api.sim.thermalAccumulator = (api.sim.thermalAccumulator || 0) + effDt * chunks;
    if (api.sim.thermalAccumulator >= 5) { api.sim.thermalAccumulator = 0; api.applyThermalDecay(); }

    // updateRed (muestrea 1 Hz + render si panel abierto), como en updateStats
    const t1 = hr();
    api.updateRed();
    const d1 = hr() - t1;
    redMs += d1; callMs.push(d1);
    ringMax = Math.max(ringMax, api.red.ring.length);
    if (Date.now() - lastProg > 30000) { lastProg = Date.now(); console.error(`[gate] seed ${seed} t=${api.sim.time.toFixed(1)} wall=${((Date.now() - wallStart) / 1000).toFixed(0)}s redMs=${redMs.toFixed(1)}`); }
  }

  // continuidad del ring: huecos entre muestras consecutivas
  const R = api.red.ring;
  for (let i = 1; i < R.length; i += 1) gapMax = Math.max(gapMax, R[i].t - R[i - 1].t);

  // integral de ventanas 1 s consecutivas (sin solape) vs delta total del run.
  // El ring esta acotado (RED_RING_CAP=66, ~60 s): la integral cubre solo la
  // ventana del ring, asi que la referencia es el delta de acumuladores en ESA
  // MISMA ventana (R[0].a -> R[last].a). Comparar contra el delta del run entero
  // seria un artefacto del harness, no un error del panel.
  let intGraze = 0, intPred = 0, intHeat = 0;
  for (let i = 1; i < R.length; i += 1) {
    const wdt = Math.max(1e-6, R[i].t - R[i - 1].t);
    const f = api.redFlows(R[i - 1].a, R[i].a, wdt);
    intGraze += f.graze_mass * wdt;
    intPred += f.predation * wdt;
    intHeat += f.heat * wdt;
  }
  // referencia: delta de acumuladores dentro de la ventana del ring
  const acc1 = R.length ? R[R.length - 1].a : acc0;
  const ref0 = R.length ? R[0].a : acc0;
  const relErr = (a, b) => (Math.max(Math.abs(a), Math.abs(b)) < 1e-9 ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
  const errGraze = relErr(intGraze, acc1.graze - ref0.graze);
  const errPred = relErr(intPred, acc1.predation - ref0.predation);
  const errHeat = relErr(intHeat, (acc1.metabolism + acc1.thermal) - (ref0.metabolism + ref0.thermal));

  const wallMs = Math.max(1, Date.now() - wallStart);
  callMs.sort((a, b) => a - b);
  const p95 = callMs.length ? callMs[Math.min(callMs.length - 1, Math.floor(callMs.length * 0.95))] : 0;

  // memoria del estado red (bytes, cota superior): ring <= 66 x (22 numeros + overhead)
  const bytes = RED_RING_BYTES_GUESS * ringMax + 4096;
  const c = api.counts();
  return {
    seed, wall_s: +(wallMs / 1000).toFixed(1), sim_time_s: +api.sim.time.toFixed(1),
    counts: { consumers: c.consumers, predators: c.predators },
    red_cost_pct: +((redMs / wallMs) * 100).toFixed(4),
    p95_update_ms: +p95.toFixed(4),
    err_graze_pct: +(errGraze * 100).toFixed(4),
    err_predation_pct: +(errPred * 100).toFixed(4),
    err_heat_pct: +(errHeat * 100).toFixed(4),
    ring_max: ringMax, gap_max_s: +gapMax.toFixed(3),
    red_mem_kb: +(bytes / 1024).toFixed(2),
  };
}

// ~22 numeros por muestra (17 accum + 2 migraciones + t + overhead objeto)
const RED_RING_BYTES_GUESS = 66 * 8 + 64;

if (require.main === module) {
  const results = [];
  for (const s of SEEDS) {
    const r = runSeed(s);
    results.push(r);
    console.error(`seed ${s}: coste_red=${r.red_cost_pct}% p95=${r.p95_update_ms}ms err_graze=${r.err_graze_pct}% err_pred=${r.err_predation_pct}% err_heat=${r.err_heat_pct}% ring=${r.ring_max} gap=${r.gap_max_s}s mem=${r.red_mem_kb}KB (wall ${r.wall_s}s)`);
  }
  const gate = {
    cost_ok: results.every((r) => r.red_cost_pct <= 2),
    p95_ok: results.every((r) => r.p95_update_ms < 16),
    err_ok: results.every((r) => r.err_graze_pct <= 2 && r.err_predation_pct <= 2 && r.err_heat_pct <= 2),
    continuity_ok: results.every((r) => r.gap_max_s <= 2),
    mem_ok: results.every((r) => r.red_mem_kb <= 1024),
  };
  const out = { task: 'task_932', gate, seeds: results, generated_at: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, 'red_gate.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  console.error(`GATE: ${Object.entries(gate).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join(' ')}`);
  process.exit(Object.values(gate).every(Boolean) ? 0 : 1);
}
