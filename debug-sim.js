#!/usr/bin/env node
/**
 * debug-sim.js — Script de depuración para Micromundo
 *
 * Simula una ejecución rápida headless (sin DOM real, sin rendering) del
 * ecosistema completo para analizar equilibrio, extinciones, reproducción
 * y evolución genética.
 *
 * Uso:
 *   node debug-sim.js [duración_minutos]
 *
 * Por defecto simula 5 minutos a máxima velocidad.
 *
 * Métricas registradas cada INTERVAL_SEC segundos de simulación:
 *   - Poblaciones por tipo (productor A/B/C, consumidores, depredadores)
 *   - Energía promedio del sistema
 *   - Nacimientos y muertes acumulados
 *   - Valores genéticos medios por grupo
 *   - Eventos de extinción
 *
 * Output: JSON en stdout + resumen legible en stderr.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── Configuración ───────────────────────────────────────────
const DURATION_MIN = parseFloat(process.argv[2]) || 5;
const SIM_DT = 0.5;                       //dt por chunk: más grande = más rápido (aprox correcta para análisis)
const CHUNKS_PER_ITER = 50;               //chunks por iteración de bucle
const INTERVAL_SEC = 10;                 //cada cuántos segundos sim registramos métricas
const PROJ_DIR = path.resolve(__dirname);

// ─── Hash de commit para trazabilidad ────────────────────────
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: PROJ_DIR, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ─── Mock de DOM mínimo ──────────────────────────────────────
function createDomMock() {
  const fakeCanvas = {
    width: 800,
    height: 600,
    getContext: () => ({
      setTransform: () => {},
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      drawImage: () => {},
    }),
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  };

  const fakeElement = {
    textContent: '',
    innerHTML: '',
    value: '50',
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    appendChild: () => {},
    removeChild: () => {},
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 800,
    clientHeight: 600,
    offsetWidth: 800,
    offsetHeight: 600,
  };

  const canvasIds = new Set(['world', 'graph', 'geneGraph']);
  const documentMock = {
    getElementById: (id) => canvasIds.has(id) ? fakeCanvas : fakeElement,
    querySelector: () => fakeElement,
    querySelectorAll: () => [],
    createElement: () => fakeElement,
    createTextNode: () => fakeElement,
    body: fakeElement,
    documentElement: fakeElement,
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
  };

  const windowMock = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };

  return { documentMock, windowMock, fakeCanvas, fakeElement };
}

// ─── Carga y ejecución de app.js ─────────────────────────────
function loadSim() {
  const appJsPath = path.join(PROJ_DIR, 'app.js');
  let src = fs.readFileSync(appJsPath, 'utf8');

  // Reemplazar init() por exports: no llamamos init() (evita animationLoop/DOM)
  const exportsCode = `
    globalThis.__sim = {
      simulate,
      counts,
      sim,
      stepProducer,
      stepMobile,
      seedWorld,
      resetWorld,
      initProducerField,
      recordGeneHistory,
      spawnProducer,
      spawnConsumer,
      spawnPredator,
      kill,
      GROUPS,
      GROUP_KEYS,
      GROUP_LABELS,
      TYPE,
      PRODUCER,
      WORLD
    };
  `;
  src = src.replace(/\n  init\(\);\n\}\)\(\);\s*$/, '\n' + exportsCode + '\n})();\n');
  if (!src.includes('globalThis.__sim')) {
    throw new Error('No se pudo inyectar exports en app.js');
  }

  const { documentMock, windowMock } = createDomMock();

  const context = {
    window: windowMock,
    document: documentMock,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    Intl: Intl,
    Number,
    Math,
    Date,
    console,
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    Float32Array,
    Uint8ClampedArray,
    Map,
    Set,
    Array,
    Object,
    String,
    Boolean,
    JSON,
    Error,
    globalThis: {},
  };
  context.globalThis = context;
  context.self = context;

  vm.createContext(context);
  vm.runInContext(src, context, { filename: 'app.js' });

  if (!context.__sim) throw new Error('No se pudo extraer __sim de app.js');
  return context.__sim;
}

// ─── Motor de simulación headless ────────────────────────────
function runSimulation(durationSec) {
  const api = loadSim();

  // Init sin rendering ni animationLoop
  api.initProducerField();
  api.seedWorld();
  api.recordGeneHistory();

  const gitHash = getGitHash();
  const simStartTime = Date.now();

  const metrics = [];
  const extinctions = [];
  let lastRecordTime = 0;
  let prevCounts = api.counts();

  // Función para registrar métricas periódicas
  function recordMetrics() {
    const c = api.counts();
    const total = c.producerDensity + c.producerB + c.producerC + c.consumers + c.predators;

    // Recoger genes promedio por grupo
    const genes = {};
    for (const group of api.GROUPS) {
      const genePoint = api.sim.geneHistory.length > 0
        ? api.sim.geneHistory[api.sim.geneHistory.length - 1]
        : null;
      if (genePoint && genePoint[group]) {
        genes[group] = {
          n: genePoint[group].n,
          avg: genePoint[group].avg
        };
      }
    }

    // Detectar extinciones
    const labels = {
      producerDensity: 'Productor A (densidad)',
      producerB: 'Productor B (colonia)',
      producerC: 'Productor C (móvil)',
      consumers: 'Consumidores',
      predators: 'Depredadores'
    };
    const countMap = {
      producerDensity: c.producerDensity,
      producerB: c.producerB,
      producerC: c.producerC,
      consumers: c.consumers,
      predators: c.predators
    };
    for (const key of Object.keys(countMap)) {
      if (prevCounts[key] > 0 && countMap[key] === 0) {
        extinctions.push({
          t: parseFloat(api.sim.time.toFixed(1)),
          group: labels[key],
          key
        });
      }
    }
    prevCounts = c;

    metrics.push({
      t: parseFloat(api.sim.time.toFixed(1)),
      sim_time_mmss: formatTime(api.sim.time),
      populations: {
        producerA_density: parseFloat(c.producerDensity.toFixed(4)),
        producerB: c.producerB,
        producerC: c.producerC,
        consumers: c.consumers,
        predators: c.predators,
        total_creatures: api.sim.creatures.filter(e => e && e.alive).length
      },
      energy: {
        avg: parseFloat(c.energyAvg.toFixed(2))
      },
      events: {
        births: api.sim.births,
        deaths: api.sim.deaths
      },
      genes
    });

    lastRecordTime = api.sim.time;
  }

  // Registro inicial
  recordMetrics();

  // Bucle principal de simulación a máxima velocidad
  let nextGeneRecord = 0;

  while (api.sim.time < durationSec) {
    const remaining = Math.ceil((durationSec - api.sim.time) / SIM_DT);
    const batch = Math.min(CHUNKS_PER_ITER, remaining);
    for (let i = 0; i < batch && api.sim.time < durationSec; i++) {
      api.simulate(SIM_DT);
    }

    // Registrar genes periódicamente
    if (api.sim.time >= nextGeneRecord) {
      api.recordGeneHistory();
      nextGeneRecord = api.sim.time + INTERVAL_SEC;
    }

    // Registrar métricas cada INTERVAL_SEC
    if (api.sim.time - lastRecordTime >= INTERVAL_SEC) {
      recordMetrics();
    }
  }

  // Registro final
  recordMetrics();

  const wallTime = Date.now() - simStartTime;

  // ─── Reporte ──────────────────────────────────────────────
  const first = metrics[0];
  const last = metrics[metrics.length - 1];

  const report = {
    meta: {
      git_commit: gitHash,
      duration_sim_sec: parseFloat(api.sim.time.toFixed(1)),
      wall_time_ms: wallTime,
      speed_factor: parseFloat((api.sim.time * 1000 / wallTime).toFixed(1)),
      sim_dt: SIM_DT,
      chunks_per_iter: CHUNKS_PER_ITER,
      interval_sec: INTERVAL_SEC,
      timestamp: new Date().toISOString()
    },
    summary: {
      start: first,
      end: last,
      extinctions,
      peaks: findPeaks(metrics),
      survival: checkSurvival(last)
    },
    metrics
  };

  return report;
}

// ─── Utilidades de reporte ───────────────────────────────────
function formatTime(t) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function findPeaks(metrics) {
  const peaks = {};
  const keys = ['producerA_density', 'producerB', 'producerC', 'consumers', 'predators'];
  for (const key of keys) {
    let peak = 0;
    let peakT = 0;
    for (const m of metrics) {
      const v = m.populations[key];
      if (v > peak) {
        peak = v;
        peakT = m.t;
      }
    }
    peaks[key] = { peak: parseFloat(peak.toFixed(2)), at_t: peakT };
  }
  return peaks;
}

function checkSurvival(lastMetric) {
  const p = lastMetric.populations;
  return {
    producerA: p.producerA_density > 0.01,
    producerB: p.producerB > 0,
    producerC: p.producerC > 0,
    consumers: p.consumers > 0,
    predators: p.predators > 0,
    all_alive: p.producerA_density > 0.01 && p.producerB > 0 && p.producerC > 0 && p.consumers > 0 && p.predators > 0
  };
}

function printHumanReport(report) {
  const lines = [];
  const M = report.meta;
  const S = report.summary;

  lines.push('═══════════════════════════════════════════════════');
  lines.push('  🔬 DEBUG-SIM — Micromundo Ecosystem Analysis');
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Commit:      ${M.git_commit}`);
  lines.push(`  Sim time:    ${formatTime(M.duration_sim_sec)} (${M.duration_sim_sec}s)`);
  lines.push(`  Wall time:   ${(M.wall_time_ms / 1000).toFixed(1)}s`);
  lines.push(`  Speed:       ${M.speed_factor}x real-time`);
  lines.push(`  Timestamp:   ${M.timestamp}`);
  lines.push('');

  // Poblaciones inicio vs fin
  const f = S.start.populations;
  const l = S.end.populations;
  lines.push('── POBLACIONES ─────────────────────────────────────');
  lines.push('  Grupo               Inicio       Final        Pico         Pico@t');
  lines.push('  ────────────────────────────────────────────────────────────────');
  const rows = [
    ['Prod A (densidad)', f.producerA_density, l.producerA_density, S.peaks.producerA_density],
    ['Prod B (colonia)',  f.producerB,         l.producerB,         S.peaks.producerB],
    ['Prod C (móvil)',    f.producerC,         l.producerC,         S.peaks.producerC],
    ['Consumidores',      f.consumers,         l.consumers,         S.peaks.consumers],
    ['Depredadores',      f.predators,         l.predators,         S.peaks.predators]
  ];
  for (const [label, fv, lv, pk] of rows) {
    const fmtV = (v) => typeof v === 'number' && v < 100 ? v.toFixed(2) : Math.round(v).toString();
    lines.push(
      `  ${label.padEnd(19)} ${fmtV(fv).padStart(12)} ${fmtV(lv).padStart(12)} ${fmtV(pk.peak).padStart(12)} ${formatTime(pk.at_t).padStart(8)}`
    );
  }
  lines.push('');

  // Energía
  lines.push('── ENERGÍA ─────────────────────────────────────────');
  lines.push(`  Inicio: ${S.start.energy.avg.toFixed(2)}  →  Final: ${S.end.energy.avg.toFixed(2)}`);
  lines.push('');

  // Nacimientos / Muertes
  lines.push('── EVENTOS ─────────────────────────────────────────');
  lines.push(`  Nacimientos: ${S.end.events.births}`);
  lines.push(`  Muertes:     ${S.end.events.deaths}`);
  lines.push('');

  // Extinciones
  if (S.extinctions.length > 0) {
    lines.push('── ⚠ EXTINCIONES ───────────────────────────────────');
    for (const ext of S.extinctions) {
      lines.push(`  ${formatTime(ext.t)} — ${ext.group} se extinguió`);
    }
    lines.push('');
  } else {
    lines.push('── ✅ Sin extinciones detectadas ────────────────────');
    lines.push('');
  }

  // Supervivencia
  lines.push('── SUPERVIVENCIA FINAL ─────────────────────────────');
  const sv = S.survival;
  const icon = (ok) => ok ? '✅' : '❌';
  lines.push(`  ${icon(sv.producerA)} Productor A (densidad)`);
  lines.push(`  ${icon(sv.producerB)} Productor B (colonia)`);
  lines.push(`  ${icon(sv.producerC)} Productor C (móvil)`);
  lines.push(`  ${icon(sv.consumers)} Consumidores`);
  lines.push(`  ${icon(sv.predators)} Depredadores`);
  lines.push('');

  // Genes finales
  if (S.end.genes) {
    lines.push('── GENES PROMEDIO FINAL ────────────────────────────');
    for (const group of Object.keys(S.end.genes)) {
      const g = S.end.genes[group];
      const geneStrs = Object.entries(g.avg).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`);
      lines.push(`  ${group} (n=${g.n}): ${geneStrs.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────
function main() {
  const durationSec = DURATION_MIN * 60;

  process.stderr.write(`\n🔬 debug-sim: simulando ${DURATION_MIN} min (${durationSec}s) a máxima velocidad...\n\n`);

  const report = runSimulation(durationSec);

  // JSON a stdout
  console.log(JSON.stringify(report, null, 2));

  // Resumen legible a stderr
  process.stderr.write('\n');
  process.stderr.write(printHumanReport(report));
  process.stderr.write('\n\n');
}

main();
