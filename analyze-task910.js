#!/usr/bin/env node
// task_910: análisis del batch 5x10m OFF — viabilidad energética del predator
// Criterios de Jared:
//   soporta: >=4/5 extinciones <10m, ingreso/metab < 0.8, capture/preyNear < 0.1%
//   refuta: 5/5 sobreviven o ingreso/metab >= 1
const fs = require('fs');
const path = require('path');

const dir = __dirname + '/task_910_results';
const files = fs.readdirSync(dir).filter(f => /^run_\d+_seed\d+\.json$/.test(f)).sort();
if (!files.length) { console.error('sin runs'); process.exit(1); }

const rows = [];
for (const f of files) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, f))).runs[0];
  const ms = run.metrics;
  const last = ms[ms.length - 1];
  // extinction: primer t con predators==0 tras t>0
  let extT = null;
  for (const m of ms) { if (m.t > 0 && m.populations.predators === 0) { extT = m.t; break; } }
  // medias temporales sobre intervalos con predators>0 (funnel/balance solo significan con predator vivo)
  const live = ms.filter(m => m.t > 0 && m.populations.predators > 0);
  const mean = k => live.length ? live.reduce((a, m) => a + (m.flows[k] || 0), 0) / live.length : 0;
  const inc = mean('predIncome'), met = mean('predMetab'), th = mean('predThermal');
  const pn = mean('fnlPreyNear'), cap = mean('fnlCapture');
  rows.push({
    seed: f.match(/seed(\d+)/)[1],
    extT, ext10m: extT !== null && extT < 600,
    predIncome: +inc.toFixed(3), predMetab: +met.toFixed(3), predThermal: +th.toFixed(3),
    incMetab: +(met > 0 ? inc / met : 0).toFixed(3),
    capPreyNearPct: +(pn > 0 ? 100 * cap / pn : 0).toFixed(3),
    finalPreds: last.populations.predators,
    finalCons: last.populations.consumers,
    finalProdC: last.populations.producerC,
  });
}

const extCount = rows.filter(r => r.ext10m).length;
const survivors = rows.filter(r => !r.ext10m).length;
const incMetabMax = Math.max(...rows.map(r => r.incMetab));
const capPNMax = Math.max(...rows.map(r => r.capPreyNearPct));
const incMetabMean = rows.reduce((a, r) => a + r.incMetab, 0) / rows.length;

console.log('seed      extT    ext<10m  income  metab   inc/metab  cap/preyNear%  final(pC/cons/pred)');
for (const r of rows) {
  console.log(`${r.seed}  ${String(r.extT ?? 'alive').padEnd(7)} ${String(r.ext10m).padEnd(7)}  ${String(r.predIncome).padEnd(7)} ${String(r.predMetab).padEnd(7)} ${String(r.incMetab).padEnd(9)}  ${String(r.capPreyNearPct).padEnd(12)}  ${r.finalProdC}/${r.finalCons}/${r.finalPreds}`);
}
console.log(`\nextinciones<10m: ${extCount}/${rows.length}  supervivientes: ${survivors}`);
console.log(`ingreso/metab: media=${incMetabMean.toFixed(3)} max=${incMetabMax}`);
console.log(`capture/preyNear: max=${capPNMax}%`);

let verdict;
if (survivors === rows.length || incMetabMax >= 1) verdict = 'REFUTADA: 5/5 sobreviven o ingreso/metab>=1';
else if (extCount >= 4 && incMetabMax < 0.8 && capPNMax < 0.1) verdict = 'SOPORTADA: >=4/5 extinciones<10m, inc/metab<0.8, cap/preyNear<0.1%';
else verdict = `MIXTA (ext=${extCount}/5, maxIncMetab=${incMetabMax}, maxCapPN=${capPNMax}%)`;
console.log(`VEREDICTO: ${verdict}`);
fs.writeFileSync(__dirname + '/task_910_results/analysis.json', JSON.stringify({ rows, extCount, incMetabMax, capPNMax, verdict }, null, 2));
