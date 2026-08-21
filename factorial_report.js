// factorial_report.js — aggregate task_550 2x2 factorial results.
// Usage: node factorial_report.js [factorial_2x2_results]
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'factorial_2x2_results';
const CELLS = ['cc', 'co', 'oc', 'oo'];
const LABEL = {
  cc: 'consumer-pC ON / predator-pC ON',
  co: 'consumer-pC ON / predator-pC OFF',
  oc: 'consumer-pC OFF / predator-pC ON',
  oo: 'consumer-pC OFF / predator-pC OFF',
};

function loadCell(cell) {
  const dir = path.join(root, cell);
  if (!fs.existsSync(dir)) return { runs: [], seeds: [] };
  const files = fs.readdirSync(dir).filter(f => /^run_.*\.json$/.test(f));
  const runs = files.map(f => {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
    const a = r.aggregate;
    const pop = a.populations;
    return {
      file: f,
      seed: r.meta.config.seeds[0],
      ablation: r.meta.config.ablation || {},
      // survival proxies at final state
      producerC_final: meanOf(pop.producerC),
      producerC_p50: a.percentiles.populations.producerC?.p50_mean ?? null,
      consumers_final: meanOf(pop.consumers),
      predators_final: meanOf(pop.predators),
      producerA_density: meanOf(pop.producerA_density),
      producerB_final: meanOf(pop.producerB),
      energyConsumer: a.energy.consumer?.mean ?? null,
      energyField: a.energy.field?.mean ?? null,
      births: a.rates?.births ?? a.rates?.birth_rate ?? null,
      deaths: a.rates?.deaths ?? a.rates?.death_rate ?? null,
      extinctions: a.extinctions,
      performance: a.performance,
    };
  });
  return { runs, seeds: runs.map(r => r.seed) };
}
const meanOf = x => (x && typeof x.mean === 'number' ? x.mean : null);

function stats(xs) {
  const v = xs.filter(x => typeof x === 'number' && isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { n: v.length, mean, sd, min: Math.min(...v), max: Math.max(...v) };
}

const report = {};
for (const cell of CELLS) {
  const { runs, seeds } = loadCell(cell);
  const colStats = key => stats(runs.map(r => r[key]));
  report[cell] = {
    label: LABEL[cell],
    n_runs: runs.length,
    seeds,
    producerC_final: colStats('producerC_final'),
    producerC_p50: colStats('producerC_p50'),
    consumers_final: colStats('consumers_final'),
    predators_final: colStats('predators_final'),
    energyConsumer: colStats('energyConsumer'),
    energyField: colStats('energyField'),
    producerA_density: colStats('producerA_density'),
    producerB_final: colStats('producerB_final'),
  };
}

// pcCollapse: fraction of runs where producerC final population is 0
for (const cell of CELLS) {
  const { runs } = loadCell(cell);
  const collapsed = runs.filter(r => r.producerC_final === 0).length;
  report[cell].pc_collapse_fraction = runs.length ? collapsed / runs.length : null;
  report[cell].predator_extinct_fraction = runs.length
    ? runs.filter(r => r.predators_final === 0).length / runs.length
    : null;
}

// --- Formal comparison (task_550 closure) ---
// Fisher exact (2x2) on pc_collapse by consumer-pC factor, and Welch t-test on producerC_final.
function fisherExact(a, b, c, d) {
  // one-sided Fisher: enrichment of collapses in group1
  const logFact = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const n1 = a + b, n2 = c + d, n = n1 + n2;
  const base = logFact(n) - logFact(a + c) - logFact(b + d) - logFact(n1) - logFact(n2);
  let p = 0;
  const prob = k => base + logFact(a + c) - logFact(k) - logFact(a + c - k) + logFact(b + d) - logFact(n1 - k) - logFact(b + d - n1 + k);
  const pObs = prob(a);
  for (let k = Math.max(0, n1 - (b + d)); k <= Math.min(n1, a + c); k++) {
    const pk = Math.exp(prob(k));
    if (pk <= pObs * (1 + 1e-9)) p += pk;
  }
  return Math.min(1, p);
}
function welch(m1, s1, n1, m2, s2, n2) {
  const se = Math.sqrt(s1 * s1 / n1 + s2 * s2 / n2);
  if (!se) return null;
  // normal approx (n>=20 per cell expected)
  const z = (m1 - m2) / se;
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
  return { diff: m1 - m2, z, p };
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

{
  const data = Object.fromEntries(CELLS.map(c => [c, loadCell(c)]));
  const cmp = {};
  for (const [name, [on, off]] of [['consumer_pc', ['cc', 'oo']], ['predator_pc', ['cc', 'co']]]) {
    const g1 = data[on].runs, g2 = data[off].runs;
    const c1 = g1.filter(r => r.producerC_final === 0).length;
    const c2 = g2.filter(r => r.producerC_final === 0).length;
    cmp[name] = {
      contrast: `${LABEL[on]} vs ${LABEL[off]}`,
      collapse_on: `${c1}/${g1.length}`, collapse_off: `${c2}/${g2.length}`,
      fisher_p_onetail: fisherExact(c1, g1.length - c1, c2, g2.length - c2),
    };
  }
  const pcC = stats(data.cc.runs.map(r => r.producerC_final));
  const pcO = stats(data.oo.runs.map(r => r.producerC_final));
  const conC = stats(data.cc.runs.map(r => r.consumers_final));
  const conO = stats(data.oo.runs.map(r => r.consumers_final));
  if (pcC && pcO && pcC.n > 1 && pcO.n > 1) cmp.producerC_final_welch = welch(pcC.mean, pcC.sd, pcC.n, pcO.mean, pcO.sd, pcO.n);
  if (conC && conO && conC.n > 1 && conO.n > 1) cmp.consumers_final_welch = welch(conC.mean, conC.sd, conC.n, conO.mean, conO.sd, conO.n);
  report.comparison = cmp;
}

const out = path.join(root, 'report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error('written', out);
