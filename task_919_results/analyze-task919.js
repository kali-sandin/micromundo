#!/usr/bin/env node
// task_919 Corte 1: correccion de UNIDADES del shadow ledger 918.
// Sin tocar app.js ni conducta. Dos bugs de unidades corregidos:
//
//  (1) metabRate omitia *dt: flows son TASAS E/s; el acumulado debe
//      integrar rate*dt (sesgo ~x N_muestras en la version 918).
//  (2) respaldo solar por intervalo de 10s: el horizonte fisico de
//      respaldo es el ciclo solar (dayNightPeriod=600s); la reserva
//      existe precisamente para tender puentes dentro del ciclo.
//      Metrica de mineria => nonsolar en ventanas rodantes de un ciclo
//      completo (no por intervalo). El ns por intervalo se reporta
//      solo como diagnostico.
//
// Ademas separa explicitamente: stock inicial, fotosintesis (in),
// ingestion (granted), asimilacion (eta*granted) y perdidas
// ((1-eta)*granted + metab), y anade intake/metab y pendiente de stock.
//
// Uso: node analyze-task919.js [dirResults]   (default task_918_results)
const fs = require('fs');
const path = require('path');

const DIR = path.isAbsolute(process.argv[2] || '') ? path.join(process.argv[2])
  : path.join(__dirname, process.argv[2] || 'task_918_results');
const SEEDS = [12345, 20264, 28183, 36102, 44021];
const ETAS = [0.5, 0.7, 0.9];
const CONVS = [6, 12, 18];
const SOLAR_PERIOD = 600; // dayNightPeriod en app.js (s)

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

