#!/bin/bash
# run_batch_robust.sh — Batch multi-semilla robusto para sim-harness.js
# Guarda cada semilla en fichero individual para resistir cortes.
# Uso: ./run_batch_robust.sh <duration_min> <num_seeds> <base_seed>
set -euo pipefail

DURATION="${1:-30}"
NSEEDS="${2:-20}"
BASE="${3:-12345}"
OUTDIR="batch_${DURATION}m_results"
mkdir -p "$OUTDIR"

echo "=== Batch ${NSEEDS}x${DURATION}m started $(date -Iseconds) ===" | tee "$OUTDIR/batch.log"

COMPLETED=0
FAILED=0

for i in $(seq 0 $((NSEEDS - 1))); do
  SEED=$((BASE + i * 7919))
  IDX=$((i + 1))
  OUTFILE="$OUTDIR/seed_${SEED}.json"

  # Skip if already done
  if [ -f "$OUTFILE" ] && [ -s "$OUTFILE" ]; then
    echo "[$IDX/$NSEEDS] seed=$SEED already done, skipping" | tee -a "$OUTDIR/batch.log"
    COMPLETED=$((COMPLETED + 1))
    continue
  fi

  echo "[$IDX/$NSEEDS] seed=$SEED start=$(date -Iseconds)" | tee -a "$OUTDIR/batch.log"

  if node sim-harness.js --duration="$DURATION" --seeds=1 --seed="$SEED" --interval=10 --out="$OUTFILE" --quiet 2>>"$OUTDIR/batch.log"; then
    COMPLETED=$((COMPLETED + 1))
    echo "[$IDX/$NSEEDS] seed=$SEED OK" | tee -a "$OUTDIR/batch.log"
  else
    FAILED=$((FAILED + 1))
    echo "[$IDX/$NSEEDS] seed=$SEED FAILED" | tee -a "$OUTDIR/batch.log"
    rm -f "$OUTFILE"  # Clean partial output
  fi
done

echo "=== Batch finished $(date -Iseconds): $COMPLETED OK, $FAILED FAILED ===" | tee -a "$OUTDIR/batch.log"
