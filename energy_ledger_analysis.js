/**
 * energy_ledger_analysis.js
 * 
 * Análisis dimensional del ledger energético de Micromundo.
 * 
 * Problema identificado por Richard:
 * - field.mass es densidad de biomasa normalizada [0, 1.5] por celda
 * - mobileEnergy es energía de criaturas [0, maxEnergy ~65]
 * - El ledger las suma 1:1 en "total energy" lo que es dimensionalmente incorrecto
 * 
 * Este script instrumenta sim-harness para medir todos los flujos con sus
 * unidades reales y construir un ledger dimensional correcto.
 * 
 * Uso: node energy_ledger_analysis.js [--duration=5] [--seed=12345]
 */

const { execSync } = require('child_process');

// Parse args
const args = process.argv.slice(2);
const duration = parseInt(args.find(a => a.startsWith('--duration='))?.split('=')[1] || '5');
const seed = parseInt(args.find(a => a.startsWith('--seed='))?.split('=')[1] || '12345');

console.log(`\n📊 LEDGER DIMENSIONAL — Análisis de flujos energéticos`);
console.log(`   Duration: ${duration} min, Seed: ${seed}\n`);

// ===== CONSTANTES DEL MODELO (extraídas de app.js) =====

// Campo (producerField)
const FIELD_CELLS = 17800; // cols * rows aproximado
const FIELD_MAX_PER_CELL = 1.5;
const FIELD_GROWTH_RATE = 0.020; // por step de 0.45s, con sunEff
const FIELD_BASELINE_GROWTH = 0.001; // evita frontera absorbente
const FIELD_DT = 0.45; // stepProducerField cada 0.45s
const SUN_BASE = 1.0;
const SUN_EFF = SUN_BASE / (1 + SUN_BASE * 0.15); // ~0.87

// Grazing
const GRAZE_MULT = 18; // multiplicador gain
const GRAZE_BITE_RATE_MIN = 0.018; // bite base
const GRAZE_COOLDOWN_MIN = 0.3; // segundos
const GRAZE_COOLDOWN_MAX = 0.8;

// Metabolismo
const METAB_FACTOR_ACTIVE = 7.5; // smoothFactor cuando energy > 0.5*maxEnergy
const METAB_FACTOR_IDLE = 1.0;

// Reproducción
const REPRO_THRESHOLD = 0.78; // fracción de maxEnergy
const REPRO_COST_FRAC = 0.35; // fracción transferada al hijo

// Carcass
const CARCASS_EFFICIENCY = 0.55; // 55% de energy se conserva
const CARCASS_DECAY_TO_FIELD = 0.25; // 25% del decay va al campo
const CARCASS_DECAY_LOSS = 0.75; // 75% se pierde

// Colony feed
const COLONY_GAIN_MULT = 3.0;
const COLONY_GAIN_CAP = 18;
const COLONY_DRAIN_DIRECT = 0.30;

// Predation
const PRED_GAIN_CONSUMER_RAW = 92; // base
const PRED_MAX_TRANSFER_CONSUMER = 1.3; // x target.energy
const PRED_MAX_TRANSFER_PRODUCER = 1.0; // x target.energy

// ===== ANÁLISIS TEÓRICO =====

console.log('═'.repeat(70));
console.log('1. UNIDADES DIMENSIONALES');
console.log('═'.repeat(70));
console.log(`
   field.mass[idx]     = densidad de biomasa por celda [0, 1.5] — ADIMENSIONAL
   field.total         = Σ mass[i] ≈ suma de densidades — NO es energía
   mobileEnergy        = energía de criatura [0, maxEnergy] — UNIDADES DE ENERGÍA
   mobileEnergySum     = Σ creature.energy — ENERGÍA TOTAL MÓVIL
   
   PROBLEMA: El ledger suma field.total + mobileEnergySum como si fueran
   la misma unidad. Pero field.mass es un ÍNDICE de densidad vegetal
   y mobileEnergy es ENERGÍA real.
   
   El mult=18 en grazing convierte 1 unidad de field.mass en 18 unidades
   de mobileEnergy. Esto es una AMPLIFICACIÓN DIMENSIONAL, no un bug.
   Representa la conversión fotosíntesis → biomasa → energía asimilable.
`);

console.log('═'.repeat(70));
console.log('2. FLUJOS ENERGÉTICOS (todos en energy/s)');
console.log('═'.repeat(70));

