#!/bin/bash
# task_550 fase 2: validacion tras fix ablacion (atraccion a pC) y Fisher.
# 1) smoke emparejado 4 seeds: oc/oo con ablacion corregida + 2 seeds cc paridad
# 2) batch 20x30m secuencial celda oo (contrafacto limpio: sin interaccion consumer/predator-pC)
# 1 CPU: todo secuencial en un unico proceso en background.
set -u
cd "$(dirname "$0")"
LOG=task_550_phase2.log
echo "=== phase2 start $(date -Iseconds) git=$(git rev-parse --short HEAD) ===" >>"$LOG"

run() { # cell seed dur out flags...
  local cell="$1" seed="$2" dur="$3" out="$4"; shift 4
  if [ -f "$out" ]; then echo "[$cell $seed] skip" >>"$LOG"; return 0; fi
  echo "[$cell seed=$seed dur=${dur}m] start=$(date -Iseconds)" >>"$LOG"
  if node sim-harness.js --duration=$dur --seeds=1 --seed=$seed \
      --dt=0.016666666666666666 --interval=10 --migration=off \
      "$@" --out="$out" --quiet >>"$LOG" 2>&1; then
    echo "[$cell seed=$seed] done=$(date -Iseconds)" >>"$LOG"
  else
    echo "[$cell seed=$seed] FAILED rc=$? at=$(date -Iseconds)" >>"$LOG"
  fi
}

# --- 1) smoke emparejado 5m ---
SMOKE=factorial_2x2_smoke_fixed
mkdir -p "$SMOKE"/{cc,oc,oo}
S1=(12345 20264 28183 36102)
for i in 0 1 2 3; do
  s=${S1[$i]}
  if [ $i -lt 2 ]; then run cc "$s" 5 "$SMOKE/cc/run_$((i+1))_seed$s.json"; fi
  run oc "$s" 5 "$SMOKE/oc/run_$((i+1))_seed$s.json" --ablate=consumer-pc=off
  run oo "$s" 5 "$SMOKE/oo/run_$((i+1))_seed$s.json" --ablate=consumer-pc=off,predator-pc=off
done
echo "=== smoke done $(date -Iseconds) ===" >>"$LOG"

# --- 2) batch 20x30m secuencial celda oo (fix aplicado) ---
SEEDS=(12345 20264 28183 36102 44021 51940 59859 67778 75697 83616 91535 99454 107373 115292 123211 131130 139049 146968 154887 162806)
OUT30=factorial_2x2_30m_results/oo
mkdir -p "$OUT30"
for i in "${!SEEDS[@]}"; do
  s=${SEEDS[$i]}
  run oo "$s" 30 "$OUT30/run_$((i+1))_seed$s.json" --ablate=consumer-pc=off,predator-pc=off
done
echo "=== 30m oo batch done $(date -Iseconds) ===" >>"$LOG"
echo "=== phase2 finished $(date -Iseconds) ===" >>"$LOG"
