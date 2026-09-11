#!/bin/bash
# task_922 CP2: extension 5x180m (msg_619 Jared) + control OFF 90m para div/coste justos
cd "$(dirname "$0")"
for seed in 12345 23456 34567 45678 56789; do
  node sim-harness.js --duration=180 --seeds=1 --seed=$seed --dt=0.0166667 --interval=10 --no-migration --conserve=dual-ledger=on --quiet --out=task_922_results/batch180_seed$seed.json 2>task_922_results/batch180_seed$seed.err
  echo "seed $seed done $(date -Is)" >> task_922_results/batch180.log
done
echo ALL_DONE >> task_922_results/batch180.log
node sim-harness.js --duration=90 --seeds=1 --seed=12345 --dt=0.0166667 --interval=10 --no-migration --conserve=dual-ledger=off --quiet --out=task_922_results/control_off_90m.json 2>task_922_results/control_off_90m.err
echo CONTROL_OFF_DONE_OK $(date -Is) >> task_922_results/batch180.log
