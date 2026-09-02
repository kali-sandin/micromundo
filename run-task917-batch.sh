#!/bin/bash
# task_917 Gate 1: ledger energetico productor-campo (P-A), shadow/inerte.
# Sin cambios en app.js ni en reglas: el harness ya exporta por intervalo
# photosynthField, graze, trophicAmplification, deposits, clamp y paridad
# de campo. Protocolo Jared: 5 seeds x 10m, dt 1/60, migracion off.
set -e
cd "$(dirname "$0")"
mkdir -p task_917_results
SEEDS=(12345 20264 28183 36102 44021)
LOG=task_917_results/batch.log
echo "=== Batch 5x10m ledger P-A started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="task_917_results/run_led_${idx}_seed${seed}.json"
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
node analyze-task917.js | tee task_917_results/gate1_analysis.txt