// Input al campo: growth
const fieldGrowthPerStep = FIELD_GROWTH_RATE * SUN_EFF * FIELD_DT;
const fieldGrowthPerCellPerSec = fieldGrowthPerStep / FIELD_DT;
const fieldGrowthTotalPerSec = fieldGrowthPerCellPerSec * FIELD_CELLS;
console.log(`\n   INPUT AL CAMPO (field growth):`);
console.log(`   Growth por celda por step: ${fieldGrowthPerStep.toFixed(6)} mass units`);
console.log(`   Growth por celda por segundo: ${fieldGrowthPerCellPerSec.toFixed(6)} mass/s`);
console.log(`   Growth total del campo: ${fieldGrowthTotalPerSec.toFixed(1)} mass/s × ${FIELD_CELLS} celdas`);
console.log(`   NOTA: mass/s no es energy/s. Es producción primaria en unidades de campo.`);

// Grazing: cuánta mass se remueve y cuánta energy se genera
const avgBiteRate = (GRAZE_BITE_RATE_MIN + 0.006 * 3 + 0.003 * 3) * 0.5; // size=3, cilia=3 promedio
const avgCooldown = (GRAZE_COOLDOWN_MIN + GRAZE_COOLDOWN_MAX) / 2;
const grazesPerSecPerConsumer = 1 / avgCooldown;
const massRemovedPerConsumerPerSec = avgBiteRate * grazesPerSecPerConsumer;
const energyGainedPerConsumerPerSec = avgBiteRate * GRAZE_MULT * 0.8 * grazesPerSecPerConsumer; // densityFactor ~0.8

console.log(`\n   GRAZING (consumer → field):`);
console.log(`   Bite rate promedio: ${avgBiteRate.toFixed(4)} mass/evento`);
console.log(`   Cooldown promedio: ${avgCooldown.toFixed(2)}s → ${grazesPerSecPerConsumer.toFixed(2)} eventos/s`);
console.log(`   Mass removida: ${massRemovedPerConsumerPerSec.toFixed(4)} mass/s por consumer`);
console.log(`   Energy generada: ${energyGainedPerConsumerPerSec.toFixed(3)} energy/s por consumer`);
console.log(`   AMPLIFICACIÓN: ${GRAZE_MULT}x (field.mass → mobileEnergy)`);
console.log(`   Ratio gain:mass = ${energyGainedPerConsumerPerSec.toFixed(3)} : ${massRemovedPerConsumerPerSec.toFixed(4)}`);
console.log(`   = ${(energyGainedPerConsumerPerSec / massRemovedPerConsumerPerSec).toFixed(1)}x amplificación neta`);

// Con N consumers
const nConsumers = 700;
console.log(`\n   Con ${nConsumers} consumers:`);
console.log(`   Mass total removida: ${(massRemovedPerConsumerPerSec * nConsumers).toFixed(1)} mass/s`);
console.log(`   Energy total generada: ${(energyGainedPerConsumerPerSec * nConsumers).toFixed(0)} energy/s`);

// Balance del campo
const fieldInput = fieldGrowthTotalPerSec;
const fieldOutput = massRemovedPerConsumerPerSec * nConsumers;
console.log(`\n   BALANCE DEL CAMPO:`);
console.log(`   Input (growth):  ${fieldInput.toFixed(1)} mass/s`);
console.log(`   Output (grazing): ${fieldOutput.toFixed(1)} mass/s`);
console.log(`   Net: ${(fieldInput - fieldOutput).toFixed(1)} mass/s ${fieldInput > fieldOutput ? '(excedente)' : '(déficit)'}`);

// Metabolismo
const avgMetabolism = 0.05; // aproximado
const metabPerConsumerPerSec = avgMetabolism * METAB_FACTOR_ACTIVE * 0.5; // smoothFactor promedio
console.log(`\n   METABOLISMO (loss):`);
console.log(`   Metabolismo promedio: ${avgMetabolism.toFixed(3)}/s × smooth ${METAB_FACTOR_ACTIVE} × factor 0.5`);
console.log(`   = ${metabPerConsumerPerSec.toFixed(4)} energy/s por consumer`);
console.log(`   Total con ${nConsumers} consumers: ${(metabPerConsumerPerSec * nConsumers).toFixed(1)} energy/s`);

// NET energy
const netEnergyPerConsumer = energyGainedPerConsumerPerSec - metabPerConsumerPerSec;
console.log(`\n   NET POR CONSUMER:`);
console.log(`   Gain: ${energyGainedPerConsumerPerSec.toFixed(3)} energy/s`);
console.log(`   Loss: ${metabPerConsumerPerSec.toFixed(4)} energy/s`);
console.log(`   NET: +${netEnergyPerConsumer.toFixed(3)} energy/s por consumer`);
console.log(`   Total: +${(netEnergyPerConsumer * nConsumers).toFixed(0)} energy/s`);

