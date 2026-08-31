#!/bin/bash
# task_915 Gate 1: 5 seeds x 10m shadow pred-suctorial (protocolo Jared)
set -e
cd "$(dirname "$0")"
mkdir -p task_915_results
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_915_results/batch.log
echo "=== Batch 5x10m shadow pred-suctorial started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_915_results/run_sh_${idx}_seed${seed}.json"
  if [ -f "$out" ]; then echo "[$idx/5] skip" | tee -a "$LOG"; continue; fi
  echo "[$idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=10 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off \
     --shadow=pred-suctorial=on \
     --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[$idx/5] seed=$seed FAILED rc=$?" | tee -a "$LOG"
  fi
done
echo "=== batch done $(date -Iseconds) ===" | tee -a "$LOG"
node analyze-task915.js run_sh | tee task_915_results/gate1_analysis.txt
