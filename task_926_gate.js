#!/usr/bin/env node
/**
 * task_926_gate.js — Gate Observatorio: agregados del panel vs runtime
 *
 * Por cada seed (5 seeds x 10m, dt 1/60, migracion OFF):
 *  - Ejecuta el loop fiel al navegador llamando updateObservatorY (cadencia updateStats).
 *  - Aggregate check: para cada flujo mostrado, sum(flow_k * dt_i) del historial
 *    vs delta real de sim.flowAccum en la misma ventana. Gate: error relativo <=2%.
 *  - Stock check: stocks del historial (field_biomass, mobile_E, carcass_E) vs
 *    computo independiente directo del estado sim. Gate: error <=2%.
 *  - Coste intrinseco: tiempo total dentro de updateObservatory / wall total. Gate <=2%.
 *
 * Uso: node task_926_gate.js [--duration=600] [--seeds=5]
 * Salida: JSON en stdout, resumen en stderr.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PROJ_DIR = __dirname;

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
      simulate, counts, sim, stepProducer, stepMobile, stepProducerField,
      seedWorld, resetWorld, initProducerField, initGrid,
      recordGeneHistory, spawnProducer, spawnConsumer, spawnPredator,
      kill, GROUPS, GROUP_KEYS, GROUP_LABELS, TYPE, PRODUCER, WORLD,
      setSeed, applyThermalDecay, updateObservatory, observatory, obsReset,
      rebuildGrid, compactIfNeeded,
      MAX_DT, BASE_DT, GRID_REFRESH_INTERVAL,
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) throw new Error('exports injection failed');

  // DOM mock fiel (copiado de sim-harness): panel visible -> renderObservatory corre y el coste medido es el peor caso
  const fakeCanvas = {
    width: 800, height: 600,
    getContext: () => ({
      setTransform() {}, fillRect() {}, clearRect() {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
      beginPath() {}, closePath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, fillText() {},
      measureText: () => ({ width: 0 }), drawImage() {},
    }),
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  };
  const fakeElement = {
    textContent: '', innerHTML: '', value: '50', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, querySelectorAll: () => [],
    querySelector: () => fakeElement, removeEventListener() {}, addEventListener() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollWidth: 0, scrollHeight: 0, clientWidth: 800, clientHeight: 600,
    offsetWidth: 800, offsetHeight: 600,
  };
  const canvasIds = new Set(['world', 'graph', 'geneGraph', 'obsGraph']);
  const documentMock = {
    getElementById: (id) => (canvasIds.has(id) ? fakeCanvas : fakeElement),
    querySelector: () => fakeElement, querySelectorAll: () => [],
    createElement: () => fakeElement, createTextNode: () => fakeElement,
    body: fakeElement, documentElement: fakeElement,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete',
  };
  const windowMock = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
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

const FLOW_KEYS = ['photo_field', 'photo_direct', 'subsidy', 'graze', 'predation',
  'carcass_eat', 'excretion', 'metabolism', 'thermal', 'other_losses'];

function directStocks(api) {
  const m = api.sim.producerField.mass;
  let fm = 0; for (let i = 0; i < m.length; i += 1) fm += m[i];
  let ce = 0;
  const cs = api.sim.carcasses;
  for (let i = 0; i < cs.length; i += 1) ce += cs[i].energy;
  return { field_biomass_mass: fm, mobile_energy_E: api.sim.mobileEnergySum, carcass_energy_E: ce };
}

function runSeed(seed) {
  const api = loadSim();
  api.sim.seed = seed >>> 0;
  api.resetWorld();
  api.sim.migrationTimer = 1e9; // migracion OFF
  const dt = OPTS.dt;
  const chunks = Math.max(1, Math.ceil(dt / (api.MAX_DT || 0.1)));
  const effDt = Math.min(dt / chunks, api.MAX_DT || 0.1);

  const wallStart = Date.now();
  let obsTimeMs = 0;
  const accKeys = ['photosynthField', 'photosynthDirect', 'trophicAmplification', 'graze',
    'predation', 'carcassEat', 'metabolism', 'thermal', 'excretion', 'producerLoss',
    'reproduction', 'birthGain', 'deathDecay', 'carcassExpire'];

  // primera llamada inicializa baseline (lastAccum) sin empujar historial
  const t0 = Date.now(); api.updateObservatory(); obsTimeMs += Date.now() - t0;
  const accumBaseline = {};
  const la = api.observatory.lastAccum || {};
  for (const k of accKeys) accumBaseline[k] = la[k] || 0;
  const baselineT = api.sim.time;

  let lastThermal = 0, lastResync = 0, lastProg = 0;
  while (api.sim.time < OPTS.durationSec) {
    api.compactIfNeeded();
    api.rebuildGrid();
    for (let c = 0; c < chunks; c += 1) api.simulate(effDt);
    api.sim.migrationTimer = 1e9;
    api.sim.thermalAccumulator = (api.sim.thermalAccumulator || 0) + effDt * chunks;
    if (api.sim.thermalAccumulator >= 5) { api.sim.thermalAccumulator = 0; api.applyThermalDecay(); }
    api.sim.energyResyncAccum = (api.sim.energyResyncAccum || 0) + effDt * chunks;
    if (api.sim.energyResyncAccum >= 60) {
      api.sim.energyResyncAccum = 0;
      let rs = 0; const cr = api.sim.creatures;
      for (let i = 0; i < cr.length; i += 1) {
        const e = cr[i]; if (!e || !e.alive) continue;
        if (e.type === api.TYPE.CONSUMER || e.type === api.TYPE.PREDATOR) rs += e.energy;
      }
      api.sim.mobileEnergySum = rs;
    }
    const t1 = Date.now(); api.updateObservatory(); obsTimeMs += Date.now() - t1;
    if (Date.now() - lastProg > 10000) { lastProg = Date.now(); console.error(`[gate] seed ${seed} t=${api.sim.time.toFixed(1)} wall=${((Date.now()-wallStart)/1000).toFixed(0)}s obsMs=${obsTimeMs}`); }
  }

  const wallMs = Date.now() - wallStart;
  const h = api.observatory.history;
  // agregados del historial (integral de flujos) vs delta real de flowAccum
  const flowErr = {};
  const flowReport = {};
  for (const fk of FLOW_KEYS) {
    let observed = 0, prevT = null;
    // flows[k] es tasa por segundo entre muestras: integral = rate * dt_intervalo
    // reconstruimos dt de cada muestra desde lastSampleAt chain via t diffs
    let tPrev = baselineT;
    for (let i = 0; i < h.length; i += 1) {
      const dtI = h[i].t - tPrev; tPrev = h[i].t;
      observed += (h[i].flows[fk] || 0) * dtI;
    }
    // delta real por clave fuente
    const fa = api.sim.flowAccum;
    let expected = 0;
    if (fk === 'photo_field') expected = (fa.photosynthField || 0) - accumBaseline.photosynthField;
    else if (fk === 'photo_direct') expected = (fa.photosynthDirect || 0) - accumBaseline.photosynthDirect;
    else if (fk === 'subsidy') expected = (fa.trophicAmplification || 0) - accumBaseline.trophicAmplification;
    else if (fk === 'graze') expected = (fa.graze || 0) - accumBaseline.graze;
    else if (fk === 'predation') expected = (fa.predation || 0) - accumBaseline.predation;
    else if (fk === 'carcass_eat') expected = (fa.carcassEat || 0) - accumBaseline.carcassEat;
    else if (fk === 'excretion') expected = (fa.excretion || 0) - accumBaseline.excretion;
    else if (fk === 'metabolism') expected = (fa.metabolism || 0) - accumBaseline.metabolism;
    else if (fk === 'thermal') expected = (fa.thermal || 0) - accumBaseline.thermal;
    else if (fk === 'other_losses') {
      const d = (k) => (fa[k] || 0) - (accumBaseline[k] || 0);
      expected = d('producerLoss')
        + Math.max(0, d('reproduction') - d('birthGain'))
        + d('deathDecay') + d('carcassExpire');
    }
    const rel = expected !== 0 ? Math.abs(observed - expected) / Math.abs(expected) : Math.abs(observed);
    flowErr[fk] = rel;
    flowReport[fk] = { observed, expected, rel_err_pct: +(rel * 100).toFixed(4) };
  }

  // stocks: ultima muestra vs computo directo
  const last = h[h.length - 1];
  const ds = directStocks(api);
  const stockErr = {};
  for (const k of Object.keys(ds)) {
    const v = last.stocks[k];
    const rel = Math.abs(v - ds[k]) / Math.max(1e-9, Math.abs(ds[k]));
    stockErr[k] = rel;
  }

  const c = api.counts();
  return {
    seed, wall_s: +(wallMs / 1000).toFixed(1), samples: h.length,
    sim_time_s: +api.sim.time.toFixed(1),
    counts: { producers: c.producers, consumers: c.consumers, predators: c.predators },
    obs_cost_pct: +((obsTimeMs / Math.max(1, wallMs)) * 100).toFixed(4),
    max_flow_rel_err_pct: +Math.max(...Object.values(flowErr)).toFixed(4) * 1,
    max_stock_rel_err_pct: +(Math.max(...Object.values(stockErr)) * 100).toFixed(4),
    flows: flowReport, stock_err_pct: stockErr,
  };
}

if (require.main === module) {
const results = [];
for (const s of SEEDS) {
  const r = runSeed(s);
  results.push(r);
  console.error(`seed ${s}: coste_obs=${r.obs_cost_pct}% err_flujo_max=${r.max_flow_rel_err_pct}% err_stock_max=${r.max_stock_rel_err_pct}% (${r.samples} muestras, wall ${r.wall_s}s)`);
}
const summary = {
  task: 'task_926 gate agregados vs runtime',
  config: { seeds: SEEDS, duration_s: OPTS.durationSec, dt: OPTS.dt, migration: 'off' },
  results,
  gates: {
    flow_err_le_2pct: results.every((r) => r.max_flow_rel_err_pct <= 2),
    stock_err_le_2pct: results.every((r) => r.max_stock_rel_err_pct <= 2),
    cost_le_2pct: results.every((r) => r.obs_cost_pct <= 2),
  },
};
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
console.error('GATES:', JSON.stringify(summary.gates));
}
module.exports = { loadSim, runSeed, FLOW_KEYS, directStocks, OPTS };
