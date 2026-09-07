#!/usr/bin/env node
// task_921 cp2: comparacion pareada OFF (baseline_off_60m, 4919c0f) vs ON 5x60m
// (--conserve=trophic-a=on, dt 1/60 exacto, migr OFF, sample 10s).
//
// Criterios de exito (task_921):
//   1. A + consumer vivos 5/5 al final (producerA_density>0 y consumers>=1)
//   2. CV poblacion <=25% (segunda mitad de cada run, total_creatures)
//   3. pendiente <=5%/10m (regresion total_creatures, ultima ventana 600s)
//   4. diversidad genes >=80% de OFF (misma seed; var media genes consumer)
//   5. deriva energia <=10% (|mobile_sum_fin - init|/init)
//   6. consumer final 50-150% de OFF (misma seed)
//   7. otras TTE no >10% antes: extinciones compartidas no ocurren >10%
//      antes que en OFF, y sin extinciones nuevas vs OFF
//   8. coste <=5% (mean wall/sim ON vs OFF)
//
// Uso: node analyze_paired.js [onDir] [offDir]
//   por defecto: task_921_results/paired_on_60m  baseline_off_60m
const fs = require('fs');
const path = require('path');

const ON_DIR = process.argv[2] || path.join(__dirname);
const OFF_DIR = process.argv[3] || path.join(__dirname, '..', '..', 'baseline_off_60m');

function loadRuns(dir) {
  return fs.readdirSync(dir).filter(f => /^run_\d+_seed\d+\.json$/.test(f))
    .sort().map(f => {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const r = j.runs ? j.runs[0] : j;
      r.__file = f;
      return r;
    });
}

function geneDiversity(sample) {
  const genes = sample.genes || {};
  const keys = Object.keys(genes).filter(k => k.startsWith('consumer') || k.startsWith('predator'));
  if (!keys.length) return 0;
  // varianza media de genes de consumer/predator vs umbral 0.01 (def. analyze_batch)
  let sumVar = 0, nVar = 0;
  for (const k of keys) {
    const v = genes[k].variance || {};
    for (const trait of Object.values(v)) { sumVar += trait; nVar++; }
  }
  const meanVar = nVar ? sumVar / nVar : 0;
  return Math.min(1, meanVar / 0.01);
}

function analyzeRun(r) {
  const M = (r.metrics || []).slice().sort((a, b) => a.t - b.t);
  const last = M[M.length - 1];
  const first = M[0];
  const pop = s => (s.populations || {}).total_creatures || 0;

  // CV segunda mitad
  const half = M.slice(Math.floor(M.length / 2)).map(pop);
  const mean = half.reduce((a, b) => a + b, 0) / (half.length || 1);
  const cv = mean > 0 ? Math.sqrt(half.reduce((a, b) => a + (b - mean) ** 2, 0) / half.length) / mean : Infinity;

  // pendiente ultima ventana 600s (o la que haya)
  const tEnd = last.t;
  const win = M.filter(s => s.t >= tEnd - 600);
  const n = win.length;
  let slopePct10m = 0;
  if (n > 1) {
    const st = win.reduce((a, s) => a + s.t, 0), ss = win.reduce((a, s) => a + pop(s), 0);
    const stt = win.reduce((a, s) => a + s.t * s.t, 0), sts = win.reduce((a, s) => a + s.t * pop(s), 0);
    const slope = (n * sts - st * ss) / (n * stt - st * st || 1); // criaturas/s
    const baseMean = ss / n;
    slopePct10m = baseMean > 0 ? Math.abs(slope * 600 / baseMean * 100) : 0;
  }

  const e0 = (first.energy || {}).mobile_sum || 0;
  const e1 = (last.energy || {}).mobile_sum || 0;
  const drift = e0 > 0 ? Math.abs(e1 - e0) / e0 : Infinity;

  const wallPerSim = (r.wall_time_ms / 1000) / (r.duration_sim_sec || last.t || 1);

  return {
    seed: r.seed,
    final: last.populations || {},
    aliveA: ((last.populations || {}).producerA_density || 0) > 0,
    aliveC: ((last.populations || {}).consumers || 0) >= 1,
    cv, slopePct10m, drift, wallPerSim,
    divFinal: geneDiversity(last),
    extinctions: (r.extinctions || []).map(e => ({ t: e.t, group: e.group })),
    tEnd,
  };
}

const on = loadRuns(ON_DIR).map(analyzeRun);
const off = loadRuns(OFF_DIR).map(analyzeRun);
const offBySeed = new Map(off.map(r => [r.seed, r]));

const fmt = (x, d = 2) => (isFinite(x) ? x.toFixed(d) : 'n/a');
let out = '';
out += `=== task_921 cp2: pareado OFF/ON 5x60m ===\n`;
out += `ON runs: ${on.length}/5 (${ON_DIR})  OFF baseline: ${off.length}/5\n\n`;
if (on.length < 5) out += `AVISO: batch ON incompleto; analisis preliminar.\n\n`;

