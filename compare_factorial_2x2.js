#!/usr/bin/env node
/**
 * compare_factorial_2x2.js — Resumen factorial 2x2: consumer-pC x predator-pC ON/OFF
 *
 * Para cada celda (cc=control, co=predator-pC off, oc=consumer-pC off, oo=both off):
 * - por semilla: pC t0/60s/final, pC collapse (<=5% del t0 antes de 600s),
 *   predator y consumer finales, guildas vivas al final, extinciones
 * - agregados por celda: tasas de colapso pC, extincion predator, medias±sd finales
 * - veredicto causal: efecto principal consumer-pC vs predator-pC vs interaccion
 *
 * Uso: node compare_factorial_2x2.js [results_dir=factorial_2x2_results]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'factorial_2x2_results';
const CELLS = [
  { id: 'cc', label: 'control (consumer-pC ON, predator-pC ON)' },
  { id: 'co', label: 'predator-pC OFF' },
  { id: 'oc', label: 'consumer-pC OFF' },
  { id: 'oo', label: 'both OFF' },
];

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
function sd(a) { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map(x => (x - m) ** 2))) : 0; }

function analyzeRun(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (data.runs && data.runs.length) data = data.runs[0];
  const m = data.metrics || data.results || [];
  if (!m.length) return null;
  const pop = (r) => r.populations || {};
  const pCnow = (r) => (pop(r).pC !== undefined ? pop(r).pC : (pop(r).ProducerC !== undefined ? pop(r).ProducerC : null));
  const t0 = m[0], t60 = m.find(r => r.t >= 55) || t0, tl = m[m.length - 1];
  const pC0 = pCnow(t0), pC60 = pCnow(t60), pCf = pCnow(tl);
  const predF = (pop(tl).predators !== undefined ? pop(tl).predators : pop(tl).predator);
  const consF = (pop(tl).consumers !== undefined ? pop(tl).consumers : pop(tl).consumer);
  if (pC0 === null) return null;
  const collapse = pC0 > 0 && pCf <= 0.05 * pC0;
  const guilds = Object.entries(pop(tl)).filter(([k, v]) => typeof v === 'number' && v > 0).map(([k]) => k);
  const predExt = typeof predF === 'number' && predF <= 0;
  return {
    seed: (path.basename(file).match(/seed(\d+)/) || [])[1] || path.basename(file),
    tEnd: tl.t, pC0, pC60, pCf, collapse, predExt,
    predF, consF, guildsAlive: guilds.length, guilds: guilds.join('+'),
  };
}

const cellResults = {};
for (const c of CELLS) {
  const dir = path.join(root, c.id);
  if (!fs.existsSync(dir)) { cellResults[c.id] = null; continue; }
  const runs = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => analyzeRun(path.join(dir, f))).filter(Boolean);
  cellResults[c.id] = runs;
}

console.log('=== Factorial 2x2: consumer-pC x predator-pC (20 seeds x 10m, migration=off) ===\n');
for (const c of CELLS) {
  const runs = cellResults[c.id];
  if (!runs || !runs.length) { console.log(`[${c.id}] ${c.label}: SIN RESULTADOS\n`); continue; }
  const pC0m = mean(runs.map(r => r.pC0)), pCfm = mean(runs.map(r => r.pCf));
  const nCollapse = runs.filter(r => r.collapse).length;
  const nPredExt = runs.filter(r => r.predExt).length;
  console.log(`[${c.id}] ${c.label}  (n=${runs.length})`);
  console.log(`  pC t0=${pC0m.toFixed(0)}  final=${pCfm.toFixed(1)}±${sd(runs.map(r => r.pCf)).toFixed(1)}  colapso pC: ${nCollapse}/${runs.length}`);
  console.log(`  predator extinto: ${nPredExt}/${runs.length}  consumer final=${mean(runs.map(r => r.consF)).toFixed(0)}±${sd(runs.map(r => r.consF)).toFixed(0)}  guildas vivas=${mean(runs.map(r => r.guildsAlive)).toFixed(1)}`);
  console.log('');
}

// Efectos: tasa colapso pC por celda y efectos principales/interaccion (2x2)
function rate(id) { const r = cellResults[id]; return r && r.length ? r.filter(x => x.collapse).length / r.length : NaN; }
const [rCC, rCO, rOC, rOO] = ['cc', 'co', 'oc', 'oo'].map(rate);
if (![rCC, rCO, rOC, rOO].some(isNaN)) {
  const effCons = (rOC + rOO) / 2 - (rCC + rCO) / 2;   // efecto de ablacion consumer-pC
  const effPred = (rCO + rOO) / 2 - (rCC + rOC) / 2;   // efecto de ablacion predator-pC
  const inter = rOO - rCO - rOC + rCC;                  // interaccion
  console.log('=== Causalidad (tasa colapso pC) ===');
  console.log(`  cc=${rCC.toFixed(2)} co=${rCO.toFixed(2)} oc=${rOC.toFixed(2)} oo=${rOO.toFixed(2)}`);
  console.log(`  efecto ablacion consumer-pC: ${effCons.toFixed(2)}  (positivo => ablacion causa colapso)`);
  console.log(`  efecto ablacion predator-pC: ${effPred.toFixed(2)}`);
  console.log(`  interaccion: ${inter.toFixed(2)}`);
}
