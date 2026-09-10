#!/bin/bash
cd "$(dirname "$0")"
for seed in 12345 23456 34567 45678 56789; do
  node sim-harness.js --duration=90 --seeds=1 --seed=$seed --dt=0.0166667 --interval=10 --no-migration --conserve=dual-ledger=on --quiet --out=task_922_results/batch90_seed$seed.json 2>task_922_results/batch90_seed$seed.err
  echo "seed $seed done $(date -Is)" >> task_922_results/batch90.log
done
echo ALL_DONE >> task_922_results/batch90.log
