#!/bin/bash
# task_550: factorial 2x2 diagnostic — consumer-pC x predator-pC ON/OFF
# 4 cells in parallel, each 20 fixed seeds x 10m, migration=off (matches OFF baseline where pC collapse was observed)
# Usage: bash run-factorial-2x2.sh
set -u
cd "$(dirname "$0")"

SEEDS=(12345 20264 28183 36102 44021 51940 59859 67778 75697 83616 91535 99454 107373 115292 123211 131130 139049 146968 154887 162806)
DUR=10
RESULTS="factorial_2x2_results"
mkdir -p "$RESULTS"

run_cell() {
  local cell="$1"; shift
  local -a flags=("$@")
  local dir="$RESULTS/$cell"
  mkdir -p "$dir"
  local log="$RESULTS/${cell}.log"
  echo "=== cell $cell started $(date -Iseconds) flags: ${flags[*]:-none} ===" >>"$log"
  for i in "${!SEEDS[@]}"; do
    local seed="${SEEDS[$i]}"
    local idx=$((i+1))
    local out="$dir/run_${idx}_seed${seed}.json"
    if [ -f "$out" ]; then echo "[${idx}/20] $seed skip" >>"$log"; continue; fi
    echo "[${idx}/20] $seed start=$(date -Iseconds)" >>"$log"
    if node sim-harness.js --duration=$DUR --seeds=1 --seed=$seed \
        --dt=0.016666666666666666 --interval=10 --migration=off \
        ${flags[@]+"${flags[@]}"} \
        --out="$out" --quiet 2>>"$log"; then
      echo "[${idx}/20] $seed done=$(date -Iseconds)" >>"$log"
    else
      echo "[${idx}/20] $seed FAILED rc=$? at=$(date -Iseconds)" >>"$log"
    fi
  done
  echo "=== cell $cell finished $(date -Iseconds) ===" >>"$log"
}

run_cell cc &  # consumer-pc ON, predator-pc ON (control, 10m)
run_cell co --ablate=predator-pc=off &  # consumer ON, predator OFF
run_cell oc --ablate=consumer-pc=off &  # consumer OFF, predator ON
run_cell oo --ablate=consumer-pc=off,predator-pc=off & # both OFF
wait
echo "=== factorial 2x2 finished $(date -Iseconds) ===" | tee "$RESULTS/BATCH_DONE"
