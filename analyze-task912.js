#!/usr/bin/env node
// task_912: comparación formal pareada OFF/ON 5 seeds x 10m (protocolo Jared)
// Criterios: éxito >=4/5 vivos, ratio .8-1.2, contacto/preyNear >=1%,
// consumers >=70% OFF, CV<=25%, coste<=5%. Fallo: >=2/5 extintos, ratio fuera
// .5-1.5, consumers <50%, rescate o coste >5%.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'task_912_results');
const SEEDS = [12345, 20264, 28183, 36102, 44021];

function loadRuns(mode) {
  return SEEDS.map((seed, i) => {
    const f = path.join(DIR, `run_${mode}_${i + 1}_seed${seed}.json`);
    if (!fs.existsSync(f)) return null;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    return d.runs ? d.runs[0] : d;
  });
}

function summarize(run) {
  const s = run.metrics;
  const pops = s.map(x => x.populations);
  const predators = pops.map(p => p.predators);
  const consumers = pops.map(p => p.consumers);
  const fl = s.map(x => x.flows);
  const sum = k => fl.reduce((a, f) => a + (f[k] || 0), 0);
  const extinctAt = (run.extinctions || []).filter(e => e.group === 'predator').map(e => e.t)[0] || null;
  const finalPred = predators[predators.length - 1];
  return {
    seed: run.seed,
    wall_sim: +(run.duration_sim_sec * 1000 / run.wall_time_ms).toFixed(3),
    predator_alive: finalPred > 0,
    extinctAt,
    finalPredators: finalPred,
    finalConsumers: consumers[consumers.length - 1],
    avgConsumers: Math.round(consumers.reduce((a, b) => a + b, 0) / consumers.length),
    cvConsumers: cv(consumers),
    predIncome: +sum('predIncome').toFixed(1),
    predMetab: +sum('predMetab').toFixed(1),
    ratioIncMetab: +(sum('predIncome') / Math.max(1e-9, sum('predMetab'))).toFixed(3),
    preyNear: +sum('fnlPreyNear').toFixed(0),
    contact: +sum('fnlContact').toFixed(1),
    capture: +sum('fnlCapture').toFixed(1),
    contactPerPreyNearPct: +(100 * sum('fnlContact') / Math.max(1e-9, sum('fnlPreyNear'))).toFixed(3),
    ambushHide: +sum('ambushHide').toFixed(1),
    ambushLunge: +sum('ambushLunge').toFixed(1),
    rescues: (run.extinctions || []).filter(e => e.group !== 'predator').length,
  };
}

function cv(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const v = a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length;
  return +(Math.sqrt(v) / Math.max(1e-9, m)).toFixed(3);
}

function main() {
  const off = loadRuns('off').filter(Boolean).map(summarize);
  const on = loadRuns('on').filter(Boolean).map(summarize);
  console.log(`runs loaded: off=${off.length}/5 on=${on.length}/5\n`);
  for (const mode of ['off', 'on']) {
    const arr = mode === 'off' ? off : on;
    console.log(`=== ${mode.toUpperCase()} ===`);
    for (const r of arr) {
      console.log(`seed=${r.seed} alive=${r.predator_alive}${r.extinctAt ? ` (ext t=${r.extinctAt}s)` : ''} pred=${r.finalPredators} cons=${r.finalConsumers} ratio=${r.ratioIncMetab} contact/preyNear=${r.contactPerPreyNearPct}% hide=${r.ambushHide}s lunge=${r.ambushLunge}s wall/sim=${r.wall_sim}`);
    }
  }
  if (off.length === 5 && on.length === 5) {
    const alive = on.filter(r => r.predator_alive).length;
    const consRatio = on.reduce((a, r, i) => a + r.finalConsumers / Math.max(1, off[i].finalConsumers), 0) / 5;
    const ratios = on.map(r => r.ratioIncMetab);
    const contactPct = on.reduce((a, r) => a + r.contactPerPreyNearPct, 0) / 5;
    const cvMax = Math.max(...on.map(r => r.cvConsumers));
    const wallOff = off.reduce((a, r) => a + r.wall_sim, 0) / 5;
    const wallOn = on.reduce((a, r) => a + r.wall_sim, 0) / 5;
    const costPct = +(100 * (wallOn / wallOff - 1)).toFixed(2);
    const rescues = on.reduce((a, r) => a + r.rescues, 0);
    console.log('\n=== VEREDICTO (criterios task_912) ===');
    console.log(`predators vivos ON: ${alive}/5 (exito >=4, fallo <=3)`);
    console.log(`ratio ingreso/metab ON: min=${Math.min(...ratios)} max=${Math.max(...ratios)} (exito .8-1.2, fallo fuera .5-1.5)`);
    console.log(`contacto/preyNear ON medio: ${contactPct.toFixed(3)}% (exito >=1%)`);
    console.log(`consumers ON/OFF final medio: ${(100 * consRatio).toFixed(1)}% (exito >=70%, fallo <50%)`);
    console.log(`CV consumers ON max: ${cvMax} (<=0.25)`);
    console.log(`coste wall/sim ON vs OFF: ${costPct > 0 ? '+' : ''}${costPct}% (<=5%)`);
    console.log(`rescates ON: ${rescues}`);
    const pass = alive >= 4 && ratios.every(r => r >= 0.8 && r <= 1.2) && contactPct >= 1 &&
      consRatio >= 0.7 && cvMax <= 0.25 && costPct <= 5 && rescues === 0;
    const fail = alive <= 3 || ratios.some(r => r < 0.5 || r > 1.5) || consRatio < 0.5 || costPct > 5;
    console.log(`\nRESULTADO: ${pass ? 'EXITO' : fail ? 'FALLO (hipótesis refutada)' : 'MIXTO'}`);
  } else {
    console.log('\n(batch incompleto; veredicto pendiente)');
  }
}

function cv_(a) { return cv(a); }
main();
