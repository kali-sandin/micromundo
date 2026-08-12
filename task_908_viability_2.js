// task_908 — Análisis de balance: qué mult mantiene steady-state?

const cols = 17800;
const growth_per_cell_s = 0.020 * 0.87 / 1 + 0.001 * 0.87 / 1; // per cell per REAL second
// Wait: growth = 0.020 * sunEff * t, where t is dt (1/60). So per step.
// Per second = growth_per_step * 60
const growth_per_cell_per_s = (0.020 * 0.87 * (1/60) + 0.001 * 0.87 * (1/60)) * 60;
const field_total_growth_per_s = growth_per_cell_per_s * cols;

// Grazing parameters
const biteRate = 0.034;
const cooldown = 0.55;
const events_per_s = 1 / cooldown;
const consumers = 720;
const densityFactor = 0.85;

const total_mass_extracted_per_s = biteRate * events_per_s * consumers;

// Metabolism
const metabolism_base = 0.038;
const metabFactor = 6.5;
const total_metab_per_s = metabolism_base * metabFactor * consumers;

console.log('=== BALANCE ANALYSIS ===');
console.log(`Field photosynthesis: ${field_total_growth_per_s.toFixed(1)} mass/s`);
console.log(`Mass extracted by grazing: ${total_mass_extracted_per_s.toFixed(1)} mass/s`);
console.log(`Field surplus: ${(field_total_growth_per_s - total_mass_extracted_per_s).toFixed(1)} mass/s`);
console.log(`Total metabolism: ${total_metab_per_s.toFixed(1)} E/s`);
console.log();

// For the SYSTEM to be energy-balanced:
// photosynthesis (as energy input) = metabolism (as energy output)
// photosynthesis creates field mass. That mass is converted to mobile energy via grazing.
// The conversion factor (mult) determines the ratio.
// 
// SYSTEM_NET = photosynthesis_energy - metabolism 
// If we treat field mass as having energy value 1:1:
//   photosynthesis_energy = field_total_growth_per_s * 1 = 325 E/s
//   But metabolism = 178 E/s -> surplus +147 E/s (system gains energy)
//
// If we treat mult as the conversion factor:
//   The REAL question is: what makes mobile creatures' energy stable?
//   Mobile NET = graze_gain - metab = bite*mult*df*events*N - metab*N
//   For NET ≈ 0: mult = metab / (bite*df*events) = 0.247 / (0.034*0.85*1.82)
const balanced_mult = (metabolism_base * metabFactor) / (biteRate * densityFactor * events_per_s);
console.log(`Mult for mobile balance (NET≈0): ${balanced_mult.toFixed(2)}`);

// But that's for energy stability of individuals. What about population?
// For births to offset deaths, creatures need surplus to reach repro threshold.
// Repro threshold = 0.78 * maxEnergy ≈ 47
// Average energy needs to hover around 40-50 for reproduction rate to be meaningful.
// 
// At balanced_mult, gain = metab, so energy never accumulates -> no births -> extinction.
// We need gain > metab by enough margin.
// 
// Sustainable surplus per consumer: ~0.05-0.15 E/s (reaches threshold in 100-300s)
const target_surplus = 0.10; // E/s per consumer
const sustainable_mult = (metabolism_base * metabFactor + target_surplus) / (biteRate * densityFactor * events_per_s);
console.log(`Mult for sustainable surplus (+0.10 E/s): ${sustainable_mult.toFixed(2)}`);

// What about the SYSTEM energy budget?
// At sustainable_mult, total gain = (metab + 0.10) * N = 178 + 72 = 250 E/s
// Photosynthesis = 325 mass/s
// Mass extracted = bite * events * N = 0.034 * 1.82 * 720 = 44.6 mass/s
// At mult=sustainable_mult, total mobile gain = 44.6 * sustainable_mult * 0.85 = ?
const total_mobile_gain = total_mass_extracted_per_s * sustainable_mult * densityFactor;
console.log(`\nAt mult=${sustainable_mult.toFixed(2)}:`);
console.log(`  Total mobile gain: ${total_mobile_gain.toFixed(1)} E/s`);
console.log(`  Total metabolism: ${total_metab_per_s.toFixed(1)} E/s`);
console.log(`  Mobile surplus: ${(total_mobile_gain - total_metab_per_s).toFixed(1)} E/s`);
console.log(`  Photosynthesis: ${field_total_growth_per_s.toFixed(1)} mass/s`);
console.log(`  Mass extracted: ${total_mass_extracted_per_s.toFixed(1)} mass/s`);
console.log(`  Mass surplus: ${(field_total_growth_per_s - total_mass_extracted_per_s).toFixed(1)} mass/s`);

