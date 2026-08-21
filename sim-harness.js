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
    ablate: {}, // task_550: { consumerPC: false, predatorPC: false }
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--no-migration') { opts.migration = false; continue; }
    if (arg === '--quiet') { opts.quiet = true; continue; }
    const m = arg.match(/^--(\w+)=(.*)$/);
    if (!m) { console.error(`[args] unknown argument: ${arg}`); process.exit(2); }
    const [, key, val] = m;
    switch (key) {
      case 'duration': opts.durationMin = parseFloat(val); break;
      case 'seeds': opts.seeds = parseInt(val, 10); break;
      case 'seed': opts.seed = parseInt(val, 10); break;
      case 'interval': opts.intervalSec = parseFloat(val); break;
      case 'dt': opts.dt = parseFloat(val); break;
      case 'out': opts.outFile = val; break;
      case 'ablate': {
        // --ablate=consumer-pc=off,predator-pc=off  (task_550 factorial diagnostic)
        for (const part of val.split(',')) {
          if (!part) continue;
          const m2 = part.match(/^(consumer-pc|predator-pc)=(on|off|true|false|1|0)$/);
          if (!m2) { console.error(`[args] --ablate expects consumer-pc|predator-pc=on|off (got: ${part})`); process.exit(2); }
          opts.ablate[m2[1] === 'consumer-pc' ? 'consumerPC' : 'predatorPC'] = ['on', 'true', '1'].includes(m2[2]);
        }
        break;
      }
      case 'quiet': if (val !== 'true' && val !== 'false') { console.error(`[args] --quiet expects true/false`); process.exit(2); } opts.quiet = val === 'true'; break;
      case 'migration': {
        const v = val.toLowerCase();
        if (v === 'off' || v === 'false' || v === '0') opts.migration = false;
        else if (v === 'on' || v === 'true' || v === '1') opts.migration = true;
        else { console.error(`[args] --migration expects on|off|true|false (got: ${val})`); process.exit(2); }
        break;
      }
      default:
        console.error(`[args] unknown option: --${key}`);
        process.exit(2);
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
  ctx.__ABLATE = Object.assign({}, OPTS.ablate); // undefined keys leave browser behaviour untouched
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
  let lastProgressLog = 0;
  let prevSystemEnergy = 0;
  let prevFieldTotal = 0;
  let residualMax = 0;
  let residualSamples = [];
  let residualThroughputMax = 0;
  let residualThroughputSamples = [];
  let fieldResidualMax = 0;
  let fieldResidualSamples = [];
  let prevAlive = {
    'producer-a': true, 'producer-b': true, 'producer-c': true,
    'consumer': true, 'predator': true,
  };
  let prevBirths = 0;
  let prevDeaths = 0;
  // Migration tracking: separate rescue/recolonization events from true births
  let prevMigrations = null;
  function snapshotMigrations() {
    const m = api.sim.migrations || {};
    const me = api.sim.migrationEnergy || {};
    return {
      producerB: m.producerB || 0, producerC: m.producerC || 0,
      consumers: m.consumers || 0, predators: m.predators || 0,
      producerB_e: me.producerB || 0, producerC_e: me.producerC || 0,
      consumers_e: me.consumers || 0, predators_e: me.predators || 0,
    };
  }
  prevMigrations = snapshotMigrations();
  let stepsProcessed = 0;

  // Flow accumulators for delta computation
  const flowKeys = ['graze', 'colonyFeed', 'prodCGraze', 'predation', 'carcassEat',
    'carcassToField', 'metabolism', 'reproduction', 'excretion', 'thermal', 'carcassExpire',
    'photosynthField', 'photosynthDirect', 'producerLoss', 'asexualRepro', 'birthGain', 'trophicAmplification', 'deathDecay', 'feedGain', 'fieldClampLoss',
    // task_908 funnel predacion (pasos-depredador/s)
    'fnlPreyNear', 'fnlPreyNear3', 'fnlContact', 'fnlRejCooldown', 'fnlRejSatiety',
    'fnlChase', 'fnlRejChase', 'fnlRejGape', 'fnlCapture'];
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

    // Migration deltas per guild (count + energy): these are rescue/recolonization,
    // NOT reproduction. sim.births includes them (UI compat), so net births subtracts.
    const curMig = snapshotMigrations();
    const migDelta = {
      producerB: curMig.producerB - prevMigrations.producerB,
      producerC: curMig.producerC - prevMigrations.producerC,
      consumers: curMig.consumers - prevMigrations.consumers,
      predators: curMig.predators - prevMigrations.predators,
    };
    const migEnergyDelta = {
      producerB: curMig.producerB_e - prevMigrations.producerB_e,
      producerC: curMig.producerC_e - prevMigrations.producerC_e,
      consumers: curMig.consumers_e - prevMigrations.consumers_e,
      predators: curMig.predators_e - prevMigrations.predators_e,
    };
    const migTotal = migDelta.producerB + migDelta.producerC + migDelta.consumers + migDelta.predators;
    const migEnergyTotal = migEnergyDelta.producerB + migEnergyDelta.producerC + migEnergyDelta.consumers + migEnergyDelta.predators;
    prevMigrations = curMig;
    const birthsNet = birthsDelta - migTotal;

    // Energy by trophic level
    let negMobile = { count: 0, sum: 0, min: 0, dormant: 0, dormantNeg: 0 };
    let producerEnergy = 0;
    let consumerEnergy = 0;
    let predatorEnergy = 0;
    let carcassEnergy = 0;
    const creatures = api.sim.creatures;
    for (let i = 0; i < creatures.length; i++) {
      const e = creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === api.TYPE.PRODUCER) producerEnergy += (e.energy || 0) + (e.leafEnergy || 0);
      else if (e.type === api.TYPE.CONSUMER) consumerEnergy += e.energy || 0;
      else if (e.type === api.TYPE.PREDATOR) predatorEnergy += e.energy || 0;
      if (e.type === api.TYPE.CONSUMER || e.type === api.TYPE.PREDATOR) {
        if (e.energy < 0) { negMobile.count += 1; negMobile.sum += e.energy; if (e.energy < negMobile.min) negMobile.min = e.energy; }
        if (e.dormant) { negMobile.dormant += 1; if (e.energy < 0) negMobile.dormantNeg += 1; }
      }
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
    // Dimensional ledger: true system inputs vs internal transfers vs destruction
    // TRUE INPUTS: solar energy enters system ONLY via photosynthesis.
    // trophicAmplification (gain mult - bite) is NOT a real input — it exposes
    // the dimensional mismatch (mass index → mobile energy at 18:1).
    // Keeping it out of trueInputs makes the invariante honest: if mult>1,
    // the residual will exceed 2%, correctly flagging energy creation.
    const photosynth = (flows.photosynthField || 0) + (flows.photosynthDirect || 0);
    const trophicAmp = flows.trophicAmplification || 0;
    const trueInputs = photosynth;
    // Reproductive waste: parents lose energy, children get part of it back
    const reproductiveWaste = Math.max(0, (flows.reproduction || 0) - (flows.birthGain || 0));
    // INTERNAL TRANSFERS (do NOT change total system energy):
    // grazing/colonyFeed/prodCGraze: field→mobile, predation: consumer→predator,
    // birthGain: child appears (compensated by reproduction loss above),
    // carcassEat: carcass→mobile,
    // excretion: mobile→field, carcassToField: carcass→field
    const grazingTransfer = (flows.graze || 0) + (flows.colonyFeed || 0) + (flows.prodCGraze || 0);
    const internalTransfer = grazingTransfer + (flows.predation || 0) + (flows.birthGain || 0)
      + (flows.carcassEat || 0) + (flows.excretion || 0) + (flows.carcassToField || 0);
    // TRUE DESTRUCTION: energy leaves system permanently
    const destruction = (flows.metabolism || 0) + (flows.thermal || 0) + (flows.carcassExpire || 0) + (flows.producerLoss || 0) + reproductiveWaste + (flows.deathDecay || 0);
    // System NET: photosynthesis (only real input) minus destruction.
    // A negative NET means the system is losing energy sustainably.
    // A positive NET means energy is being created (bug or photosynth > losses).
    // trophicAmp is tracked separately as 'unexplained energy creation' for diagnosis.
    const systemNet = trueInputs - destruction;
    // Legacy compat
    const fieldInput = grazingTransfer;
    const mobileLoss = (flows.metabolism || 0) + (flows.thermal || 0);
    const carcassLoss = (flows.carcassExpire || 0);
    const mobileToField = (flows.excretion || 0) + (flows.carcassToField || 0);
    const energyIn = fieldInput + (flows.carcassEat || 0);
    const energyOut = mobileLoss + carcassLoss + mobileToField;

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

    // Dimensional invariante: ΔE_mobile vs (mobileInputs - mobileDestruction) over interval.
    // field.total is a logistic density index [0,1.5] per cell, NOT energy.
    // Including it in the system energy sum makes the invariante meaningless.
    // Correct contract: track only dimensional energy (producer entities + mobile + carcasses).
    // Mobile energy inputs: photosynth (direct to entities) + trophicAmp (gain from grazing)
    //   + grazing transfer (field→mobile, counted at bite value) + predation + carcassEat + birthGain.
    // Mobile energy outputs: metabolism + thermal + carcassExpire + producerLoss + reproWaste + deathDecay.
    // Internal transfers that don't change mobile energy: excretion (m→field, leaves mobile),
    //   carcassToField (carcass→field, leaves mobile+carcass).
    // But grazing REMOVES from field (not energy) and ADDS to mobile (energy).
    // So for the MOBILE energy budget:
    //   inputs = photosynth_direct + trophicAmp + grazing_bite + predation + carcassEat + birthGain
    //   outputs = metabolism + thermal + carcassExpire + producerLoss + reproWaste + deathDecay + excretion + carcassToField
    // Note: photosynthField goes to field (not mobile), so excluded from mobile inputs.
    // Correct mobile budget using feedGain:
    // Dimensional invariante: track ΔE_sys over the full entity pool
    // (producers + consumers + predators + carcasses). Field is NOT energy.
    //
    // System inputs (add energy to entity pool):
    //   photosynthDirect: solar → producer entities (B/C photosynthesize directly)
    //   graze: bite extracted from producerField. Field is NOT in E_sys, so the
    //     full bite is a system-level input; trophicAmp only nets gain-bite.
    //   trophicAmplification: net energy created during ALL feeding (gain - sourceLoss).
    //     When consumer grazes field at mult>1: positive amp (field mass index → mobile energy).
    //     When predator gains less than prey lost: negative amp (already in deathDecay).
    //
    // System outputs (remove energy from entity pool):
    //   metabolism, thermal: heat dissipation
    //   excretion: mobile → field (leaves entity pool)
    //   deathDecay: 45% lost as heat on death + predation inefficiency
    //   carcassExpire, carcassToField: carcass energy lost or returned to field
    //   producerLoss: producer entity losses (metab, competition, clamp, mutation penalties)
    //   reproductiveWaste: parent energy spent on reproduction that didn't reach child
    //
    // Internal transfers (neutral to E_sys):
    //   predation (prey→predator), carcassEat (carcass→mobile),
    //   reproduction-birthGain (parent→child), grazing from entities
    const systemInputs = (flows.photosynthDirect || 0) + (flows.trophicAmplification || 0) + (flows.graze || 0);
    const systemOutputs = (flows.metabolism || 0) + (flows.thermal || 0) + (flows.excretion || 0)
      + (flows.deathDecay || 0) + (flows.carcassExpire || 0) + (flows.carcassToField || 0)
      + (flows.producerLoss || 0) + reproductiveWaste;
    const curSystemEnergy = producerEnergy + consumerEnergy + predatorEnergy + carcassEnergy;
    const deltaSystem = curSystemEnergy - prevSystemEnergy;
    const expectedDelta = (systemInputs - systemOutputs) * dt_real;
    const residual = Math.abs(deltaSystem - expectedDelta);
    const flowScale = Math.max(Math.abs(expectedDelta), Math.abs(deltaSystem), 1);
    // Throughput-scaled residual: total entity-pool flow volume over the interval.
    // Net deltas can be near zero at quasi-equilibrium and overstate residual %;
    // normalizing by throughput gives the honest accounting-error ratio.
    const entityThroughput = ((systemInputs + systemOutputs) * dt_real) || 1;
    const residualThroughputPct = (residual / entityThroughput) * 100;
    const residualPct = (residual / flowScale) * 100;
    // Skip first sample (t=0): no prior simulation, meaningless delta
    if (lastRecord > 0) {
      if (residualPct > residualMax) residualMax = residualPct;
      residualSamples.push(residualPct);
      if (residualThroughputPct > residualThroughputMax) residualThroughputMax = residualThroughputPct;
      residualThroughputSamples.push(residualThroughputPct);
      // Debug: log first few residual breakdowns
      if (residualSamples.length <= 5 && process.env.RESIDUAL_DEBUG) {
        const feedG = flows.feedGain || 0;
        const graz = flows.graze || 0;
        const colF = flows.colonyFeed || 0;
        const pred = flows.predation || 0;
        const prodCG = flows.prodCGraze || 0;
        const carcE = flows.carcassEat || 0;
        const bGain = flows.birthGain || 0;
        const repro = flows.reproduction || 0;
        console.error(`[residual] t=${api.sim.time.toFixed(1)} dt_real=${dt_real.toFixed(2)} dE=${deltaSystem.toFixed(1)} exp=${expectedDelta.toFixed(1)} res=${residualPct.toFixed(1)}% | sysIn=${systemInputs.toFixed(2)} sysOut=${systemOutputs.toFixed(2)} | pe=${producerEnergy.toFixed(1)} ce=${consumerEnergy.toFixed(1)} pre=${predatorEnergy.toFixed(1)} care=${carcassEnergy.toFixed(1)} sysE=${curSystemEnergy.toFixed(1)} | in: phD=${(flows.photosynthDirect||0).toFixed(2)} tAmp=${trophicAmp.toFixed(2)} | out: metab=${(flows.metabolism||0).toFixed(2)} pL=${(flows.producerLoss||0).toFixed(2)} dD=${(flows.deathDecay||0).toFixed(2)} exc=${(flows.excretion||0).toFixed(2)} | feedG=${feedG.toFixed(2)} graz=${graz.toFixed(2)} colF=${colF.toFixed(2)} pred=${pred.toFixed(2)} prodCG=${prodCG.toFixed(2)} carcE=${carcE.toFixed(2)} bGain=${bGain.toFixed(2)} repro=${repro.toFixed(2)} reproW=${reproductiveWaste.toFixed(2)}`);
      }
    }
    prevSystemEnergy = curSystemEnergy;

    // ── Field dimension invariante ──
    // Field is a logistic density index [0, 1.5] per cell, NOT energy.
    // Track its budget separately: Δ(field.total) vs (growth + deposits - extraction - clamp)
    // Field inputs: photosynthField (solar growth), excretion (mobile→field), carcassToField
    // Field outputs: graze bite (field→mobile), clampLoss (capping at 1.5)
    // colonyFeed/prodCGraze do NOT touch the field — they are entity→entity transfers.
    // Diffusion is neutral (redistributes, doesn't change total).
    const curFieldTotal = api.sim.producerField.total || 0;
    const deltaField = curFieldTotal - prevFieldTotal;
    const fieldGrowth = flows.photosynthField || 0;
    const fieldExtraction = flows.graze || 0; // only graze removes from field.mass
    const fieldDeposits = (flows.excretion || 0) + (flows.carcassToField || 0);
    const fieldClamp = flows.fieldClampLoss || 0;
    const fieldExpectedDelta = (fieldGrowth + fieldDeposits - fieldExtraction - fieldClamp) * dt_real;
    const fieldResidual = Math.abs(deltaField - fieldExpectedDelta);
    const fieldFlowScale = Math.max(Math.abs(fieldExpectedDelta), Math.abs(deltaField), 1);
    const fieldResidualPct = (fieldResidual / fieldFlowScale) * 100;
    const fieldThroughput = ((fieldGrowth + fieldDeposits + fieldExtraction + fieldClamp) * dt_real) || 1;
    const fieldResidualThroughputPct = (fieldResidual / fieldThroughput) * 100;
    if (lastRecord > 0) {
      if (fieldResidualPct > fieldResidualMax) fieldResidualMax = fieldResidualPct;
      fieldResidualSamples.push(fieldResidualPct);
      if (fieldResidualSamples.length <= 3 && process.env.RESIDUAL_DEBUG) {
        console.error(`[field-residual] t=${api.sim.time.toFixed(1)} dF=${deltaField.toFixed(1)} exp=${fieldExpectedDelta.toFixed(1)} res=${fieldResidualPct.toFixed(1)}% | growth=${fieldGrowth.toFixed(3)} extract=${fieldExtraction.toFixed(3)} deposit=${fieldDeposits.toFixed(3)} ftot=${curFieldTotal.toFixed(1)}`);
      }
    }
    prevFieldTotal = curFieldTotal;

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
        neg_mobile: { count: negMobile.count, sum: parseFloat(negMobile.sum.toFixed(1)), min: parseFloat(negMobile.min.toFixed(2)), dormant: negMobile.dormant, dormant_neg: negMobile.dormantNeg },
      },
      rates: {
        births_per_sec: parseFloat((birthsNet / dt_real).toFixed(3)),
        deaths_per_sec: parseFloat((deathsDelta / dt_real).toFixed(3)),
        births_total: api.sim.births,
        deaths_total: api.sim.deaths,
        births_net_total: parseFloat((api.sim.births - (api.sim.migrations.producerB + api.sim.migrations.producerC + api.sim.migrations.consumers + api.sim.migrations.predators)).toFixed(0)),
        migration_per_interval: {
          counts: migDelta,
          energy: {
            producerB: parseFloat(migEnergyDelta.producerB.toFixed(1)),
            producerC: parseFloat(migEnergyDelta.producerC.toFixed(1)),
            consumers: parseFloat(migEnergyDelta.consumers.toFixed(1)),
            predators: parseFloat(migEnergyDelta.predators.toFixed(1)),
          },
          energy_per_sec: parseFloat((migEnergyTotal / dt_real).toFixed(3)),
        },
        migration_totals: {
          producerB: curMig.producerB, producerC: curMig.producerC,
          consumers: curMig.consumers, predators: curMig.predators,
        },
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
        photosynthField: parseFloat((flows.photosynthField || 0).toFixed(3)),
        photosynthDirect: parseFloat((flows.photosynthDirect || 0).toFixed(3)),
        photosynth: parseFloat(photosynth.toFixed(3)),
        trophicAmplification: parseFloat(trophicAmp.toFixed(3)),
        deathDecay: parseFloat((flows.deathDecay || 0).toFixed(3)),
        trueInputs: parseFloat(trueInputs.toFixed(3)),
        destruction: parseFloat(destruction.toFixed(3)),
        producerLoss: parseFloat((flows.producerLoss || 0).toFixed(3)),
        birthGain: parseFloat((flows.birthGain || 0).toFixed(3)),
        reproductiveWaste: parseFloat(reproductiveWaste.toFixed(3)),
        balance_in: parseFloat(energyIn.toFixed(3)),
        balance_out: parseFloat(energyOut.toFixed(3)),
        system_net: parseFloat(systemNet.toFixed(3)),
        field_input: parseFloat(fieldInput.toFixed(3)),
        mobile_loss: parseFloat(mobileLoss.toFixed(3)),
        carcass_loss: parseFloat(carcassLoss.toFixed(3)),
        mobile_to_field: parseFloat(mobileToField.toFixed(3)),
        internal_transfer: parseFloat(internalTransfer.toFixed(3)),
        // task_908 funnel predacion (pasos-depredador/s)
        fnlPreyNear: parseFloat((flows.fnlPreyNear || 0).toFixed(2)),
        fnlPreyNear3: parseFloat((flows.fnlPreyNear3 || 0).toFixed(2)),
        fnlContact: parseFloat((flows.fnlContact || 0).toFixed(2)),
        fnlRejCooldown: parseFloat((flows.fnlRejCooldown || 0).toFixed(2)),
        fnlRejSatiety: parseFloat((flows.fnlRejSatiety || 0).toFixed(2)),
        fnlChase: parseFloat((flows.fnlChase || 0).toFixed(2)),
        fnlRejChase: parseFloat((flows.fnlRejChase || 0).toFixed(2)),
        fnlRejGape: parseFloat((flows.fnlRejGape || 0).toFixed(2)),
        fnlCapture: parseFloat((flows.fnlCapture || 0).toFixed(2)),
        residual_pct: parseFloat(residualPct.toFixed(3)),
        residual_throughput_pct: parseFloat(residualThroughputPct.toFixed(3)),
        system_energy: parseFloat(curSystemEnergy.toFixed(1)),
        field_residual_pct: parseFloat(fieldResidualPct.toFixed(3)),
        field_residual_throughput_pct: parseFloat(fieldResidualThroughputPct.toFixed(3)),
        field_growth: parseFloat(fieldGrowth.toFixed(3)),
        field_extraction: parseFloat(fieldExtraction.toFixed(3)),
        field_deposits: parseFloat(fieldDeposits.toFixed(3)),
        field_clamp: parseFloat(fieldClamp.toFixed(3)),
        field_delta: parseFloat(deltaField.toFixed(3)),
      },
      genes,
    });

    lastRecord = api.sim.time;
  }

  // Initialize prevSystemEnergy for residual calculation
  {
    const creatures0 = api.sim.creatures;
    let pe0 = 0, ce0 = 0, pre0 = 0, care0 = 0;
    for (let i = 0; i < creatures0.length; i++) {
      const e = creatures0[i];
      if (!e || !e.alive) continue;
      if (e.type === api.TYPE.PRODUCER) pe0 += e.energy || 0;
      else if (e.type === api.TYPE.CONSUMER) ce0 += e.energy || 0;
      else if (e.type === api.TYPE.PREDATOR) pre0 += e.energy || 0;
    }
    const carcasses0 = api.sim.carcasses;
    for (let i = 0; i < carcasses0.length; i++) {
      if (carcasses0[i]) care0 += carcasses0[i].energy || 0;
    }
    // Note: field.total excluded — it's a density index, not energy.
    prevSystemEnergy = pe0 + ce0 + pre0 + care0;
    prevFieldTotal = api.sim.producerField.total || 0;
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

    // Progress line every 60s of sim time (stderr only; does not affect output)
    if (api.sim.time - lastProgressLog >= 60) {
      lastProgressLog = api.sim.time;
      const el = ((Date.now() - wallStart) / 1000).toFixed(0);
      console.error(`[seed ${seed}] t=${api.sim.time.toFixed(0)}s/${durationSec}s wall=${el}s pop=${(api.sim.creatures || []).length}`);
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
    residual_max_pct: parseFloat(residualMax.toFixed(3)),
    residual_throughput_max_pct: parseFloat(residualThroughputMax.toFixed(3)),
    residual_throughput_median_pct: residualThroughputSamples.length > 0
      ? parseFloat(residualThroughputSamples.slice().sort((a,b)=>a-b)[Math.floor(residualThroughputSamples.length/2)].toFixed(3))
      : 0,
    residual_median_pct: residualSamples.length > 0
      ? parseFloat(residualSamples.slice().sort((a,b)=>a-b)[Math.floor(residualSamples.length/2)].toFixed(3))
      : 0,
    field_residual_max_pct: parseFloat(fieldResidualMax.toFixed(3)),
    field_residual_median_pct: fieldResidualSamples.length > 0
      ? parseFloat(fieldResidualSamples.slice().sort((a,b)=>a-b)[Math.floor(fieldResidualSamples.length/2)].toFixed(3))
      : 0,
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
// NOTE: entities classify by e.sub (PRODUCER.B / PRODUCER.C), not e.mobile.
// The old e.mobile check made producer-c always n=0 and producer-b absorb C.
function groupForCreatureLive(e, group, api) {
  if (!e || !e.alive) return false;
  if (group === 'producer-b' && e.type === api.TYPE.PRODUCER && e.sub === api.PRODUCER.B) return true;
  if (group === 'producer-c' && e.type === api.TYPE.PRODUCER && e.sub === api.PRODUCER.C) return true;
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

  // Flow aggregation — task_908 fix: media TEMPORAL por run (intervalos t>0),
  // no solo el ultimo intervalo. El valor del ultimo intervalo es ruido
  // puntual (p.ej. predation=0 por handling time); la media temporal es la
  // magnitud fisica honesta. Se conserva flows_last por compat.
  const flowKeysAgg = ['graze', 'colonyFeed', 'prodCGraze', 'predation', 'carcassEat',
    'metabolism', 'reproduction', 'excretion', 'thermal', 'carcassExpire',
    'photosynthField', 'photosynthDirect', 'photosynth', 'trophicAmplification', 'feedGain', 'trueInputs', 'destruction', 'system_net', 'deathDecay',
    'fnlPreyNear', 'fnlPreyNear3', 'fnlContact', 'fnlRejCooldown', 'fnlRejSatiety',
    'fnlChase', 'fnlRejChase', 'fnlRejGape', 'fnlCapture'];
  function temporalMeanFlows(run, key) {
    // media sobre intervalos con t>0 (el intervalo t=0 arranca en 0 y diluiria)
    let sum = 0, n = 0;
    for (const m of run.metrics) {
      if (m.t <= 0) continue;
      sum += m.flows ? m.flows[key] || 0 : 0;
      n++;
    }
    return n > 0 ? sum / n : 0;
  }
  const flowStats = {};
  for (const k of flowKeysAgg) {
    if (k === 'photosynth' || k === 'trueInputs' || k === 'destruction' || k === 'system_net') continue; // derivados abajo
    const vals = runs.map(r => temporalMeanFlows(r, k));
    flowStats[k] = { mean: mean(vals), stdev: stdev(vals) };
  }
  // Derivados con media temporal coherente
  const photosynthMeans = runs.map(r => temporalMeanFlows(r, 'photosynthField') + temporalMeanFlows(r, 'photosynthDirect'));
  flowStats.photosynth = { mean: mean(photosynthMeans), stdev: stdev(photosynthMeans) };
  flowStats.trueInputs = flowStats.photosynth;
  const destructionMeans = runs.map(r => temporalMeanFlows(r, 'metabolism') + temporalMeanFlows(r, 'thermal')
    + temporalMeanFlows(r, 'carcassExpire') + temporalMeanFlows(r, 'producerLoss')
    + temporalMeanFlows(r, 'reproductiveWaste') + temporalMeanFlows(r, 'deathDecay'));
  flowStats.destruction = { mean: mean(destructionMeans), stdev: stdev(destructionMeans) };
  const systemNetMeans = runs.map(r => temporalMeanFlows(r, 'photosynthField') + temporalMeanFlows(r, 'photosynthDirect')
    - temporalMeanFlows(r, 'metabolism') - temporalMeanFlows(r, 'thermal')
    - temporalMeanFlows(r, 'carcassExpire') - temporalMeanFlows(r, 'producerLoss')
    - temporalMeanFlows(r, 'reproductiveWaste') - temporalMeanFlows(r, 'deathDecay'));
  flowStats.system_net = { mean: mean(systemNetMeans), stdev: stdev(systemNetMeans) };
  // Compat: valores del ultimo intervalo bajo flows_last
  const flowStatsLast = {};
  for (const k of ['graze', 'colonyFeed', 'prodCGraze', 'predation', 'carcassEat', 'metabolism', 'reproduction', 'excretion', 'thermal', 'carcassExpire', 'photosynth', 'system_net']) {
    const vals = lastMetrics.map(m => m.flows ? m.flows[k] || 0 : 0);
    flowStatsLast[k] = { mean: mean(vals), stdev: stdev(vals) };
  }
  const balanceIn = lastMetrics.map(m => m.flows ? m.flows.balance_in || 0 : 0);
  const balanceOut = lastMetrics.map(m => m.flows ? m.flows.balance_out || 0 : 0);
  flowStats.balance_in = { mean: mean(balanceIn), stdev: stdev(balanceIn) };
  flowStats.balance_out = { mean: mean(balanceOut), stdev: stdev(balanceOut) };
  flowStats.net = { mean: mean(balanceIn) - mean(balanceOut), stdev: stdev(balanceIn.map((v, i) => v - balanceOut[i])) };
  // System net: true energy creation vs destruction (field input - losses)
  const systemNets = lastMetrics.map(m => m.flows ? m.flows.system_net || 0 : 0);
  flowStats.system_net_last = { mean: mean(systemNets), stdev: stdev(systemNets) };
  const fieldInputs = lastMetrics.map(m => m.flows ? m.flows.field_input || 0 : 0);
  flowStats.field_input = { mean: mean(fieldInputs), stdev: stdev(fieldInputs) };
  const mobileLosses = lastMetrics.map(m => m.flows ? m.flows.mobile_loss || 0 : 0);
  flowStats.mobile_loss = { mean: mean(mobileLosses), stdev: stdev(mobileLosses) };
  const internalTransfers = lastMetrics.map(m => m.flows ? m.flows.internal_transfer || 0 : 0);
  flowStats.internal_transfer = { mean: mean(internalTransfers), stdev: stdev(internalTransfers) };
  flowStats._last = flowStatsLast;

  const extinctions = runs.map(r => r.extinctions.length);
  const survivalCounts = finals.map(f => Object.values(f.survival).filter(Boolean).length - 1);

  // Coefficient of variation for final populations (stability metric)
  const cvConsumers = popStats.consumers.stdev / Math.max(1, popStats.consumers.mean);
  const cvPredators = popStats.predators.stdev / Math.max(1, popStats.predators.mean);

  return {
    seeds: n,
    ablation: Object.assign({}, OPTS.ablate), // task_550: echoes active ablation flags
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
    dimensional_invariante: {
      entity_residual_max: { mean: mean(runs.map(r => r.residual_max_pct || 0)), max: Math.max(...runs.map(r => r.residual_max_pct || 0)) },
      entity_residual_median: { mean: mean(runs.map(r => r.residual_median_pct || 0)) },
      field_residual_max: { mean: mean(runs.map(r => r.field_residual_max_pct || 0)), max: Math.max(...runs.map(r => r.field_residual_max_pct || 0)) },
      field_residual_median: { mean: mean(runs.map(r => r.field_residual_median_pct || 0)) },
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
    lines.push('── ENERGY FLOWS (media temporal ± σ, energy/s) ────────────');
    const fLabels = {
      graze: 'Grazing', colonyFeed: 'Colonia feed', prodCGraze: 'ProdC grazing',
      predation: 'Predación', carcassEat: 'Carcass eat', metabolism: 'Metabolismo',
      reproduction: 'Reproducción', excretion: 'Excretion', thermal: 'Thermal',
      carcassExpire: 'Carcass expire',
      photosynthField: 'Photosynth (field)', photosynthDirect: 'Photosynth (direct)',
      photosynth: 'Photosynth (total)', trophicAmplification: 'Trophic amplification',
      trueInputs: 'True inputs', destruction: 'Destruction', deathDecay: 'Death decay (45%)',
      producerLoss: 'Producer loss', birthGain: 'Birth gain',
      reproductiveWaste: 'Repro waste',
    };
    for (const [k, label] of Object.entries(fLabels)) {
      const s = agg.flows[k];
      if (s) lines.push(`  ${label.padEnd(19)} ${fmt(s.mean, 2).padStart(10)} ${fmt(s.stdev, 2).padStart(10)}`);
    }
    // task_908 funnel depredacion: deteccion -> contacto -> chase -> captura
    const fnl = agg.flows;
    if (fnl && fnl.fnlPreyNear) {
      lines.push('');
      lines.push('  ── FUNNEL predación (pasos-depredador/s, media temporal) ──');
      const fnlLabels = [
        ['fnlPreyNear', 'Detect (>0 presa)'],
        ['fnlPreyNear3', 'Detect (≥3 presas)'],
        ['fnlContact', 'Contacto (eatRange)'],
        ['fnlRejCooldown', '  rechazo cooldown'],
        ['fnlRejSatiety', '  rechazo saciedad'],
        ['fnlChase', 'Chase intentos'],
        ['fnlRejChase', '  chase fallidos'],
        ['fnlRejGape', '  rechazo gape'],
        ['fnlCapture', 'CAPTURAS'],
      ];
      for (const [k, label] of fnlLabels) {
        const s = fnl[k];
        if (s) lines.push(`  ${label.padEnd(19)} ${fmt(s.mean, 1).padStart(10)} ${fmt(s.stdev, 1).padStart(10)}`);
      }
      if (fnl.fnlChase.mean > 0 && fnl.fnlCapture.mean > 0) {
        lines.push(`  captura/chase: ${((fnl.fnlCapture.mean / fnl.fnlChase.mean) * 100).toFixed(1)}%`);
      }
    }
    if (agg.flows.net) {
      lines.push(`  ${'NET MOBILE'.padEnd(19)} ${fmt(agg.flows.net.mean, 2).padStart(10)} ${fmt(agg.flows.net.stdev, 2).padStart(10)}`);
    }
    if (agg.flows.system_net) {
      lines.push(`  ${'SYSTEM NET'.padEnd(19)} ${fmt(agg.flows.system_net.mean, 2).padStart(10)} ${fmt(agg.flows.system_net.stdev, 2).padStart(10)}`);
      lines.push(`  ${'(field→mobile)'.padEnd(19)} ${fmt(agg.flows.field_input.mean, 2).padStart(10)} ${fmt(agg.flows.field_input.stdev, 2).padStart(10)}`);
      lines.push(`  ${'(mobile loss)'.padEnd(19)} ${fmt(agg.flows.mobile_loss.mean, 2).padStart(10)} ${fmt(agg.flows.mobile_loss.stdev, 2).padStart(10)}`);
      lines.push(`  ${'(internal xfer)'.padEnd(19)} ${fmt(agg.flows.internal_transfer.mean, 2).padStart(10)} ${fmt(agg.flows.internal_transfer.stdev, 2).padStart(10)}`);
    }
    // Dimensional invariante residual
    const residualVals = runs.map(r => r.residual_max_pct || 0);
    const residualMedVals = runs.map(r => r.residual_median_pct || 0);
    if (residualVals.length > 0) {
      const rMax = Math.max(...residualVals);
      const rMed = residualMedVals.sort((a,b)=>a-b)[Math.floor(residualMedVals.length/2)] || 0;
      lines.push(`  ${'RESIDUAL max %'.padEnd(19)} ${fmt(rMax, 1).padStart(10)}`);
      lines.push(`  ${'RESIDUAL med %'.padEnd(19)} ${fmt(rMed, 1).padStart(10)}`);
      lines.push(`  ${'INVARIANTE ≤2%'.padEnd(19)} ${rMax <= 2 ? '✅ PASS' : '❌ FAIL'.padStart(10)}`);
    }
    // Field dimension invariante
    const fieldResidualVals = runs.map(r => r.field_residual_max_pct || 0);
    const fieldResidualMedVals = runs.map(r => r.field_residual_median_pct || 0);
    if (fieldResidualVals.length > 0 && fieldResidualVals.some(v => v > 0)) {
      const frMax = Math.max(...fieldResidualVals);
      const frMed = fieldResidualMedVals.sort((a,b)=>a-b)[Math.floor(fieldResidualMedVals.length/2)] || 0;
      lines.push('');
      lines.push('  ── Field dimension ──');
      lines.push(`  ${'FIELD RES max %'.padEnd(19)} ${fmt(frMax, 1).padStart(10)}`);
      lines.push(`  ${'FIELD RES med %'.padEnd(19)} ${fmt(frMed, 1).padStart(10)}`);
      lines.push(`  ${'FIELD INV ≤2%'.padEnd(19)} ${frMax <= 2 ? '✅ PASS' : '❌ FAIL'.padStart(10)}`);
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

  // 4. Energy drift: compare first vs last sample TOTAL energy pool, drift <= 10%
  // Total pool = mobile_sum + field + carcass (true conservation metric)
  let driftPass = true;
  let driftMax = 0;
  let systemNetAvg = 0;
  let sysNetCount = 0;
  for (const r of runs) {
    if (r.metrics.length < 2) continue;
    const m0 = r.metrics[0];
    const mEnd = r.metrics[r.metrics.length - 1];
    const pool0 = m0.energy.mobile_sum + m0.energy.field + m0.energy.carcass;
    const poolEnd = mEnd.energy.mobile_sum + mEnd.energy.field + mEnd.energy.carcass;
    if (pool0 > 0) {
      const drift = Math.abs(poolEnd - pool0) / pool0;
      if (drift > driftMax) driftMax = drift;
    }
    // Average system_net from all metric points (skip first = 0)
    for (let i = 1; i < r.metrics.length; i++) {
      systemNetAvg += r.metrics[i].flows.system_net || 0;
      sysNetCount++;
    }
  }
  const avgNet = sysNetCount > 0 ? systemNetAvg / sysNetCount : 0;
  driftPass = driftMax <= 0.10;
  checks.push({ name: `Energy pool drift <= 10% (max ${driftMax.toFixed(3)}, avg NET ${avgNet.toFixed(1)} E/s)`, pass: driftPass });

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
        ablation: Object.assign({}, OPTS.ablate),
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
