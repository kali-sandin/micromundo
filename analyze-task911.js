#!/usr/bin/env node
// task_911: análisis del batch 5x8m OFF + spike pred-intermittent vs baseline task_910 (5x10m OFF, mismas seeds)
// Criterios de Jared (task_911):
//   exito:  >=4/5 predator vivos a 8m, ingreso/metab 0.8-1.2, contacto/preyNear >=1%,
//           consumers >50% baseline (t=480), p95 coste <=5% (wall/sim vs baseline)
//   fallo:  extincion >=2/5, ratio <0.5 o >1.5, consumers <=50% baseline, coste >5%
const fs = require('fs');
const path = require('path');

function loadRuns(dir) {
  return fs.readdirSync(dir).filter(f => /^run_\d+_seed\d+\.json$/.test(f)).sort()
    .map(f => {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f)));
      return { seed: f.match(/seed(\d+)/)[1], run: j.runs[0] };
    });
}
const spike = loadRuns(__dirname + '/task_911_results');
const base = loadRuns(__dirname + '/task_910_results');
if (!spike.length) { console.error('sin runs spike'); process.exit(1); }
if (!base.length) { console.error('sin runs baseline'); process.exit(1); }
const baseBySeed = Object.fromEntries(base.map(b => [b.seed, b]));

const rows = [];
for (const { seed, run } of spike) {
  const ms = run.metrics;
  const last = ms[ms.length - 1];
  const preds = last.populations.predators;
  const live = ms.filter(m => m.t > 0 && m.populations.predators > 0);
  const mean = k => live.length ? live.reduce((a, m) => a + (m.flows[k] || 0), 0) / live.length : 0;
  const inc = mean('predIncome'), met = mean('predMetab');
  const pn = mean('fnlPreyNear'), cap = mean('fnlCapture'), con = mean('fnlContact');
  const chase = mean('pursuitChase'), coast = mean('pursuitCoast');
  // baseline en t=480 (interpolar el intervalo mas cercano <=480)
  const b = baseBySeed[seed].run.metrics;
  const b480 = b.reduce((acc, m) => (m.t > 0 && m.t <= 480) ? m : acc, b[1]);
  const consRatio = b480.populations.consumers > 0
    ? last.populations.consumers / b480.populations.consumers : 0;
  // coste: wall por segundo de sim (throughput). p95 coste ~ comparar speed_factor.
  const bSpeed = baseBySeed[seed].run.speed_factor;
  const speedPenalty = bSpeed > 0 ? 1 - run.speed_factor / bSpeed : 1;
  rows.push({
    seed, predsFinal: preds, ext: preds === 0,
    predIncome: +inc.toFixed(3), predMetab: +met.toFixed(3),
    incMetab: +(met > 0 ? inc / met : 0).toFixed(3),
    contactPreyNearPct: +(pn > 0 ? 100 * con / pn : 0).toFixed(3),
    dutyChase: +(chase + coast > 0 ? chase / (chase + coast) : 0).toFixed(3),
    consRatio: +consRatio.toFixed(3),
    speedSpike: +run.speed_factor.toFixed(2), speedBase: +bSpeed.toFixed(2),
    speedPenaltyPct: +(100 * speedPenalty).toFixed(1),
    finalCons: last.populations.consumers, baseCons480: b480.populations.consumers,
  });
}

const alive = rows.filter(r => !r.ext).length;
const ratios = rows.filter(r => !r.ext).map(r => r.incMetab);
const cpnMin = Math.min(...rows.map(r => r.contactPreyNearPct));
const consMin = Math.min(...rows.map(r => r.consRatio));
const speedPenMax = Math.max(...rows.map(r => r.speedPenaltyPct));

console.log('seed    preds  income metab  inc/metab  cont/preyNear%  duty  cons/base  speed(spk/base  penal%)');
for (const r of rows) {
  console.log(`${r.seed}  ${String(r.predsFinal).padEnd(5)} ${String(r.predIncome).padEnd(6)} ${String(r.predMetab).padEnd(6)} ${String(r.incMetab).padEnd(9)}  ${String(r.contactPreyNearPct).padEnd(13)} ${String(r.dutyChase).padEnd(5)} ${String(r.consRatio).padEnd(8)} ${r.speedSpike}/${r.speedBase} (${r.speedPenaltyPct}%)`);
}
console.log(`\npredators vivos: ${alive}/${rows.length}`);
console.log(`inc/metab (vivos): ${ratios.length ? ratios.join(', ') : '-'}`);
console.log(`min contacto/preyNear: ${cpnMin}%  min consumers/baseline: ${consMin}  max penalizacion speed: ${speedPenMax}%`);

let verdict;
if (alive < 4) verdict = `FALLO: supervivencia ${alive}/5 <4`;
else if (ratios.some(x => x < 0.8 || x > 1.2)) verdict = `MIXTO: ratio fuera de 0.8-1.2 (${ratios.join(',')})`;
else if (cpnMin < 1) verdict = `MIXTO: contacto/preyNear ${cpnMin}% <1%`;
else if (consMin <= 0.5) verdict = `FALLO: consumers <=50% baseline (${consMin})`;
else if (speedPenMax > 5) verdict = `MIXTO: coste perf ${speedPenMax}% >5%`;
else verdict = 'SOPORTADO: >=4/5 vivos, ratio 0.8-1.2, contacto>=1%, consumers>50%, coste<=5%';
console.log(`VEREDICTO: ${verdict}`);
fs.writeFileSync(__dirname + '/task_911_results/analysis.json',
  JSON.stringify({ rows, alive, cpnMin, consMin, speedPenMax, verdict }, null, 2));
