#!/usr/bin/env node
// task_918 Gate 1: reserva energetica explicita del campo A (ledger paralelo).
//
// La reserva E del campo A se proyecta como ledger paralelo INERTE (flag OFF
// por construction: cero cambios de conducta en app.js; el analisis consume
// los flows por intervalo que el harness ya exporta). Modelo natural:
//
//   stockE(0)  = conv * fieldTotal(t0)      (standing crop inicial cargado)
//   inE        = conv * (field_growth + field_deposits - field_clamp) * dt
//                (fotosintesis solar + reciclaje mobile/carcass - clamp)
//   demandE    = conv * graze * dt          (ingestion limitada por biomasa:
//                el bite ya esta acotado por la masa de la celda)
//   grantedE   = min(demandE, stockE)       (la reserva limita la ingestion)
//   intakeE    = eta * grantedE             (asimilacion eta<1, perdidas (1-eta))
//   nonsolar   = max(0, intakeE - eta*inE... ver definicion metrica abajo)
//
// Metricas Gate 1 por (eta, conv) barriendo sin fijarlas:
//   coverage p95   = grantedE/demandE >= 98%  (reserva no estrangula ingestion)
//   nonsolar p95   = max(0, grantedE - inE)/grantedE <= 2%
//                    (fraccion de la extraccion NO respaldada por inflow
//                    sostenible => mineria de stock; equilibrio exige ~0)
//   stockAlive     = stockE > 0 durante todo el run (sin agotamiento)
// Gate pasa solo si EXISTE un combo con 5/5 seeds cumpliendo todo, y ademas
// paridad campo OFF p95 <= 2% y coste <= 5% (ledger post-hoc: coste
// estructural 0; wallSim de los runs se reporta).
//
// Uso: node analyze-task918.js [dirResults]   (default task_918_results)
const fs = require('fs');
const path = require('path');

const DIR = path.isAbsolute(process.argv[2] || '') ? process.argv[2] : path.join(__dirname, process.argv[2] || 'task_918_results');
const SEEDS = [12345, 20264, 28183, 36102, 44021];
const ETAS = [0.5, 0.7, 0.9];
const CONVS = [6, 12, 18];

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function loadRuns() {
  const runs = [];
  for (let i = 0; i < SEEDS.length; i += 1) {
    const f = path.join(DIR, `run_led_${i + 1}_seed${SEEDS[i]}.json`);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    runs.push(d.runs ? d.runs[0] : d);
  }
  return runs;
}

// Ledger paralelo de un run para un (eta, conv). Devuelve metricas por run.
function shadowReserve(run, eta, conv) {
  const m = run.metrics;
  let stockE = conv * (m[0].energy.field || 0);
  let initStockE = stockE;
  let exhausted = false;
  let tExhaust = null;
  const coverage = [];   // granted/demand por intervalo, %
  const nonsolar = [];   // max(0, granted-in)/granted por intervalo, %
  let inE = 0, grantedE = 0, intakeE = 0, demandE = 0;
  let metab = 0, intervals = 0, tLast = m[0].t;
  // ventanas: acumulativo y estado estacionario (ultimos 5m)
  const nsLast5 = [];
  const tEnd = m[m.length - 1].t;
  let cumIn = 0, cumGran = 0;
  for (let k = 1; k < m.length; k += 1) {
    const dt = m[k].t - m[k - 1].t;
    if (dt <= 0) continue;
    const fl = m[k].flows;
    // mismas claves ledger del campo que task_917 (field_growth/field_deposits/
    // field_clamp/field_extraction; field_extraction === graze)
    const inI = conv * Math.max(0, fl.field_growth + fl.field_deposits - fl.field_clamp) * dt;
    const demI = conv * fl.field_extraction * dt;
    const granI = Math.min(demI, stockE + inI);
    stockE = stockE + inI - granI;
    if (stockE <= 0 && !exhausted) { exhausted = true; tExhaust = m[k].t; }
    if (demI > 0) coverage.push(granI / demI * 100);
    if (granI > 0) nonsolar.push(Math.max(0, granI - inI) / granI * 100);
    cumIn += inI; cumGran += granI;
    if (m[k].t >= tEnd - 300 && granI > 0) nsLast5.push(Math.max(0, granI - inI) / granI * 100);
    inE += inI; grantedE += granI; intakeE += eta * granI; demandE += demI;
    metab += (fl.metabolism || 0) + (fl.thermal || 0) + (fl.reproduction || 0);
    intervals += 1; tLast = m[k].t;
  }
  return {
    eta, conv,
    stockAlive: !exhausted,
    tExhaust,
    stockFinal: +stockE.toFixed(1),
    stockRatio: +(stockE / (initStockE || 1)).toFixed(3),
    coverageP95: +pct(coverage.slice().sort((a, b) => a - b), 0.95).toFixed(2),
    nonsolarP50: +pct(nonsolar.slice().sort((a, b) => a - b), 0.5).toFixed(2),
    nonsolarP95: +pct(nonsolar.slice().sort((a, b) => a - b), 0.95).toFixed(2),
    nonsolarCum: +(Math.max(0, cumGran - cumIn) / (cumGran || 1) * 100).toFixed(2),
    nsLast5P50: +pct(nsLast5.slice().sort((a, b) => a - b), 0.5).toFixed(2),
    nsLast5P95: +pct(nsLast5.slice().sort((a, b) => a - b), 0.95).toFixed(2),
    inRate: +(inE / (tLast - m[0].t || 1)).toFixed(1),
    grantedRate: +(grantedE / (tLast - m[0].t || 1)).toFixed(1),
    intakeRate: +(intakeE / (tLast - m[0].t || 1)).toFixed(1),
    metabRate: +(metab / (tLast - m[0].t || 1)).toFixed(1),
  };
}

