#!/usr/bin/env node
// task_914 Gate 1 (shadow-only): proyeccion de seleccion de presa por
// rentabilidad neta frente a nearestFood por distancia, sin cambiar conducta.
//
// Evidencia base (83f3f2c, task_913): ratioReal ingreso/metab 0.044-0.092,
// shadow UB 21.7-41.6. Richard: nearestFood elige distancia y podria estar
// bloqueando encuentros rentables.
//
// Modelo de proyeccion (documentado, generoso a favor de la hipotesis):
//  - gainNear/gainScore: ceiling fisico de captura (cap 1.3x energia presa)
//    del objetivo elegido por nearest vs por score=gain/(1+dist).
//  - Proyeccion multiplica el ingreso REAL observado por:
//      multGain = sum(gainScore)/sum(gainNear)   (presa mas rentable)
//      multDist = sum(distNear)/sum(distScore)   (caza mas corta => mas contacto)
//  - ratioProj = ratioReal * multGain * multDist, capado por ratioUB (913).
//  - Coste: wall/sim vs runs shadow de task_913 (misma condicion).
// Gate 1: si TODAS las seeds ratioProj >= 0.8 y coste <=5% -> Gate 2 (flag OFF
// + pareado 5x30m). Si alguna seed < 0.8 -> refutada, publicar y cerrar.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'task_914_results');
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
  const ratioReal = metabPerPred > 0 ? incomeReal / metabPerPred : 0;
  const selSteps = sum('shSelSteps'), selDiff = sum('shSelDiff');
  const gainNear = sum('shGainNearSum'), gainScore = sum('shGainScoreSum');
  const distNear = sum('shDistNearSum'), distScore = sum('shDistScoreSum');
  const multGain = gainNear > 0 ? gainScore / gainNear : 1;
  const multDist = distScore > 0 ? distNear / distScore : 1;
  const ratioProj = ratioReal * multGain * multDist;
  return {
    seed: run.seed, simSec, avgPred: +avgPred.toFixed(1),
    selSteps, diffFrac: +(selSteps > 0 ? selDiff / selSteps : 0).toFixed(3),
    gainNearAvg: +(selSteps > 0 ? gainNear / selSteps : 0).toFixed(1),
    gainScoreAvg: +(selSteps > 0 ? gainScore / selSteps : 0).toFixed(1),
    distNearAvg: +(selSteps > 0 ? distNear / selSteps : 0).toFixed(1),
    distScoreAvg: +(selSteps > 0 ? distScore / selSteps : 0).toFixed(1),
    multGain: +multGain.toFixed(3), multDist: +multDist.toFixed(3),
    ratioReal: +ratioReal.toFixed(4), ratioProj: +ratioProj.toFixed(3),
    wallSim: +(simSec / (run.wall_time_ms / 1000)).toFixed(3),
  };
}

const prefix = process.argv[2] || 'run_sh';
const rows = [];
SEEDS.forEach((seed, i) => {
  const run = loadRun(DIR, prefix, i, seed);
  if (run) rows.push(analyze(run));
});
if (!rows.length) { console.error('no runs found for prefix ' + prefix); process.exit(1); }

console.log('=== task_914 Gate 1 shadow-only: nearest vs score (rentabilidad neta) ===');
for (const r of rows) {
  console.log(`seed ${r.seed}: pred=${r.avgPred} selSteps=${r.selSteps} diffFrac=${r.diffFrac}`);
  console.log(`  gainNear=${r.gainNearAvg}E gainScore=${r.gainScoreAvg}E distNear=${r.distNearAvg}px distScore=${r.distScoreAvg}px`);
  console.log(`  multGain=${r.multGain} multDist=${r.multDist} ratioReal=${r.ratioReal} -> ratioProj=${r.ratioProj} wallSim=${r.wallSim}`);
}

// Coste: comparar wallSim medio contra los runs shadow de task_913 (misma condicion)
const sh913 = SEEDS.map((s, i) => loadRun(path.join(__dirname, 'task_913_results'), 'run_sh', i, s))
  .filter(Boolean).map(r => r.duration_sim_sec / (r.wall_time_ms / 1000));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const wallNow = mean(rows.map(r => r.wallSim));
const wall913 = mean(sh913);
const overhead = wall913 > 0 ? (wallNow - wall913) / wall913 : NaN;
console.log(`\nwallSim medio: shadow914=${wallNow.toFixed(3)} vs shadow913=${wall913.toFixed(3)} -> overhead=${(overhead * 100).toFixed(2)}%`);

const pass = rows.filter(r => r.ratioProj >= 0.8).length;
console.log(`seeds con ratioProj>=0.8: ${pass}/${rows.length}; media ratioProj=${mean(rows.map(r => r.ratioProj)).toFixed(3)}`);
const costOk = isFinite(overhead) && overhead <= 0.05;
console.log(pass === rows.length && costOk
  ? 'GATE 1 PASA (todas >=0.8 y coste <=5%): procede Gate 2 con flag OFF + checkpoint'
  : `GATE 1 REFUTA (${pass}/${rows.length} <0.8${costOk ? '' : ' o coste>5%'}): publicar y cerrar`);
