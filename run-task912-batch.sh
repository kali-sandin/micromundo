#!/bin/bash
# task_912: pareado 5 seeds x 10m OFF/ON con spike pred-ambush (protocolo Jared)
set -e
cd "$(dirname "$0")"
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_912_results/batch.log
echo "=== Batch pareado 5x10m OFF/ON spike pred-ambush started $(date -Iseconds) ===" | tee "$LOG"
for MODE in off on; do
  FLAG="pred-ambush=$MODE"
  for i in "${!SEEDS[@]}"; do
    seed="${SEEDS[$i]}"; idx=$((i+1))
    out="task_912_results/run_${MODE}_${idx}_seed${seed}.json"
    if [ -f "$out" ]; then echo "[$MODE $idx/5] skip" | tee -a "$LOG"; continue; fi
    echo "[$MODE $idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
    if node sim-harness.js --duration=10 --seeds=1 --seed=$seed \
       --dt=0.016666666666666666 --interval=10 --migration=off \
       --spike="$FLAG" \
       --out="$out" --quiet >>"$LOG" 2>&1; then
      echo "[$MODE $idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
    else
      echo "[$MODE $idx/5] seed=$seed FAILED rc=$?" | tee -a "$LOG"
    fi
  done
done
echo "=== Batch finished $(date -Iseconds) ===" | tee -a "$LOG"
