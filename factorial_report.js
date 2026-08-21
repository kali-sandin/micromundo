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

const out = path.join(root, 'report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error('written', out);
