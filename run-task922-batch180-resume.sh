#!/bin/bash
# task_922 CP2: runner REANUDABLE 5x180m + control OFF 90m.
# - Salta cualquier seed cuyo JSON exista, sea valido y cubra la duracion.
# - El propio script puede relanzarse tras cualquier muerte/reboot: continua donde estaba.
# - Toda salida queda en task_922_results/ para evidencia.
cd "$(dirname "$0")"
R=task_922_results
LOG=$R/batch180.log

json_ok() { # file expected_sim_sec
  local f="$1" exp="$2"
  [ -f "$f" ] || return 1
  node -e '
    const fs=require("fs");
    try{
      const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const runs=j.runs||j.results||[];
      const r=Array.isArray(runs)?runs[0]:runs;
      const d=r&&r.duration_sim_sec||0;
      process.exit(d>=parseFloat(process.argv[2])*0.999?0:1);
    }catch(e){process.exit(1);}
  ' "$f" "$exp"
}

echo "RESUME_START $(date -Is)" >> "$LOG"
for seed in 12345 23456 34567 45678 56789; do
  OUT=$R/batch180_seed$seed.json
  if json_ok "$OUT" 10800; then
    echo "seed $seed SKIP_VALID $(date -Is)" >> "$LOG"
    continue
  fi
  rm -f "$OUT"
  echo "seed $seed START $(date -Is)" >> "$LOG"
  node sim-harness.js --duration=180 --seeds=1 --seed=$seed --dt=0.0166667 --interval=10 --no-migration --conserve=dual-ledger=on --quiet --out="$OUT" 2>>$R/batch180_seed$seed.err
  rc=$?
  echo "seed $seed END rc=$rc $(date -Is)" >> "$LOG"
  [ $rc -ne 0 ] && echo "seed $seed FAILED rc=$rc $(date -Is)" >> "$LOG"
done
echo "ALL_DONE $(date -Is)" >> "$LOG"

# Control OFF 90m (para div/coste pareado), tambien reanudable
if json_ok $R/control_off_90m.json 5400; then
  echo "CONTROL_OFF SKIP_VALID $(date -Is)" >> "$LOG"
else
  rm -f $R/control_off_90m.json
  echo "CONTROL_OFF START $(date -Is)" >> "$LOG"
  node sim-harness.js --duration=90 --seeds=1 --seed=12345 --dt=0.0166667 --interval=10 --no-migration --conserve=dual-ledger=off --quiet --out=$R/control_off_90m.json 2>>$R/control_off_90m.err
  echo "CONTROL_OFF END rc=$? $(date -Is)" >> "$LOG"
fi
echo "RESUME_END $(date -Is)" >> "$LOG"
