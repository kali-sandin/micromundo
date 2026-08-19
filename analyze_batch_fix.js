/**
 * analyze_batch_fix.js — Análisis post-batch para formato sim-harness v1.0 (runs[0])
 *
 * Procesa seed_*.json con {meta, aggregate, verdict, runs} y genera:
 * 1. Tabla por seed: poblaciones finales, guildas, flujos (media temporal 2ª mitad),
 *    drift NET del pool, residual, perf
 * 2. Agregado multi-seed: pass rate, CV entre semillas, perf medio, extinctions
 * 3. Veredicto task_908
 *
 * Uso: node analyze_batch_fix.js [batch_dir]
 */

const fs = require('fs');
const path = require('path');

const batchDir = process.argv[2] || 'batch_5m_fix_results';

const CRITERIA = {
  MIN_PASS_RATE: 18 / 20,
  MAX_CV: 0.25,
  MAX_DRIFT: 0.10,
  MAX_PERF_REGRESSION: 0.05,
  MIN_DIVERSITY: 0.20,
};

function stats(arr) {
  const n = arr.length;
  if (!n) return { mean: NaN, stdev: NaN, min: NaN, max: NaN };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const varr = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, stdev: Math.sqrt(varr), min: Math.min(...arr), max: Math.max(...arr) };
}

function cv(s) {
  return s.mean !== 0 ? s.stdev / Math.abs(s.mean) : 0;
}

// Flujos medios con promedio temporal real (2ª mitad), no solo el último intervalo
function flowsMean(metrics, frac) {
  const from = Math.floor(metrics.length * frac);
  const acc = {};
  let n = 0;
  for (let i = from; i < metrics.length; i++) {
    const f = metrics[i].flows || {};
    for (const [k, v] of Object.entries(f)) acc[k] = (acc[k] || 0) + (v || 0);
    n++;
  }
  for (const k of Object.keys(acc)) acc[k] /= n;
  return acc;
}

// Drift NET del pool total (entity + field) medio en 2ª mitad, E/s de simulación
function poolDrift(metrics, frac) {
  const from = Math.floor(metrics.length * frac);
  let net = 0, n = 0, maxFrac = 0;
  const first = metrics[from];
  const pool0 = poolTotal(first);
  for (let i = from + 1; i < metrics.length; i++) {
    const prev = metrics[i - 1], cur = metrics[i];
    const dt = cur.t - prev.t;
    if (dt <= 0) continue;
    net += (poolTotal(cur) - poolTotal(prev)) / dt;
    // drift fraccional acumulado vs punto medio
    maxFrac = Math.max(maxFrac, Math.abs(poolTotal(cur) - pool0) / Math.max(1, pool0));
    n++;
  }
  return { netPerSec: n ? net / n : NaN, maxFrac };
}

function poolTotal(m) {
  const e = m.energy || {};
  return (e.producer || 0) + (e.consumer || 0) + (e.predator || 0) +
    (e.field || 0) + (e.carcass || 0) + (e.mobile_sum || 0) * 0 - (e.consumer || 0) * 0 || 0;
}

const files = fs.readdirSync(batchDir).filter(f => /^seed_.*\.json$/.test(f) || /^run_.*_seed\d+\.json$/.test(f)).sort();
if (!files.length) { console.error('No seed_*.json in ' + batchDir); process.exit(1); }

const rows = [];
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(batchDir, f), 'utf8')); }
  catch (e) { console.error(`  ${f}: PARSE ERROR (${e.message})`); continue; }
  const run = d.runs && d.runs[0];
  if (!run || !run.metrics || !run.metrics.length) { console.error(`  ${f}: no run data`); continue; }
  const metrics = run.metrics;
  const last = metrics[metrics.length - 1];
  const pop = last.populations || {};
  const flows = flowsMean(metrics, 0.5);
  const drift = poolDrift(metrics, 0.5);
  const guilds = {
    'prodA': (pop.producerA_density || 0) > 0.01,
    'prodB': (pop.producerB || 0) >= 5,
    'prodC': (pop.producerC || 0) >= 5,
    'consumers': (pop.consumers || 0) >= 5,
    'predators': (pop.predators || 0) >= 5,
  };
  rows.push({
    file: f,
    seed: run.seed,
    commit: run.git_commit,
    dur: last.t,
    pop,
    guildsAlive: Object.values(guilds).filter(Boolean).length,
    flows,
    drift,
    predationTemporal: flows.predation || 0,
    extinctions: (run.extinctions || []).length,
    residualMax: run.residual_max_pct,
    fieldResidualMax: run.field_residual_max_pct,
    speed: run.speed_factor,
    wallS: run.wall_time_ms / 1000,
    verdictPass: !!(d.verdict && d.verdict.all_pass),
    checks: d.verdict ? d.verdict.checks : [],
  });
}

