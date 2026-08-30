#!/bin/bash
# task_914 Gate 1: 5 seeds x 10m shadow pred-profit (protocolo Jared)
set -e
cd "$(dirname "$0")"
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_914_results/batch.log
echo "=== Batch 5x10m shadow pred-profit started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_914_results/run_sh_${idx}_seed${seed}.json"
  if [ -f "$out" ]; then echo "[$idx/5] skip" | tee -a "$LOG"; continue; fi
  echo "[$idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=10 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off \
     --shadow=pred-profit=on \
     --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[$idx/5] seed=$seed FAILED rc=$?" | tee -a "$LOG"
  fi
done
echo "=== batch done $(date -Iseconds) ===" | tee -a "$LOG"
node analyze-task914.js run_sh | tee task_914_results/gate1_analysis.txt
