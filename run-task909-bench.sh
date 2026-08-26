#!/usr/bin/env bash
# task_909 — Gate de throughput reproducible del sim-harness
# Benchmark fijo: seed 12345, poblacion estandar del harness (init del repo),
# duracion sim fija, muestreo wall/sim por tramo de 60s de sim + estado termico.
# Uso: ./run-task909-bench.sh <etiqueta> [minutos_sim=3] [--cpu-load]
set -euo pipefail
TAG="${1:?etiqueta requerida}"
SIMMIN="${2:-3}"
LOAD=0; [[ "${3:-}" == "--cpu-load" ]] && LOAD=1
OUT="task_909_results"
mkdir -p "$OUT"

thrott () { vcgencmd get_throttled 2>/dev/null || echo "vcgencmd=NA"; }
temp () { vcgencmd measure_temp 2>/dev/null || true; }
clock () { vcgencmd measure_clock arm 2>/dev/null || true; }

LOADPID=""
if [[ $LOAD -eq 1 ]]; then
  # un core saturado artificial (mismo core unico) para contraste con carga
  /tmp/loadgen.sh & LOADPID=$!
  sleep 2
fi
trap '[[ -n "$LOADPID" ]] && kill $LOADPID 2>/dev/null || true' EXIT

{
  echo "tag=$TAG sim_min=$SIMMIN cpu_load=$LOAD date=$(date -Is)"
  echo "pre: $(thrott) $(temp) $(clock)"
} | tee "$OUT/bench_${TAG}_env.txt"

node sim-harness.js --seed=12345 --seeds=1 --duration="$SIMMIN" \
  --interval=10 --no-migration --out="$OUT/bench_${TAG}.json" --quiet \
  2> "$OUT/bench_${TAG}.time.txt"

{
  echo "post: $(thrott) $(temp) $(clock)"
} | tee -a "$OUT/bench_${TAG}_env.txt"

[[ -n "$LOADPID" ]] && kill $LOADPID 2>/dev/null || true
echo "OK $TAG"
