#!/usr/bin/env node
// task_921 analyze: Gate ON 5x10m summary
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const OFF_DIR = path.join(__dirname, '..', '..', 'baseline_off_60m');

function loadRuns(dir) {
  return fs.readdirSync(dir).filter(f => /^run_\d+_seed\d+\.json$/.test(f))
    .sort().map(f => {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const r = j.runs ? j.runs[0] : j;
      r.__file = f;
      r.__config = j.config || (j.meta && j.meta.config) || {};
      return r;
    });
}

function analyze(r) {
  const M = r.metrics || {};
  const samples = Object.values(M).sort((a, b) => a.t - b.t);
  const res = { seed: r.seed };
  // stock A: energy.field > 0 at all t
  res.fieldMin = Infinity;
  res.stockOK = samples.length > 0;
  // cumulative ledger (flows are rates E/s sampled at interval)
  let prevT = null, conservIn = 0, conservAssim = 0, conservDetritus = 0,
    conservStarved = 0, metab = 0, thermal = 0, repro = 0;
  const has = k => samples.some(s => (s.flows && s.flows[k] !== undefined));
  for (const s of samples) {
    if (!(s.energy && s.energy.field > 0)) res.stockOK = false;
    res.fieldMin = Math.min(res.fieldMin, s.energy ? s.energy.field : 0);
    const f = s.flows || {};
    const dt = prevT === null ? 0 : (s.t - prevT);
    conservIn += (f.conservIn || 0) * dt;
    conservAssim += (f.conservAssim || 0) * dt;
    conservDetritus += (f.conservDetritus || 0) * dt;
    conservStarved += (f.conservStarved || 0) * dt;
    metab += (f.metabolism || 0) * dt;
    thermal += (f.thermal || 0) * dt;
    repro += (f.reproduction || 0) * dt;
    prevT = s.t;
  }
  // residual: |in - (assim + detritus + starved_expected)| / in ; real closure: in = assim + detritus (+starved as recorded loss)
  const denom = conservIn;
  res.conservIn = conservIn;
  res.conservAssim = conservAssim;
  res.conservDetritus = conservDetritus;
  res.conservStarved = conservStarved;
  res.residualPct = denom > 0 ? Math.abs(conservIn - (conservAssim + conservDetritus + conservStarved)) / denom * 100 : NaN;
  // ratio: assimilated / metabolic demand (metabolism + thermal + reproduction). No explicit "metab demand" metric exists;
  // documented: uses flows.metabolism + flows.thermal + flows.reproduction accumulated.
  const demand = metab + thermal + repro;
  res.demand = demand;
  res.metab = metab; res.thermal = thermal; res.repro = repro;
  res.ratio = demand > 0 ? conservAssim / demand : NaN;
  // final populations
  const last = samples[samples.length - 1];
  const pop = last.populations || {};
  res.finalA = pop.producerA_density;
  res.finalConsumers = pop.consumers;
  res.aliveOK = (pop.producerA_density >= 1 || (res.fieldMin >= 0 && pop.producerA_density > 0)) && pop.consumers >= 1;
  res.aliveA = (pop.producerA_density || 0) > 0; // density metric, not a count; "vivos" = density>0 (field stock separately >0)
  res.aliveCons = (pop.consumers || 0) >= 1;
  // wall cost
  const simSec = r.duration_sim_sec || (last.t || 600);
  res.wallPerSim = (r.wall_time_ms / 1000) / simSec;
  res.simSec = simSec; res.wallSec = r.wall_time_ms / 1000;
  return res;
}

const runs = loadRuns(DIR);
const offRuns = loadRuns(OFF_DIR);
const offWallPerSim = offRuns.length
  ? offRuns.reduce((a, r) => a + (r.wall_time_ms / 1000) / (r.duration_sim_sec || 3600), 0) / offRuns.length
  : NaN;

const rows = runs.map(analyze);
const costPct = offWallPerSim ? (rows.reduce((a, r) => a + r.wallPerSim, 0) / rows.length) / offWallPerSim * 100 - 100 : NaN;

const verdicts = rows.map(r => ({
  seed: r.seed,
  stock: r.stockOK,
  residual: isFinite(r.residualPct) && r.residualPct <= 2,
  ratio: isFinite(r.ratio) && r.ratio >= 0.8 && r.ratio <= 1.2,
  alive: r.aliveA && r.aliveCons
}));
const costOK = isFinite(costPct) && costPct <= 5;
const allOK = verdicts.every(v => v.stock && v.residual && v.ratio && v.alive) && costOK;

const fmt = (x, d = 2) => isFinite(x) ? x.toFixed(d) : 'n/a';
let out = '';
out += '=== task_921 Gate ON 5x10m summary ===\n';
out += `runs: ${rows.length}/5  (window 0..600s)\n`;
out += `OFF baseline wall/sim (task_920, 60m runs): ${fmt(offWallPerSim, 4)} (n=${offRuns.length})\n`;
out += `mean ON wall/sim: ${fmt(rows.reduce((a, r) => a + r.wallPerSim, 0) / rows.length, 4)}\n`;
out += `cost overhead ON vs OFF: ${fmt(costPct, 2)}% (limit <=5%)\n\n`;
out += 'seed    | stock>0 | fieldMin   | residual% | assim     | demand    | ratio | A_final | consumers | wall/sim\n';
out += '--------+---------+------------+-----------+-----------+-----------+-------+---------+-----------+----------\n';
for (const r of rows) {
  out += `${String(r.seed).padEnd(7)} | ${r.stockOK ? 'OK' : 'FAIL'}    | ${fmt(r.fieldMin, 1).padStart(10)} | ${fmt(r.residualPct, 3).padStart(9)} | ${fmt(r.conservAssim, 0).padStart(9)} | ${fmt(r.demand, 0).padStart(9)} | ${fmt(r.ratio).padStart(5)} | ${fmt(r.finalA, 1).padStart(7)} | ${String(r.finalConsumers).padStart(9)} | ${fmt(r.wallPerSim, 3)}\n`;
}
out += '\nNotes:\n';
out += '- residual = |conservIn - (conservAssim+conservDetritus+conservStarved)| / conservIn (real closure incl. starved loss), cumulative over 0..600s.\n';
out += '- ratio = cum conservAssim / cum (metabolism+thermal+reproduction). No dedicated "metab demand" metric exists; used available metabolic expenditure flows from flows.*.\n';
out += '- stock A = energy.field > 0 at every sample.\n';
out += '- cost = mean(wall/sim ON) / mean(wall/sim OFF baseline_off_60m) - 1. Caveat: OFF runs are 60m duration; wall/sim normalizes duration.\n\n';
out += `VERDICT: ${allOK ? 'PASA' : 'FALLA'}\n`;
for (const v of verdicts) {
  const fails = [];
  if (!v.stock) fails.push('stock');
  if (!v.residual) fails.push('residual>2%');
  if (!v.ratio) fails.push('ratio fuera [0.8,1.2]');
  if (!v.alive) fails.push('poblacion muerta');
  out += `  seed ${v.seed}: ${fails.length ? 'FALLA (' + fails.join(', ') + ')' : 'ok'}\n`;
}
if (!costOK) out += `  coste: FALLA (${fmt(costPct, 2)}% > 5%)\n`;
process.stdout.write(out);
fs.writeFileSync(path.join(DIR, 'gate_summary.txt'), out);
