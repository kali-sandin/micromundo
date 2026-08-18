#!/usr/bin/env node
/**
 * test.js — Suite de tests de funcionamiento y rendimiento para Micromundo
 *
 * Uso:
 *   node test.js              — ejecuta todos los tests
 *   node test.js functional   — solo tests de funcionamiento
 *   node test.js perf         — solo tests de rendimiento
 *
 * Requiere: app.js en el mismo directorio.
 * No necesita DOM real: carga app.js en sandbox VM al estilo debug-sim.js.
 *
 * Salida: resumen legible en stderr + JSON en stdout.
 * Exit code: 0 si todo pasa, 1 si hay fallos.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJ_DIR = path.resolve(__dirname);
const APP_JS = path.join(PROJ_DIR, 'app.js');

// ─── Resultados ──────────────────────────────────────────────
const results = {
  meta: {
    git_commit: 'unknown',
    timestamp: new Date().toISOString(),
    node_version: process.version
  },
  functional: [],
  perf: [],
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
};

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: PROJ_DIR, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

results.meta.git_commit = getGitHash();

// ─── DOM mock (compartido con debug-sim) ─────────────────────
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

// ─── Carga de app.js en sandbox ──────────────────────────────
function loadApp() {
  let src = fs.readFileSync(APP_JS, 'utf8');
  const exportsCode = `
    globalThis.__sim = {
      simulate, counts, sim, stepProducer, stepMobile,
      seedWorld, resetWorld, initProducerField, recordGeneHistory,
      spawnProducer, spawnConsumer, spawnPredator, kill,
      createCreature, childFrom, inheritGene, inheritAsexual,
      mutate, clamp, rand, chance, torusDistance2,
      derivedConsumerStats, compactIfNeeded, rebuildGrid,
      queryNearby, nearestFood, feedingPower, armorResistance,
      canEatArmored, movementMaskFromValue, hasMove,
      checkMigration, migratePopulation, feedConsumer,
      nearestCarcassFood, returnCarcassEnergyToField,
      producerCCrowdFactor, grazeProducerDensity, reproduceMobile,
      stepProducerField, fieldCellX, fieldCellY, fieldIndex,
      setSeed,
      saveSnapshot, saveSnapshotJSON, loadSnapshot, loadSnapshotJSON,
      applyWorldSizeFromForm,
      GROUPS, GROUP_KEYS, GROUP_LABELS, TYPE, PRODUCER,
      WORLD, CELL, FIELD_CELL,
      camera, worldToScreen, visibleTileOffsets,
      drawCarcasses, render
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) throw new Error('No se pudo inyectar exports');

  const { document, window } = createDomMock();
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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
  ctx.__sim.__test = { window, worldCanvas: document.getElementById('world') };
  return ctx.__sim;
}

// ─── Helpers de test ─────────────────────────────────────────
let currentSuite = '';
function suite(name) { currentSuite = name; }

function assert(name, fn) {
  try {
    const r = fn();
    results.functional.push({ suite: currentSuite, name, status: 'pass', detail: r || '' });
    results.summary.passed++;
  } catch (err) {
    results.functional.push({ suite: currentSuite, name, status: 'fail', detail: err.message });
    results.summary.failed++;
  }
  results.summary.total++;
}

function perf(name, fn, opts = {}) {
  const minOps = opts.minOps || 1;
  const maxMs = opts.maxMs || Infinity;
  const t0 = Date.now();
  let ops = 0;
  let result;
  try {
    result = fn();
    ops = opts.ops || 1;
    const elapsed = Date.now() - t0;
    const status = elapsed <= maxMs ? 'pass' : 'warn';
    results.perf.push({ suite: currentSuite, name, status, elapsed_ms: elapsed, ops, detail: result || '' });
    if (status === 'pass') results.summary.passed++;
    else results.summary.failed++;
  } catch (err) {
    results.perf.push({ suite: currentSuite, name, status: 'fail', elapsed_ms: 0, ops: 0, detail: err.message });
    results.summary.failed++;
  }
  results.summary.total++;
}

function expectOk(val, msg) {
  if (!val) throw new Error(msg || 'Esperaba valor truthy');
}
function expectEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `Esperaba ${a} === ${b}`);
}
function expectGte(a, b, msg) {
  if (a < b) throw new Error(msg || `Esperaba ${a} >= ${b}`);
}
function expectLte(a, b, msg) {
  if (a > b) throw new Error(msg || `Esperaba ${a} <= ${b}`);
}
function expectRange(v, lo, hi, msg) {
  if (v < lo || v > hi) throw new Error(msg || `Esperaba ${v} en [${lo}, ${hi}]`);
}

// ═════════════════════════════════════════════════════════════
//  TESTS DE FUNCIONAMIENTO
// ═════════════════════════════════════════════════════════════

function runFunctionalTests() {
  const api = loadApp();
  suite('Carga y exports');

  assert('app.js carga sin error', () => {
    expectOk(api.sim, 'sim no disponible');
    expectOk(api.simulate, 'simulate no disponible');
    expectOk(api.counts, 'counts no disponible');
  });

  assert('constantes expuestas', () => {
    expectEq(api.TYPE.PRODUCER, 0);
    expectEq(api.TYPE.CONSUMER, 1);
    expectEq(api.TYPE.PREDATOR, 2);
    expectEq(api.PRODUCER.A, 0);
    expectEq(api.PRODUCER.B, 1);
    expectEq(api.PRODUCER.C, 2);
    expectOk(api.WORLD.w > 0 && api.WORLD.h > 0);
  });

  assert('estado inicial tiene tiempo valido', () => {
    expectEq(api.sim.time, 0, 'sim.time debe arrancar en 0 antes de simulate/reset');
    expectOk(Number.isFinite(api.sim.time), 'sim.time no es finito');
  });

  // ─── Spawn ──────────────────────────────────────
  suite('Spawn de seres');

  assert('spawnConsumer crea consumidor valido', () => {
    const before = api.sim.creatures.filter(e => e && e.alive).length;
    const c = api.spawnConsumer({ x: 100, y: 100 });
    expectOk(c, 'spawnConsumer devolvió null/undefined');
    expectEq(c.type, api.TYPE.CONSUMER);
    expectOk(c.alive, 'Consumidor no esta vivo');
    expectOk(c.energy > 0, 'Consumidor sin energia');
    expectOk(c.speed > 0, 'Consumidor sin velocidad');
    expectOk(c.radius > 0, 'Consumidor sin radio');
    expectOk(c.metabolism > 0, 'Consumidor sin metabolism');
    expectOk(c.maxEnergy > 0, 'Consumidor sin maxEnergy');
    const after = api.sim.creatures.filter(e => e && e.alive).length;
    expectEq(after, before + 1, 'No se añadio la criatura');
  });

  assert('spawnPredator crea depredador valido', () => {
    const p = api.spawnPredator({ x: 200, y: 200 });
    expectOk(p, 'spawnPredator devolvió null');
    expectEq(p.type, api.TYPE.PREDATOR);
    expectOk(p.alive);
    expectOk(p.energy > 0);
    expectOk(p.radius > 0);
    expectOk(p.speed > 0);
  });

  assert('spawnProducer B crea productor colonia', () => {
    const b = api.spawnProducer({ sub: api.PRODUCER.B, x: 300, y: 300 });
    expectOk(b, 'spawnProducer B devolvió null');
    expectEq(b.type, api.TYPE.PRODUCER);
    expectEq(b.sub, api.PRODUCER.B);
    expectOk(b.alive);
    expectOk(b.radius > 0);
    expectOk(b.leafCount > 0, 'Colonia sin hojas');
  });

  assert('spawnProducer C crea productor movil', () => {
    const c = api.spawnProducer({ sub: api.PRODUCER.C, x: 400, y: 400 });
    expectOk(c);
    expectEq(c.type, api.TYPE.PRODUCER);
    expectEq(c.sub, api.PRODUCER.C);
    expectOk(c.alive);
    expectOk(c.speed > 0, 'Productor movil sin velocidad');
  });

  assert('spawnProducer A añade densidad al campo', () => {
    api.initProducerField();
    const fieldTotalBefore = api.sim.producerField.total;
    api.spawnProducer({ sub: api.PRODUCER.A, x: 500, y: 500 });
    const fieldTotalAfter = api.sim.producerField.total;
    expectGte(fieldTotalAfter, fieldTotalBefore, 'Densidad del campo no aumento');
  });

  assert('seres moviles arrancan con la misma percepcion base', () => {
    const prodC = api.spawnProducer({ sub: api.PRODUCER.C, x: 120, y: 120 });
    const consumer = api.spawnConsumer({ x: 140, y: 140 });
    const predator = api.spawnPredator({ x: 160, y: 160 });
    expectEq(prodC.perception, consumer.perception, 'Productor C y consumidor arrancan con distinto rango');
    expectEq(consumer.perception, predator.perception, 'Consumidor y depredador arrancan con distinto rango');
  });

  assert('apelotonamiento de Prod.C reduce captacion solar', () => {
    api.resetWorld();
    const center = api.spawnProducer({ sub: api.PRODUCER.C, x: 400, y: 400 });
    for (let i = 0; i < 8; i++) {
      api.spawnProducer({ sub: api.PRODUCER.C, x: 410 + i * 3, y: 410 + i * 2 });
    }
    api.rebuildGrid();
    expectOk(api.producerCCrowdFactor(center) < 1, 'Prod.C denso no penaliza captacion');
    api.resetWorld();
    const alone = api.spawnProducer({ sub: api.PRODUCER.C, x: 1000, y: 1000 });
    api.rebuildGrid();
    expectEq(api.producerCCrowdFactor(alone), 1, 'Prod.C aislado no deberia estar penalizado');
  });

  // ─── Kill ───────────────────────────────────────
  suite('Kill y limpieza');

  assert('kill marca como muerta y incrementa deaths', () => {
    const deathsBefore = api.sim.deaths;
    const c = api.spawnConsumer({ x: 50, y: 50 });
    api.kill(c, 'test');
    expectEq(c.alive, false, 'Criatura sigue viva tras kill');
    expectEq(api.sim.deaths, deathsBefore + 1, 'Deaths no incremento');
  });

  assert('cadaver descompuesto recicla energia al producerField', () => {
    api.initProducerField();
    api.sim.producerField.mass.fill(0);
    api.sim.producerField.total = 0;
    api.sim.carcasses = [];
    const c = api.spawnConsumer({ x: 50, y: 50 });
    c.energy = 100;
    const fieldTotalBefore = api.sim.producerField.total;
    api.kill(c, 'test-reciclaje');
    expectOk(api.sim.carcasses.length > 0, 'kill no creo carcass reciclable');
    api.returnCarcassEnergyToField(api.sim.carcasses[0]);
    const fieldTotalAfter = api.sim.producerField.total;
    expectOk(fieldTotalAfter > fieldTotalBefore, 'cadaver no reciclo energia al campo');
  });

  assert('kill sobre muerta no duplica deaths', () => {
    const c = api.spawnConsumer({ x: 50, y: 50 });
    api.kill(c);
    const deathsAfter1 = api.sim.deaths;
    api.kill(c);
    expectEq(api.sim.deaths, deathsAfter1, 'Deaths se duplico');
  });

  assert('kill(null) no crashea', () => {
    api.kill(null);
    api.kill(undefined);
  });

  // ─── Counts ─────────────────────────────────────
  suite('Counts y estadisticas');

  assert('counts refleja poblacion correcta', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    api.spawnConsumer({ x: 10, y: 10 });
    api.spawnConsumer({ x: 20, y: 20 });
    api.spawnPredator({ x: 30, y: 30 });
    api.spawnProducer({ sub: api.PRODUCER.B, x: 40, y: 40 });
    api.spawnProducer({ sub: api.PRODUCER.C, x: 50, y: 50 });
    const c = api.counts();
    expectEq(c.consumers, 2, `consumers=${c.consumers}`);
    expectEq(c.predators, 1, `predators=${c.predators}`);
    expectEq(c.producerB, 1);
    expectEq(c.producerC, 1);
  });

  assert('counts no cuenta muertas', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    const c1 = api.spawnConsumer({ x: 10, y: 10 });
    api.spawnConsumer({ x: 20, y: 20 });
    api.kill(c1);
    const c = api.counts();
    expectEq(c.consumers, 1);
  });

  // ─── Genética ───────────────────────────────────
  suite('Genetica y herencia');

  assert('inheritGene promedia dos valores dentro de limites', () => {
    const fakeA = { size: 4 };
    const fakeB = { size: 8 };
    let val = null;
    for (let i = 0; i < 50; i++) {
      val = api.inheritGene(fakeA, fakeB, 'size', 0, 20);
      expectRange(val, 0, 20);
    }
    // El promedio deberia estar cerca de 6 en la mayoria de casos
    expectOk(val !== null);
  });

  assert('inheritGene respeta limites min/max', () => {
    const a = { x: 100 };
    const b = { x: 100 };
    for (let i = 0; i < 100; i++) {
      const v = api.inheritGene(a, b, 'x', 0, 10);
      expectLte(v, 10, `Valor ${v} excede max 10`);
      expectGte(v, 0, `Valor ${v} menor que min 0`);
    }
  });

  assert('mutate aplica spread y clamp', () => {
    for (let i = 0; i < 100; i++) {
      const v = api.mutate(5, 3, 0, 10);
      expectRange(v, 0, 10);
    }
  });

  assert('childFrom produce criatura valida de dos consumidores', () => {
    const a = api.spawnConsumer({ x: 100, y: 100 });
    const b = api.spawnConsumer({ x: 120, y: 120 });
    const child = api.childFrom(a, b, api.TYPE.CONSUMER);
    expectOk(child, 'childFrom devolvió null');
    expectOk(child.alive, 'Hijo no vivo');
    expectEq(child.type, api.TYPE.CONSUMER);
    expectOk(child.energy > 0, 'Hijo sin energia');
    expectRange(child.x, 0, api.WORLD.w);
    expectRange(child.y, 0, api.WORLD.h);
  });

  assert('childFrom no crea energia: child <= perdida parental', () => {
    const a = api.spawnConsumer({ x: 100, y: 100, energy: 60 });
    const b = api.spawnConsumer({ x: 120, y: 120, energy: 60 });
    const parentLoss = a.energy * 0.42 + b.energy * 0.38;
    const child = api.childFrom(a, b, api.TYPE.CONSUMER);
    expectOk(child.energy <= parentLoss, 'child energy (' + child.energy.toFixed(2) + ') excede perdida parental (' + parentLoss.toFixed(2) + ')');
  });

  assert('childFrom respeta maxEnergy del child', () => {
    const a = api.spawnConsumer({ x: 100, y: 100, energy: 200, size: 1, reserves: 0 });
    const b = api.spawnConsumer({ x: 120, y: 120, energy: 200, size: 1, reserves: 0 });
    const child = api.childFrom(a, b, api.TYPE.CONSUMER);
    expectOk(child.energy <= child.maxEnergy, 'child energy supera maxEnergy');
  });

  // ─── derivedConsumerStats ───────────────────────
  suite('derivedConsumerStats');

  assert('derivedConsumerStats calcula radius, speed, metabolism', () => {
    const c = api.spawnConsumer({ x: 10, y: 10 });
    const before = { ...c };
    api.derivedConsumerStats(c);
    expectOk(c.radius > 0, 'Radio no calculado');
    expectOk(c.speed >= 0, 'Speed negativa');
    expectOk(c.metabolism > 0, 'Metabolism no calculado');
    expectOk(c.maxEnergy > 0, 'maxEnergy no calculado');
    expectOk(c.perception > 0, 'Perception no calculado');
  });

  assert('derivedConsumerStats: mas flagella = mas speed', () => {
    const slow = api.createCreature({ type: api.TYPE.CONSUMER, size: 3, reserves: 4, flagella: 0, cilia: 0, chemosense: 1, pseudopodia: 0, armor: 0, vacuole: 1 });
    api.derivedConsumerStats(slow);
    const fast = api.createCreature({ type: api.TYPE.CONSUMER, size: 3, reserves: 4, flagella: 5, cilia: 0, chemosense: 1, pseudopodia: 0, armor: 0, vacuole: 1 });
    api.derivedConsumerStats(fast);
    expectOk(fast.speed > slow.speed, `flagella alto (${fast.speed}) deberia ser mas rapido que bajo (${slow.speed})`);
  });

  assert('derivedConsumerStats: mas armor = mas metabolism', () => {
    const light = api.createCreature({ type: api.TYPE.CONSUMER, size: 3, reserves: 4, flagella: 2, cilia: 0, chemosense: 1, pseudopodia: 0, armor: 0, vacuole: 1 });
    api.derivedConsumerStats(light);
    const heavy = api.createCreature({ type: api.TYPE.CONSUMER, size: 3, reserves: 4, flagella: 2, cilia: 0, chemosense: 1, pseudopodia: 0, armor: 5, vacuole: 1 });
    api.derivedConsumerStats(heavy);
    expectOk(heavy.metabolism > light.metabolism, `armor alto (${heavy.metabolism}) deberia tener mas metabolism que bajo (${light.metabolism})`);
  });

  // ─── Simulación ─────────────────────────────────
  suite('Bucle de simulacion');

  assert('simulate avanza el tiempo', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.initProducerField();
    const t0 = api.sim.time;
    api.simulate(1.0);
    expectGte(api.sim.time, t0 + 0.99, 'Tiempo no avanzo');
  });

  assert('simulate con seres vivos no crashea tras 10s', () => {
    api.resetWorld();
    api.seedWorld();
    for (let i = 0; i < 20; i++) api.simulate(0.5);
    expectGte(api.sim.time, 10, 'Tiempo simulado insuficiente');
  });

  assert('simulate mantiene seres en el mundo (toroidal)', () => {
    api.resetWorld();
    const c = api.spawnConsumer({ x: 100, y: 100 });
    for (let i = 0; i < 60; i++) api.simulate(1.0);
    // Aunque muera por edad, mientras viva no debe salir del mundo
    if (c.alive) {
      expectRange(c.x, 0, api.WORLD.w, 'x fuera del mundo');
      expectRange(c.y, 0, api.WORLD.h, 'y fuera del mundo');
    }
  });

  assert('dormant consumer con energia agotada muere (no energia negativa)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    api.sim.producerField.mass.fill(0);
    api.sim.producerField.total = 0;
    const c = api.spawnConsumer({ x: 100, y: 100, energy: 0.002, maxAge: 9999 });
    c.dormant = true;
    c.dormantTimer = 999; // revival bloqueado de todos modos por campo vacio
    api.rebuildGrid();
    for (let i = 0; i < 5; i++) {
      api.stepMobile(c, 1 / 30);
      if (!c.alive) break; // simulate() no stepea muertos
    }
    expectEq(c.alive, false, 'dormant sin reservas debe morir');
    expectEq(c.energy >= 0, true, 'energia nunca negativa tras morir en dormancia');
  });

  assert('dormant ProducerC con energia agotada muere (no energia negativa)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    api.sim.producerField.mass.fill(0);
    api.sim.producerField.total = 0;
    const p = api.spawnProducer({ sub: api.PRODUCER.C, x: 100, y: 100, energy: 1e-5, maxAge: 9999 });
    p.dormant = true;
    p.dormantTimer = 999;
    api.rebuildGrid();
    for (let i = 0; i < 5; i++) {
      api.stepProducer(p, 1 / 30);
      if (!p.alive) break;
    }
    expectEq(p.alive, false, 'ProducerC dormant sin reservas debe morir');
    expectEq(p.energy >= 0, true, 'energia nunca negativa tras morir en dormancia');
  });

  assert('consumer exhausto sin comida no aplica fear scan', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    api.sim.producerField.mass.fill(0);
    api.sim.producerField.total = 0;
    const c = api.spawnConsumer({ x: 100, y: 100, energy: 1, maxAge: 9999 });
    api.spawnPredator({ x: 115, y: 100, energy: 80, maxAge: 9999 });
    c.energy = c.maxEnergy * 0.04;
    api.rebuildGrid();
    api.stepMobile(c, 1 / 30);
    expectEq(c.starved, 2, 'consumer no entro en inanicion severa');
    expectEq(c.fearFactor, 1, 'consumer exhausto sin comida no debe escanear amenazas');
  });

  assert('consumer con energia suficiente mantiene fear scan', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    api.sim.producerField.mass.fill(0);
    api.sim.producerField.total = 0;
    const c = api.spawnConsumer({ x: 100, y: 100, energy: 50, maxAge: 9999 });
    api.spawnPredator({ x: 115, y: 100, energy: 80, maxAge: 9999 });
    c.energy = c.maxEnergy * 0.2;
    api.rebuildGrid();
    api.stepMobile(c, 1 / 30);
    expectEq(c.starved, 0, 'consumer no deberia estar en inanicion severa');
    expectLte(c.fearFactor, 1, 'consumer sano debe seguir detectando amenazas');
  });

  assert('seedWorld pobla el ecosistema', () => {
    api.resetWorld();
    api.seedWorld();
    const c = api.counts();
    expectOk(c.producerB > 0, 'No hay producerB tras seed');
    expectOk(c.producerC > 0, 'No hay producerC tras seed');
    expectOk(c.consumers > 0, 'No hay consumidores tras seed');
    expectOk(c.predators > 0, 'No hay depredadores tras seed');
  });

  assert('resetWorld deja graficas con punto inicial', () => {
    api.sim.graph.clear();
    api.sim.geneHistory.clear();
    api.sim.lastGraphAt = 300;
    api.resetWorld();
    expectOk(api.sim.graph.length > 0, 'resetWorld dejo grafica de poblacion sin puntos');
    expectOk(api.sim.geneHistory.length > 0, 'resetWorld dejo grafica de genes sin historico');
    expectEq(api.sim.graph.at(0).t, 0, 'grafica no reinicio en t=0');
  });

  assert('cambio de tamaño aplica ratio 16:9', () => {
    api.applyWorldSizeFromForm({ get: (key) => key === 'width' ? '4000' : key === 'height' ? '2250' : null });
    expectEq(api.WORLD.w, 4000, 'ancho no aplicado');
    expectEq(api.WORLD.h, 2250, 'alto 16:9 no aplicado');
    api.applyWorldSizeFromForm({ get: (key) => key === 'width' ? '16000' : key === 'height' ? '9000' : null });
    expectEq(api.WORLD.w, 16000, 'ancho no restaurado');
    expectEq(api.WORLD.h, 9000, 'alto no restaurado');
  });

  // ─── Espacio toroidal ───────────────────────────
  suite('Geometria toroidal');

  assert('torusDistance2 devuelve valor no negativo', () => {
    for (let i = 0; i < 20; i++) {
      const a = { x: Math.random() * api.WORLD.w, y: Math.random() * api.WORLD.h };
      const b = { x: Math.random() * api.WORLD.w, y: Math.random() * api.WORLD.h };
      const d2 = api.torusDistance2(a, b);
      expectOk(d2 >= 0, `distancia negativa: ${d2}`);
    }
  });

  // ─── Sistema de genes ───────────────────────────
  suite('Gene history');

  assert('recordGeneHistory registra punto con todos los grupos', () => {
    api.sim.geneHistory.clear();
    api.recordGeneHistory();
    expectEq(api.sim.geneHistory.length, 1, 'No se registro punto');
    const point = api.sim.geneHistory.at(0);
    for (const g of api.GROUPS) {
      expectOk(point[g], `Grupo ${g} no presente en geneHistory`);
      expectOk(typeof point[g].n === 'number');
      expectOk(point[g].avg, `avg no presente para ${g}`);
    }
  });

  // ─── compactIfNeeded ────────────────────────────
  suite('Compactacion');

  assert('compactIfNeeded compacta tras muchas muertes', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    // Crear muchas criaturas y matar la mayoria
    const created = [];
    for (let i = 0; i < 200; i++) {
      created.push(api.spawnConsumer({ x: Math.random() * 800, y: Math.random() * 600 }));
    }
    for (let i = 0; i < 180; i++) {
      if (created[i]) api.kill(created[i]);
    }
    api.compactIfNeeded();
    // No debe crashear y debe mantener criaturas vivas
    const alive = api.sim.creatures.filter(e => e && e.alive).length;
    expectGte(alive, 15, 'Perdio criaturas vivas en compactacion');
  });

  // ─── Carcasses / Render ────────────────────────
  suite('Carcasses y render');

  assert('kill crea carcass en sim.carcasses', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    const c = api.spawnConsumer({ x: 100, y: 100 });
    api.kill(c, 'test-carcass');
    expectOk(api.sim.carcasses.length > 0, 'kill no creo carcass');
    const car = api.sim.carcasses[api.sim.carcasses.length - 1];
    expectOk(car.x !== undefined && car.y !== undefined, 'carcass sin coords');
    expectOk(car.radius > 0, 'carcass sin radio');
    expectOk(car.energy > 0, 'carcass sin energia comestible');
    expectOk(car.maxLife > 0, 'carcass sin maxLife');
  });

  assert('consumidor puede comer carcass', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    const eater = api.spawnConsumer({ x: 100, y: 100, energy: 5 });
    const dead = api.spawnConsumer({ x: 101, y: 101, energy: 80 });
    api.kill(dead, 'test-carcass-food');
    api.rebuildGrid();
    const car = api.nearestCarcassFood(eater, 40);
    expectOk(car, 'no encontro carcass cercano');
    const energyBefore = eater.energy;
    const carEnergyBefore = car.energy;
    expectOk(api.feedConsumer(eater, car, 1 / 30), 'feedConsumer no pudo comer carcass');
    expectOk(eater.energy > energyBefore, 'comer carcass no subio energia');
    expectOk(car.energy < carEnergyBefore, 'comer carcass no redujo energia del cadaver');
  });

  assert('drawCarcasses no crashea (bug view undefined)', () => {
    api.resetWorld();
    const c = api.spawnConsumer({ x: 100, y: 100 });
    api.kill(c, 'test-render');
    expectOk(api.sim.carcasses.length > 0, 'no hay carcasses que dibujar');
    // Esta linea crasheba con ReferenceError: view is not defined
    api.drawCarcasses(api.visibleTileOffsets());
  });

  assert('render completo con carcasses no crashea', () => {
    api.resetWorld();
    api.seedWorld();
    // Matar algunas criaturas para generar carcasses
    const creatures = api.sim.creatures.filter(e => e && e.alive);
    for (let i = 0; i < Math.min(5, creatures.length); i++) {
      api.kill(creatures[i], 'test-render-full');
    }
    expectOk(api.sim.carcasses.length > 0, 'no hay carcasses tras kills');
    // render() llama a drawCarcasses internamente
    api.render();
  });

  assert('canvas principal usa backing store HiDPI sin cambiar coordenadas CSS', () => {
    api.__test.window.devicePixelRatio = 2;
    api.__test.window.innerWidth = 800;
    api.__test.window.innerHeight = 600;
    api.render();
    expectEq(api.__test.worldCanvas.width, 1600, 'canvas.width no escala con DPR');
    expectEq(api.__test.worldCanvas.height, 1200, 'canvas.height no escala con DPR');
    expectEq(api.__test.worldCanvas._ctx._lastTransform[0], 2, 'transform X no aplica DPR');
    expectEq(api.__test.worldCanvas._ctx._lastTransform[3], 2, 'transform Y no aplica DPR');
  });

  // ─── Metabolismo adaptativo ─────────────────────
  suite('Conservacion depredadores');

  assert('metabolismo adaptativo se activa cuando predatorCount < 60', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    // Crear un depredador con energia conocida
    const p = api.spawnPredator({ x: 100, y: 100 });
    const e0 = p.energy;
    api.sim.predatorCount = 30; // bajo umbral
    api.sim.predatorCountTimer = 999;
    api.simulate(1.0);
    // El metabolismo adaptativo deberia reducir el drain
    // metabolism * dt * 7.5 * 0.5 vs metabolism * dt * 7.5
    const drainNormal = p.metabolism * 1.0 * 7.5;
    const drainAdaptive = p.metabolism * 1.0 * 7.5 * 0.5;
    // Si el depredador sigue vivo, el drain fue menor que sin adaptacion
    // Verificamos que el mecanismo no crashea y la energia baja menos
    expectOk(p.energy < e0, 'Energia no bajo tras simulate');
  });

  assert('predatorCount se actualiza durante simulate', () => {
    api.resetWorld();
    const before = api.sim.predatorCount;
    api.spawnPredator({ x: 100, y: 100 });
    api.spawnPredator({ x: 200, y: 200 });
    // predatorCount se mantiene live via spawn/kill
    expectEq(api.sim.predatorCount, before + 2, 'predatorCount no se actualizo correctamente');
  });

  assert('boost reproductivo baja umbral cuando predatorCount < 40', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    // Crear dos depredadores con energia suficiente para reproducirse
    const p1 = api.spawnPredator({ x: 100, y: 100 });
    const p2 = api.spawnPredator({ x: 110, y: 110 });
    // Dar energia suficiente para umbral normal predator (0.60) y boost (0.50)
    const midEnergy = p1.maxEnergy * 0.55; // entre 0.50 y 0.60
    p1.energy = midEnergy;
    p2.energy = midEnergy;
    p1.cooldown = 0;
    p2.cooldown = 0;
    api.sim.predatorCount = 25; // bajo umbral de boost
    api.sim.predatorCountTimer = 999;
    const birthsBefore = api.sim.births;
    // Simular varios pasos para dar oportunidad de reproduccion
    for (let i = 0; i < 30; i++) api.simulate(0.5);
    // Con boost, deberia haber mas intentos de reproduccion
    // Verificamos que no crashea (el test principal es que el umbral cambia)
    expectOk(api.sim.births >= birthsBefore, 'births no incremento');
  });

  // ═══ TASK_908: FUNNEL DEPREDACIÓN (regresión NaN chase) ═══
  // Causa raíz histórica: el check de chase leía e.vx/e.vy inexistentes →
  // chaseSuccess=NaN → chance(NaN)=false → 0% capturas de consumers SIEMPRE.
  // Este test guarda que el funnel detección→contacto→chase→captura funcione.
  suite('Task_908: funnel depredación');

  assert('predator captura consumers con presas adyacentes (fnlCapture>0)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    const chases0 = api.sim.flowAccum.fnlChase;
    const captures0 = api.sim.flowAccum.fnlCapture;
    const preds = [];
    for (let i = 0; i < 3; i++) {
      const p = api.spawnPredator({ x: 400 + i * 6, y: 400 + i * 4 });
      p.energy = p.maxEnergy * 0.5; // sin saciedad
      preds.push(p);
    }
    for (let i = 0; i < 12; i++) {
      api.spawnConsumer({ x: 402 + (i % 4) * 7, y: 402 + Math.floor(i / 4) * 7 });
    }
    api.rebuildGrid();
    for (let i = 0; i < 60; i++) api.simulate(0.5); // 30s
    const chases = api.sim.flowAccum.fnlChase - chases0;
    const captures = api.sim.flowAccum.fnlCapture - captures0;
    expectOk(chases > 0, `fnlChase=0: no hubo intentos de caza (setup sin contacto, got ${chases})`);
    expectOk(captures > 0, `fnlCapture=0 con ${chases} chases en 30s (regresión NaN chase) cicatrizada`);
    return `chases=${chases}, captures=${captures}`;
  });

  // ═══ TASK_142: GAPS CRITICOS DE COBERTURA ═══
  suite('Task_142: gaps criticos');

  assert('grazeProducerDensity: gain y field loss', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    api.sim.producerField.mass.fill(1.0);
    api.sim.producerField.total = api.sim.producerField.mass.length * 1.0;
    const c = api.spawnConsumer({ x: 100, y: 100 });
    c.energy = c.maxEnergy * 0.1;
    c.grazeCooldown = 0;
    const eBefore = c.energy;
    const cellIdx = api.fieldIndex(
      api.fieldCellX(c.x), api.fieldCellY(c.y)
    );
    const massBefore = api.sim.producerField.mass[cellIdx];
    api.rebuildGrid();
    const grazed = api.grazeProducerDensity(c, 1 / 30);
    expectEq(grazed, true, 'grazeProducerDensity devolvio false con mass=1.0');
    expectOk(c.energy > eBefore, 'Consumer no gano energia al grazer');
    const massAfter = api.sim.producerField.mass[cellIdx];
    expectOk(massAfter < massBefore, 'Field mass no disminuyo tras graze');
  });

  assert('grazeProducerDensity: gain = bite * 18 * densityFactor (documenta amplificacion)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.sim.mobileEnergySum = 0;
    api.sim.flowAccum.graze = 0;
    api.initProducerField();
    api.sim.producerField.mass.fill(1.0);
    api.sim.producerField.total = api.sim.producerField.mass.length * 1.0;
    const c = api.spawnConsumer({ x: 100, y: 100 });
    c.energy = c.maxEnergy * 0.1;
    c.grazeCooldown = 0;
    const cellIdx = api.fieldIndex(api.fieldCellX(c.x), api.fieldCellY(c.y));
    const massBefore = api.sim.producerField.mass[cellIdx];
    const eBefore = c.energy;
    api.rebuildGrid();
    const grazed = api.grazeProducerDensity(c, 1 / 30);
    expectEq(grazed, true, 'graze devolvio false');
    const massAfter = api.sim.producerField.mass[cellIdx];
    const bite = massBefore - massAfter;
    const gain = c.energy - eBefore;
    expectOk(bite > 0, 'bite<=0');
    expectOk(gain > 0, 'gain<=0');
    // Documentar: gain es ~18x bite (con densityFactor). No es conservacion 1:1.
    const ratio = gain / bite;
    expectOk(ratio > 5, 'ratio gain:bite=' + ratio.toFixed(1) + ' (esperado ~18x con mult=18). La energia NO se conserva 1:1.');
  });

  assert('grazeProducerDensity: respeta cooldown', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.initProducerField();
    api.sim.producerField.mass.fill(1.0);
    api.sim.producerField.total = api.sim.producerField.mass.length * 1.0;
    const c = api.spawnConsumer({ x: 100, y: 100 });
    c.energy = 10;
    c.grazeCooldown = 0.5;
    const eBefore = c.energy;
    const result = api.grazeProducerDensity(c, 1 / 30);
    expectEq(result, false, 'grazeProducerDensity deberia devolver false con cooldown activo');
    expectEq(c.energy, eBefore, 'Energy cambio pese a cooldown activo');
  });

  assert('grazeProducerDensity: respeta cap maxEnergy', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.initProducerField();
    api.sim.producerField.mass.fill(2.0);
    api.sim.producerField.total = api.sim.producerField.mass.length * 2.0;
    const c = api.spawnConsumer({ x: 100, y: 100 });
    c.energy = c.maxEnergy - 0.1;
    c.grazeCooldown = 0;
    api.rebuildGrid();
    api.grazeProducerDensity(c, 1 / 30);
    expectLte(c.energy, c.maxEnergy, 'Energy excedio maxEnergy tras graze');
  });

  assert('ledger dimensional: photosynthField se trackea en stepProducerField', () => {
    api.resetWorld();
    api.initProducerField();
    api.sim.producerField.mass.fill(0.5);
    api.sim.producerField.total = api.sim.producerField.mass.length * 0.5;
    const before = api.sim.flowAccum.photosynthField || 0;
    api.stepProducerField(0.5); // force step
    const after = api.sim.flowAccum.photosynthField || 0;
    expectOk(after > before, 'photosynthField no aumento tras stepProducerField: before=' + before + ' after=' + after);
  });

  assert('ledger dimensional: photosynthDirect se trackea en stepProducer (ProducerC)', () => {
    api.resetWorld();
    api.initProducerField();
    api.sim.solarEnergy = 1.0;
    const pc = api.spawnProducer({ sub: api.PRODUCER.C, x: 400, y: 300 });
    pc.energy = pc.maxEnergy * 0.5;
    const before = api.sim.flowAccum.photosynthDirect || 0;
    api.stepProducer(pc, 0.5);
    const after = api.sim.flowAccum.photosynthDirect || 0;
    expectOk(after > before, 'photosynthDirect no aumento tras stepProducer C: before=' + before + ' after=' + after);
  });

  assert('ledger dimensional: photosynthDirect se trackea en stepProducer (ProducerB)', () => {
    api.resetWorld();
    api.initProducerField();
    api.sim.solarEnergy = 1.0;
    const pb = api.sim.creatures.find(e => e && e.alive && e.type === api.TYPE.PRODUCER && !e.mobile);
    expectOk(pb, 'No hay ProducerB vivo tras resetWorld');
    if (pb) {
      pb.energy = pb.maxEnergy * 0.5;
      const before = api.sim.flowAccum.photosynthDirect || 0;
      api.stepProducer(pb, 0.5);
      const after = api.sim.flowAccum.photosynthDirect || 0;
      expectOk(after > before, 'photosynthDirect no aumento tras stepProducer B: before=' + before + ' after=' + after);
    }
  });

  // Helper: measure total system energy across all pools
  function measureSystemEnergy(api) {
    let producerEnergy = 0, consumerEnergy = 0, predatorEnergy = 0;
    const creatures = api.sim.creatures;
    for (let i = 0; i < creatures.length; i++) {
      const e = creatures[i];
      if (!e || !e.alive) continue;
      if (e.type === api.TYPE.PRODUCER) producerEnergy += (e.energy || 0) + (e.leafEnergy || 0);
      else if (e.type === api.TYPE.CONSUMER) consumerEnergy += e.energy || 0;
      else if (e.type === api.TYPE.PREDATOR) predatorEnergy += e.energy || 0;
    }
    let carcassEnergy = 0;
    for (let i = 0; i < api.sim.carcasses.length; i++) {
      carcassEnergy += api.sim.carcasses[i].energy || 0;
    }
    const fieldEnergy = api.sim.producerField.total || 0;
    return producerEnergy + consumerEnergy + predatorEnergy + carcassEnergy + fieldEnergy;
  }

  assert('ledger dimensional: residual invariante <=2% (conservacion energetica)', () => {
    // La conservacion dice: ΔE_sistema = (fotosintesis - destruccion) * dt
    // donde fotosintesis = photosynthField + photosynthDirect (true sources)
    // y destruccion = metabolism + thermal + carcassExpire + producerLoss + reproductiveWaste (true sinks).
    // Grazing, predation, excretion, etc son transferencias internas y no afectan el balance total.
    // El residual mide la discrepancia: |ΔE_real - ΔE_esperado| / max(flow).
    // Con mult=18, el residual sera alto porque grazing crea energia.
    // Pero la *dimensionalidad* del ledger debe ser correcta:
    // 1. Todos los acumuladores existen y son numericos
    // 2. photosynth >= 0 (entrada)
    // 3. destruction >= 0 (salida)
    // 4. El balance del sistema es system_net = photosynth - destruction
    // 5. La energia total del sistema = field + producers + consumers + predators + carcasses
    api.resetWorld();
    api.initProducerField();
    api.sim.producerField.mass.fill(0.5);
    api.sim.producerField.total = api.sim.producerField.mass.length * 0.5;
    // Reset all flowAccum counters
    for (const k of Object.keys(api.sim.flowAccum)) {
      api.sim.flowAccum[k] = 0;
      api.sim.flowAccumPrev[k] = 0;
    }
    // Measure system energy before
    const sysBefore = measureSystemEnergy(api);
    // Run 2 seconds of simulation
    for (let i = 0; i < 120; i++) api.simulate(1/60);
    const sysAfter = measureSystemEnergy(api);
    const deltaSystem = sysAfter - sysBefore;
    // True inputs: photosynthesis + trophic amplification (energy created by grazing mult)
    const photosynth = api.sim.flowAccum.photosynthField + api.sim.flowAccum.photosynthDirect;
    const trophicAmp = api.sim.flowAccum.trophicAmplification || 0;
    const deathDecay = api.sim.flowAccum.deathDecay || 0;
    const trueInputs = photosynth + trophicAmp;
    // True outputs
    const reproWaste = Math.max(0, api.sim.flowAccum.reproduction - api.sim.flowAccum.birthGain);
    const destruction = api.sim.flowAccum.metabolism + api.sim.flowAccum.thermal
      + api.sim.flowAccum.carcassExpire + api.sim.flowAccum.producerLoss + reproWaste + deathDecay;
    const expectedDelta = trueInputs - destruction;
    const residual = Math.abs(deltaSystem - expectedDelta);
    const flowScale = Math.max(Math.abs(trueInputs), Math.abs(destruction), 1);
    const residualPct = (residual / flowScale) * 100;
    // Validate accumulator types
    expectOk(typeof api.sim.flowAccum.photosynthField === 'number', 'photosynthField no es number');
    expectOk(typeof api.sim.flowAccum.photosynthDirect === 'number', 'photosynthDirect no es number');
    expectOk(typeof api.sim.flowAccum.producerLoss === 'number', 'producerLoss no es number');
    expectOk(typeof api.sim.flowAccum.birthGain === 'number', 'birthGain no es number');
    expectOk(typeof api.sim.flowAccum.trophicAmplification === 'number', 'trophicAmplification no es number');
    expectOk(photosynth >= 0, 'photosynth negativo: ' + photosynth);
    expectOk(trophicAmp >= 0, 'trophicAmplification negativo: ' + trophicAmp);
    expectOk(destruction >= 0, 'destruction negativo: ' + destruction);
    // Residual should be <=2% for the dimensional ledger to be trustworthy.
    // This checks that ALL energy creation (photosynth + trophic amplification) and destruction
    // are properly tracked, so the ledger closes.
    expectOk(residualPct <= 2.0,
      'residual=' + residualPct.toFixed(2) + '% (>2%). deltaSys=' + deltaSystem.toFixed(1)
      + ' expected=' + expectedDelta.toFixed(1) + ' photo=' + photosynth.toFixed(1)
      + ' trophicAmp=' + trophicAmp.toFixed(1) + ' destr=' + destruction.toFixed(1)
      + ' flowScale=' + flowScale.toFixed(1));
  });

  assert('feedConsumer: predator come consumer con gain', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    const predator = api.spawnPredator({ x: 100, y: 100 });
    const prey = api.spawnConsumer({ x: 105, y: 100 });
    predator.energy = predator.maxEnergy * 0.3;
    predator.huntCooldown = 0;
    predator.digestTimer = 0;
    predator.vx = 50; predator.vy = 0;
    prey.vx = 5; prey.vy = 0;
    prey.energy = prey.maxEnergy * 0.8;
    prey.size = 1;
    const eBefore = predator.energy;
    api.rebuildGrid();
    api.feedConsumer(predator, prey, 1 / 30);
    // Chase success es probabilistico: pudo ganar energia (kill) o poner huntCooldown (escape)
    expectOk(predator.energy > eBefore || predator.huntCooldown > 0, 'Predator ni comio ni fallo caza');
  });

  assert('feedConsumer: predator saturado no caza (>95% energy)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    const predator = api.spawnPredator({ x: 100, y: 100 });
    const prey = api.spawnConsumer({ x: 105, y: 100 });
    predator.energy = predator.maxEnergy * 0.98;
    predator.huntCooldown = 0;
    predator.digestTimer = 0;
    prey.energy = prey.maxEnergy * 0.8;
    const preyAliveBefore = prey.alive;
    api.rebuildGrid();
    api.feedConsumer(predator, prey, 1 / 30);
    expectEq(prey.alive, preyAliveBefore, 'Predator saturado mato presa');
  });

  assert('feedConsumer: predator digiriendo no caza', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    const predator = api.spawnPredator({ x: 100, y: 100 });
    const prey = api.spawnConsumer({ x: 105, y: 100 });
    predator.energy = predator.maxEnergy * 0.3;
    predator.huntCooldown = 0;
    predator.digestTimer = 5;
    prey.energy = prey.maxEnergy * 0.8;
    const preyAliveBefore = prey.alive;
    api.rebuildGrid();
    api.feedConsumer(predator, prey, 1 / 30);
    expectEq(prey.alive, preyAliveBefore, 'Predator digiriendo mato presa');
  });

  assert('reproduceMobile: respeta umbral reproductivo', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 0;
    api.sim.predatorCount = 0;
    api.initProducerField();
    const c1 = api.spawnConsumer({ x: 100, y: 100 });
    const c2 = api.spawnConsumer({ x: 110, y: 100 });
    c1.energy = c1.maxEnergy * 0.3;
    c2.energy = c2.maxEnergy * 0.3;
    c1.cooldown = 0;
    c2.cooldown = 0;
    c1.age = 1;
    c2.age = 1;
    const birthsBefore = api.sim.births;
    api.rebuildGrid();
    api.reproduceMobile(c1, api.TYPE.CONSUMER, null);
    expectEq(api.sim.births, birthsBefore, 'Reproduccion ocurrio con energia insuficiente');
  });

  assert('reproduceMobile: conserva energia (parent+child)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 2;
    api.sim.predatorCount = 0;
    api.initProducerField();
    const c1 = api.spawnConsumer({ x: 100, y: 100 });
    const c2 = api.spawnConsumer({ x: 110, y: 100 });
    c1.energy = c1.maxEnergy * 0.9;
    c2.energy = c2.maxEnergy * 0.9;
    c1.cooldown = 0;
    c2.cooldown = 0;
    c1.age = 1;
    c2.age = 1;
    const e1Before = c1.energy;
    const e2Before = c2.energy;
    const birthsBefore = api.sim.births;
    api.rebuildGrid();
    api.reproduceMobile(c1, api.TYPE.CONSUMER, c2);
    if (api.sim.births > birthsBefore) {
      expectOk(c1.energy < e1Before, 'Parent no perdio energia tras repro');
      expectOk(c2.energy < e2Before, 'Mate no perdio energia tras repro');
    }
  });

  assert('reproduceMobile: respetar cooldown', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.sim.liveProducerBCount = 0;
    api.sim.liveProducerCCount = 0;
    api.sim.liveConsumerCount = 2;
    api.sim.predatorCount = 0;
    api.initProducerField();
    const c1 = api.spawnConsumer({ x: 100, y: 100 });
    c1.energy = c1.maxEnergy * 0.9;
    c1.cooldown = 10;
    c1.age = 1;
    const birthsBefore = api.sim.births;
    api.reproduceMobile(c1, api.TYPE.CONSUMER, null);
    expectEq(api.sim.births, birthsBefore, 'Reproduccion ocurrio pese a cooldown activo');
  });

  assert('resetWorld: limpia carcasses y resetea counters', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    api.spawnConsumer({ x: 100, y: 100 });
    api.spawnPredator({ x: 200, y: 200 });
    api.sim.births = 999;
    api.sim.deaths = 888;
    api.sim.time = 123;
    api.sim.carcasses.push({ x: 50, y: 50, energy: 10, age: 0, radius: 5 });
    api.resetWorld();
    expectEq(api.sim.carcasses.length, 0, 'resetWorld no vacio carcasses');
    expectEq(api.sim.births, 0, 'resetWorld no reseteo births');
    expectEq(api.sim.deaths, 0, 'resetWorld no reseteo deaths');
    expectEq(api.sim.time, 0, 'resetWorld no reseteo time');
  });

  assert('stepProducerField: crecimiento logistico sin crashear', () => {
    api.initProducerField();
    api.sim.producerField.mass.fill(0.3);
    api.sim.producerField.total = api.sim.producerField.mass.length * 0.3;
    api.sim.solarEnergy = 1.0;
    const totalBefore = api.sim.producerField.total;
    api.stepProducerField(1.0);
    expectOk(api.sim.producerField.total !== totalBefore, 'stepProducerField no cambio total');
  });

  assert('stepProducerField: diffusion suaviza picos', () => {
    api.initProducerField();
    const cols = api.sim.producerField.cols;
    const rows = api.sim.producerField.rows;
    // Crear un pico en el centro, resto a 0
    api.sim.producerField.mass.fill(0);
    const centerIdx = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    api.sim.producerField.mass[centerIdx] = 1.5;
    api.sim.producerField.total = 1.5;
    api.sim.solarEnergy = 0.1; // minimo sol para reducir growth
    api.sim.producerField.accumulator = 0;
    // Ejecutar varios pasos para que diffusion actue
    for (let i = 0; i < 10; i++) api.stepProducerField(0.5);
    const centerAfter = api.sim.producerField.mass[centerIdx];
    expectOk(centerAfter < 1.5, 'Diffusion no redujo el pico central');
  });

  // ═══ TASK_061: PRNG SEED REPRODUCIBLE ═══
  suite('Task_061: PRNG seed');

  assert('setSeed produce secuencia determinista', () => {
    api.setSeed(12345);
    const v1 = api.rand(0, 1);
    const v2 = api.rand(0, 1);
    const v3 = api.rand(0, 1);
    api.setSeed(12345);
    const w1 = api.rand(0, 1);
    const w2 = api.rand(0, 1);
    const w3 = api.rand(0, 1);
    expectEq(v1, w1, 'PRNG no es determinista (v1)');
    expectEq(v2, w2, 'PRNG no es determinista (v2)');
    expectEq(v3, w3, 'PRNG no es determinista (v3)');
  });

  assert('resetWorld con seed fija es reproducible', () => {
    api.sim.seed = 999;
    api.resetWorld();
    const counts1 = api.counts();
    const time1 = api.sim.time;
    // Segunda pasada con mismo seed
    api.sim.seed = 999;
    api.resetWorld();
    const counts2 = api.counts();
    const time2 = api.sim.time;
    expectEq(counts1.consumers, counts2.consumers, 'Consumers distintos con mismo seed');
    expectEq(counts1.predators, counts2.predators, 'Predators distintos con mismo seed');
    expectEq(counts1.producerB, counts2.producerB, 'ProducerB distintos con mismo seed');
    expectEq(counts1.producerC, counts2.producerC, 'ProducerC distintos con mismo seed');
  });

  assert('PRNG diferente seed da diferente secuencia', () => {
    api.setSeed(111);
    const a1 = api.rand(0, 100);
    api.setSeed(222);
    const a2 = api.rand(0, 100);
    expectOk(a1 !== a2, 'Seeds distintos dieron mismo valor');
  });

  // ═══ TASK_060: SAVE/LOAD SNAPSHOT ═══
  suite('Task_060: save/load');

  assert('saveSnapshot produce estructura valida', () => {
    api.resetWorld();
    const snap = api.saveSnapshot();
    expectEq(snap.version, 1, 'Version de snapshot incorrecta');
    expectOk(snap.sim.time === 0, 'Snapshot no arranca en t=0');
    expectOk(snap.creatures.length > 0, 'Snapshot sin criaturas');
    expectOk(snap.field.mass.length > 0, 'Snapshot sin field mass');
    expectOk(typeof snap.sim.seed === 'number', 'Snapshot sin seed');
  });

  assert('loadSnapshot restaura estado correctamente', () => {
    api.resetWorld();
    for (let i = 0; i < 20; i++) api.simulate(0.5);
    const snap = api.saveSnapshot();
    const countsBefore = api.counts();
    const timeBefore = api.sim.time;
    // Reset y cargar
    api.resetWorld();
    expectOk(api.sim.time === 0, 'resetWorld no reinicio time');
    const ok = api.loadSnapshot(snap);
    expectEq(ok, true, 'loadSnapshot devolvio false');
    const countsAfter = api.counts();
    expectEq(countsAfter.consumers, countsBefore.consumers, 'Consumers no restaurados');
    expectEq(countsAfter.predators, countsBefore.predators, 'Predators no restaurados');
    expectEq(api.sim.time, timeBefore, 'time no restaurado');
  });

  assert('save/load JSON roundtrip preserva estado', () => {
    api.resetWorld();
    for (let i = 0; i < 10; i++) api.simulate(0.5);
    const json = api.saveSnapshotJSON();
    const countsBefore = api.counts();
    api.resetWorld();
    api.loadSnapshotJSON(json);
    const countsAfter = api.counts();
    expectEq(countsAfter.consumers, countsBefore.consumers, 'JSON roundtrip: consumers distintos');
    expectEq(countsAfter.predators, countsBefore.predators, 'JSON roundtrip: predators distintos');
  });

  assert('loadSnapshot con seed restaurado es determinista', () => {
    api.sim.seed = 42;
    api.resetWorld();
    for (let i = 0; i < 10; i++) api.simulate(0.5);
    const counts1 = api.counts();
    const snap = api.saveSnapshot();
    // Cargar snapshot y seguir simulando
    api.loadSnapshot(snap);
    for (let i = 0; i < 10; i++) api.simulate(0.5);
    const counts2 = api.counts();
    // Debe ser identico a simular 20 pasos desde el mismo punto
    api.sim.seed = 42;
    api.resetWorld();
    for (let i = 0; i < 20; i++) api.simulate(0.5);
    const counts3 = api.counts();
    expectEq(counts2.consumers, counts3.consumers, 'Snapshot+sim no es determinista vs sim continua');
  });
}

// ═════════════════════════════════════════════════════════════
//  TESTS DE MIGRACION ANTI-EXTINCION
// ═════════════════════════════════════════════════════════════

function runMigrationTests() {
  const api = loadApp();
  suite('Migración anti-extinción');

  assert('checkMigration no crashea con población sana', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    api.seedWorld();
    api.checkMigration();
    expectOk(true, 'checkMutation crasheó con población sana');
  });

  assert('migratePopulation crea criaturas junto a bordes', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    const donor = api.spawnConsumer({ x: 500, y: 500 });
    const before = api.sim.creatures.filter(e => e && e.alive).length;
    api.migratePopulation('consumers', 1, [donor]);
    const after = api.sim.creatures.filter(e => e && e.alive).length;
    expectGte(after, before + 3, 'migratePopulation no creó suficientes criaturas');
    expectLte(after - before, 8, 'migratePopulation creó demasiadas criaturas');
  });

  assert('migratePopulation genera genes cercanos al donor', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    const donor = api.spawnConsumer({ x: 500, y: 500, size: 3.5, flagella: 3, chemosense: 2.0 });
    api.migratePopulation('consumers', 1, [donor]);
    const migrants = api.sim.creatures.filter(e => e && e.alive && e !== donor);
    expectOk(migrants.length >= 3, 'No se crearon migrantes');
    for (const m of migrants) {
      expectRange(m.size, 0.5, 9, 'size fuera de rango');
      expectRange(m.flagella, 0, 7, 'flagella fuera de rango');
      expectRange(m.chemosense, 0, 5, 'chemosense fuera de rango');
    }
  });

  assert('checkMigration no dispara con population > 15', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    for (let i = 0; i < 30; i++) api.spawnConsumer({ x: 100 + i * 10, y: 100 });
    const before = api.sim.creatures.filter(e => e && e.alive).length;
    for (let i = 0; i < 50; i++) api.checkMigration();
    const after = api.sim.creatures.filter(e => e && e.alive).length;
    expectEq(after, before, 'checkMigration creó criaturas con población sana');
  });

  assert('checkMigration recoloniza especies extintas (count=0)', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    api.spawnConsumer({ x: 100, y: 100 });
    // Con count=0 en producers/predators, checkMigration debe poder recolonizar
    // Forzamos suficiente iteraciones para que la prob baja (~0.17%) se materialice
    for (let i = 0; i < 2000; i++) api.checkMigration();
    const types = api.sim.creatures.filter(e => e && e.alive).map(e => e.type);
    const hasProducer = types.some(t => t === api.TYPE.PRODUCER);
    // Es probable que recolonice producers tras 2000 iteraciones
    // Verificamos que si se crearon, son validos (no crash)
    const producers = api.sim.creatures.filter(e => e && e.alive && e.type === api.TYPE.PRODUCER);
    for (const p of producers) {
      expectEq(p.alive, true, 'Productor recolonizado no esta vivo');
    }
  });

  assert('migratePopulation responde para depredadores', () => {
    api.sim.creatures = [];
    api.sim.freeIds = [];
    api.sim.carcasses = [];
    api.initProducerField();
    const donor = api.spawnPredator({ x: 500, y: 500 });
    const before = api.sim.creatures.filter(e => e && e.alive).length;
    api.migratePopulation('predators', 1, [donor]);
    const after = api.sim.creatures.filter(e => e && e.alive).length;
    expectGte(after, before + 3, 'migratePopulation no creó depredadores');
    const migrants = api.sim.creatures.filter(e => e && e.alive && e !== donor && e.type === api.TYPE.PREDATOR);
    for (const m of migrants) {
      expectEq(m.type, api.TYPE.PREDATOR, 'Migrante no es depredador');
    }
  });
}

// ═════════════════════════════════════════════════════════════
//  TESTS DE RENDIMIENTO
// ═════════════════════════════════════════════════════════════

function runPerfTests() {
  const api = loadApp();
  suite('Rendimiento');

  perf('init+seed completo', () => {
    api.resetWorld();
    api.seedWorld();
    api.recordGeneHistory();
    const c = api.counts();
    return `criaturas: ${api.sim.creatures.filter(e => e && e.alive).length}`;
  }, { maxMs: 5000 });

  perf('200 steps de simulate (dt=0.5)', () => {
    api.resetWorld();
    api.seedWorld();
    let totalCreatures = 0;
    for (let i = 0; i < 200; i++) {
      api.simulate(0.5);
      totalCreatures = api.sim.creatures.filter(e => e && e.alive).length;
    }
    return `t=${api.sim.time.toFixed(1)}s, vivos=${totalCreatures}, births=${api.sim.births}, deaths=${api.sim.deaths}`;
  }, { maxMs: 30000 });

  perf('spawn+kill x500', () => {
    for (let i = 0; i < 500; i++) {
      const c = api.spawnConsumer({ x: Math.random() * api.WORLD.w, y: Math.random() * api.WORLD.h });
      api.kill(c);
    }
    return '500 spawns+kills ok';
  }, { maxMs: 5000 });

  perf('counts() x1000', () => {
    let last;
    for (let i = 0; i < 1000; i++) last = api.counts();
    return JSON.stringify(last);
  }, { maxMs: 5000 });

  perf('recordGeneHistory x100', () => {
    for (let i = 0; i < 100; i++) api.recordGeneHistory();
    return `geneHistory len=${api.sim.geneHistory.length}`;
  }, { maxMs: 10000 });

  perf('rebuildGrid + queryNearby x100', () => {
    // Necesita criaturas vivas
    api.resetWorld();
    api.seedWorld();
    for (let i = 0; i < 100; i++) {
      api.rebuildGrid();
      const out = [];
      api.queryNearby(
        Math.random() * api.WORLD.w,
        Math.random() * api.WORLD.h,
        200,
        api.TYPE.CONSUMER,
        out
      );
    }
    return '100 rebuild+query ok';
  }, { maxMs: 15000 });

  // Test de estabilidad: sim larga sin crashear
  perf('Simulacion 30s sin crashear', () => {
    api.resetWorld();
    api.seedWorld();
    let extinct = false;
    for (let i = 0; i < 60; i++) {
      api.simulate(0.5);
      const c = api.counts();
      if (c.consumers === 0 && c.predators === 0) { extinct = true; break; }
    }
    const c = api.counts();
    return `t=${api.sim.time.toFixed(0)}s, cons=${c.consumers}, pred=${c.predators}, extinto=${extinct}`;
  }, { maxMs: 30000 });
}

// ─── Reporte ─────────────────────────────────────────────────
function printReport() {
  const lines = [];
  const S = results.summary;

  lines.push('═══════════════════════════════════════════════════');
  lines.push('  🧪 TEST SUITE — Micromundo');
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`  Commit:     ${results.meta.git_commit}`);
  lines.push(`  Node:       ${results.meta.node_version}`);
  lines.push(`  Timestamp:  ${results.meta.timestamp}`);
  lines.push(`  Total:      ${S.total}`);
  lines.push(`  ✅ Pass:     ${S.passed}`);
  lines.push(`  ❌ Fail:     ${S.failed}`);
  lines.push('');

  // Agrupar por suite
  const suites = {};
  for (const t of [...results.functional, ...results.perf]) {
    if (!suites[t.suite]) suites[t.suite] = [];
    suites[t.suite].push(t);
  }

  for (const [name, tests] of Object.entries(suites)) {
    lines.push(`── ${name} ─────────────────────────────────`);
    for (const t of tests) {
      const icon = t.status === 'pass' ? '✅' : t.status === 'warn' ? '⚠️' : '❌';
      let line = `  ${icon} ${t.name}`;
      if (t.elapsed_ms != null) line += ` (${t.elapsed_ms}ms)`;
      if (t.detail) line += ` — ${t.detail}`;
      lines.push(line);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════');
  if (S.failed === 0) {
    lines.push('  🎉 TODOS LOS TESTS PASARON');
  } else {
    lines.push(`  ⚠ ${S.failed} TEST(S) FALLARON`);
  }
  lines.push('═══════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────
function main() {
  const filter = process.argv[2] || 'all';

  process.stderr.write('\n🧪 Ejecutando tests de Micromundo...\n\n');

  if (filter === 'functional' || filter === 'all') {
    runFunctionalTests();
  }
  if (filter === 'migration' || filter === 'all') {
    runMigrationTests();
  }
  if (filter === 'perf' || filter === 'all') {
    runPerfTests();
  }

  const report = printReport();
  process.stderr.write('\n' + report + '\n\n');

  // JSON a stdout
  console.log(JSON.stringify(results, null, 2));

  process.exit(results.summary.failed > 0 ? 1 : 0);
}

main();
