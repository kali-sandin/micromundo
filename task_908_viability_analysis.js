// task_908 — Análisis de viabilidad cuantitativa de alternativas
// Sin tocar app.js. Usa parámetros extraídos del código para calcular balances.

const params = {
  // Field growth (per cell per step at dt=1/60)
  sunEff_at_1: 0.87,       // sun=1 -> 0.87
  growth_per_step: 0.020 * 0.87 * (1/60),  // logistic growth per cell per step
  baselineGrowth: 0.001 * 0.87 * (1/60),
  cols: 17800,             // approximate cell count
  diffusion: 0.028 * (1/60),

  // Grazing (per event)
  biteRate_typical: 0.034,  // size=3, cilia=1, feeding=0: 0.018+0.018+0.003+0.010
  biteRate_rich: 0.047,     // size=5, cilia=2, feeding=1
  grazeCooldown_avg: 0.55,  // rand(0.3, 0.8)
  mult_current: 18,
  densityFactor_typical: 0.85, // mass ~0.7

  // Metabolism (per creature per second)
  metabolism_base: 0.038,   // typical consumer
  metabFactor_resting: 1.5,
  metabFactor_active: 6.5,
  metabFactor_effective: 6.5, // active during foraging

  // Population
  consumers_typical: 720,
  maxEnergy_consumer: 60,   // ~size 3

  // Photosynthesis (field growth total)
  // total_growth_per_s = growth_per_step * cols * 60 steps/s
};

// Calculate field energy budget
const field_growth_per_cell_per_s = params.growth_per_step * 60 + params.baselineGrowth * 60;
const field_total_growth_per_s = field_growth_per_cell_per_s * params.cols;
console.log(`=== FIELD BUDGET ===`);
console.log(`Growth per cell/s: ${field_growth_per_cell_per_s.toFixed(5)}`);
console.log(`Total field growth/s: ${field_total_growth_per_s.toFixed(1)} mass units/s`);
console.log(`(This is FREE energy from photosynthesis)`);

// Calculate grazing extraction
const bite_per_event = params.biteRate_typical;
const events_per_consumer_per_s = 1 / params.grazeCooldown_avg;
const total_bite_per_s = bite_per_event * events_per_consumer_per_s * params.consumers_typical;
console.log(`\n=== GRAZING EXTRACTION ===`);
console.log(`Bite per event: ${bite_per_event}`);
console.log(`Events per consumer/s: ${events_per_consumer_per_s.toFixed(2)}`);
console.log(`Total mass extracted/s: ${total_bite_per_s.toFixed(1)}`);

// Calculate energy flows for each alternative
console.log(`\n=== ALTERNATIVE COMPARISON ===`);

const alts = [
  {
    name: "Current (mult=18)",
    mult: 18,
    desc: "gain = bite * 18 * densityFactor"
  },
  {
    name: "D: mult=1 (neutral)",
    mult: 1,
    desc: "gain = bite * densityFactor"
  },
  {
    name: "B: eff 15% (trophic)",
    mult: null,
    eff: 0.15,
    desc: "gain = bite * densityFactor * eff, but mass extracted from field is an energy cost"
  },
  {
    name: "A: Ledger only (mult=18)",
    mult: 18,
    ledger_only: true,
    desc: "No mech change, just track photosynthesis as input"
  }
];

