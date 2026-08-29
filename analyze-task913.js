#!/usr/bin/env node
// task_913 Gate 1 (shadow-only): proyeccion upper-bound de un aparato
// cono+tether morfologico del predator, sin cambiar conducta.
//
// Modelo UB (generoso a favor de la hipotesis):
//  - opportunity = presa gape-compatible dentro de tether (60px, efectivo
//    min(60, radio de query perception*RANGE_SCALE)) y cono frontal 30 grados.
//  - Si TODA oportunidad fuese captura exitosa al ceiling fisico:
//      captureRateUB = min(oppFrac * throttleHz, 1 / (handlingAvg + digestAvg))
//    handlingAvg ~ 1.8+0.35*sizeAvg+0.4 ~ 3.1s ; digestAvg = (8+15)/2 = 11.5s
//    => ciclo ~14.6s (asuncion documentada; sizeAvg no muestreado).
//  - incomeUB = captureRateUB * gainUBavg (gain capado a 1.3x energia presa).
//  - ratioUB = incomeUB / metabPerPredator.
// Gate 1: ratioUB >= 0.8 -> pasa a implementacion pareada; < 0.8 -> refutada.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'task_913_results');
const SEEDS = [12345, 20264, 28183, 36102, 44021];
const CYCLE_S = 14.6; // handling+digest medio (documentado)

function loadRun(prefix, i, seed) {
  const f = path.join(DIR, `${prefix}_${i + 1}_seed${seed}.json`);
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return d.runs ? d.runs[0] : d;
}

function shadowUB(run) {
  const m = run.metrics;
  const fl = m.map(x => x.flows);
  const sum = k => fl.reduce((a, f) => a + (f[k] || 0), 0);
  const simSec = run.duration_sim_sec;
  const pops = m.map(x => x.populations);
  const avgPred = pops.reduce((a, p) => a + (p.predators || 0), 0) / pops.length;
  const predSteps = sum('shdPredSteps');
  const coneSteps = sum('shdConeSteps');
  const episodes = sum('shdEpisodes');
  const gainUBSum = sum('shdGainUBSum');
  const tetherOpp = sum('shdTetherOpp');
  const predMetab = sum('predMetab');
  const predIncome = sum('predIncome');
  const oppFrac = predSteps > 0 ? coneSteps / predSteps : 0;
  const throttleHz = simSec * avgPred > 0 ? predSteps / (simSec * avgPred) : 0;
  const gainUBavg = coneSteps > 0 ? gainUBSum / coneSteps : 0;
  const attemptRate = oppFrac * throttleHz;
  const captureRateUB = Math.min(attemptRate, 1 / CYCLE_S);
  const incomeUB = captureRateUB * gainUBavg;
  const metabPerPred = simSec * avgPred > 0 ? predMetab / (simSec * avgPred) : 0;
  const incomeReal = simSec * avgPred > 0 ? predIncome / (simSec * avgPred) : 0;
  return {
    seed: run.seed, simSec, avgPred: +avgPred.toFixed(1),
    predSteps, coneSteps, tetherOpp, episodes,
    oppFrac: +oppFrac.toFixed(4), throttleHz: +throttleHz.toFixed(3),
    gainUBavg: +gainUBavg.toFixed(1), attemptRate: +attemptRate.toFixed(4),
    captureRateUB: +captureRateUB.toFixed(4), incomeUB: +incomeUB.toFixed(3),
    metabPerPred: +metabPerPred.toFixed(4), incomeReal: +incomeReal.toFixed(4),
    ratioUB: +(metabPerPred > 0 ? incomeUB / metabPerPred : 0).toFixed(2),
    ratioReal: +(metabPerPred > 0 ? incomeReal / metabPerPred : 0).toFixed(4),
    predatorExtinctAt: (run.extinctions || []).filter(e => e.group === 'predator').map(e => e.t)[0] || null,
    wallSim: +(simSec / (run.wall_time_ms / 1000)).toFixed(2),
  };
}

const prefix = process.argv[2] || 'run_sh';
const rows = [];
SEEDS.forEach((seed, i) => {
  const run = loadRun(prefix, i, seed);
  if (run) rows.push(shadowUB(run));
});

if (!rows.length) { console.error('no runs found for prefix ' + prefix); process.exit(1); }

console.log('=== task_913 Gate 1 shadow-only: upper-bound cono+tether ===');
console.log(`ciclo handling+digest asumido: ${CYCLE_S}s (generoso)`);
for (const r of rows) {
  console.log(`seed ${r.seed}: pred=${r.avgPred} oppFrac=${r.oppFrac} throttle=${r.throttleHz}Hz gainUB=${r.gainUBavg}E`);
  console.log(`  attempt=${r.attemptRate}/s capUB=${r.captureRateUB}/s incomeUB=${r.incomeUB}E/s metab=${r.metabPerPred}E/s -> ratioUB=${r.ratioUB} (real ${r.ratioReal}) extinto=${r.predatorExtinctAt} wallSim=${r.wallSim}`);
}
const pass = rows.filter(r => r.ratioUB >= 0.8).length;
const meanRatioUB = rows.reduce((a, r) => a + r.ratioUB, 0) / rows.length;
console.log(`\nseeds con ratioUB>=0.8: ${pass}/${rows.length}; media ratioUB=${meanRatioUB.toFixed(2)}`);
console.log(pass === rows.length
  ? 'GATE 1 PASA (todos >=0.8): procede implementacion pareada Gate 2'
  : 'GATE 1 REFUTA (ratio proyectado <0.8 en alguna/algunas seeds): cerrar sin implementar');

