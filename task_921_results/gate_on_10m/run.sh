#!/bin/bash
# task_921 Gate ON 5x10m: --conserve=trophic-a=on, dt 1/60 exacto, migr off, sample 10s.
set -e
cd "$(dirname "$0")/../.."
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_921_results/gate_on_10m/batch.log
echo "=== Gate ON 5x10m (HEAD $(git rev-parse --short HEAD)) started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_921_results/gate_on_10m/run_${idx}_seed${seed}.json"
  if [ -f "$out" ]; then echo "[$idx/5] skip" | tee -a "$LOG"; continue; fi
  echo "[$idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=10 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off --conserve=trophic-a=on \
     --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[$idx/5] seed=$seed FAILED=$(date -Iseconds)" | tee -a "$LOG"
  fi
done
echo "=== Gate ON 5x10m finished $(date -Iseconds) ===" | tee -a "$LOG"