// THE REAL PROBLEM: 
// Photosynthesis creates 325 mass/s, but only 44.6 mass/s is grazed.
// The rest (280 mass/s) accumulates in the field.
// At mult=18, the 44.6 mass/s becomes 681 E/s (way more than metab 178).
// At mult=4, the 44.6 mass/s becomes 152 E/s (close to metab 178).
// At mult=5, the 44.6 mass/s becomes 190 E/s (slight surplus).

console.log(`\n=== SYSTEM-LEVEL ANALYSIS ===`);
console.log(`Photosynthesis creates ${field_total_growth_per_s.toFixed(0)} mass/s`);
console.log(`Grazing extracts ${total_mass_extracted_per_s.toFixed(0)} mass/s (${(total_mass_extracted_per_s/field_total_growth_per_s*100).toFixed(0)}% of production)`);
console.log(`Field accumulates ${(field_total_growth_per_s - total_mass_extracted_per_s).toFixed(0)} mass/s unused`);
console.log(`\nPOTENTIAL SOLUTION SPACE:`);
console.log(`Option 1: mult=4-5 with current params. Mobile balance near zero.`);
console.log(`  Risk: population sensitive to densityFactor and competition.`);
console.log(`Option 2: mult=4-5 AND reduce photosynthesis growth rate.`);
console.log(`  This tightens the field budget and makes mult less critical.`);
console.log(`Option 3: mult=1 with drastically reduced metabolism.`);
console.log(`  metab would need to be ~0.007 (from 0.038). Unrealistic biology.`);
console.log(`Option 4: Treat field mass as direct energy (mult=1) with field growth reduced 10x.`);
console.log(`  Growth 0.002 instead of 0.020. Field becomes scarce resource.`);
console.log(`  Consumers compete for limited field energy. Mult=1 means 1:1 conversion.`);

// Option 4 math
const growth_reduced = 0.002 * 0.87;
const field_growth_reduced = growth_reduced * cols;
console.log(`\n=== OPTION 4 DETAIL: mult=1, growth=0.002 ===`);
console.log(`Field growth: ${field_growth_reduced.toFixed(1)} mass/s`);
console.log(`Mass extracted: ${total_mass_extracted_per_s.toFixed(1)} mass/s`);
console.log(`At mult=1, mobile gain: ${total_mass_extracted_per_s * densityFactor} E/s`);
console.log(`Metabolism: ${total_metab_per_s.toFixed(1)} E/s`);
console.log(`Still deficit: ${(total_mass_extracted_per_s * densityFactor - total_metab_per_s).toFixed(1)} E/s`);
console.log(`Field sustainable? Extract ${total_mass_extracted_per_s.toFixed(0)} vs growth ${field_growth_reduced.toFixed(0)} -> ${total_mass_extracted_per_s > field_growth_reduced ? 'OVERGRAZING' : 'sustainable'}`);

// Conclusion
console.log(`\n=== STRUCTURAL CONCLUSION ===`);
console.log(`The core imbalance is NOT just mult=18.`);
console.log(`It's the combination: growth_rate=0.020 (fast field regen) × mult=18 (huge conversion) × metab=0.038×6.5=0.247 (moderate cost)`);
console.log(`\nWith 720 consumers extracting 44.6 mass/s from a field that regenerates 325 mass/s:`);
console.log(`  - mult=18: each mass unit -> 18 energy. 44.6*18*0.85 = 681 E/s. Metab=178. SURPLUS +503 E/s -> BOOM`);
console.log(`  - mult=4: each mass unit -> 4 energy. 44.6*4*0.85 = 152 E/s. Metab=178. DEFICIT -26 E/s -> DECLINE`);
console.log(`  - mult=5: each mass unit -> 5 energy. 44.6*5*0.85 = 190 E/s. Metab=178. SURPLUS +12 E/s -> STABLE?`);
console.log(`\nRECOMMENDATION: mult=5 is the sweet spot IF we want to preserve current metabolism.`);
console.log(`But Jared said "sin tuning". This analysis informs the decision, not implements it.`);
