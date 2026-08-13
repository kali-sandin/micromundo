#!/bin/bash
# mult-comparison.sh — Comparativa de gain mult usando sim-harness.js existente
# Prueba mult=18, mult=5, mult=6.6 con 3 semillas x 5min
set -e

cd /home/kali/.openclaw/workspace/projects/micromundo

MULTS="18 5 6.6"
SEEDS="12345 54321"
DURATION=3
RESULTS_FILE="mult-comparison-results.txt"

echo "=== COMPARATIVA GAIN MULT ===" > "$RESULTS_FILE"
echo "Duration: ${DURATION}min x 3 seeds, migration ON" >> "$RESULTS_FILE"
echo "Git: $(git rev-parse --short HEAD)" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# Backup original
cp app.js app.js.bak

for mult in $MULTS; do
  echo ""
  echo "=== Testing mult=$mult ==="
  
  # Patch mult value
  sed -i "s/const gain = bite \* 18 \* densityFactor;/const gain = bite * ${mult} * densityFactor;/" app.js
  
  # Verify patch
  if ! grep -q "bite \* ${mult} \* densityFactor" app.js; then
    echo "ERROR: Patch failed for mult=$mult"
    cp app.js.bak app.js
    continue
  fi
  
  echo "mult=$mult" >> "$RESULTS_FILE"
  echo "--------------" >> "$RESULTS_FILE"
  
  for seed in $SEEDS; do
    echo "  seed $seed..."
    OUTPUT=$(node sim-harness.js --duration=$DURATION --seeds=1 --seed=$seed --quiet 2>/dev/null)
    
    # Extract key metrics from JSON output
    # We need: final populations, energy drift, system_net, extinctions
    SUMMARY=$(echo "$OUTPUT" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const r = data.runs[0];
      if (!r) { console.log('NO RUN DATA'); process.exit(0); }
      const first = r.metrics[0];
      const last = r.metrics[r.metrics.length - 1];
      const e0 = first.energy;
      const eN = last.energy;
      const total0 = e0.producer + e0.consumer + e0.predator + e0.field + e0.carcass;
      const totalN = eN.producer + eN.consumer + eN.predator + eN.field + eN.carcass;
      const drift = total0 > 0 ? ((totalN - total0) / total0 * 100).toFixed(1) : 'N/A';
      
      // avg system_net from last 3 intervals
      const last3 = r.metrics.slice(-3);
      const avgNet = last3.reduce((s,m) => s + (m.flows.system_net || 0), 0) / last3.length;
      
      console.log(JSON.stringify({
        seed: r.seed,
        pop_init: { C: first.populations.consumers, P: first.populations.predators, prodC: first.populations.producerC },
        pop_final: { C: last.populations.consumers, P: last.populations.predators, prodC: last.populations.producerC },
        energy_init: total0.toFixed(0),
        energy_final: totalN.toFixed(0),
        drift_pct: parseFloat(drift),
        avg_net: parseFloat(avgNet.toFixed(1)),
        extinctions: r.extinctions.length,
        births: last.rates.births_total,
        deaths: last.rates.deaths_total,
        speed: r.speed_factor,
        survival: r.final_state.survival,
      }));
    " 2>/dev/null)
    
    echo "    $SUMMARY"
    echo "  seed=$seed: $SUMMARY" >> "$RESULTS_FILE"
  done
  
  echo "" >> "$RESULTS_FILE"
  
  # Restore for next iteration
  cp app.js.bak app.js
done

# Restore original
cp app.js.bak app.js
rm app.js.bak

echo ""
echo "=== RESULTS ==="
cat "$RESULTS_FILE"
