#!/bin/bash
# OFF (migration off) batch: waits for ON batch to finish, then runs same 20 seeds x30m
set -e
cd "$(dirname "$0")"

ON_LOG="baseline_20x30m_dt_1_60.log"
ON_DIR="batch_30m_results"
SEEDS=(12345 20264 28183 36102 44021 51940 59859 67778 75697 83616 91535 99454 107373 115292 123211 131130 139049 146968 154887 162806)
EXPECTED=20

# Wait for ON batch completion marker in log (max ~10h)
while true; do
  done_count=$(ls "$ON_DIR"/run_*_seed*.json 2>/dev/null | wc -l)
  if grep -q "Batch 20x30m finished" "$ON_LOG" 2>/dev/null; then
    echo "ON batch finished ($done_count results). Starting OFF."
    break
  fi
  if [ "$done_count" -ge "$EXPECTED" ]; then
    echo "ON batch has $done_count results. Starting OFF."
    break
  fi
  sleep 60
done

LOG="baseline_20x30m_off.log"
RESULTS_DIR="batch_30m_results_off"
mkdir -p "$RESULTS_DIR"

echo "=== Batch 20x30m OFF started $(date -Iseconds) ===" | tee "$LOG"

for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"
  idx=$((i+1))
  outfile="${RESULTS_DIR}/run_${idx}_seed${seed}.json"
  if [ -f "$outfile" ]; then
    echo "[${idx}/20] seed=$seed already done, skip" | tee -a "$LOG"
    continue
  fi
  echo "[${idx}/20] seed=$seed start=$(date -Iseconds)" | tee -a "$LOG"
  if node sim-harness.js --duration=30 --seeds=1 --seed=$seed \
     --dt=0.016666666666666666 --interval=10 --migration=off \
     --out="$outfile" --quiet 2>>"$LOG"; then
    echo "[${idx}/20] seed=$seed done=$(date -Iseconds)" | tee -a "$LOG"
  else
    echo "[${idx}/20] seed=$seed FAILED rc=$? at=$(date -Iseconds)" | tee -a "$LOG"
  fi
done
echo "=== Batch 20x30m OFF finished $(date -Iseconds) ===" | tee -a "$LOG"
