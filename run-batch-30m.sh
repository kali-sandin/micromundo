#!/bin/bash
# Robust batch runner: one process per seed, 30min each
# Restarts if a single seed fails; collects all JSON results
set -e
cd "$(dirname "$0")"

SEEDS=(12345 20264 28183 36102 44021 51940 59859 67778 75697 83616 91535 99454 107373 115292 123211 131130 139049 146968 154887 162806)
LOG="baseline_20x30m_dt_1_60.log"
RESULTS_DIR="batch_30m_results"
mkdir -p "$RESULTS_DIR"

echo "=== Batch 20x30m started $(date -Iseconds) ===" | tee "$LOG"

for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"
  idx=$((i+1))
  outfile="${RESULTS_DIR}/run_${idx}_seed${seed}.json"

  if [ -f "$outfile" ]; then
    echo "[${idx}/20] seed=$seed already done, skip" | tee -a "$LOG"
    continue
  fi

  echo "[${idx}/20] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  # Run single seed, 30min, output to file
  if node sim-harness.js --duration=30 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=on \
     --out="$outfile" --quiet 2>>"$LOG"; then
    echo "[${idx}/20] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[${idx}/20] seed=$seed FAILED rc=$? at=$(date -Iseconds)" | tee -a "$LOG"
  fi
done

echo "=== Batch 20x30m finished $(date -Iseconds) ===" | tee -a "$LOG"