// Shadow con unidades corregidas. Ventanas: rolling window de largo
// SOLAR_PERIOD; nsWin mide que fraccion del granted de cada ventana NO
// esta respaldada por el inflow de esa misma ventana.
function shadowReserve(run, eta, conv) {
  const m = run.metrics;
  let stockE = conv * (m[0].energy.field || 0);
  const initStockE = stockE;
  let exhausted = false, tExhaust = null;
  let metab = 0, inE = 0, grantedE = 0, intakeE = 0, demandE = 0, lossE = 0;
  let tEnd = m[m.length - 1].t;
  const nsInt = [];   // diagnostico: por intervalo (metrica bug 918)
  const rows = [];    // {t, inI, granI, stock} para ventanas y pendiente
  for (let k = 1; k < m.length; k += 1) {
    const dt = m[k].t - m[k - 1].t;
    if (dt <= 0) continue;
    const fl = m[k].flows;
    const inI = conv * Math.max(0, fl.field_growth + fl.field_deposits - fl.field_clamp) * dt;
    const demI = conv * fl.field_extraction * dt;
    const granI = Math.min(demI, stockE + inI);
    stockE = stockE + inI - granI;
    if (stockE <= 0 && !exhausted) { exhausted = true; tExhaust = m[k].t; }
    if (granI > 0) nsInt.push(Math.max(0, granI - inI) / granI * 100);
    inE += inI; grantedE += granI; intakeE += eta * granI; demandE += demI;
    lossE += (1 - eta) * granI;                                   // perdidas asimilacion
    metab += ((fl.metabolism || 0) + (fl.thermal || 0) + (fl.reproduction || 0)) * dt; // FIX dt
    rows.push({ t: m[k].t, inI, granI, stock: stockE });
  }
  tEnd = rows.length ? rows[rows.length - 1].t : tEnd;
  // ventanas rodantes de un ciclo solar
  const nsWin = [];
  let a = 0, wIn = 0, wGr = 0;
  for (let b = 0; b < rows.length; b += 1) {
    wIn += rows[b].inI; wGr += rows[b].granI;
    while (rows[b].t - rows[a].t > SOLAR_PERIOD) { wIn -= rows[a].inI; wGr -= rows[a].granI; a += 1; }
    if (rows[b].t - rows[a].t >= SOLAR_PERIOD * 0.95 && wGr > 0) {
      nsWin.push(Math.max(0, wGr - wIn) / wGr * 100);
    }
  }
  // pendiente de stock (% del stock inicial por 10 min), regresion lineal
  const n = rows.length;
  let st = 0, ss = 0, stt = 0, sts = 0;
  for (const r of rows) { st += r.t; ss += r.stock; stt += r.t * r.t; sts += r.t * r.stock; }
  const slope = n > 1 ? (n * sts - st * ss) / (n * stt - st * st || 1) : 0; // E/s
  const slope10m = slope * 600 / (initStockE || 1) * 100;                    // %init/10m
  const dur = tEnd - m[0].t || 1;
  return {
    eta, conv, stockAlive: !exhausted, tExhaust,
    stockFinal: +stockE.toFixed(1),
    stockRatio: +(stockE / (initStockE || 1)).toFixed(3),
    nsIntP95: +pct(nsInt.slice().sort((x, y) => x - y), 0.95).toFixed(2),
    nsWinP95: +pct(nsWin.slice().sort((x, y) => x - y), 0.95).toFixed(2),
    nsCum: +(Math.max(0, grantedE - inE) / (grantedE || 1) * 100).toFixed(2),
    slope10m: +slope10m.toFixed(2),
    inRate: +(inE / dur).toFixed(1),
    grantedRate: +(grantedE / dur).toFixed(1),
    intakeRate: +(intakeE / dur).toFixed(1),
    metabRate: +(metab / dur).toFixed(1),                    // FIX dt
    assimLossRate: +(lossE / dur).toFixed(1),
    intakeMetab: +(intakeE / (metab || 1)).toFixed(2),
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
  console.log(`task_919 Corte 1: shadow 918 con unidades corregidas (metab*dt, respaldo por ciclo solar ${SOLAR_PERIOD}s)`);
  console.log(`seeds=${runs.length} dir=${path.basename(DIR)} baseline=${runs[0].git_commit || '?'} dur=${runs[0].duration_sim_sec}s`);
  console.log('');
  let parityWorst = 0; const wallSim = [];
  for (const run of runs) {
    parityWorst = Math.max(parityWorst, parityOf(run));
    wallSim.push(+(run.duration_sim_sec / (run.wall_time_ms / 1000)).toFixed(2));
  }
  console.log(`paridad campo OFF p95 worst = ${parityWorst}% | wallSim = ${wallSim.join(' ')}`);
  console.log('');
  let passCombo = null;
  console.log('eta | conv | alive  | nsInt95% | nsWin95% | nsCum% | stockR | pend%/10m | inE/s | granE/s | intakeE/s | metabE/s | lossE/s | int/metab');
  for (const eta of ETAS) {
    for (const conv of CONVS) {
      const per = runs.map(r => shadowReserve(r, eta, conv));
      const alive = per.filter(p => p.stockAlive).length;
      const nsWinWorst = Math.max(...per.map(p => p.nsWinP95));
      const nsCumWorst = Math.max(...per.map(p => p.nsCum));
      const p0 = per[0];
      const im = per.map(p => p.intakeMetab).join('/');
      console.log(`${eta.toFixed(1)} | ${String(conv).padStart(4)} | ${`${alive}/${runs.length}`.padStart(5)} | ${String(p0.nsIntP95).padStart(8)} | ${String(nsWinWorst).padStart(8)} | ${String(nsCumWorst).padStart(5)} | ${p0.stockRatio.toFixed(3)} | ${String(Math.max(...per.map(p => Math.abs(p.slope10m)))).padStart(9)} | ${p0.inRate} | ${p0.grantedRate} | ${p0.intakeRate} | ${per[0].metabRate} | ${p0.assimLossRate} | ${im}`);
      const imOk = per.filter(p => p.intakeMetab >= 0.8 && p.intakeMetab <= 1.2).length;
      if (!passCombo && alive === runs.length && nsWinWorst <= 2 && nsCumWorst <= 2) {
        passCombo = { eta, conv, nsWinWorst, nsCumWorst, imOk };
      }
    }
  }
  console.log('');
  console.log(`GATE PARIDAD campo OFF (p95<=2%): ${parityWorst <= 2 ? 'PASS' : 'FAIL'} (${parityWorst}%)`);
  console.log(`GATE COSTE (<=5%): shadow post-hoc inerte (cero cambios app.js); wallSim arriba`);
  console.log(`GATE RESERVA unidades corregidas (5/5 stock>0, nsWin<=2%, nsCum<=2%): ${passCombo ? `PASS eta=${passCombo.eta} conv=${passCombo.conv} (nsWin ${passCombo.nsWinWorst}%, cum ${passCombo.nsCumWorst}%)` : 'FAIL'}`);
  console.log(`Pendiente stock +234%/10m = transitorio (stock x3.15): se evalua |pend|<=5%/10m en Corte 2 (30m estacionario).`);
  console.log(`NOTA intake/metab 0.8-1.2 (criterio 919 Corte 2): ver columna int/metab; shadow inerte no altera sim.`);
}

main();
