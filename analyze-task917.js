#!/usr/bin/env node
// task_917 Gate 1: presupuesto energetico productor-campo (P-A), shadow/inerte.
//
// Ledger explicito campo→consumer por intervalo (migr OFF, dt 1/60):
//   STOCK:     field.total (indice de densidad, no energia dimensional)
//   FOTO:      photosynthField (crecimiento solar pre-difusion)
//   DEPOSITOS: excretion + carcassToField (mobile/carcass → campo)
//   TRANSF:    graze (bite extraido del campo, valor bite)
//   PERDIDAS:  fieldClampLoss (cap 1.5/celda)
//   ASIMILACION consumer: intake bruto desde campo = graze + trophicAmp
//     (feedGain = bite + amp en el path de graze). El "input no solar" es la
//     amplificacion trofica x18: energia consumer no respaldada por fotosintesis
//     medida. share = trophicAmp / (graze + trophicAmp).
//
// Paridad exacta campo: Δfield == FOTO + DEP - TRANSF - PERD por intervalo.
// Paridad consumer-side (proxy): trophicAmp = feedGain - bite queda explicado
//   por diseño (mult 18), NO por input solar.
// Gate 1 pasa solo si 5/5 seeds: |paridad campo residual| <= 2% (p95),
//   input no solar <= 2% del intake de campo, coste <= 5%.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'task_917_results');
const SEEDS = [12345, 20264, 28183, 36102, 44021];

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function analyze() {
  const rows = [];
  const perSeed = [];
  for (let i = 0; i < SEEDS.length; i += 1) {
    const f = path.join(DIR, `run_led_${i + 1}_seed${SEEDS[i]}.json`);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const run = d.runs ? d.runs[0] : d;
    const m = run.metrics;
    const parityRes = [];   // |Δfield - expected| / throughput, %, por intervalo
    const ampShares = [];   // tAmp / (graze + tAmp), %
    const solarE = [];      // fotosintesis campo E-equiv (tasa/s)
    const ampE = [];
    let prevField = m.length ? m[0].energy.field : 0;
    for (let k = 1; k < m.length; k += 1) {
      const fl = m[k].flows;
      const dt = m[k].t - m[k - 1].t;
      if (dt <= 0) continue;
      const expected = (fl.field_growth + fl.field_deposits - fl.field_extraction - fl.field_clamp) * dt;
      const actual = m[k].energy.field - m[k - 1].energy.field;
      const throughput = ((fl.field_growth + fl.field_deposits + fl.field_extraction + fl.field_clamp) * dt) || 1;
      parityRes.push(Math.abs(actual - expected) / throughput * 100);
      const intake = fl.graze + fl.trophicAmplification;
      if (intake > 0) ampShares.push(fl.trophicAmplification / intake * 100);
      solarE.push(fl.photosynthField);
      ampE.push(fl.trophicAmplification);
    }
    const row = {
      seed: run.seed,
      simSec: run.duration_sim_sec,
      wallSim: +(run.duration_sim_sec / (run.wall_time_ms / 1000)).toFixed(3),
      parityP50: +pct(parityRes.slice().sort((a, b) => a - b), 0.5).toFixed(3),
      parityP95: +pct(parityRes.slice().sort((a, b) => a - b), 0.95).toFixed(3),
      harnessFieldResMax: run.field_residual_max_pct,
      harnessSysResThroughputMax: run.residual_throughput_max_pct,
      ampShareP50: +pct(ampShares.slice().sort((a, b) => a - b), 0.5).toFixed(2),
      ampShareP95: +pct(ampShares.slice().sort((a, b) => a - b), 0.95).toFixed(2),
      photoFieldAvg: +(solarE.reduce((a, b) => a + b, 0) / (solarE.length || 1)).toFixed(2),
      tAmpAvg: +(ampE.reduce((a, b) => a + b, 0) / (ampE.length || 1)).toFixed(2),
      extinctions: run.extinctions.length,
    };
    rows.push(row);
    perSeed.push({ parity: row.parityP95, amp: row.ampShareP95 });
  }
  return { rows, perSeed };
}

function main() {
  const { rows, perSeed } = analyze();
  if (!rows.length) { console.error('sin runs'); process.exit(1); }
  console.log('task_917 Gate 1: ledger P-A campo-consumer (shadow, migr OFF, 5x10m, dt 1/60)\n');
  console.log('seed    | wallSim | paridadP50% | paridadP95% | ampShareP50% | ampShareP95% | fotoField/s | tAmp/s | ext');
  for (const r of rows) {
    console.log(
      String(r.seed).padEnd(7) + ' | ' +
      r.wallSim.toFixed(2).padStart(6) + 'x | ' +
      r.parityP50.toFixed(2).padStart(10) + ' | ' +
      r.parityP95.toFixed(2).padStart(10) + ' | ' +
      r.ampShareP50.toFixed(2).padStart(11) + ' | ' +
      r.ampShareP95.toFixed(2).padStart(11) + ' | ' +
      r.photoFieldAvg.toFixed(2).padStart(10) + ' | ' +
      r.tAmpAvg.toFixed(1).padStart(6) + ' | ' + r.extinctions);
  }
  const passParity = perSeed.every(p => p.parity <= 2);
  const passAmp = perSeed.every(p => p.amp <= 2);
  // Coste: instrumentacion es solo analisis post-run (sin cambios en sim);
  // wallSim compara contra task_916 runs del mismo HEAD.
  console.log(`\nGATE PARIDAD campo (p95<=2%): ${passParity ? 'PASS' : 'FAIL'}`);
  console.log(`GATE INPUT NO SOLAR (tAmp/intake p95<=2%): ${passAmp ? 'PASS' : 'FAIL'}`);
  console.log(`GATE COSTE (<=5%): analisis post-run, sin cambios en sim -> coste estructural 0; wallSim arriba`);
  const pass = passParity && passAmp;
  console.log(`\nVEREDICTO Gate 1: ${pass ? 'PASA -> procede checkpoint + 5x30m' : 'REFUTADO -> publicar datos/tests y cerrar sin tocar x18'}`);
}

main();
