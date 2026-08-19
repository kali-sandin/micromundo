/**
 * analyze_batch.js — Análisis post-batch de resultados multi-semilla
 * 
 * Procesa todos los seed_*.json en batch_30m_results/ y genera:
 * 1. Tabla resumen por seed (pass/fail, poblaciones finales, flujos)
 * 2. Estadísticas agregadas (media, CV, min, max)
 * 3. Ledger dimensional: graze input vs metabolism output vs NET
 * 4. Veredicto global del baseline
 * 
 * Uso: node analyze_batch.js [batch_dir]
 */

const fs = require('fs');
const path = require('path');

const batchDir = process.argv[2] || 'batch_30m_results';

// Veredicto según criterios de task_908
const CRITERIA = {
  MIN_PASS_RATE: 18/20,     // >=18/20 sin guilda <5%
  MAX_PENDING_FRAC: 0.05,   // pendiente <=5%/10m
  MAX_CV: 0.25,             // CV<=25% poblacion final
  MAX_ENERGY_DRIFT: 0.10,   // deriva energia <=10%
  MIN_DIVERSITY: 0.20,      // diversidad >=20%
  MAX_PERF_REGRESSION: 0.05 // perf <=5% regresion
};

function loadSeed(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const data = JSON.parse(raw);
  // Harness batch reports wrap single-run data in runs[0]
  if (data.runs && data.runs.length) {
    return { ...data.runs[0], meta: data.meta };
  }
  return data;
}

function analyzeSeed(data) {
  const metrics = data.metrics || data.results || [];
  if (!metrics.length) return null;

  const last = metrics[metrics.length - 1];
  const first = metrics[0];
  const duration = last.t - first.t;

  // Poblaciones finales
  const pop = last.populations || {};
  const popFirst = (metrics[Math.min(10, metrics.length-1)].populations) || {};

  // Extinctions
  const extinctions = data.extinctions || [];

  // Guildas vivas al final
  const guilds = {
    'producer-a': pop.producerA_density > 0.01,
    'producer-b': (pop.producerB || 0) > 0,
    'producer-c': (pop.producerC || 0) > 0,
    'consumer': (pop.consumers || 0) > 0,
    'predator': (pop.predators || 0) > 0,
  };
  const guildCount = Object.values(guilds).filter(Boolean).length;
  const guildsLow = Object.entries(guilds).filter(([k,v]) => {
    if (!v) return false;
    if (k === 'producer-a') return pop.producerA_density < 0.05;
    return (pop[k.replace('-','')] || pop[k] || 0) < 5;
  });

  // Flujos promedio (segunda mitad de la sim)
  const halfIdx = Math.floor(metrics.length / 2);
  let avgGraze = 0, avgMetab = 0, avgRepro = 0, avgPredation = 0;
  let avgThermal = 0, avgCarcassEat = 0, avgExcretion = 0;
  let count = 0;
  for (let i = halfIdx; i < metrics.length; i++) {
    const f = metrics[i].flows || {};
    avgGraze += f.graze || 0;
    avgMetab += f.metabolism || 0;
    avgRepro += f.reproduction || 0;
    avgPredation += f.predation || 0;
    avgThermal += f.thermal || 0;
    avgCarcassEat += f.carcassEat || 0;
    avgExcretion += f.excretion || 0;
    count++;
  }
  if (count > 0) {
    avgGraze /= count; avgMetab /= count; avgRepro /= count;
    avgPredation /= count; avgThermal /= count;
    avgCarcassEat /= count; avgExcretion /= count;
  }

  // Net energy balance
  const totalIn = avgGraze + avgPredation + avgCarcassEat;
  const totalOut = avgMetab + avgRepro + avgThermal + avgExcretion;
  const netEnergy = totalIn - totalOut;

  // Energy drift: (final mobile_sum - initial) / initial
  const energyInitial = (first.energy?.mobile_sum || 0);
  const energyFinal = (last.energy?.mobile_sum || 0);
  const energyDrift = energyInitial > 0 ? (energyFinal - energyInitial) / energyInitial : 0;

  // Gene diversity (última muestra)
  const genes = last.genes || {};
  let geneDiversity = 0;
  const geneKeys = Object.keys(genes).filter(k => k.startsWith('consumer_') || k.startsWith('predator_'));
  if (geneKeys.length > 0) {
    const variances = geneKeys.map(k => genes[k].var || 0);
    const meanVar = variances.reduce((a,b) => a+b, 0) / variances.length;
    geneDiversity = meanVar > 0.01 ? 1 : meanVar / 0.01;
  }

  // Veredicto
  const pass = guildsLow.length === 0 && extinctions.length === 0;
  const checks = {
    allGuildsAlive: guildCount === 5,
    noExtinctions: extinctions.length === 0,
    noLowGuilds: guildsLow.length === 0,
    energyDriftOK: Math.abs(energyDrift) <= CRITERIA.MAX_ENERGY_DRIFT,
    diversityOK: geneDiversity >= CRITERIA.MIN_DIVERSITY,
  };
  const checksPass = Object.values(checks).filter(Boolean).length;
  const verdict = checksPass >= 5 ? 'PASS' : checksPass >= 3 ? 'PARTIAL' : 'FAIL';

  return {
    duration,
    finalPop: pop,
    guildCount,
    guildsLow: guildsLow.map(([k]) => k),
    extinctions: extinctions.map(e => `${e.group}@${e.t}s`),
    flows: {
      graze: avgGraze,
      metabolism: avgMetab,
      predation: avgPredation,
      reproduction: avgRepro,
      thermal: avgThermal,
      carcassEat: avgCarcassEat,
      excretion: avgExcretion,
      netEnergy,
    },
    energyDrift,
    geneDiversity,
    checks,
    verdict,
  };
}

