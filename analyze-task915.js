#!/usr/bin/env node
// task_915 Gate 1 (shadow-only): viabilidad de alimentacion suctorial
// persistente, sin cambiar conducta.
//
// Evidencia 910-914: predator 0/5 en todos los gates, ingreso/metab .020-.092;
// task_913 UB por-paso (21.7-41.6) sobreestimaba por solape: contaba una
// captura completa por paso con la presa dentro del cono.
//
// Correccion de solapes: adquisicion = episodio continuo de CONTACTO fisico
// (eatRange) con la misma presa, contado UNA vez; transferencia proyectada
// solo si el episodio se sostiene >= 1.8s (piso de handling huntCooldown) o
// alcanza el cap de 30s, con techo ecologico de captura (cap 1.3x energia).
//
// Proyeccion de flujo: ingresoSuctorial(eta) = eta * transferSum / (simSec*avgPred)
// ratioProj(eta) = ingresoSuctorial / metabPerPred, eta = .3/.5/.7.
// Gate 1 pasa solo si 5/5 seeds ratioProj(0.7) >= 0.8 y coste <= 5%.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'task_915_results');
const SEEDS = [12345, 20264, 28183, 36102, 44021];

function loadRun(dir, prefix, i, seed) {
  const f = path.join(dir, `${prefix}_${i + 1}_seed${seed}.json`);
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return d.runs ? d.runs[0] : d;
}

function analyze(run) {
  const m = run.metrics;
  const sum = k => m.reduce((a, x) => a + (x.flows[k] || 0), 0);
  const simSec = run.duration_sim_sec;
  const pops = m.map(x => x.populations);
  const avgPred = pops.reduce((a, p) => a + (p.predators || 0), 0) / pops.length;
  const predMetab = sum('predMetab'), predIncome = sum('predIncome');
  const metabPerPred = simSec * avgPred > 0 ? predMetab / (simSec * avgPred) : 0;
  const incomeReal = simSec * avgPred > 0 ? predIncome / (simSec * avgPred) : 0;
  const transferSum = sum('shSucTransfer');
  const transferPerPred = simSec * avgPred > 0 ? transferSum / (simSec * avgPred) : 0;
  const row = {
    seed: run.seed, simSec, avgPred: +avgPred.toFixed(1),
    acq: sum('shSucAcq'), acqHeld: sum('shSucAcqHeld'),
    attachTime: +sum('shSucAttachTime').toFixed(1),
    transferSum: +transferSum.toFixed(1),
    transferPerPred: +transferPerPred.toFixed(3),
    metabPerPred: +metabPerPred.toFixed(4),
    incomeReal: +incomeReal.toFixed(4),
    wallSim: +(simSec / (run.wall_time_ms / 1000)).toFixed(3),
  };
  row.ratioProj = {};
  for (const eta of [0.3, 0.5, 0.7]) {
    row.ratioProj[eta] = +(metabPerPred > 0 ? (eta * transferPerPred) / metabPerPred : 0).toFixed(3);
  }
  return row;
}

const prefix = process.argv[2] || 'run_sh';
const rows = [];
SEEDS.forEach((seed, i) => {
  const run = loadRun(DIR, prefix, i, seed);
  if (run) rows.push(analyze(run));
});
if (!rows.length) { console.error('no runs found for prefix ' + prefix); process.exit(1); }

console.log('=== task_915 Gate 1 shadow-only: suctorial persistente (dedup por episodio) ===');
for (const r of rows) {
  console.log(`seed ${r.seed}: pred=${r.avgPred} acq=${r.acq} held=${r.acqHeld} attach=${r.attachTime}s transfer=${r.transferSum}E (${r.transferPerPred}E/s/pred)`);
  console.log(`  metab=${r.metabPerPred}E/s/pred real=${r.incomeReal} -> ratioProj .3=${r.ratioProj[0.3]} .5=${r.ratioProj[0.5]} .7=${r.ratioProj[0.7]} wallSim=${r.wallSim}`);
}

// Coste: comparar wallSim medio contra los runs shadow de task_913 (misma condicion)
const sh913 = SEEDS.map((s, i) => loadRun(path.join(__dirname, 'task_913_results'), 'run_sh', i, s))
  .filter(Boolean).map(r => r.duration_sim_sec / (r.wall_time_ms / 1000));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const wallNow = mean(rows.map(r => r.wallSim));
const wall913 = mean(sh913);
const overhead = wall913 > 0 ? (wallNow - wall913) / wall913 : NaN;
console.log(`\nwallSim medio: shadow915=${wallNow.toFixed(3)} vs shadow913=${wall913.toFixed(3)} -> overhead=${(overhead * 100).toFixed(2)}%`);

const pass = rows.filter(r => r.ratioProj[0.7] >= 0.8).length;
console.log(`seeds con ratioProj(.7)>=0.8: ${pass}/${rows.length}; media ratioProj(.7)=${mean(rows.map(r => r.ratioProj[0.7])).toFixed(3)}`);
const costOk = isFinite(overhead) && overhead <= 0.05;
console.log(pass === rows.length && costOk
  ? 'GATE 1 PASA (5/5 >=0.8 en eta=.7 y coste <=5%): procede Gate 2 con flag OFF + checkpoint'
  : `GATE 1 REFUTA (${pass}/${rows.length} <0.8 en eta=.7${costOk ? '' : ' o coste>5%'}): publicar y cerrar`);