out += 'seed   | vivos | CV     | pend%/10m | derivaE | divON | divOFF | divRat | consON | consOFF | cons%  | TTE check\n';
out += '-------+-------+--------+-----------+---------+-------+--------+--------+--------+---------+--------+----------\n';
const rows = on.map(r => {
  const o = offBySeed.get(r.seed) || {};
  const divRat = o.divFinal > 0 ? r.divFinal / o.divFinal : (r.divFinal > 0 ? Infinity : 1);
  const consPct = (o.final.consumers || 0) > 0 ? r.final.consumers / o.final.consumers * 100 : (r.final.consumers > 0 ? Infinity : 0);
  // TTE: extinciones compartidas no >10% antes; sin nuevas vs OFF
  const offTTE = new Map((o.extinctions || []).map(e => [e.group, e.t]));
  const onTTE = new Map(r.extinctions.map(e => [e.group, e.t]));
  let tteOK = true; const tteNotes = [];
  for (const [g, tOn] of onTTE) {
    const tOff = offTTE.get(g);
    if (tOff === undefined) { tteOK = false; tteNotes.push(`nueva:${g}@${fmt(tOn, 0)}s`); }
    else if (tOn < tOff * 0.9) { tteOK = false; tteNotes.push(`${g}:${fmt(tOn, 0)}<${fmt(tOff, 0)}s`); }
    else tteNotes.push(`${g}@${fmt(tOn, 0)}s ok`);
  }
  return { ...r, divRat, consPct, tteOK, tteNotes };
});
for (const r of rows) {
  out += `${String(r.seed).padEnd(6)} | ${r.aliveA && r.aliveC ? 'SI' : 'NO'}   | ${fmt(r.cv, 3).padStart(6)} | ${fmt(r.slopePct10m).padStart(9)} | ${fmt(r.drift * 100).padStart(7)}% | ${fmt(r.divFinal, 2).padStart(5)} | ${fmt((offBySeed.get(r.seed) || {}).divFinal || 0, 2).padStart(6)} | ${fmt(divRatFmt(r.divRat)).padStart(6)} | ${String(r.final.consumers).padStart(6)} | ${String((offBySeed.get(r.seed) || { final: {} }).final.consumers ?? '-').padStart(7)} | ${fmt(divRatFmt(r.consPct), 0).padStart(5)}% | ${(r.tteOK ? 'ok' : 'FALLA') + (r.tteNotes.length ? ' ' + r.tteNotes.join(',') : '')}\n`;
}
function divRatFmt(x) { return isFinite(x) ? x : 999; }

const meanWallOn = on.length ? on.reduce((a, r) => a + r.wallPerSim, 0) / on.length : NaN;
const meanWallOff = off.length ? off.reduce((a, r) => a + r.wallPerSim, 0) / off.length : NaN;
const costPct = meanWallOff ? (meanWallOn / meanWallOff - 1) * 100 : NaN;
out += `\nwall/sim ON mean: ${fmt(meanWallOn, 3)} | OFF mean: ${fmt(meanWallOff, 3)} | coste: ${fmt(costPct, 2)}% (<=5%)\n`;
out += `Nota coste: wall/sim depende de carga CPU del host en el momento de cada batch; comparar solo batches medidos en condiciones comparables.\n`;

// Veredicto por criterio (solo con 5/5 runs)
const complete = on.length === 5;
const c1 = complete && rows.every(r => r.aliveA && r.aliveC);
const c2 = complete && rows.every(r => r.cv <= 0.25);
const c3 = complete && rows.every(r => r.slopePct10m <= 5);
const c4 = complete && rows.every(r => r.divRat >= 0.8);
const c5 = complete && rows.every(r => r.drift <= 0.10);
const c6 = complete && rows.every(r => r.consPct >= 50 && r.consPct <= 150);
const c7 = complete && rows.every(r => r.tteOK);
const c8 = isFinite(costPct) && costPct <= 5;
out += `\nCriterios (evaluados solo con 5/5):\n`;
out += `1 A+consumer vivos 5/5:      ${c1 ? 'PASS' : 'FAIL'}\n`;
out += `2 CV<=25%:                   ${c2 ? 'PASS' : 'FAIL'}\n`;
out += `3 pendiente<=5%/10m:         ${c3 ? 'PASS' : 'FAIL'}\n`;
out += `4 diversidad>=80% OFF:       ${c4 ? 'PASS' : 'FAIL'}\n`;
out += `5 deriva E<=10%:             ${c5 ? 'PASS' : 'FAIL'}\n`;
out += `6 consumer 50-150% OFF:      ${c6 ? 'PASS' : 'FAIL'}\n`;
out += `7 otras TTE no >10% antes:   ${c7 ? 'PASS' : 'FAIL'}\n`;
out += `8 coste<=5%:                 ${c8 ? 'PASS' : 'FAIL'}\n`;
out += `\nVEREDICTO cp2: ${!complete ? 'PENDIENTE (batch ON incompleto)' : (c1 && c2 && c3 && c4 && c5 && c6 && c7 && c8 ? 'PASA' : 'FALLA')}\n`;

process.stdout.write(out);
fs.writeFileSync(path.join(ON_DIR, 'paired_summary.txt'), out);
