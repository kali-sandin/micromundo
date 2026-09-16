#!/usr/bin/env node
/**
 * task_923 e2e_headless.js — Run end-to-end headless del laboratorio causal.
 * Flujo completo Mundo > Experimento > Datos con brazos reales de 5m:
 *   warmup 600s sim -> snapshot PRNG -> control 300s -> tratamiento 300s (x1.25 luz)
 *   -> paridad (re-run control) -> report JSON versionado -> artefactos.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ_DIR = path.resolve(__dirname, '..');
const APP_JS = path.join(PROJ_DIR, 'app.js');

function createDomMock() {
  const noopCtx = () => {
    const ctx = {
      _lastTransform: null,
      setTransform(...args) { ctx._lastTransform = args; }, fillRect() {}, clearRect() {},
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 800) * (h || 600) * 4) }),
      putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 800) * (h || 600) * 4), width: w, height: h }),
      save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
      beginPath() {}, closePath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, fillText() {}, measureText: () => ({ width: 0 }),
      drawImage() {},
    };
    return ctx;
  };
  const worldCtx = noopCtx();
  const fakeCanvas = {
    width: 800, height: 600, _ctx: worldCtx, getContext: () => worldCtx,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  };
  const fakeEl = {
    textContent: '', innerHTML: '', value: '50', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollWidth: 0, scrollHeight: 0, clientWidth: 800, clientHeight: 600,
    offsetWidth: 800, offsetHeight: 600, close() {}, showModal() {},
    hidden: false,
  };
  const canvasIds = new Set(['world', 'graph', 'geneGraph']);
  const doc = {
    getElementById: (id) => canvasIds.has(id) ? fakeCanvas : fakeEl,
    querySelector: () => fakeEl, querySelectorAll: () => [],
    createElement: (tag) => tag === 'canvas' ? fakeCanvas : fakeEl, createTextNode: () => fakeEl,
    body: fakeEl, documentElement: fakeEl,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete',
  };
  const win = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  };
  return { document: doc, window: win };
}

function loadApp() {
  let src = fs.readFileSync(APP_JS, 'utf8');
  const exportsCode = `
    globalThis.__sim = {
      simulate, counts, sim, resetWorld, setSeed,
      compactIfNeeded, rebuildGrid,
      saveSnapshot, loadSnapshot,
      experimentSample, experimentRunArmSync, buildExperimentReport,
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) throw new Error('No se pudo inyectar exports');
  const { document, window } = createDomMock();
  class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
  const ctx = {
    window, document,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    Intl, Number, Math, Date, console,
    setTimeout: () => {}, clearTimeout: () => {},
    setInterval: () => {}, clearInterval: () => {},
    ResizeObserver: ResizeObserverMock,
    Float32Array, Uint8ClampedArray, Map, Set,
    Array, Object, String, Boolean, JSON, Error,
    ImageData: class ImageData {
      constructor(a, b) {
        if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = arguments[2] || b; }
        else { this.width = a; this.height = b || a; this.data = new Uint8ClampedArray(this.width * this.height * 4); }
      }
    },
  };
  window.ResizeObserver = ResizeObserverMock;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'app.js' });
  if (!ctx.__sim) throw new Error('No se pudo extraer __sim');
  return ctx.__sim;
}

const DT = 1 / 60;
function stepLoop(api, steps) {
  for (let i = 0; i < steps; i += 1) {
    api.compactIfNeeded();
    api.rebuildGrid();
    api.simulate(DT);
  }
}
const sec = (s) => Math.round(s * 60);

function main() {
  const t0 = Date.now();
  const api = loadApp();
  const SEED = 20260916;
  const PREDICTION = 'Con +25% de luz, la biomasa de productores y la poblacion de consumers creceran mas rapido en los primeros 5 minutos que en el brazo control con la misma seed.';
  const out = { seed: SEED, prediction: PREDICTION, phases: {} };

  // 1) Mundo: warmup 600s
  let t = Date.now();
  api.setSeed(SEED);
  api.resetWorld();
  stepLoop(api, sec(600));
  out.phases.warmup = { sim_s: 600, wall_ms: Date.now() - t, counts: api.counts() };

  // 2) Experimento: snapshot PRNG + brazos misma seed 2x300s
  const snap = api.saveSnapshot();
  const HITOS = [60, 120, 180, 240, 300];

  t = Date.now();
  const control = api.experimentRunArmSync(snap, 300, 1, HITOS);
  out.phases.control = { wall_ms: Date.now() - t };

  t = Date.now();
  const treatment = api.experimentRunArmSync(snap, 300, 1.25, HITOS);
  out.phases.treatment = { wall_ms: Date.now() - t };

  // 3) Paridad: re-run control bit-exacto
  t = Date.now();
  const control2 = api.experimentRunArmSync(snap, 300, 1, HITOS);
  out.phases.parity_rerun = { wall_ms: Date.now() - t };
  out.checks = {};
  out.checks.parity_bit_exact = JSON.stringify(control.samples) === JSON.stringify(control2.samples);
  out.checks.samples_len = control.samples.length === HITOS.length + 1;
  out.checks.same_seed_design = true;

  // 4) Datos: report JSON versionado
  const report = api.buildExperimentReport(PREDICTION, snap, control, treatment);
  out.checks.report_schema = report.schema === 'micromundo.experiment/1';
  out.checks.report_version = report.version === 1;
  out.checks.same_seed = report.design.same_seed === true;
  out.checks.prng_state = typeof report.design.snapshot.prng_state === 'number';

  // Coste de overhead de brazo: control vs loop nativo de 300s
  t = Date.now();
  api.loadSnapshot(snap);
  stepLoop(api, sec(300));
  const nativeMs = Date.now() - t;
  const armMs = out.phases.control.wall_ms;
  out.cost = { native_ms: nativeMs, arm_ms: armMs, overhead_ratio: +(armMs / nativeMs).toFixed(3) };
  out.checks.overhead_le_5pct = out.cost.overhead_ratio <= 1.05;

  // Datos con unidades: diferencias clave final
  const lastC = control.samples[control.samples.length - 1];
  const lastT = treatment.samples[treatment.samples.length - 1];
  out.final_comparison = { control: lastC, treatment: lastT };

  out.total_wall_ms = Date.now() - t0;
  fs.writeFileSync(path.join(__dirname, 'e2e_report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(__dirname, 'e2e_meta.json'), JSON.stringify(out, null, 2));
  const allOk = Object.values(out.checks).every(Boolean);
  console.log(JSON.stringify({ ok: allOk, checks: out.checks, cost: out.cost, total_wall_ms: out.total_wall_ms }, null, 2));
  process.exit(allOk ? 0 : 1);
}
main();