// ===== Gate 2: comparación pareada OFF/ON 5 seeds x10m =====
// OFF = task_912_results/run_off_* (commit 008bd9f). Equivalencia: con
// predTether OFF y sin __SHADOW, el codigo añadido en task_913 es inerte
// (guards por flag), asi que OFF 008bd9f es baseline pareado valido.
function gate2() {
  const offRuns = SEEDS.map((s, i) => {
    const f = path.join(__dirname, 'task_912_results', `run_off_${i + 1}_seed${s}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).runs[0] : null;
  });
  const onRuns = SEEDS.map((s, i) => {
    const f = path.join(__dirname, 'task_913_results', `run_on_${i + 1}_seed${s}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).runs[0] : null;
  });
  if (onRuns.some(r => !r)) { console.log('\n[gate2] runs ON incompletos; espera a que acabe el batch'); return null; }
  const sum = (run, k) => run.metrics.reduce((a, m) => a + (m.flows[k] || 0), 0);
  const cv = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length) / Math.max(1, mu); };
  const rows = SEEDS.map((seed, i) => {
    const on = onRuns[i], off = offRuns[i] || null;
    const pops = on.metrics.map(m => m.populations);
    const preds = pops.map(p => p.predators);
    const cons = pops.map(p => p.consumers);
    const extinctAt = (on.extinctions || []).filter(e => e.group === 'predator').map(e => e.t)[0] || null;
    const income = sum(on, 'predIncome'), metab = sum(on, 'predMetab');
    const finalCons = cons[cons.length - 1];
    const offFinalCons = off ? off.metrics[off.metrics.length - 1].populations.consumers : null;
    const e0 = on.metrics[0].energy, eN = on.metrics[on.metrics.length - 1].energy;
    const wallSim = +(on.duration_sim_sec / (on.wall_time_ms / 1000)).toFixed(2);
    return {
      seed, alive: preds[preds.length - 1] > 0 && !extinctAt, extinctAt,
      finalPredators: preds[preds.length - 1], finalConsumers: finalCons,
      consVsOff: offFinalCons != null ? +(finalCons / offFinalCons).toFixed(3) : null,
      cvConsumers: +cv(cons).toFixed(3),
      ratioIncMetab: +(income / Math.max(1e-9, metab)).toFixed(3),
      tetherStrikes: sum(on, 'tetherStrike'),
      captures: sum(on, 'fnlCapture'),
      contactPerPreyNearPct: +(100 * sum(on, 'fnlContact') / Math.max(1, sum(on, 'fnlPreyNear'))).toFixed(3),
      energyDriftPct: +(100 * (eN.mobile_sum - e0.mobile_sum) / Math.max(1e-9, e0.mobile_sum)).toFixed(2),
      rescues: (on.extinctions || []).filter(e => e.group !== 'predator').length,
      wallSim, offWallSim: off ? +(off.duration_sim_sec / (off.wall_time_ms / 1000)).toFixed(2) : null,
    };
  });
  console.log('\n=== task_913 Gate 2: cono+tether ON, pareado vs OFF (008bd9f) ===');
  for (const r of rows) {
    console.log(`seed ${r.seed}: alive=${r.alive}${r.extinctAt ? ` (ext t=${r.extinctAt}s)` : ''} pred=${r.finalPredators} cons=${r.finalConsumers} (${(r.consVsOff * 100).toFixed(0)}% OFF) CV=${r.cvConsumers} ratio=${r.ratioIncMetab} strikes=${r.tetherStrikes} cap=${r.captures} contacto/preyNear=${r.contactPerPreyNearPct}% driftE=${r.energyDriftPct}% wall/sim=${r.wallSim} (OFF ${r.offWallSim}) rescates=${r.rescues}`);
  }
  const alive = rows.filter(r => r.alive).length;
  const ratios = rows.map(r => r.ratioIncMetab);
  const consPct = Math.min(...rows.map(r => r.consVsOff));
  const cvMax = Math.max(...rows.map(r => r.cvConsumers));
  const driftMax = Math.max(...rows.map(r => Math.abs(r.energyDriftPct)));
  const costPct = Math.max(...rows.map(r => (1 - r.wallSim / r.offWallSim) * 100));
  const contactPct = Math.min(...rows.map(r => r.contactPerPreyNearPct));
  const rescates = rows.reduce((a, r) => a + r.rescues, 0);
  console.log(`\nalive: ${alive}/5 (exito >=4); ratio ON min=${Math.min(...ratios)} max=${Math.max(...ratios)} (exito .8-1.2, fallo fuera .5-1.5)`);
  console.log(`consumers min vs OFF: ${(consPct * 100).toFixed(0)}% (exito >=70, fallo <50); CV max=${cvMax.toFixed(3)} (<=0.25); driftE max=${driftMax.toFixed(1)}% (<=10)`);
  console.log(`coste wall/sim max: ${costPct.toFixed(1)}% (<=5); contacto/preyNear min=${contactPct}% (exito >=1); rescates=${rescates}`);
  const pass = alive >= 4 && ratios.every(r => r >= 0.8 && r <= 1.2) && contactPct >= 1 && consPct >= 0.7 && cvMax <= 0.25 && driftMax <= 10 && costPct <= 5 && rescates === 0;
  const fail = alive <= 3 || ratios.some(r => r < 0.5 || r > 1.5) || consPct < 0.5 || costPct > 5;
  console.log(pass ? 'GATE 2 PASA' : fail ? 'GATE 2 REFUTADO' : 'GATE 2 PARCIAL (ni exito ni fallo umbral): hipotesis no soportada como exito');
  return { rows, alive, pass, fail };
}

const gate2Result = gate2();
const out = { prefix, cycle_s: CYCLE_S, rows, pass, mean_ratio_UB: +meanRatioUB.toFixed(3), gate2: gate2Result };
fs.writeFileSync(path.join(DIR, `gate1_${prefix}_analysis.json`), JSON.stringify(out, null, 2));
