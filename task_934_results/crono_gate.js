#!/usr/bin/env node
/**
 * task_934 crono_gate.js — Gate Cronología viva
 *
 * 5 seeds x 10 min, dt 1/60, migración OFF, panel Cronología ABIERTO y
 * grabación ON (peor caso de coste):
 *  - Paridad/fidelidad: misma seed OFF vs ON; estado final (poblaciones,
 *    campo, acumuladores de flujo) debe ser IDENTICO (la grabación es de solo
 *    lectura). Gate: delta 0 exacto.
 *  - Continuidad: gap máximo entre muestras del ring <= 2 s; cap <= 606.
 *  - Coste: tiempo en updateCrono (incluye renderCrono) / wall <= 2%.
 *  - p95 por llamada updateCrono < 16 ms.
 *  - Memoria: cota del ring <= 2 MB.
 *
 * Uso: node crono_gate.js [--duration=600] [--seeds=5]
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
      updateCrono, cronoReset, buildCronoJSON, crono, CRONO_RING_CAP,
      TYPE, WORLD, obsSnapshotAccum,
      applyThermalDecay, rebuildGrid, compactIfNeeded, MAX_DT,
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) throw new Error('exports injection failed');

  const fakeElement = {
    textContent: '', innerHTML: '', value: '50', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: (c) => c !== 'hidden' },
    appendChild() {}, removeChild() {}, replaceChildren() {}, querySelectorAll: () => [],
    querySelector: () => null, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollWidth: 0, scrollHeight: 0, clientWidth: 420, clientHeight: 260,
    offsetWidth: 420, offsetHeight: 260, focus() {}, blur() {}, type: '',
    className: '',
  };
  const fakeCanvas = {
    width: 800, height: 600, getContext: () => ({ setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, fillText() {}, save() {}, restore() {}, measureText: () => ({ width: 0 }), drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }), translate() {}, scale() {}, rotate() {} }),
    getBoundingClientRect: () => ({ width: 420, height: 260, left: 0, top: 0 }),
    addEventListener() {}, focus() {},
  };
  const canvasIds = new Set(['world', 'graph', 'geneGraph', 'obsGraph', 'atlasCanvas', 'atlasSpark']);
  const documentMock = {
    getElementById: (id) => (canvasIds.has(id) ? fakeCanvas : fakeElement),
    querySelector: () => fakeElement, querySelectorAll: () => [],
    createElement: () => Object.assign(Object.create(fakeElement), {}),
    createTextNode: () => fakeElement,
    createDocumentFragment: () => Object.assign(Object.create(fakeElement), {}),
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

function finalState(api) {
  const c = api.counts();
  const a = api.obsSnapshotAccum();
  return {
    consumers: c.consumers, predators: c.predators,
    producerB: c.producerB, producerC: c.producerC,
    fieldTotal: +api.sim.producerField.total.toFixed(6),
    time: +api.sim.time.toFixed(6),
    births: api.sim.births, deaths: api.sim.deaths,
    metabolism: +a.metabolism.toFixed(6), graze: +a.graze.toFixed(6),
    predation: +a.predation.toFixed(6), photosynthField: +a.photosynthField.toFixed(6),
  };
}

function runSeed(seed, cronoOn) {
  const api = loadSim();
  api.sim.seed = seed >>> 0;
  api.resetWorld();
  api.sim.migrationTimer = 1e9;
  api.cronoReset();
  api.crono.enabled = cronoOn;

  const dt = OPTS.dt;
  const chunks = Math.max(1, Math.ceil(dt / (api.MAX_DT || 0.1)));
  const effDt = Math.min(dt / chunks, api.MAX_DT || 0.1);
  const hr = () => Number(process.hrtime.bigint()) / 1e6;
  const wallStart = Date.now();
  let cronoMs = 0;
  const callMs = [];
  let ringMax = 0, events = 0, lastProg = 0;

  while (api.sim.time < OPTS.durationSec) {
    api.compactIfNeeded();
    api.rebuildGrid();
    for (let c = 0; c < chunks; c += 1) api.simulate(effDt);
    api.sim.migrationTimer = 1e9;
    api.sim.thermalAccumulator = (api.sim.thermalAccumulator || 0) + effDt * chunks;
    if (api.sim.thermalAccumulator >= 5) { api.sim.thermalAccumulator = 0; api.applyThermalDecay(); }
    const t1 = hr();
    api.updateCrono();
    const d1 = hr() - t1;
    cronoMs += d1; callMs.push(d1);
    ringMax = Math.max(ringMax, api.crono.ring.length);
    events = api.crono.events.length;
    if (Date.now() - lastProg > 30000) { lastProg = Date.now(); console.error(`[gate] seed ${seed} ${cronoOn ? 'ON' : 'OFF'} t=${api.sim.time.toFixed(1)} wall=${((Date.now() - wallStart) / 1000).toFixed(0)}s cronoMs=${cronoMs.toFixed(1)}`); }
  }

  const wallMs = Math.max(1, Date.now() - wallStart);
  callMs.sort((a, b) => a - b);
  const p95 = callMs.length ? callMs[Math.min(callMs.length - 1, Math.floor(callMs.length * 0.95))] : 0;
  const R = api.crono.ring;
  let gapMax = 0;
  for (let i = 1; i < R.length; i += 1) gapMax = Math.max(gapMax, R[i].t - R[i - 1].t);
  // cota de memoria del ring: 606 x (8 numeros + overhead de objeto) bytes
  const memKb = ringMax * (8 * 8 + 64) / 1024;
  return {
    state: finalState(api), wall_s: +(wallMs / 1000).toFixed(1),
    crono: {
      crono_cost_pct: +((cronoMs / wallMs) * 100).toFixed(4),
      p95_update_ms: +p95.toFixed(4),
      ring_max: ringMax, gap_max_s: +gapMax.toFixed(3),
      events, mem_kb: +memKb.toFixed(2),
    }
  };
}

if (require.main === module) {
  const results = [];
  for (const s of SEEDS) {
    const off = runSeed(s, false);
    const on = runSeed(s, true);
    // fidelidad: la grabación es solo lectura => estado final identico
    let parityOk = true; const diffs = [];
    for (const k in off.state) {
      if (off.state[k] !== on.state[k]) { parityOk = false; diffs.push(k + ': ' + off.state[k] + ' vs ' + on.state[k]); }
    }
    const r = {
      seed: s, wall_s: on.wall_s, parity_ok: parityOk,
      parity_diffs: diffs,
      cost_pct: on.crono.crono_cost_pct, p95_ms: on.crono.p95_update_ms,
      ring_max: on.crono.ring_max, gap_max_s: on.crono.gap_max_s,
      events: on.crono.events, mem_kb: on.crono.mem_kb,
    };
    results.push(r);
    console.error(`seed ${s}: parity=${parityOk ? 'OK' : 'FAIL ' + diffs.join('; ')} coste=${r.cost_pct}% p95=${r.p95_ms}ms ring=${r.ring_max} gap=${r.gap_max_s}s events=${r.events} mem=${r.mem_kb}KB (wall ${r.wall_s}s)`);
  }
  const gate = {
    fidelity_ok: results.every((r) => r.parity_ok),
    cost_ok: results.every((r) => r.cost_pct <= 2),
    p95_ok: results.every((r) => r.p95_ms < 16),
    continuity_ok: results.every((r) => r.gap_max_s <= 2),
    mem_ok: results.every((r) => r.mem_kb <= 2048),
  };
  const out = { task: 'task_934', gate, seeds: results, generated_at: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, 'crono_gate.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  console.error(`GATE: ${Object.entries(gate).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join(' ')}`);
  process.exit(Object.values(gate).every(Boolean) ? 0 : 1);
}
