#!/bin/bash
# task_918 Gate 1: reserva E explicita campo A. Ledger paralelo INERTE:
# analisis post-hoc sobre runs OFF estandar (mismo protocolo 917: 5 seeds
# x 10m, dt 1/60, migracion off). Cero cambios de conducta en app.js.
set -e
cd "$(dirname "$0")"
mkdir -p task_918_results
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_918_results/batch.log
echo "=== Batch 5x10m task_918 (HEAD $(git rev-parse --short HEAD)) started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_918_results/run_led_${idx}_seed${seed}.json"
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
echo "=== batch done $(date -Iseconds) ===" | tee -a "$LOG"
node analyze-task918.js | tee task_918_results/gate1_analysis.txt