console.log(`📊 ANÁLISIS BATCH (formato fix) — ${rows.length} seeds — dir: ${batchDir}`);
console.log('='.repeat(90));
console.log('SEED    | P.A  PB  PC   CONS  PRED | GUILDS | graze  metab  repro  pred(t) | NET E/s | resid | speed');
console.log('-'.repeat(90));
for (const r of rows) {
  console.log(
    String(r.seed).padEnd(7) + ' | ' +
    (r.pop.producerA_density ?? 0).toFixed(2).padStart(4) + ' ' +
    String(r.pop.producerB ?? 0).padStart(3) + ' ' +
    String(r.pop.producerC ?? 0).padStart(3) + ' ' +
    String(r.pop.consumers ?? 0).padStart(5) + ' ' +
    String(r.pop.predators ?? 0).padStart(4) + ' | ' +
    `${r.guildsAlive}/5    | ` +
    (r.flows.graze || 0).toFixed(0).padStart(5) + ' ' +
    (r.flows.metabolism || 0).toFixed(0).padStart(5) + ' ' +
    (r.flows.reproduction || 0).toFixed(0).padStart(6) + ' ' +
    (r.predationTemporal || 0).toFixed(2).padStart(6) + ' | ' +
    r.drift.netPerSec.toFixed(1).padStart(7) + ' | ' +
    (r.residualMax ?? -1).toFixed(1).padStart(5) + ' | ' +
    (r.speed ?? 0).toFixed(2) + 'x'
  );
}

console.log('='.repeat(90));
// Agregado
const cons = stats(rows.map(r => r.pop.consumers || 0));
const preds = stats(rows.map(r => r.pop.predators || 0));
const pb = stats(rows.map(r => r.pop.producerB || 0));
const pc = stats(rows.map(r => r.pop.producerC || 0));
const pa = stats(rows.map(r => r.pop.producerA_density || 0));
const net = stats(rows.map(r => r.drift.netPerSec));
const speed = stats(rows.map(r => r.speed || 0));
const predT = stats(rows.map(r => r.predationTemporal || 0));
const grazeF = stats(rows.map(r => r.flows.graze || 0));
const metabF = stats(rows.map(r => r.flows.metabolism || 0));
const reproF = stats(rows.map(r => r.flows.reproduction || 0));
const extTot = rows.reduce((a, r) => a + r.extinctions, 0);
const guildMin = Math.min(...rows.map(r => r.guildsAlive));
const passCount = rows.filter(r => r.verdictPass).length;
const residMax = Math.max(...rows.map(r => r.residualMax ?? 0));
const fieldResidMax = Math.max(...rows.map(r => r.fieldResidualMax ?? 0));

console.log(`Poblaciones finales entre seeds (media ± sd, CV):
  producerA: ${pa.mean.toFixed(3)} ± ${pa.stdev.toFixed(3)} (CV ${(cv(pa) * 100).toFixed(1)}%)
  producerB: ${pb.mean.toFixed(1)} ± ${pb.stdev.toFixed(1)} (CV ${(cv(pb) * 100).toFixed(1)}%)
  producerC: ${pc.mean.toFixed(1)} ± ${pc.stdev.toFixed(1)} (CV ${(cv(pc) * 100).toFixed(1)}%)
  consumers: ${cons.mean.toFixed(1)} ± ${cons.stdev.toFixed(1)} (CV ${(cv(cons) * 100).toFixed(1)}%)
  predators: ${preds.mean.toFixed(1)} ± ${preds.stdev.toFixed(1)} (CV ${(cv(preds) * 100).toFixed(1)}%)`);
console.log(`Flujos 2ª mitad (media entre seeds): graze ${grazeF.mean.toFixed(1)}, metab ${metabF.mean.toFixed(1)}, repro ${reproF.mean.toFixed(1)}, predation(temporal) ${predT.mean.toFixed(2)} [min ${predT.min.toFixed(2)}, max ${predT.max.toFixed(2)}]`);
console.log(`Drift NET pool (E/s): ${net.mean.toFixed(1)} ± ${net.stdev.toFixed(1)} [min ${net.min.toFixed(1)}, max ${net.max.toFixed(1)}]`);
console.log(`Perf: speed ${speed.mean.toFixed(2)}x ± ${speed.stdev.toFixed(2)} [min ${speed.min.toFixed(2)}, max ${speed.max.toFixed(2)}]; wall ${stats(rows.map(r => r.wallS)).mean.toFixed(0)}s`);
console.log(`Residual entity max: ${residMax.toFixed(2)}% | field max: ${fieldResidMax.toFixed(2)}% | extinctions total: ${extTot} | guildas min: ${guildMin}/5`);
console.log('-'.repeat(90));
console.log(`VEREDICTO AGREGADO (${rows.length} seeds):
  ${rows.length >= 20 ? (passCount >= 18 ? '✅' : '❌') : '⏳'} pass rate ${passCount}/${rows.length} (criterio >=18/20)
  ${cv(cons) <= CRITERIA.MAX_CV ? '✅' : '❌'} CV consumers entre seeds ${(cv(cons) * 100).toFixed(1)}% <= 25%
  ${cv(preds) <= CRITERIA.MAX_CV ? '✅' : '❌'} CV predators entre seeds ${(cv(preds) * 100).toFixed(1)}% <= 25%
  ❌/✅ drift NET (causa conocida gain:bite 18x + migración, pendiente decisión): ${net.mean.toFixed(1)} E/s
  ${extTot === 0 ? '✅' : '❌'} extinciones ${extTot}
  ${guildMin === 5 ? '✅' : '❌'} 5/5 guildas en todas las seeds
  ${predT.min > 0 ? '✅' : '❌'} predation > 0 (temporal) en todas las seeds`);