for (const alt of alts) {
  console.log(`\n--- ${alt.name} ---`);
  console.log(`Formula: ${alt.desc}`);

  // Energy IN to mobile creatures via grazing
  let gain_per_event;
  if (alt.mult !== null) {
    gain_per_event = bite_per_event * alt.mult * params.densityFactor_typical;
  } else {
    // eff model: gain = mass_extracted * eff, but we need to account for field energy
    gain_per_event = bite_per_event * params.densityFactor_typical * alt.eff;
    // Actually the eff model means: of the energy in the field mass, only eff% transfers
    // If we treat mass as energy equivalent: gain = bite * eff
    gain_per_event = bite_per_event * alt.eff;
  }

  const gain_per_consumer_per_s = gain_per_event * events_per_consumer_per_s;
  const total_graze_gain_per_s = gain_per_consumer_per_s * params.consumers_typical;

  console.log(`Gain per event: ${gain_per_event.toFixed(4)}`);
  console.log(`Gain per consumer/s: ${gain_per_consumer_per_s.toFixed(3)}`);
  console.log(`Total graze gain/s: ${total_graze_gain_per_s.toFixed(1)}`);

  // Metabolism cost
  const metab_per_consumer_per_s = params.metabolism_base * params.metabFactor_effective;
  const total_metab_per_s = metab_per_consumer_per_s * params.consumers_typical;
  console.log(`Metab per consumer/s: ${metab_per_consumer_per_s.toFixed(4)}`);
  console.log(`Total metab/s: ${total_metab_per_s.toFixed(1)}`);

  // Net energy balance for mobile creatures
  const mobile_net = total_graze_gain_per_s - total_metab_per_s;
  console.log(`Mobile NET: ${mobile_net > 0 ? '+' : ''}${mobile_net.toFixed(1)} E/s`);

  // Reproduction threshold: 0.78 * maxEnergy = 46.8
  // Energy surplus needed to reach threshold from typical start (~30 E)
  const energy_surplus_per_consumer_per_s = gain_per_consumer_per_s - metab_per_consumer_per_s;
  console.log(`Surplus per consumer: ${energy_surplus_per_consumer_per_s > 0 ? '+' : ''}${energy_surplus_per_consumer_per_s.toFixed(4)} E/s`);

  // Time to reach reproduction threshold from avg energy 30
  const threshold = 0.78 * params.maxEnergy_consumer;
  const start_energy = 30;
  const energy_gap = threshold - start_energy;
  if (energy_surplus_per_consumer_per_s > 0) {
    const time_to_repro = energy_gap / energy_surplus_per_consumer_per_s;
    console.log(`Repro threshold: ${threshold.toFixed(1)}, time from ${start_energy}E: ${time_to_repro.toFixed(0)}s`);
  } else {
    console.log(`Repro threshold: ${threshold.toFixed(1)}, NEVER REACHED (deficit ${energy_surplus_per_consumer_per_s.toFixed(4)} E/s)`);
  }

  // System-wide energy balance
  if (alt.ledger_only) {
    // For ledger-only, the photosynthesis IS the real input
    const system_net = field_total_growth_per_s - total_metab_per_s;
    console.log(`SYSTEM_NET (with photosynthesis as input): ${system_net > 0 ? '+' : ''}${system_net.toFixed(1)} E/s`);
    console.log(`Field growth as % of metabolism: ${(field_total_growth_per_s / total_metab_per_s * 100).toFixed(0)}%`);
  } else {
    // For mult alternatives, field growth is free but mass extraction is the conversion
    const system_net = total_graze_gain_per_s - total_metab_per_s;
    console.log(`SYSTEM_NET (mobile only): ${system_net > 0 ? '+' : ''}${system_net.toFixed(1)} E/s`);
  }
}

console.log(`\n=== KEY FINDING ===`);
console.log(`Field photosynthesis generates ${field_total_growth_per_s.toFixed(0)} mass/s`);
console.log(`Consumer metabolism costs ${params.metabolism_base * params.metabFactor_effective * params.consumers_typical.toFixed(0)} E/s`);
const total_metab = params.metabolism_base * params.metabFactor_effective * params.consumers_typical;
console.log(`Total metab: ${total_metab.toFixed(1)} E/s`);
console.log(`\nFor the system to be balanced:`);
console.log(`  Photosynthesis input must ≈ Metabolism output`);
console.log(`  Photosynthesis: ${field_total_growth_per_s.toFixed(0)} mass/s`);
console.log(`  Metabolism: ${total_metab.toFixed(0)} E/s`);
console.log(`  Ratio photosynth:metab = ${(field_total_growth_per_s / total_metab).toFixed(2)}:1`);
console.log(`\n  At mult=1: field provides ${field_total_growth_per_s.toFixed(0)} mass/s, consumers extract ${total_bite_per_s.toFixed(0)} mass/s`);
console.log(`  So mult must be ≈ ${total_metab / field_total_growth_per_s.toFixed(0)} to balance metabolism`);
console.log(`  But mult=${(total_metab / total_bite_per_s).toFixed(1)} would balance if ALL mass converted to energy`);