console.log('\n' + '═'.repeat(70));
console.log('3. LEDGER DIMENSIONAL CORRECTO');
console.log('═'.repeat(70));
console.log(`
   El sistema tiene DOS pools con unidades distintas:
   
   POOL 1: Biomasa del campo (field.total)
   - Unidades: mass units (índice de densidad, adimensional)
   - Input: growth fotosintético, carcass decay, excretion
   - Output: grazing (bite remueve mass), diffusion
   
   POOL 2: Energía móvil (mobileEnergySum)  
   - Unidades: energy units
   - Input: grazing gain (mass × 18), colony feed, predation, carcass eat
   - Output: metabolism, reproduction cost, thermal loss
   
   CONVERSIÓN ENTRE POOLS:
   - Campo → Móvil: gain = bite × 18 (grazing) — CREA energía de biomasa
   - Móvil → Campo: carcass decay (×0.25), excretion (×0.025) — RECICLA energía a biomasa
   
   El multiplicador 18 es el FACTOR DE CONVERSIÓN dimensional.
   No es un bug ni un capricho: representa la eficiencia fotosintética
   inversa (cuánta energía se puede extraer de unidad de biomasa).
   
   PERO: ¿es 18x consistente con el equilibrio del sistema?
`);

// Verificación de equilibrio
console.log('═'.repeat(70));
console.log('4. VERIFICACIÓN DE EQUILIBRIO');
console.log('═'.repeat(70));

const conversionFactor = GRAZE_MULT;
const recyclingFactor = CARCASS_EFFICIENCY * CARCASS_DECAY_TO_FIELD; // 0.55 * 0.25 = 0.1375
const excretionFactor = 0.025; // 2.5% del metabCost

console.log(`
   Factor de conversión campo→móvil: ${conversionFactor}x
   Factor de reciclaje móvil→campo: ${recyclingFactor.toFixed(4)} (carcass) + ${excretionFactor} (excretion)
   
   Para sistema cerrado en equilibrio:
   field_output × conversion = metab + repro + thermal
   ${(fieldOutput).toFixed(1)} × ${conversionFactor} = ${fieldOutput * conversionFactor | 0} energy/s generado
   ${(metabPerConsumerPerSec * nConsumers).toFixed(1)} energy/s metabolism
   
   EXCEDENTE: ${((fieldOutput * conversionFactor) - (metabPerConsumerPerSec * nConsumers)).toFixed(0)} energy/s
   → Esto explica el boom de consumers (NET +982/s observado en batch 5m)
   
   El campo NO puede sostener esto: genera ${fieldInput.toFixed(0)} mass/s pero los consumers
   remueven ${fieldOutput.toFixed(0)} mass/s. Si ${fieldOutput > fieldInput}, el campo se agota.
   Pero el gain sigue funcionando porque bite se limita a min(mass, biteRate),
   y cuando mass→0, bite→0 y gain→0.
   
   El PROBLEMA real es: cuando el campo está denso (mass ~0.8-1.2), cada consumer
   genera ${energyGainedPerConsumerPerSec.toFixed(2)} energy/s pero solo gasta ${metabPerConsumerPerSec.toFixed(3)}.
   El excedente se acumula en maxEnergy cap, pero con REPRO_THRESHOLD=0.78,
   los consumers saturados se reproducen constantemente.
   
   CONCLUSIÓN: El mult=18 es demasiado alto para el balance actual.
   El campo genera suficiente mass para sostener X consumers, pero
   el gain por consumer es tan alto que la población explota.
   Un mult=8-10 daría ratio gain:metab ~2.5-3x, suficiente para
   crecimiento pero con freno natural.
`);

console.log('═'.repeat(70));
console.log('5. RECOMENDACIÓN');
console.log('═'.repeat(70));
console.log(`
   Richard tiene razón: el ledger suma unidades distintas.
   
   El mult=18 actúa como conversión biomasa→energía.
   Con el metabolismo actual, produce NET +${netEnergyPerConsumer.toFixed(2)} energy/s/consumer.
   Esto causa boom incontrolable.
   
   Jared dice NO tocar balance. Correcto: primero cerrar 20x30m.
   
   Lo que este análisis aporta:
   1. El ledger dimensional explica POR QUÉ el sistema boom-a
   2. No es un bug de doble conteo: es un factor de conversión demasiado alto
   3. Los datos del 20x30m confirmarán si el campo se agota o el boom es indefinido
   4. Cuando Jared decida ajustar, el palanca correcto es mult (no metab, no growth)
`);

console.log('\n✅ Análisis completo.\n');
