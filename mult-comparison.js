#!/usr/bin/env node
/**
 * mult-comparison.js — Comparativa empírica de gain mult
 *
 * Reutiliza sim-harness.js infrastructure parcheando app.js en memoria.
 * Prueba mult=18 (actual), mult=5 (balance), mult=6.6 (sostenible)
 * con 3 semillas x 5 min cada una.
 *
 * Uso: node mult-comparison.js [--duration=5] [--seeds=3]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJ_DIR = path.resolve(__dirname);
const APP_PATH = path.join(PROJ_DIR, 'app.js');

// Parse args
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--(\w+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, true];
  })
);
const DURATION_MIN = parseFloat(args.duration || 5);
const NUM_SEEDS = parseInt(args.seeds || 3, 10);
const SEEDS = [12345, 54321, 98765].slice(0, NUM_SEEDS);
const MULTS = args.mults ? args.mults.split(',').map(Number) : [18, 5, 6.6];

// ─── DOM mock (copied from sim-harness.js) ───────────────────
function createDomMock() {
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
    textContent: '', innerHTML: '', value: '50', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild() {}, removeChild() {}, querySelectorAll: () => [],
    querySelector: () => fakeElement, removeEventListener() {},
    addEventListener() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    scrollWidth: 0, scrollHeight: 0, clientWidth: 800, clientHeight: 600,
    offsetWidth: 800, offsetHeight: 600,
  };
  const canvasIds = new Set(['world', 'graph', 'geneGraph']);
  const documentMock = {
    getElementById: (id) => (canvasIds.has(id) ? fakeCanvas : fakeElement),
    querySelector: () => fakeElement, querySelectorAll: () => [],
    createElement: () => fakeElement, createTextNode: () => fakeElement,
    body: fakeElement, documentElement: fakeElement,
    addEventListener() {}, removeEventListener() {}, readyState: 'complete',
    hidden: false,
  };
  const windowMock = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  };
  return { documentMock, windowMock };
}

// ─── Load app.js with patched mult into sandbox ──────────────
function loadSimPatched(multValue) {
  let src = fs.readFileSync(APP_PATH, 'utf8');

  // Patch the mult value
  const patched = src.replace(
    /const gain = bite \* 18 \* densityFactor;/,
    `const gain = bite * ${multValue} * densityFactor;`
  );
  if (!patched.includes(`bite * ${multValue} * densityFactor`)) {
    throw new Error(`Failed to patch mult=${multValue}`);
  }

  // Inject exports (same as sim-harness.js)
  const exportsCode = `
    globalThis.__sim = {
      simulate, counts, sim, stepProducer, stepMobile, stepProducerField,
      seedWorld, resetWorld, initProducerField, initGrid,
      recordGeneHistory, spawnProducer, spawnConsumer, spawnPredator,
      kill, GROUPS, GROUP_KEYS, GROUP_LABELS, TYPE, PRODUCER, WORLD,
      setSeed, applyThermalDecay,
      rebuildGrid, compactIfNeeded,
      MAX_DT, BASE_DT, GRID_REFRESH_INTERVAL,
    };
  `;
  patched = patched.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');

  if (!patched.includes('globalThis.__sim')) {
    throw new Error('Failed to inject exports');
  }

  const { documentMock, windowMock } = createDomMock();
  const ctx = {
    window: windowMock, document: documentMock,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    Intl, Number, Math, Date, console,
    setTimeout: () => {}, clearTimeout: () => {},
    setInterval: () => {}, clearInterval: () => {},
    Float32Array, Uint8ClampedArray, Map, Set, Array, Object, String, Boolean, JSON, Error,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    globalThis: {}, self: {},
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  vm.runInContext(patched, ctx, { filename: `app-mult-${multValue}.js` });
  if (!ctx.__sim) throw new Error('Failed to extract __sim');
  return ctx.__sim;
}

// ─── Get git hash ────────────────────────────────────────────
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: PROJ_DIR, encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

// ─── Run single seed (simplified from sim-harness.js) ────────
function runSingleSeed(multValue, seed, durationSec, intervalSec = 10, dt = 1/60) {
  const api = loadSimPatched(multValue);

  api.sim.seed = seed >>> 0;
  api.resetWorld();
  api.recordGeneHistory();
  api.sim.migrationTimer = 1e9; // disable migration for controlled comparison

  const MAX_DT = api.MAX_DT || 0.1;
  const GRID_REFRESH_INTERVAL = api.GRID_REFRESH_INTERVAL || 5;
  const chunksPerStep = Math.max(1, Math.ceil(dt / MAX_DT));
  const effectiveDt = Math.min(dt / chunksPerStep, MAX_DT);

  const wallStart = Date.now();
  const metrics = [];
  let lastRecord = -intervalSec;
  let prevBirths = 0;
  let prevDeaths = 0;

  const flowKeys = ['graze', 'colonyFeed', 'prodCGraze', 'predation', 'carcassEat',
    'carcassToField', 'metabolism', 'reproduction', 'excretion', 'thermal', 'carcassExpire'];
  let prevFlow = {};
  for (const k of flowKeys) prevFlow[k] = api.sim.flowAccum[k] || 0;

  function record() {
    const c = api.counts();
    const dtReal = api.sim.time - lastRecord || intervalSec;
    const birthsDelta = api.sim.births - prevBirths;
    const deathsDelta = api.sim.deaths - prevDeaths;
    prevBirths = api.sim.births;
    prevDeaths = api.sim.deaths;

    let producerE = 0, consumerE = 0, predatorE = 0, carcassE = 0;
    const creatures = api.sim.creatures;
    for (let i = 0; i < creatures.length; i++) {
      const e = creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === api.TYPE.PRODUCER) producerE += e.energy || 0;
      else if (e.type === api.TYPE.CONSUMER) consumerE += e.energy || 0;
      else if (e.type === api.TYPE.PREDATOR) predatorE += e.energy || 0;
    }
    const carcasses = api.sim.carcasses;
    for (let i = 0; i < carcasses.length; i++) {
      if (carcasses[i]) carcassE += carcasses[i].energy || 0;
    }

    const fieldE = api.sim.producerField.total || 0;

    // Flow deltas
    const curFlow = {};
    for (const k of flowKeys) curFlow[k] = api.sim.flowAccum[k] || 0;
    const flows = {};
    for (const k of flowKeys) flows[k] = (curFlow[k] - prevFlow[k]) / dtReal;
    prevFlow = curFlow;

    const fieldInput = (flows.graze || 0) + (flows.colonyFeed || 0) + (flows.prodCGraze || 0);
    const mobileLoss = (flows.metabolism || 0) + (flows.thermal || 0);
    const carcassLoss = (flows.carcassExpire || 0);
    const systemNet = fieldInput - mobileLoss - carcassLoss;

    metrics.push({
      t: parseFloat(api.sim.time.toFixed(1)),
      pop: { prodA: parseFloat(c.producerDensity.toFixed(4)), prodB: c.producerB, prodC: c.producerC, cons: c.consumers, pred: c.predators },
      energy: {
        prod: parseFloat(producerE.toFixed(1)),
        cons: parseFloat(consumerE.toFixed(1)),
        pred: parseFloat(predatorE.toFixed(1)),
        field: parseFloat(fieldE.toFixed(1)),
        carcass: parseFloat(carcassE.toFixed(1)),
        total: parseFloat((producerE + consumerE + predatorE + fieldE + carcassE).toFixed(1)),
      },
      rates: { births_s: parseFloat((birthsDelta / dtReal).toFixed(3)), deaths_s: parseFloat((deathsDelta / dtReal).toFixed(3)) },
      flows: {
        graze: parseFloat((flows.graze || 0).toFixed(1)),
        metabolism: parseFloat((flows.metabolism || 0).toFixed(1)),
        predation: parseFloat((flows.predation || 0).toFixed(1)),
        excretion: parseFloat((flows.excretion || 0).toFixed(1)),
        system_net: parseFloat(systemNet.toFixed(1)),
      },
    });
    lastRecord = api.sim.time;
  }

  record();

  while (api.sim.time < durationSec) {
    api.compactIfNeeded();
    api.rebuildGrid();

    for (let chunk = 0; chunk < chunksPerStep; chunk++) {
      api.simulate(effectiveDt);
      if ((chunk + 1) % GRID_REFRESH_INTERVAL === 0 && chunk + 1 < chunksPerStep) {
        api.rebuildGrid();
      }
    }

    api.sim.migrationTimer = 1e9; // keep disabled

    // Thermal decay
    api.sim.thermalAccumulator = (api.sim.thermalAccumulator || 0) + effectiveDt * chunksPerStep;
    if (api.sim.thermalAccumulator >= 5) {
      api.sim.thermalAccumulator = 0;
      api.applyThermalDecay();
    }

    if (api.sim.time - lastRecord >= intervalSec) record();
  }

  record(); // final

  const wallTime = Date.now() - wallStart;
  return {
    seed,
    mult: multValue,
    git_commit: getGitHash(),
    wall_ms: wallTime,
    speed: parseFloat((api.sim.time * 1000 / wallTime).toFixed(1)),
    metrics,
  };
}

// ─── Main ────────────────────────────────────────────────────
function main() {
  const durationSec = DURATION_MIN * 60;
  const allResults = {};

  for (const mult of MULTS) {
    process.stderr.write(`\n=== mult=${mult} ===\n`);
    allResults[`mult_${mult}`] = [];

    for (const seed of SEEDS) {
      process.stderr.write(`  seed ${seed}... `);
      try {
        const result = runSingleSeed(mult, seed, durationSec);
        const m = result.metrics;
        const first = m[0] || {};
        const last = m[m.length - 1] || {};

        const drift = first.energy && first.energy.total > 0
          ? ((last.energy.total - first.energy.total) / first.energy.total * 100).toFixed(1)
          : 'N/A';

        // Average system_net from last 3 samples
        const last3 = m.slice(-3);
        const avgNet = last3.length > 0
          ? (last3.reduce((s, x) => s + (x.flows.system_net || 0), 0) / last3.length).toFixed(1)
          : 'N/A';

        process.stderr.write(`C:${first.pop.cons}->${last.pop.cons} P:${first.pop.pred}->${last.pop.pred} drift:${drift}% NET:${avgNet}E/s\n`);

        allResults[`mult_${mult}`].push({
          seed,
          summary: {
            mult,
            initial: { C: first.pop?.cons, P: first.pop?.pred, prodC: first.pop?.prodC, totalE: first.energy?.total },
            final: { C: last.pop?.cons, P: last.pop?.pred, prodC: last.pop?.prodC, totalE: last.energy?.total },
            driftPct: parseFloat(drift),
            avgNetRate: parseFloat(avgNet),
            birthsTotal: last.rates ? undefined : undefined, // will extract from metrics
            wall_ms: result.wall_ms,
            speed: result.speed,
          },
          metrics: result.metrics,
        });
      } catch (err) {
        process.stderr.write(`ERROR: ${err.message}\n`);
        allResults[`mult_${mult}`].push({ seed, error: err.message });
      }
    }
  }

  // Write results
  const outFile = path.join(PROJ_DIR, 'mult-comparison-results.json');
  fs.writeFileSync(outFile, JSON.stringify(allResults, null, 2));
  process.stderr.write(`\nResults: ${outFile}\n`);

  // Summary table
  const sep = '─'.repeat(100);
  console.log(sep);
  console.log(`COMPARATIVA DE GAIN MULT — ${DURATION_MIN}min x ${SEEDS.length} seeds — migration OFF — ${getGitHash()}`);
  console.log(sep);
  console.log('mult  | seed   | C_init | C_final | P_init | P_final | E_init  | E_final  | drift%  | NET E/s | speed');
  console.log('──────|--------|--------|---------|--------|---------|---------|----------|---------|---------|─────');

  for (const mult of MULTS) {
    const runs = allResults[`mult_${mult}`] || [];
    for (const r of runs) {
      if (r.error) {
        console.log(`${String(mult).padEnd(5)} | ${String(r.seed).padEnd(6)} | ERROR: ${r.error}`);
      } else {
        const s = r.summary;
        const i = s.initial, f = s.final;
        console.log(
          `${String(mult).padEnd(5)} | ${String(r.seed).padEnd(6)} | ${String(i.C).padEnd(6)} | ${String(f.C).padEnd(7)} | ${String(i.P).padEnd(6)} | ${String(f.P).padEnd(7)} | ${String(i.totalE).padEnd(7)} | ${String(f.totalE).padEnd(8)} | ${String(s.driftPct).padEnd(7)} | ${String(s.avgNetRate).padEnd(7)} | ${s.speed}x`
        );
      }
    }
  }

  // Aggregate by mult
  console.log('\n' + sep);
  console.log('AGGREGATE (mean ± stdev)');
  console.log(sep);

  function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
  function std(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); }

  console.log('mult  | C_final_mean±std    | P_final_mean±std    | drift%_mean±std     | NET_mean±std');
  console.log('──────|---------------------|---------------------|---------------------|---------------------');
  for (const mult of MULTS) {
    const runs = (allResults[`mult_${mult}`] || []).filter(r => !r.error);
    if (runs.length === 0) continue;
    const cF = runs.map(r => r.summary.final.C);
    const pF = runs.map(r => r.summary.final.P);
    const drifts = runs.map(r => r.summary.driftPct);
    const nets = runs.map(r => r.summary.avgNetRate);

    console.log(
      `${String(mult).padEnd(5)} | ${mean(cF).toFixed(0)}±${std(cF).toFixed(0)} (${runs.length})`.padEnd(21),
      `| ${mean(pF).toFixed(0)}±${std(pF).toFixed(0)}`.padEnd(21),
      `| ${mean(drifts).toFixed(1)}±${std(drifts).toFixed(1)}`.padEnd(21),
      `| ${mean(nets).toFixed(1)}±${std(nets).toFixed(1)}`
    );
  }

  console.log('\n' + sep);
  console.log('VEREDICTO');
  console.log(sep);
  for (const mult of MULTS) {
    const runs = (allResults[`mult_${mult}`] || []).filter(r => !r.error);
    if (runs.length === 0) { console.log(`mult=${mult}: SIN DATOS`); continue; }
    const drifts = runs.map(r => r.summary.driftPct);
    const avgDrift = mean(drifts);
    const extinctions = runs.filter(r => r.summary.final.C === 0 || r.summary.final.P === 0).length;
    const verdict = avgDrift <= 10 ? 'PASS' : avgDrift <= 50 ? 'WARN' : 'FAIL';
    console.log(`mult=${mult}: drift=${avgDrift.toFixed(1)}% extinctions=${extinctions}/${runs.length} → ${verdict}`);
  }
}

main();
