#!/usr/bin/env node
// task_922 CP2 analyzer: dual-ledger masa/E batch 5x90m gate metrics.
// Usage: node analyze_task922.js [--off control_off_10m.json] [glob...]
// Defaults: task_922_results/batch90_seed*.json
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let offPath = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--off') offPath = args[++i];
  else files.push(args[i]);
}
const dir = __dirname;
const list = files.length ? files
  : fs.readdirSync(dir).filter(f => /^batch90_seed\d+\.json$/.test(f))
      .sort().map(f => path.join(dir, f));

if (!list.length) { console.error('no batch json found'); process.exit(2); }

function slopePctPer10min(pts) {
  // pts: [{t,s}] ; linear regression slope per second -> % of mean per 10min
  if (pts.length < 3) return NaN;
  const n = pts.length;
  let st = 0, ss = 0, stt = 0, sts = 0;
  for (const p of pts) { st += p.t; ss += p.s; stt += p.t * p.t; sts += p.t * p.s; }
  const slope = (n * sts - st * ss) / (n * stt - st * st); // units/sec
  const mean = ss / n;
  return Math.abs(slope) * 600 / mean * 100; // % of mean per 10 min
}

function cv(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  if (m === 0) return 0;
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length;
  return Math.sqrt(v) / Math.abs(m) * 100;
}

function geneDiversity(metricsEnd, species) {
  // mean over traits of stdev/mean (CV) using avg+variance per trait
  const g = metricsEnd.genes && metricsEnd.genes[species];
  if (!g || !g.avg) return null;
  let sum = 0, n = 0;
  for (const k of Object.keys(g.avg)) {
    const mean = g.avg[k], vari = (g.variance && g.variance[k]) || 0;
    if (mean && isFinite(mean) && Math.abs(mean) > 1e-12) { sum += Math.sqrt(Math.max(vari, 0)) / Math.abs(mean); n++; }
  }
  return n ? (sum / n) : null;
}

const OFF = offPath && fs.existsSync(offPath) ? JSON.parse(fs.readFileSync(offPath, 'utf8')) : null;
const offRun = OFF && OFF.runs && OFF.runs[0];
const offDiv = offRun ? geneDiversity(offRun.metrics[offRun.metrics.length - 1], 'consumer') : null;
const offCost = offRun ? offRun.wall_time_ms / offRun.duration_sim_sec : null;

const rows = [];
for (const f of list) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of d.runs) {
    const met = r.metrics;
    const last = met[met.length - 1];
    const pops = met.map(m => ({ t: m.t, s: m.populations.consumers }));
    const last10 = pops.filter(p => p.t >= last.t - 600);
    const allC = pops.map(p => p.s);
    const lateC = last10.map(p => p.s);
    const div = geneDiversity(last, 'consumer');
    const ext = (r.extinctions || []).map(e => `${e.group}@${e.t}`);
    rows.push({
      file: path.basename(f), seed: r.seed,
      dual_residual_max_pct: r.dual_residual_max_pct,
      A_density: last.populations.producerA_density,
      consumers: last.populations.consumers,
      alive_AC: last.populations.producerA_density > 0 && last.populations.consumers > 0,
      cv_all_pct: cv(allC), cv_late_pct: cv(lateC),
      slope_late_pct_per10m: slopePctPer10min(last10),
      diversity_cv: div, diversity_ratio_off: (div != null && offDiv != null) ? div / offDiv : null,
      cost_wall_per_sim_s: r.wall_time_ms / r.duration_sim_sec,
      cost_ratio_off: offCost ? (r.wall_time_ms / r.duration_sim_sec) / offCost : null,
      extinctions: ext.join(';') || 'none',
    });
  }
}

// gates (task_922)
const g = {
  residual: rows.every(r => r.dual_residual_max_pct <= 2),
  alive5: rows.length === 5 && rows.every(r => r.alive_AC),
  cv: rows.every(r => r.cv_late_pct <= 25),
  slope: rows.every(r => r.slope_late_pct_per10m <= 5),
  diversity: offDiv != null ? rows.every(r => r.diversity_ratio_off != null && r.diversity_ratio_off >= 0.8) : null,
  cost: offCost != null ? rows.every(r => r.cost_ratio_off <= 1.05) : null,
};

console.log('| run | seed | dualRes% | A | cons | alive | CV_late% | slope%/10m | divCV | div/OFF | wall/sim | cost/OFF | ext |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(`| ${r.file} | ${r.seed} | ${r.dual_residual_max_pct} | ${r.A_density.toFixed(3)} | ${r.consumers} | ${r.alive_AC} | ${r.cv_late_pct.toFixed(1)} | ${r.slope_late_pct_per10m.toFixed(2)} | ${r.diversity_cv?.toFixed(4) ?? 'n/a'} | ${r.diversity_ratio_off?.toFixed(3) ?? 'n/a'} | ${r.cost_wall_per_sim_s.toFixed(3)} | ${r.cost_ratio_off?.toFixed(3) ?? 'n/a'} | ${r.extinctions} |`);
console.log('\nGATES (922): residual<=2%:', g.residual, '| A+cons 5/5:', g.alive5, '| CV<=25%:', g.cv,
  '| slope<=5%/10m:', g.slope, '| div>=80% OFF:', g.diversity, '| cost<=1.05x OFF:', g.cost);
const pass = Object.values(g).every(v => v !== false);
console.log('OVERALL:', pass ? 'PASS' : 'FAIL');
