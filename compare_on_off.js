#!/usr/bin/env node
/**
 * compare_on_off.js — Comparativa por semilla ON (migración) vs OFF (sin migración)
 *
 * Empareja run_*_seed<N>.json de dos directorios por semilla y compara:
 * - poblaciones finales (pA/pB/pC/cons/pred), guildas vivas, extinciones
 * - drift NET del pool (E/s, 2ª mitad), flujos medios (graze/metab/repro/predation)
 * - energía del pool final y residual entity max
 * - perf (speed_factor, wall)
 * - veredicto por semilla
 * + agregados (media ± sd por grupo, delta %, PASS rates)
 *
 * Uso: node compare_on_off.js <dir_on> <dir_off> [--frac=0.5]
 * Sanity: node compare_on_off.js batch_30m_results batch_30m_results  → deltas ~0
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => a.startsWith('--'));
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dirOn = pos[0];
const dirOff = pos[1];
const FRAC = parseFloat((args.find(a => a.startsWith('--frac=')) || '--frac=0.5').split('=')[1]);
if (!dirOn || !dirOff) {
  console.error('Uso: node compare_on_off.js <dir_on> <dir_off> [--frac=0.5]');
  process.exit(1);
}

function stats(arr) {
  const n = arr.length;
  if (!n) return { mean: NaN, stdev: NaN, min: NaN, max: NaN };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const varr = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, stdev: Math.sqrt(varr), min: Math.min(...arr), max: Math.max(...arr) };
}
const cvOf = s => (s.mean !== 0 ? s.stdev / Math.abs(s.mean) : 0);

function flowsMean(metrics, frac) {
  const from = Math.floor(metrics.length * frac);
  const acc = {}; let n = 0;
  for (let i = from; i < metrics.length; i++) {
    const f = metrics[i].flows || {};
    for (const [k, v] of Object.entries(f)) acc[k] = (acc[k] || 0) + (v || 0);
    n++;
  }
  for (const k of Object.keys(acc)) acc[k] /= Math.max(1, n);
  return acc;
}
function poolTotal(m) {
  const e = m.energy || {};
  return (e.producer || 0) + (e.consumer || 0) + (e.predator || 0) + (e.field || 0) + (e.carcass || 0);
}
function poolDrift(metrics, frac) {
  const from = Math.floor(metrics.length * frac);
  let net = 0, n = 0;
  for (let i = from + 1; i < metrics.length; i++) {
    const dt = metrics[i].t - metrics[i - 1].t;
    if (dt <= 0) continue;
    net += (poolTotal(metrics[i]) - poolTotal(metrics[i - 1])) / dt;
    n++;
  }
  return n ? net / n : NaN;
}
function loadRun(dir) {
  const out = new Map();
  const files = fs.readdirSync(dir).filter(f => /^run_.*_seed\d+\.json$/.test(f));
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch { continue; }
    const run = d.runs && d.runs[0];
    if (!run || !run.metrics || !run.metrics.length) continue;
    const metrics = run.metrics;
    const last = metrics[metrics.length - 1];
    const pop = last.populations || {};
    const guilds = {
      pA: (pop.producerA_density || 0) > 0.01,
      pB: (pop.producerB || 0) >= 5,
      pC: (pop.producerC || 0) >= 5,
      cons: (pop.consumers || 0) >= 5,
      pred: (pop.predators || 0) >= 5,
    };
    out.set(run.seed, {
      file: f, commit: run.git_commit,
      pop, guildsAlive: Object.values(guilds).filter(Boolean).length,
      flows: flowsMean(metrics, FRAC),
      drift: poolDrift(metrics, FRAC),
      poolFinal: poolTotal(last),
      extinctions: (run.extinctions || []).length,
      residualMax: run.residual_max_pct ?? NaN,
      speed: run.speed_factor ?? NaN,
      wallS: run.wall_time_ms / 1000,
      verdictPass: !!(d.verdict && d.verdict.all_pass),
      migration: !!run.migration_enabled,
    });
  }
  return out;
}

const on = loadRun(dirOn);
const off = loadRun(dirOff);
const seeds = [...on.keys()].filter(s => off.has(s)).sort((a, b) => a - b);
if (!seeds.length) {
  console.error(`Sin semillas comunes (ON ${on.size} seeds, OFF ${off.size} seeds, frac=${FRAC})`);
  process.exit(1);
}
const pct = (a, b) => (a !== 0 ? ((b - a) / Math.abs(a)) * 100 : NaN);

console.log(`🔁 COMPARATIVA ON vs OFF — semillas emparejadas: ${seeds.length} (ON ${on.size}, OFF ${off.size})`);
console.log(`   ON: ${dirOn} | OFF: ${dirOff} | flows/drift: 2ª mitad frac=${FRAC}`);
console.log('='.repeat(112));
console.log('SEED    |            ON pA/pB/pC/cons/pred gu ext |            OFF pA/pB/pC/cons/pred gu ext | Δcons%  Δpred%  Δpool%  Δdrift');
console.log('-'.repeat(112));
for (const s of seeds) {
  const a = on.get(s), b = off.get(s);
  const f = r => `${(r.pop.producerA_density ?? 0).toFixed(2)}/${String(r.pop.producerB ?? 0).padStart(3)}/${String(r.pop.producerC ?? 0).padStart(3)}/${String(r.pop.consumers ?? 0).padStart(4)}/${String(r.pop.predators ?? 0).padStart(3)}`;
  console.log(
    String(s).padEnd(7) + ' | ' + f(a).padEnd(30) + ` ${a.guildsAlive}/5 ${a.extinctions} | ` +
    f(b).padEnd(30) + ` ${b.guildsAlive}/5 ${b.extinctions} | ` +
    pct(a.pop.consumers || 0, b.pop.consumers || 0).toFixed(0).padStart(6) + '%' +
    pct(a.pop.predators || 0, b.pop.predators || 0).toFixed(0).padStart(7) + '%' +
    pct(a.poolFinal, b.poolFinal).toFixed(0).padStart(7) + '%' +
    (b.drift - a.drift).toFixed(1).padStart(8)
  );
}
console.log('='.repeat(112));

function agg(map, key) { return stats(seeds.map(s => map.get(s)[key])); }
function popStat(map, k) { return stats(seeds.map(s => map.get(s).pop[k] || 0)); }
function flowStat(map, k) { return stats(seeds.map(s => map.get(s).flows[k] || 0)); }

const line = (label, sA, sB) => {
  const d = pct(sA.mean, sB.mean);
  console.log(`  ${label.padEnd(24)} ON ${sA.mean.toFixed(2).padStart(9)} ± ${sA.stdev.toFixed(2).padStart(8)} (CV ${(cvOf(sA) * 100).toFixed(1)}%)  OFF ${sB.mean.toFixed(2).padStart(9)} ± ${sB.stdev.toFixed(2).padStart(8)} (CV ${(cvOf(sB) * 100).toFixed(1)}%)  Δ ${Number.isFinite(d) ? d.toFixed(1) + '%' : '—'}`);
};
console.log(`POBLACIONES FINALES (${seeds.length} seeds):`);
line('producerA density', popStat(on, 'producerA_density'), popStat(off, 'producerA_density'));
line('producerB', popStat(on, 'producerB'), popStat(off, 'producerB'));
line('producerC', popStat(on, 'producerC'), popStat(off, 'producerC'));
line('consumers', popStat(on, 'consumers'), popStat(off, 'consumers'));
line('predators', popStat(on, 'predators'), popStat(off, 'predators'));
console.log(`ENERGÍA / FLUJOS:`);
line('pool final (E)', agg(on, 'poolFinal'), agg(off, 'poolFinal'));
line('drift NET (E/s)', agg(on, 'drift'), agg(off, 'drift'));
line('graze', flowStat(on, 'graze'), flowStat(off, 'graze'));
line('metabolism', flowStat(on, 'metabolism'), flowStat(off, 'metabolism'));
line('reproduction', flowStat(on, 'reproduction'), flowStat(off, 'reproduction'));
line('predation (temporal)', flowStat(on, 'predation'), flowStat(off, 'predation'));
console.log(`ROBUSTEZ / PERF:`);
const passA = seeds.filter(s => on.get(s).verdictPass).length;
const passB = seeds.filter(s => off.get(s).verdictPass).length;
console.log(`  pass rate: ON ${passA}/${seeds.length} | OFF ${passB}/${seeds.length} (criterio >=18/20)`);
console.log(`  extinciones total: ON ${seeds.reduce((x, s) => x + on.get(s).extinctions, 0)} | OFF ${seeds.reduce((x, s) => x + off.get(s).extinctions, 0)}`);
console.log(`  guildas min: ON ${Math.min(...seeds.map(s => on.get(s).guildsAlive))}/5 | OFF ${Math.min(...seeds.map(s => off.get(s).guildsAlive))}/5`);
console.log(`  pC<15 seeds: ON ${seeds.filter(s => (on.get(s).pop.producerC || 0) < 15).length} | OFF ${seeds.filter(s => (off.get(s).pop.producerC || 0) < 15).length}`);
console.log(`  pred<15 seeds: ON ${seeds.filter(s => (on.get(s).pop.predators || 0) < 15).length} | OFF ${seeds.filter(s => (off.get(s).pop.predators || 0) < 15).length}`);
line('speed factor', agg(on, 'speed'), agg(off, 'speed'));
console.log(`  residual entity max: ON ${Math.max(...seeds.map(s => on.get(s).residualMax || 0)).toFixed(1)}% | OFF ${Math.max(...seeds.map(s => off.get(s).residualMax || 0)).toFixed(1)}%`);
// Watch +43% energía (aviso Jared)
const dPool = pct(agg(on, 'poolFinal').mean, agg(off, 'poolFinal').mean);
console.log('-'.repeat(112));
console.log(`⚑ Vigilancia Jared: Δ pool energía ON→OFF ${Number.isFinite(dPool) ? dPool.toFixed(1) + '%' : '—'} (referencia: ON tenía +43% vs OFF inválido); pC/pred<15 y pass rates arriba.`);
