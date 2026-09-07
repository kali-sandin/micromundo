#!/bin/bash
# Linea base OFF x60m para comparador de la futura tarea ON x60m (post task_920).
# Protocolo estandar: 5 seeds, dt 1/60, migracion off, sample 10s.
set -e
cd "$(dirname "$0")/.."
SEEDS=(12345 20264 28183 36102 44021)
LOG=baseline_off_60m/batch.log
echo "=== Batch OFF 5x60m (HEAD $(git rev-parse --short HEAD)) started $(date -Iseconds) ===" | tee "$LOG"
for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"; idx=$((i+1))
  out="baseline_off_60m/run_${idx}_seed${seed}.json"
  if [ -f "$out" ]; then echo "[$idx/5] skip" | tee -a "$LOG"; continue; fi
  echo "[$idx/5] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=60 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off \
     --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$idx/5] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[$idx/5] seed=$seed FAILED=$(date -Iseconds)" | tee -a "$LOG"
  fi
done
echo "=== Batch OFF 5x60m finished $(date -Iseconds) ===" | tee -a "$LOG"
