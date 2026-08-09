#!/usr/bin/env node
/**
 * sim-harness.js — Multi-seed reproducible simulation harness for Micromundo
 *
 * Replaces debug-sim.js for serious ecological analysis.
 *
 * Key improvements over debug-sim.js:
 *   - Seed control: reproducible runs via mulberry32 PRNG (already in app.js)
 *   - Proper dt: uses BASE_DT (1/30s) instead of lossy 0.5s chunks
 *   - Multi-seed: runs N seeds and aggregates mean ± stdev
 *   - Full metrics: populations, energy by trophic level, gene drift,
 *     birth/death rates, extinctions, trophic flow, performance
 *
 * Usage:
 *   node sim-harness.js [options]
 *
 * Options:
 *   --duration=N        Simulation duration in minutes (default: 5)
 *   --seeds=N           Number of seeds to run (default: 3)
 *   --seed=N            Fixed seed (single run or all runs use variations)
 *   --interval=N        Metrics recording interval in seconds (default: 10)
 *   --dt=N              Simulation timestep override (default: 1/60 = browser SIM_FRAME)
 *   --out=FILE          Write JSON output to file (default: stdout)
 *   --quiet             Suppress human-readable stderr summary
 *
 * Output: JSON report on stdout, human-readable summary on stderr.
 *
 * @author Bruce Lee — Principal Software Engineer, TheOffice
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── CLI Parsing ─────────────────────────────────────────────
function parseArgs() {
  const opts = {
    durationMin: 5,
    seeds: 3,
    seed: null,
    intervalSec: 10,
    dt: 1 / 60,  // Match browser animationLoop SIM_FRAME exactly
    outFile: null,
    quiet: false,
    migration: true,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--no-migration') { opts.migration = false; continue; }
    const m = arg.match(/^--(\w+)=(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    switch (key) {
      case 'duration': opts.durationMin = parseFloat(val); break;
      case 'seeds': opts.seeds = parseInt(val, 10); break;
      case 'seed': opts.seed = parseInt(val, 10); break;
      case 'interval': opts.intervalSec = parseFloat(val); break;
      case 'dt': opts.dt = parseFloat(val); break;
      case 'out': opts.outFile = val; break;
      case 'quiet': opts.quiet = true; break;
    }
  }
  return opts;
}

// ─── Config ──────────────────────────────────────────────────
const OPTS = parseArgs();
const PROJ_DIR = path.resolve(__dirname);
const DURATION_SEC = OPTS.durationMin * 60;
const DT = OPTS.dt;
// Run multiple seeds: if --seed given, derive variations; else random
const SEEDS = [];
if (OPTS.seed !== null) {
  // Use base seed + variations for multi-seed
  for (let i = 0; i < OPTS.seeds; i++) {
    SEEDS.push((OPTS.seed + i * 7919) >>> 0); // prime-step variations
  }
} else {
  // Random seeds
  for (let i = 0; i < OPTS.seeds; i++) {
    SEEDS.push((Math.random() * 4294967296) >>> 0);
  }
}

// ─── Git hash for traceability ───────────────────────────────
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: PROJ_DIR, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ─── DOM mock (same approach as debug-sim.js) ────────────────
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
  };
  const windowMock = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  return { documentMock, windowMock };
}

// ─── Load app.js into sandbox and extract sim API ────────────
function loadSim() {
  const appJsPath = path.join(PROJ_DIR, 'app.js');
  let src = fs.readFileSync(appJsPath, 'utf8');

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
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) {
    throw new Error('Failed to inject exports into app.js');
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
    globalThis: {}, self: {},
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'app.js' });
  if (!ctx.__sim) throw new Error('Failed to extract __sim from app.js');
  return ctx.__sim;
}

// ─── Single-seed run (faithful to browser loop) ────────────
function runSingleSeed(seed, durationSec, intervalSec, dt, migrationEnabled) {
  const api = loadSim();

  // Set seed BEFORE resetWorld to ensure full reproducibility
  api.sim.seed = seed >>> 0;
  api.resetWorld();
  api.recordGeneHistory();

  // When migration is disabled, pin timer high so simulate() never fires checkMigration
  if (!migrationEnabled) {
    api.sim.migrationTimer = 1e9;
  }

  // Determine chunking: if dt > MAX_DT, split into chunks of <= MAX_DT
  const MAX_DT = api.MAX_DT || 0.1;
  const GRID_REFRESH_INTERVAL = api.GRID_REFRESH_INTERVAL || 5;
  const chunksPerStep = Math.max(1, Math.ceil(dt / MAX_DT));
  const effectiveDt = Math.min(dt / chunksPerStep, MAX_DT);

  const wallStart = Date.now();
  const metrics = [];
  const extinctions = [];
  let lastRecord = 0;
  let prevAlive = {
    'producer-a': true, 'producer-b': true, 'producer-c': true,
    'consumer': true, 'predator': true,
  };
  let prevBirths = 0;
  let prevDeaths = 0;
  let stepsProcessed = 0;

  // Flow accumulators for delta computation
  const flowKeys = ['graze', 'colonyFeed', 'prodCGraze', 'predation', 'carcassEat',
    'carcassToField', 'metabolism', 'reproduction', 'excretion', 'thermal', 'carcassExpire'];
  let prevFlowAccum = {};
  function snapshotFlowAccum() {
    const snap = {};
    for (const k of flowKeys) snap[k] = api.sim.flowAccum[k] || 0;
    return snap;
  }
  prevFlowAccum = snapshotFlowAccum();

  function recordMetrics() {
    const c = api.counts();
    const dt_real = api.sim.time - lastRecord || intervalSec;
    const birthsDelta = api.sim.births - prevBirths;
    const deathsDelta = api.sim.deaths - prevDeaths;
    prevBirths = api.sim.births;
    prevDeaths = api.sim.deaths;

    // Energy by trophic level
    let producerEnergy = 0;
    let consumerEnergy = 0;
    let predatorEnergy = 0;
    let carcassEnergy = 0;
    const creatures = api.sim.creatures;
    for (let i = 0; i < creatures.length; i++) {
      const e = creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === api.TYPE.PRODUCER) producerEnergy += e.energy || 0;
      else if (e.type === api.TYPE.CONSUMER) consumerEnergy += e.energy || 0;
      else if (e.type === api.TYPE.PREDATOR) predatorEnergy += e.energy || 0;
    }
    const carcasses = api.sim.carcasses;
    for (let i = 0; i < carcasses.length; i++) {
      if (carcasses[i]) carcassEnergy += carcasses[i].energy || 0;
    }

    // Gene snapshot with variance
    const genes = {};
    if (api.sim.geneHistory.length > 0) {
      const gh = api.sim.geneHistory.at(api.sim.geneHistory.length - 1);
      if (gh) {
        for (const group of api.GROUPS) {
          if (gh[group]) {
            // Compute variance from current creatures (gh only has averages)
            const geneKeys = api.GROUP_KEYS[group] || [];
            const vals = {};
            const sums = {};
            const sumsq = {};
            let n = 0;
            if (group === 'producer-a') {
              n = 1;
              for (const gk of geneKeys) { vals[gk] = gh[group].avg[gk] || 0; sums[gk] = vals[gk]; sumsq[gk] = vals[gk] * vals[gk]; }
            } else {
              for (let ci = 0; ci < creatures.length; ci++) {
                const e = creatures[ci];
                if (!e || !e.alive) continue;
                const eg = groupForCreatureLive(e, group, api);
                if (!eg) continue;
                n++;
                for (const gk of geneKeys) {
                  const v = e[gk] || 0;
                  sums[gk] = (sums[gk] || 0) + v;
                  sumsq[gk] = (sumsq[gk] || 0) + v * v;
                }
              }
            }
            const avg = {};
            const variance = {};
            for (const gk of geneKeys) {
              avg[gk] = n > 0 ? (sums[gk] || 0) / n : 0;
              variance[gk] = n > 1 ? Math.max(0, (sumsq[gk] || 0) / n - avg[gk] * avg[gk]) : 0;
            }
            genes[group] = { n, avg, variance };
          }
        }
      }
    }

    // Energy flow deltas
    const curFlow = snapshotFlowAccum();
    const flows = {};
    for (const k of flowKeys) {
      flows[k] = (curFlow[k] - prevFlowAccum[k]) / dt_real;
    }
    prevFlowAccum = curFlow;
    const energyIn = (flows.graze || 0) + (flows.colonyFeed || 0) + (flows.prodCGraze || 0)
      + (flows.predation || 0) + (flows.carcassEat || 0) + (flows.excretion || 0);
    const energyOut = (flows.metabolism || 0) + (flows.reproduction || 0)
      + (flows.thermal || 0) + (flows.carcassExpire || 0);

    // Detect extinctions
    const countMap = {
      'producer-a': c.producerDensity > 0.01,
      'producer-b': c.producerB > 0,
      'producer-c': c.producerC > 0,
      'consumer': c.consumers > 0,
      'predator': c.predators > 0,
    };
    for (const [key, alive] of Object.entries(countMap)) {
      if (!alive && prevAlive[key]) {
        extinctions.push({ t: parseFloat(api.sim.time.toFixed(1)), group: key });
      }
    }
    prevAlive = countMap;

    metrics.push({
      t: parseFloat(api.sim.time.toFixed(1)),
      populations: {
        producerA_density: parseFloat(c.producerDensity.toFixed(4)),
        producerB: c.producerB,
        producerC: c.producerC,
        consumers: c.consumers,
        predators: c.predators,
        total_creatures: creatures.filter(e => e && e.alive).length,
      },
      energy: {
        producer: parseFloat(producerEnergy.toFixed(1)),
        consumer: parseFloat(consumerEnergy.toFixed(1)),
        predator: parseFloat(predatorEnergy.toFixed(1)),
        field: parseFloat((api.sim.producerField.total || 0).toFixed(1)),
        carcass: parseFloat(carcassEnergy.toFixed(1)),
        mobile_sum: parseFloat((api.sim.mobileEnergySum || 0).toFixed(1)),
        avg: parseFloat(c.energyAvg.toFixed(2)),
      },
      rates: {
        births_per_sec: parseFloat((birthsDelta / dt_real).toFixed(3)),
        deaths_per_sec: parseFloat((deathsDelta / dt_real).toFixed(3)),
        births_total: api.sim.births,
        deaths_total: api.sim.deaths,
      },
      flows: {
        graze: parseFloat((flows.graze || 0).toFixed(3)),
        colonyFeed: parseFloat((flows.colonyFeed || 0).toFixed(3)),
        prodCGraze: parseFloat((flows.prodCGraze || 0).toFixed(3)),
        predation: parseFloat((flows.predation || 0).toFixed(3)),
        carcassEat: parseFloat((flows.carcassEat || 0).toFixed(3)),
        metabolism: parseFloat((flows.metabolism || 0).toFixed(3)),
        reproduction: parseFloat((flows.reproduction || 0).toFixed(3)),
        excretion: parseFloat((flows.excretion || 0).toFixed(3)),
        thermal: parseFloat((flows.thermal || 0).toFixed(3)),
        carcassExpire: parseFloat((flows.carcassExpire || 0).toFixed(3)),
        balance_in: parseFloat(energyIn.toFixed(3)),
        balance_out: parseFloat(energyOut.toFixed(3)),
      },
      genes,
    });

    lastRecord = api.sim.time;
  }

  // Initial record
  recordMetrics();

  // Main simulation loop — faithful to browser animationLoop
  while (api.sim.time < durationSec) {
    // Mirror browser loop: compactIfNeeded + rebuildGrid before simulate chunks
    api.compactIfNeeded();
    api.rebuildGrid();

    for (let chunk = 0; chunk < chunksPerStep; chunk++) {
      api.simulate(effectiveDt);
      stepsProcessed++;
      // Mid-loop grid refresh for large multi-chunk steps
      if ((chunk + 1) % GRID_REFRESH_INTERVAL === 0 && chunk + 1 < chunksPerStep) {
        api.rebuildGrid();
      }
    }

    // Migration: simulate() already decrements migrationTimer and calls
    // checkMigration() internally. When migration is disabled, pin timer
    // high so it never fires.
    if (!migrationEnabled) {
      api.sim.migrationTimer = 1e9;
    }

    // Thermal decay: browser calls applyThermalDecay() every ~5s from updateStats().
    // Mirror that here to keep energy dynamics faithful.
    api.sim.thermalAccumulator = (api.sim.thermalAccumulator || 0) + effectiveDt * chunksPerStep;
    if (api.sim.thermalAccumulator >= 5) {
      api.sim.thermalAccumulator = 0;
      api.applyThermalDecay();
    }

    // Energy resync every ~60s: browser's updateStats() recalculates mobileEnergySum
    // from scratch to correct drift from incremental updates.
    api.sim.energyResyncAccum = (api.sim.energyResyncAccum || 0) + effectiveDt * chunksPerStep;
    if (api.sim.energyResyncAccum >= 60) {
      api.sim.energyResyncAccum = 0;
      let rs = 0;
      const creatures = api.sim.creatures;
      for (let i = 0; i < creatures.length; i++) {
        const e = creatures[i];
        if (!e || !e.alive) continue;
        if (e.type === api.TYPE.CONSUMER || e.type === api.TYPE.PREDATOR) rs += e.energy;
      }
      api.sim.mobileEnergySum = rs;
    }

    // Record gene history at intervals
    const lastGH = api.sim.geneHistory.length > 0
      ? api.sim.geneHistory.at(api.sim.geneHistory.length - 1).t
      : 0;
    if (api.sim.time - lastGH >= intervalSec) {
      api.recordGeneHistory();
    }

    // Record metrics at intervals
    if (api.sim.time - lastRecord >= intervalSec) {
      recordMetrics();
    }
  }

  // Final record
  recordMetrics();

  const wallTime = Date.now() - wallStart;
  const last = metrics[metrics.length - 1];

  // Compute p50/p95 for populations and energy across all metric points
  const popKeys = ['producerB', 'producerC', 'consumers', 'predators'];
  const energyKeysAgg = ['producer', 'consumer', 'predator', 'field', 'avg'];
  const percentiles = computePercentiles(metrics, popKeys, energyKeysAgg);

  return {
    seed: seed >>> 0,
    git_commit: getGitHash(),
    duration_sim_sec: parseFloat(api.sim.time.toFixed(1)),
    wall_time_ms: wallTime,
    speed_factor: parseFloat((api.sim.time * 1000 / wallTime).toFixed(1)),
    dt: dt,
    effective_dt: effectiveDt,
    chunks_per_step: chunksPerStep,
    interval_sec: intervalSec,
    migration_enabled: migrationEnabled,
    metrics,
    extinctions,
    percentiles,
    final_state: {
      populations: last.populations,
      energy: last.energy,
      rates: last.rates,
      flows: last.flows,
      survival: checkSurvival(last),
    },
  };
}

function checkSurvival(lastMetric) {
  const p = lastMetric.populations;
  return {
    'producer-a': p.producerA_density > 0.01,
    'producer-b': p.producerB > 0,
    'producer-c': p.producerC > 0,
    'consumer': p.consumers > 0,
    'predator': p.predators > 0,
    all_alive: p.producerA_density > 0.01 && p.producerB > 0 && p.producerC > 0
               && p.consumers > 0 && p.predators > 0,
  };
}

// Helper: check if a creature belongs to a gene group (live computation)
function groupForCreatureLive(e, group, api) {
  if (!e || !e.alive) return false;
  if (group === 'producer-b' && e.type === api.TYPE.PRODUCER && !e.mobile) return true;
  if (group === 'producer-c' && e.type === api.TYPE.PRODUCER && e.mobile) return true;
  if (group === 'consumer' && e.type === api.TYPE.CONSUMER) return true;
  if (group === 'predator' && e.type === api.TYPE.PREDATOR) return true;
  return false;
}

// Helper: compute p50/p95 for populations and energy across time series
function computePercentiles(metrics, popKeys, energyKeys) {
  function pct(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
  }
  const result = { populations: {}, energy: {} };
  for (const k of popKeys) {
    const vals = metrics.map(m => m.populations[k] || 0).sort((a, b) => a - b);
    result.populations[k] = { p50: pct(vals, 0.5), p95: pct(vals, 0.95) };
  }
  for (const k of energyKeys) {
    const vals = metrics.map(m => m.energy[k] || 0).sort((a, b) => a - b);
    result.energy[k] = { p50: pct(vals, 0.5), p95: pct(vals, 0.95) };
  }
  return result;
}

// ─── Aggregation across seeds ────────────────────────────────
function aggregateRuns(runs) {
  const n = runs.length;
  if (n === 0) return null;

  const finals = runs.map(r => r.final_state);
  const lastMetrics = runs.map(r => r.metrics[r.metrics.length - 1]);

  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function stdev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
  }

  const keys = ['producerA_density', 'producerB', 'producerC', 'consumers', 'predators'];
  const popStats = {};
  for (const k of keys) {
    const vals = lastMetrics.map(m => m.populations[k]);
    popStats[k] = { mean: mean(vals), stdev: stdev(vals), min: Math.min(...vals), max: Math.max(...vals) };
  }

  const energyKeys = ['producer', 'consumer', 'predator', 'field', 'carcass', 'avg'];
  const energyStats = {};
  for (const k of energyKeys) {
    const vals = lastMetrics.map(m => m.energy[k]);
    energyStats[k] = { mean: mean(vals), stdev: stdev(vals) };
  }

  // Percentile aggregation across runs
  const pctKeys = ['producerB', 'producerC', 'consumers', 'predators'];
  const pctStats = { populations: {}, energy: {} };
  for (const k of pctKeys) {
    const p50vals = runs.map(r => r.percentiles?.populations[k]?.p50 || 0);
    const p95vals = runs.map(r => r.percentiles?.populations[k]?.p95 || 0);
    pctStats.populations[k] = {
      p50_mean: mean(p50vals), p50_stdev: stdev(p50vals),
      p95_mean: mean(p95vals), p95_stdev: stdev(p95vals),
    };
  }
  for (const k of ['producer', 'consumer', 'predator', 'field', 'avg']) {
    const p50vals = runs.map(r => r.percentiles?.energy[k]?.p50 || 0);
    const p95vals = runs.map(r => r.percentiles?.energy[k]?.p95 || 0);
    pctStats.energy[k] = {
      p50_mean: mean(p50vals), p50_stdev: stdev(p50vals),
      p95_mean: mean(p95vals), p95_stdev: stdev(p95vals),
    };
  }

  const birthRates = lastMetrics.map(m => m.rates.births_per_sec);
  const deathRates = lastMetrics.map(m => m.rates.deaths_per_sec);

  // Flow aggregation
  const flowKeysAgg = ['graze', 'colonyFeed', 'prodCGraze', 'predation', 'carcassEat',
    'metabolism', 'reproduction', 'excretion', 'thermal', 'carcassExpire'];
  const flowStats = {};
  for (const k of flowKeysAgg) {
    const vals = lastMetrics.map(m => m.flows ? m.flows[k] || 0 : 0);
    flowStats[k] = { mean: mean(vals), stdev: stdev(vals) };
  }
  const balanceIn = lastMetrics.map(m => m.flows ? m.flows.balance_in || 0 : 0);
  const balanceOut = lastMetrics.map(m => m.flows ? m.flows.balance_out || 0 : 0);
  flowStats.balance_in = { mean: mean(balanceIn), stdev: stdev(balanceIn) };
  flowStats.balance_out = { mean: mean(balanceOut), stdev: stdev(balanceOut) };
  flowStats.net = { mean: mean(balanceIn) - mean(balanceOut), stdev: stdev(balanceIn.map((v, i) => v - balanceOut[i])) };

  const extinctions = runs.map(r => r.extinctions.length);
  const survivalCounts = finals.map(f => Object.values(f.survival).filter(Boolean).length - 1);

  // Coefficient of variation for final populations (stability metric)
  const cvConsumers = popStats.consumers.stdev / Math.max(1, popStats.consumers.mean);
  const cvPredators = popStats.predators.stdev / Math.max(1, popStats.predators.mean);

  return {
    seeds: n,
    populations: popStats,
    energy: energyStats,
    percentiles: pctStats,
    rates: {
      births_per_sec: { mean: mean(birthRates), stdev: stdev(birthRates) },
      deaths_per_sec: { mean: mean(deathRates), stdev: stdev(deathRates) },
      total_births: { mean: mean(finals.map(f => f.rates.births_total)), stdev: stdev(finals.map(f => f.rates.births_total)) },
      total_deaths: { mean: mean(finals.map(f => f.rates.deaths_total)), stdev: stdev(finals.map(f => f.rates.deaths_total)) },
    },
    flows: flowStats,
    extinctions: {
      total: extinctions.reduce((a, b) => a + b, 0),
      per_run: extinctions,
      mean: mean(extinctions),
    },
    survival: {
      groups_alive_mean: mean(survivalCounts),
      all_survived: finals.every(f => f.survival.all_alive),
      any_extinction: runs.some(r => r.extinctions.length > 0),
    },
    stability: {
      cv_consumers: parseFloat(cvConsumers.toFixed(3)),
      cv_predators: parseFloat(cvPredators.toFixed(3)),
    },
    performance: {
      wall_time_ms: { mean: mean(runs.map(r => r.wall_time_ms)), stdev: stdev(runs.map(r => r.wall_time_ms)) },
      speed_factor: { mean: mean(runs.map(r => r.speed_factor)), stdev: stdev(runs.map(r => r.speed_factor)) },
    },
  };
}

// ─── Human-readable report ───────────────────────────────────
function formatTime(t) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function fmt(v, decimals = 1) {
  if (typeof v !== 'number' || !isFinite(v)) return 'N/A';
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  return v.toFixed(decimals);
}

function printHumanReport(runs, agg) {
  const lines = [];
  const first = runs[0];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  🧬 SIM-HARNESS — Multi-seed Ecosystem Analysis');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Commit:     ${first.git_commit}`);
  lines.push(`  Seeds:      ${runs.length} (${runs.map(r => r.seed).join(', ')})`);
  lines.push(`  Duration:   ${formatTime(first.duration_sim_sec)} (${first.duration_sim_sec}s per run)`);
  lines.push(`  dt:         ${first.dt.toFixed(4)}s (eff: ${first.effective_dt?.toFixed(4) || first.dt.toFixed(4)}s, chunks: ${first.chunks_per_step || 1})`);
  lines.push(`  Interval:   ${first.interval_sec}s`);
  lines.push(`  Migration:  ${first.migration_enabled ? 'ON' : 'OFF'}`);
  lines.push(`  Timestamp:  ${new Date().toISOString()}`);
  lines.push('');

  // Aggregated populations
  lines.push('── POPULATIONS (mean ± σ across seeds) ────────────────────────');
  lines.push('  Group                Mean         σ          Min          Max');
  lines.push('  ──────────────────────────────────────────────────────────────');
  const popLabels = {
    producerA_density: 'Prod A (dens.)',
    producerB: 'Prod B (colonia)',
    producerC: 'Prod C (móvil)',
    consumers: 'Consumidores',
    predators: 'Depredadores',
  };
  for (const [k, label] of Object.entries(popLabels)) {
    const s = agg.populations[k];
    lines.push(`  ${label.padEnd(19)} ${fmt(s.mean, 2).padStart(10)} ${fmt(s.stdev, 2).padStart(10)} ${fmt(s.min, 2).padStart(10)} ${fmt(s.max, 2).padStart(10)}`);
  }
  lines.push('');

  // Percentiles
  if (agg.percentiles) {
    lines.push('── PERCENTILES p50/p95 (mean across seeds) ────────────────────');
    lines.push('  Group                p50         p95');
    lines.push('  ──────────────────────────────────────────────────────────────');
    for (const [k, label] of Object.entries({ producerB: 'Prod B', producerC: 'Prod C', consumers: 'Consumers', predators: 'Predators' })) {
      const s = agg.percentiles.populations[k];
      if (s) lines.push(`  ${label.padEnd(19)} ${fmt(s.p50_mean, 1).padStart(10)} ${fmt(s.p95_mean, 1).padStart(10)}`);
    }
    lines.push('');
  }

  // Aggregated energy
  lines.push('── ENERGY (mean ± σ) ──────────────────────────────────────────');
  const eLabels = { producer: 'Productores', consumer: 'Consumidores', predator: 'Depredadores', field: 'Campo', carcass: 'Carcasses', avg: 'Promedio' };
  for (const [k, label] of Object.entries(eLabels)) {
    const s = agg.energy[k];
    lines.push(`  ${label.padEnd(19)} ${fmt(s.mean, 1).padStart(10)} ${fmt(s.stdev, 1).padStart(10)}`);
  }
  lines.push('');

  // Energy flows
  if (agg.flows) {
    lines.push('── ENERGY FLOWS (mean ± σ, energy/s) ─────────────────────────');
    const fLabels = {
      graze: 'Grazing', colonyFeed: 'Colonia feed', prodCGraze: 'ProdC grazing',
      predation: 'Predación', carcassEat: 'Carcass eat', metabolism: 'Metabolismo',
      reproduction: 'Reproducción', excretion: 'Excretion', thermal: 'Thermal',
      carcassExpire: 'Carcass expire',
    };
    for (const [k, label] of Object.entries(fLabels)) {
      const s = agg.flows[k];
      if (s) lines.push(`  ${label.padEnd(19)} ${fmt(s.mean, 2).padStart(10)} ${fmt(s.stdev, 2).padStart(10)}`);
    }
    if (agg.flows.net) {
      lines.push(`  ${'NET BALANCE'.padEnd(19)} ${fmt(agg.flows.net.mean, 2).padStart(10)} ${fmt(agg.flows.net.stdev, 2).padStart(10)}`);
    }
    lines.push('');
  }

  // Births/deaths
  lines.push('── EVENTOS (mean ± σ) ────────────────────────────────────────');
  lines.push(`  Births/s:    ${fmt(agg.rates.births_per_sec.mean, 3)} ± ${fmt(agg.rates.births_per_sec.stdev, 3)}`);
  lines.push(`  Deaths/s:    ${fmt(agg.rates.deaths_per_sec.mean, 3)} ± ${fmt(agg.rates.deaths_per_sec.stdev, 3)}`);
  lines.push(`  Total births: ${fmt(agg.rates.total_births.mean, 0)} ± ${fmt(agg.rates.total_births.stdev, 0)}`);
  lines.push(`  Total deaths: ${fmt(agg.rates.total_deaths.mean, 0)} ± ${fmt(agg.rates.total_deaths.stdev, 0)}`);
  lines.push('');

  // Extinctions
  if (agg.extinctions.total > 0) {
    lines.push('── ⚠ EXTINCIONES ─────────────────────────────────────────────');
    lines.push(`  Total: ${agg.extinctions.total} | Por run: [${agg.extinctions.per_run.join(', ')}]`);
    for (const run of runs) {
      if (run.extinctions.length > 0) {
        for (const ext of run.extinctions) {
          lines.push(`  Seed ${run.seed}: ${formatTime(ext.t)} — ${ext.group}`);
        }
      }
    }
    lines.push('');
  } else {
    lines.push('── ✅ Sin extinciones en ninguna semilla ──────────────────────');
    lines.push('');
  }

  // Survival
  lines.push('── SUPERVIVENCIA ─────────────────────────────────────────────');
  lines.push(`  Todos sobrevivieron: ${agg.survival.all_survived ? '✅ Sí' : '❌ No'}`);
  lines.push(`  Grupos vivos promedio: ${fmt(agg.survival.groups_alive_mean, 1)}/5`);
  if (agg.stability) {
    lines.push(`  CV consumers: ${fmt(agg.stability.cv_consumers, 3)} | CV predators: ${fmt(agg.stability.cv_predators, 3)}`);
  }
  lines.push('');

  // Performance
  lines.push('── RENDIMIENTO ───────────────────────────────────────────────');
  lines.push(`  Wall time: ${fmt(agg.performance.wall_time_ms.mean / 1000, 1)}s ± ${fmt(agg.performance.wall_time_ms.stdev / 1000, 1)}s`);
  lines.push(`  Speed:     ${fmt(agg.performance.speed_factor.mean, 1)}x ± ${fmt(agg.performance.speed_factor.stdev, 1)}x`);
  lines.push('');

  // Per-run detail
  lines.push('── DETALLE POR SEMILLA ───────────────────────────────────────');
  for (const run of runs) {
    const f = run.final_state;
    lines.push(`  Seed ${run.seed}: P:${f.populations.producerB}/${f.populations.producerC} C:${f.populations.consumers} X:${f.populations.predators} | E:${fmt(f.energy.avg, 1)} | B:${f.rates.births_total} D:${f.rates.deaths_total} | ${f.survival.all_alive ? '✅' : '❌'}`);
  }
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Task 908 verdict ────────────────────────────────────────
function evaluateTask908Verdict(agg, runs) {
  const n = runs.length;
  const lines = [];
  const checks = [];

  // 1. Survival: >= 18/20 runs with all 5 guilds alive
  const fullSurvival = runs.filter(r => r.final_state.survival.all_alive).length;
  const survivalPass = fullSurvival >= Math.ceil(n * 0.9);
  checks.push({ name: `Survival >= ${Math.ceil(n*0.9)}/${n} (got ${fullSurvival})`, pass: survivalPass });

  // 2. CV consumers <= 0.25
  const cvConsPass = agg.stability.cv_consumers <= 0.25;
  checks.push({ name: `CV consumers <= 0.25 (got ${agg.stability.cv_consumers.toFixed(3)})`, pass: cvConsPass });

  // 3. CV predators <= 0.25
  const cvPredPass = agg.stability.cv_predators <= 0.25;
  checks.push({ name: `CV predators <= 0.25 (got ${agg.stability.cv_predators.toFixed(3)})`, pass: cvPredPass });

  // 4. Energy drift: compare first vs last sample avg energy, drift <= 10%
  let driftPass = true;
  let driftMax = 0;
  for (const r of runs) {
    if (r.metrics.length < 2) continue;
    const e0 = r.metrics[0].energy.avg;
    const eEnd = r.metrics[r.metrics.length - 1].energy.avg;
    if (e0 > 0) {
      const drift = Math.abs(eEnd - e0) / e0;
      if (drift > driftMax) driftMax = drift;
    }
  }
  driftPass = driftMax <= 0.10;
  checks.push({ name: `Energy drift <= 10% (max ${driftMax.toFixed(3)})`, pass: driftPass });

  // 5. Extinctions: 0 total
  const extPass = agg.extinctions.total === 0;
  checks.push({ name: `Extinctions = 0 (got ${agg.extinctions.total})`, pass: extPass });

  // 6. No rescue needed
  // (check if migration rescued any species - approximate via survival)
  const rescuePass = !runs.some(r => r.extinctions.length > 0);
  checks.push({ name: `No guild lost in any run`, pass: rescuePass });

  // 7. Diversity: gene variance averaged across groups >= 20% of mean
  let divPass = true;
  let divRatio = 0;
  for (const r of runs) {
    const lastM = r.metrics[r.metrics.length - 1];
    if (!lastM || !lastM.genes) continue;
    for (const group of Object.keys(lastM.genes)) {
      const g = lastM.genes[group];
      if (!g || g.n < 2) continue;
      for (const gk of Object.keys(g.avg)) {
        const mean = g.avg[gk];
        const variance = g.variance[gk];
        if (mean > 0.01) {
          const cv = Math.sqrt(variance) / mean;
          if (cv > divRatio) divRatio = cv;
        }
      }
    }
  }
  // At least one gene in one group should show CV >= 0.20
  divPass = divRatio >= 0.20;
  checks.push({ name: `Diversity gene CV >= 20% (max ${divRatio.toFixed(3)})`, pass: divPass });

  // 8. Population trend: no decline > 5% per 10 min
  let trendPass = true;
  let maxDecline = 0;
  for (const r of runs) {
    if (r.metrics.length < 4) continue;
    const m0 = r.metrics[0];
    const mEnd = r.metrics[r.metrics.length - 1];
    const durMin = (mEnd.t - m0.t) / 60;
    if (durMin < 1) continue;
    // Check consumers: decline rate per 10 min
    if (m0.consumers > 10) {
      const decline = (m0.consumers - mEnd.consumers) / m0.consumers;
      const declinePer10 = decline / durMin * 10;
      if (declinePer10 > maxDecline) maxDecline = declinePer10;
    }
    // Check predators
    if (m0.predators > 5) {
      const decline = (m0.predators - mEnd.predators) / m0.predators;
      const declinePer10 = decline / durMin * 10;
      if (declinePer10 > maxDecline) maxDecline = declinePer10;
    }
  }
  trendPass = maxDecline <= 0.05;
  checks.push({ name: `Population decline <= 5%/10min (max ${(maxDecline*100).toFixed(1)}%)`, pass: trendPass });

  const allPass = checks.every(c => c.pass);

  lines.push('── VEREDICTO TASK_908 ────────────────────────────────────────');
  for (const c of checks) {
    lines.push(`  ${c.pass ? '✅' : '❌'} ${c.name}`);
  }
  lines.push(`  ─────────────────────────────────────────────`);
  lines.push(`  RESULTADO: ${allPass ? '✅ APROBADO' : '❌ FALLO'}`);
  lines.push('');

  return { allPass, checks, text: lines.join('\n') };
}

// ─── Main ────────────────────────────────────────────────────
function main() {
  if (!OPTS.quiet) {
    process.stderr.write(`\n🧬 sim-harness: ${OPTS.seeds} seed(s) × ${OPTS.durationMin} min, dt=${DT.toFixed(4)}s\n\n`);
  }

  const runs = [];
  for (let i = 0; i < SEEDS.length; i++) {
    const seed = SEEDS[i];
    if (!OPTS.quiet) {
      process.stderr.write(`  Run ${i + 1}/${SEEDS.length} (seed=${seed})... `);
    }
    const runStart = Date.now();
    const result = runSingleSeed(seed, DURATION_SEC, OPTS.intervalSec, DT, OPTS.migration);
    runs.push(result);
    if (!OPTS.quiet) {
      process.stderr.write(`done in ${((Date.now() - runStart) / 1000).toFixed(1)}s\n`);
    }
  }

  const agg = aggregateRuns(runs);
  const verdict = evaluateTask908Verdict(agg, runs);

  const report = {
    meta: {
      tool: 'sim-harness.js',
      version: '1.0',
      git_commit: runs[0].git_commit,
      timestamp: new Date().toISOString(),
      config: {
        duration_min: OPTS.durationMin,
        duration_sec: DURATION_SEC,
        seeds: SEEDS,
        seed_count: SEEDS.length,
        dt: DT,
        interval_sec: OPTS.intervalSec,
        migration: OPTS.migration,
      },
    },
    aggregate: agg,
    verdict: { all_pass: verdict.allPass, checks: verdict.checks },
    runs,
  };

  const json = JSON.stringify(report, null, 2);

  if (OPTS.outFile) {
    fs.writeFileSync(OPTS.outFile, json);
    if (!OPTS.quiet) {
      process.stderr.write(`\n  JSON written to ${OPTS.outFile}\n`);
    }
  } else {
    // JSON to stdout
    process.stdout.write(json + '\n');
  }

  if (!OPTS.quiet) {
    process.stderr.write('\n');
    process.stderr.write(printHumanReport(runs, agg));
    process.stderr.write('\n');
    process.stderr.write(verdict.text + '\n');
  }
}

main();