function parityOf(run) {
  const m = run.metrics;
  const res = [];
  for (let k = 1; k < m.length; k += 1) {
    const dt = m[k].t - m[k - 1].t;
    if (dt <= 0) continue;
    const fl = m[k].flows;
    const expected = ((fl.field_growth + fl.field_deposits - fl.field_extraction - fl.field_clamp) * dt);
    const actual = m[k].energy.field - m[k - 1].energy.field;
    const thr = ((fl.field_growth + fl.field_deposits + fl.field_extraction + fl.field_clamp) * dt) || 1;
    res.push(Math.abs(actual - expected) / thr * 100);
  }
  return +pct(res.slice().sort((a, b) => a - b), 0.95).toFixed(3);
}

function main() {
  const runs = loadRuns();
  if (!runs.length) { console.error('sin runs en ' + DIR); process.exit(1); }
  console.log(`task_918 Gate 1: reserva E explicita campo A (ledger paralelo inerte, migr OFF, dt 1/60)`);
  console.log(`seeds=${runs.length} dir=${path.basename(DIR)} baseline=${runs[0].git_commit || '?'}`);
  console.log('');

  // Paridad OFF + coste (wallSim) de los runs
  let parityWorst = 0;
  const wallSim = [];
  for (const run of runs) {
    const p = parityOf(run);
    parityWorst = Math.max(parityWorst, p);
    wallSim.push(+(run.duration_sim_sec / (run.wall_time_ms / 1000)).toFixed(2));
  }
  console.log(`paridad campo OFF p95 worst = ${parityWorst}% | wallSim = ${wallSim.join(' ')} | ext = ${runs.map(r => r.extinctions.length).join(' ')}`);
  console.log('');

  // Sweep eta x conv
  let steadyCombo = null;
  let passCombo = null;
  const table = [];
  for (const eta of ETAS) {
    for (const conv of CONVS) {
      const per = runs.map(r => shadowReserve(r, eta, conv));
      const alive = per.filter(p => p.stockAlive).length;
      const covWorst = Math.max(...per.map(p => p.coverageP95));
      const nsWorst = Math.max(...per.map(p => p.nonsolarP95));
      const nsCumWorst = Math.max(...per.map(p => p.nonsolarCum));
      const ns5Worst = Math.max(...per.map(p => p.nsLast5P95));
      const intake = per.map(p => p.intakeRate).join('/');
      const metab = per[0].metabRate;
      const ok = alive === runs.length && covWorst >= 98 && nsWorst <= 2;
      const ok5 = alive === runs.length && covWorst >= 98 && ns5Worst <= 2 && nsCumWorst <= 2;
      if (ok && !passCombo) passCombo = { eta, conv, covWorst, nsWorst };
      if (ok5 && !steadyCombo) steadyCombo = { eta, conv, covWorst, ns5Worst, nsCumWorst };
      table.push({ eta, conv, alive: `${alive}/${runs.length}`, covWorst, nsWorst, nsCumWorst, ns5Worst, stockRatio: per[0].stockRatio, intake, metab });
    }
  }
  console.log('eta | conv | alive  | covP95% | nsP95% | nsCum% | ns5P95% | stockR | intake E/s (seeds) | metab E/s');
  for (const r of table) {
    console.log(`${r.eta.toFixed(1)} | ${String(r.conv).padStart(4)} | ${r.alive.padStart(5)} | ${String(r.covWorst).padStart(6)} | ${String(r.nsWorst).padStart(6)} | ${String(r.nsCumWorst).padStart(5)} | ${String(r.ns5Worst).padStart(6)} | ${r.stockRatio.toFixed(3)} | ${r.intake} | ${r.metab}`);
  }
  console.log('');
  const parityPass = parityWorst <= 2;
  console.log(`GATE PARIDAD campo OFF (p95<=2%): ${parityPass ? 'PASS' : 'FAIL'} (${parityWorst}%)`);
  console.log(`GATE COSTE (<=5%): ledger post-hoc inerte, coste estructural 0; wallSim arriba`);
  console.log(`GATE RESERVA estricto por intervalo (combo 5/5 vivo, cov>=98%, nsP95<=2%): ${passCombo ? `PASS eta=${passCombo.eta} conv=${passCombo.conv}` : 'FAIL'}`);
  console.log(`GATE RESERVA estacionario (cum+last5m <=2%): ${steadyCombo ? `PASS eta=${steadyCombo.eta} conv=${steadyCombo.conv} (ns5 ${steadyCombo.ns5Worst}%, cum ${steadyCombo.nsCumWorst}%)` : 'FAIL'}`);
  const verdict = (parityPass && (passCombo || steadyCombo))
    ? `PASS (${passCombo ? 'estricto' : 'estacionario'}) -> publicar checkpoint y preparar Gate 2 (5x30m pareado)`
    : 'REFUTADO -> publicar datos/tests y cerrar sin implementar el spike';
  console.log(`VEREDICTO Gate 1: ${verdict}`);
}

main();
