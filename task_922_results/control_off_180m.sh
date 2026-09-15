#!/usr/bin/env bash
# task_922 CP2c: control OFF 5x180m, encadenado tras el runner ON actual.
set -u
cd "$(dirname "$0")/.." || exit 1
LOG=task_922_results/control_off_180m.log
echo "WAIT_RUNNER $(date -Is)" >> "$LOG"
while pgrep -f 'sim-harness.js.*batch180_seed' > /dev/null 2>&1; do sleep 120; done
echo "RUNNER_DONE $(date -Is)" >> "$LOG"
for S in 12345 23456 34567 45678 56789; do
  echo "OFF seed $S START $(date -Is)" >> "$LOG"
  node sim-harness.js --duration=180 --seeds=1 --seed=$S --dt=0.0166667 --interval=10 \
    --no-migration --quiet --out=task_922_results/control180_off_seed$S.json \
    >> "$LOG" 2> task_922_results/control180_off_seed$S.err
  echo "OFF seed $S END rc=$? $(date -Is)" >> "$LOG"
done
echo "CONTROL180_OFF_DONE $(date -Is)" >> "$LOG"
node task_922_results/analyze_task922.js --off task_922_results/control180_off_seed12345.json \
  task_922_results/batch180_seed*.json > task_922_results/batch180_analysis.md 2>&1 || true
echo "ANALYSIS_DONE $(date -Is)" >> "$LOG"
