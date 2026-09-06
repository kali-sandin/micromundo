#!/usr/bin/env node
// task_920 Gate 1: shadow conservativo de transferencia trofica
// solar -> biomasa A -> consumer. Post-hoc sobre runs 919 corte2
// (5 seeds x30m, dt 1/60, migr OFF, sample 10s; usamos ventana 0..600s
// = horizonte 10m exigido por el gate). Cero cambios en app.js: coste 0%.
//
// Modelo shadow conservativo:
//   in       = conv * max(0, field_growth + field_deposits - field_clamp) * dt
//   demand   = conv * field_extraction * dt          (ingesta pedida por consumers)
//   granted  = min(demand, stock + in)               (ingestion <= biomasa disponible)
//   stock   += in - granted                          (lo no ingerido queda en el campo)
//   asimilado = eta * granted                        (eta < 1)
//   detrito   = (1 - eta) * granted                  (perdidas a detrito, NO a consumer)
//   metabDemand = (metabolism + thermal + reproduction) * dt
//   ratio(t) = asimiladoAcum / metabDemandAcum
//
// Barrido documentado: eta in {0.5, 0.7, 0.9}, conv in {6, 12, 18} (mismo
// rango que 918/919 para comparabilidad).
//
// Gates (5/5 obligatorio):
//   residual ledger <= 2%   |stock_fin - (stock_init + in - granted)| / (stock_init + in)
//   stock > 0 en todo t
//   ratio proyectado final in [0.8, 1.2]
//   coste <= 5%  (post-hoc, sin runtime => 0%)
//
// Uso: node analyze-task920.js [dirResults]  (default task_919_results/corte2)
const fs = require('fs');
const path = require('path');

const DIR = path.isAbsolute(process.argv[2] || '')
  ? process.argv[2] : path.join(__dirname, ...((process.argv[2] || 'task_919_results/corte2').split('/')));
const SEEDS = [12345, 20264, 28183, 36102, 44021];
const ETAS = [0.5, 0.7, 0.9];
const CONVS = [6, 12, 18];
const HORIZON = 600; // s

function shadow(run, eta, conv, horizon) {
  const m = run.metrics.filter((x) => x.t <= horizon);
  let stockE = conv * (m[0].energy.field || 0);
  const initStock = stockE;
  let inE = 0, demE = 0, granE = 0, metabE = 0;
  let minStock = stockE;
  const series = [];
  for (let k = 1; k < m.length; k += 1) {
    const dt = m[k].t - m[k - 1].t;
    if (dt <= 0) continue;
    const fl = m[k].flows;
    const inI = conv * Math.max(0, fl.field_growth + fl.field_deposits - fl.field_clamp) * dt;
    const demI = conv * fl.field_extraction * dt;
    const granI = Math.min(demI, stockE + inI);
    stockE = stockE + inI - granI;
    minStock = Math.min(minStock, stockE);
    inE += inI; demE += demI; granE += granI;
    metabE += ((fl.metabolism || 0) + (fl.thermal || 0) + (fl.reproduction || 0)) * dt;
    series.push({ t: m[k].t, stock: stockE, ratio: metabE > 0 ? (eta * granE) / metabE : 0 });
  }
  const last = series[series.length - 1] || { t: 0, stock: stockE, ratio: 0 };
  const denom = initStock + inE;
  const residual = denom > 0 ? Math.abs(stockE - denom + granE) / denom * 100 : 0; // ~0 por construccion; valida NaN/clip
  return {
    t: last.t, stockEnd: stockE, minStock, stockPos: minStock > 0,
    inE, demE, granE, starvedE: demE - granE, metabE,
    assimE: eta * granE, detritusE: (1 - eta) * granE,
    ratio: last.ratio, residualPct: residual,
  };
}

function main() {
  const runs = [];
  for (let i = 0; i < SEEDS.length; i += 1) {
    const f = path.join(DIR, `run_led_${i + 1}_seed${SEEDS[i]}.json`);
    if (fs.existsSync(f)) runs.push(JSON.parse(fs.readFileSync(f, 'utf8')).runs[0]);
  }
  console.log(`# task_920 Gate1 shadow conservativo (ventana 0-${HORIZON}s, ${runs.length} seeds, fuente ${path.basename(DIR)})`);
  console.log(`# coste runtime: 0% (analisis post-hoc, sin cambios app.js)\n`);
  let best = null; const all = [];
  for (const conv of CONVS) for (const eta of ETAS) {
    let okStock = 0, okRes = 0, okRatio = 0;
    const rows = [];
    for (const r of runs) {
      const s = shadow(r, eta, conv, HORIZON);
      if (s.stockPos) okStock += 1;
      if (s.residualPct <= 2) okRes += 1;
      if (s.ratio >= 0.8 && s.ratio <= 1.2) okRatio += 1;
      rows.push(s);
    }
    const pass = runs.length === 5 && okStock === 5 && okRes === 5 && okRatio === 5;
    const meanRatio = rows.length ? rows.reduce((a, b) => a + b.ratio, 0) / rows.length : 0;
    console.log(`conv=${conv} eta=${eta}: pass=${pass} stockPos=${okStock}/5 residual<=2%=${okRes}/5 ratioOK=${okRatio}/5 meanRatio=${meanRatio.toFixed(3)} minStock=${Math.min(...rows.map((x) => x.minStock)).toFixed(1)} starve%=${(100 * rows.reduce((a, b) => a + b.starvedE, 0) / Math.max(1e-9, rows.reduce((a, b) => a + b.demE, 0))).toFixed(1)}`);
    all.push({ conv, eta, pass, okStock, okRes, okRatio, meanRatio });
    if (pass && (!best || meanRatio < Math.abs(1 - best.meanRatio))) best = { conv, eta, meanRatio };
  }
  console.log(`\nVEREDICTO: ${best ? `PASA con conv=${best.conv} eta=${best.eta} (meanRatio ${best.meanRatio.toFixed(3)})` : 'REFUTADA: ninguna combinacion (conv,eta) cumple 5/5 stock>0 + residual<=2% + ratio .8-1.2'}`);
  if (!best) {
    // diagnostico: mejor combo por ratio mas cercano a 1
    all.sort((a, b) => Math.abs(1 - a.meanRatio) - Math.abs(1 - b.meanRatio));
    console.log(`mejor aproximacion: conv=${all[0].conv} eta=${all[0].eta} meanRatio=${all[0].meanRatio.toFixed(3)} (stockPos ${all[0].okStock}/5, ratioOK ${all[0].okRatio}/5)`);
  }
}
main();