function cvOf(vals) {
  const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
  if (mean <= 0) return vals.some(v => v > 0) ? Infinity : 0;
  const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / vals.length;
  return Math.sqrt(variance) / mean;
}

function main() {
  const files = fs.readdirSync(batchDir)
    .filter(f => (/^seed_.*\.json$/.test(f) || /^run_.*_seed\d+\.json$/.test(f)))
    .sort();

  if (files.length === 0) {
    console.log(`\n❌ No hay resultados en ${batchDir}/ aún.`);
    console.log(`   El batch probablemente sigue corriendo.`);
    process.exit(0);
  }

  console.log(`\n📊 ANÁLISIS BATCH — ${files.length} seeds`);
  // Show migration state from first file meta if present
  try {
    const first = loadSeed(path.join(batchDir, files[0]));
    if (first && first.meta && first.meta.config) {
      console.log(`   migration: ${first.meta.config.migration ? 'ON' : 'OFF'} | commit: ${(first.meta.git_commit||'?').slice(0,7)} | dt: ${first.meta.config.dt}`);
    }
  } catch (_) {}
  console.log('═'.repeat(80));

  const results = [];
  for (const f of files) {
    try {
      const data = loadSeed(path.join(batchDir, f));
      const analysis = analyzeSeed(data);
      if (analysis) {
        const seedMatch = f.match(/seed(\d+)\.json$/);
        results.push({ seed: seedMatch ? seedMatch[1] : f.replace(/\.json$/, ''), ...analysis });
      }
    } catch (e) {
      console.log(`⚠️  Error leyendo ${f}: ${e.message}`);
    }
  }

  if (results.length === 0) {
    console.log('❌ No se pudieron analizar resultados.');
    process.exit(1);
  }

  // Tabla por seed
  console.log('\nSeed       | Verdict  | Guilds | Ext    | NET energy/s | Drift  | Diversity');
  console.log('-'.repeat(80));
  for (const r of results) {
    console.log(
      `${r.seed.padEnd(10)} | ${r.verdict.padEnd(8)} | ${r.guildCount}/5    | ${r.extinctions.length.toString().padEnd(6)} | ${r.flows.netEnergy.toFixed(1).padStart(12)} | ${r.energyDrift.toFixed(3).padStart(6)} | ${r.geneDiversity.toFixed(3)}`
    );
  }

  // Estadísticas agregadas
  const passes = results.filter(r => r.verdict === 'PASS').length;
  const partials = results.filter(r => r.verdict === 'PARTIAL').length;
  const fails = results.filter(r => r.verdict === 'FAIL').length;

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📈 RESUMEN: ${passes} PASS, ${partials} PARTIAL, ${fails} FAIL de ${results.length} seeds`);
  console.log(`   Pass rate: ${(passes/results.length*100).toFixed(1)}% (criterio: >=${CRITERIA.MIN_PASS_RATE*100}%)`);

  // Poblaciones finales
  const popFinal = results.map(r => r.finalPop);
  const avgConsumers = popFinal.reduce((a,p) => a + (p.consumers||0), 0) / popFinal.length;
  const avgPredators = popFinal.reduce((a,p) => a + (p.predators||0), 0) / popFinal.length;
  const consumerCV = cvOf(popFinal.map(p => p.consumers || 0));
  const predatorCV = cvOf(popFinal.map(p => p.predators || 0));
  const producerCCV = cvOf(popFinal.map(p => p.producerC || 0));
  const producerBCV = cvOf(popFinal.map(p => p.producerB || 0));

  console.log(`\n   Consumers finales: media=${avgConsumers.toFixed(0)}, CV=${(consumerCV*100).toFixed(1)}% (criterio: <=${CRITERIA.MAX_CV*100}%)`);
  console.log(`   Predators finales: media=${avgPredators.toFixed(0)}, CV=${(predatorCV*100).toFixed(1)}% (criterio: <=${CRITERIA.MAX_CV*100}%)`);
  console.log(`   ProducerB finales: CV=${(producerBCV*100).toFixed(1)}% | ProducerC finales: CV=${(producerCCV*100).toFixed(1)}%`);

  // Ledger dimensional agregado
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 LEDGER DIMENSIONAL (media segunda mitad):\n');
  const avgFlows = results.reduce((acc, r) => {
    for (const [k,v] of Object.entries(r.flows)) {
      acc[k] = (acc[k] || 0) + v;
    }
    return acc;
  }, {});
  for (const k of Object.keys(avgFlows)) avgFlows[k] /= results.length;

  console.log(`   INPUT al pool móvil:`);
  console.log(`     Grazing (field→móvil):     ${avgFlows.graze.toFixed(1)} energy/s`);
  console.log(`     Predation (móvil→móvil):    ${avgFlows.predation.toFixed(1)} energy/s`);
  console.log(`     Carcass eat (carcass→móvil): ${avgFlows.carcassEat.toFixed(1)} energy/s`);
  console.log(`   OUTPUT del pool móvil:`);
  console.log(`     Metabolism:                 ${avgFlows.metabolism.toFixed(1)} energy/s`);
  console.log(`     Reproduction:               ${avgFlows.reproduction.toFixed(1)} energy/s`);
  console.log(`     Thermal loss:               ${avgFlows.thermal.toFixed(1)} energy/s`);
  console.log(`     Excretion (móvil→field):    ${avgFlows.excretion.toFixed(1)} energy/s`);
  console.log(`   NET (in - out):               ${avgFlows.netEnergy.toFixed(1)} energy/s`);
  console.log(`\n   Si NET > 0 consistentemente → boom energético confirmado.`);
  console.log(`   Si NET ≈ 0 → sistema en equilibrio.`);

  // Veredicto global
  console.log('\n' + '═'.repeat(80));
  const globalPass = passes/results.length >= CRITERIA.MIN_PASS_RATE;
  console.log(`\n🏆 VEREDICTO GLOBAL: ${globalPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   ${passes}/${results.length} seeds pasan todos los checks`);

  // Notas del ledger dimensional
  console.log('\n📋 NOTAS DEL LEDGER DIMENSIONAL:');
  console.log('   - field.mass es ÍNDICE de biomasa [0,1.5], NO energía');
  console.log('   - mobileEnergy es ENERGÍA real [0,maxEnergy]');
  console.log('   - mult=18 convierte mass→energy (factor de conversión dimensional)');
  console.log('   - El NET positivo confirma creación de energía vía conversión');
  console.log('   - bug conocido: excretion clasificado mal en balance_in del harness');
  console.log('     (corregir después del batch)');
}

main();
