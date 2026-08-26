#!/bin/bash
# task_910: 5 seeds x 10m OFF (presupuesto task_909)
set -e
cd "$(dirname "$0")"
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_910_results/batch.log
echo "=== Batch 5x10m OFF started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_910_results/run_${idx}_seed${seed}.json"
  if [ -f "$out" ]; then echo "[$idx/5] skip" | tee -a "$LOG"; continue; fi
  echo "[$idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=10 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off \
     --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[$idx/5] seed=$seed FAILED rc=$?" | tee -a "$LOG"
  fi
done
echo "=== Batch 5x10m OFF finished $(date -Iseconds) ===" | tee -a "$LOG"
