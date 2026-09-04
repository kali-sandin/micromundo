#!/bin/bash
# task_919 Corte 2: 5 seeds x 30m OFF (dt 1/60, migracion off, sample 10s).
# Shadow inerte: cero cambios app.js; analisis post-hoc con unidades corregidas.
set -e
cd "$(dirname "$0")/.."
mkdir -p task_919_results/corte2
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_919_results/corte2/batch.log
echo "=== Batch 5x30m task_919 corte2 (HEAD $(git rev-parse --short HEAD)) $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_919_results/corte2/run_led_${idx}_seed${seed}.json"
  if [ -f "$out" ]; then echo "[$idx/5] skip" | tee -a "$LOG"; continue; fi
  echo "[$idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=30 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off \
     --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[$idx/5] seed=$seed FAILED rc=$?" | tee -a "$LOG"
  fi
done
echo "=== batch done $(date -Iseconds) ===" | tee -a "$LOG"
node task_919_results/analyze-task919.js task_919_results/corte2 | tee task_919_results/corte2/corte2_analysis.txt
