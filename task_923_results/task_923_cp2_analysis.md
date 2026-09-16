# task_923 CP2 — e2e headless del laboratorio causal (cerrado)

Fecha: 2026-09-16 07:26 CEST · seed 20260916 · dt 1/60 · brazos 300s c/u tras warmup 600s.

## Protocolo
warmup 600s → snapshot PRNG exacto → control (x1.0) 300s → tratamiento (x1.25 luz) 300s →
paridad (re-run control) → report JSON versionado (micromundo.experiment/1) → coste A/B.

## Resultados (e2e_report.json / e2e_meta.json)
- Paridad bit-exacta: samples re-run control === control (JSON stringify). PASS
- Report versionado schema micromundo.experiment/1, version 1, same_seed true, prng_state registrado. PASS
- samples_len 6 (inicio + 5 hitos). PASS
- Efecto del tratamiento (final 300s, unidades en report): consumers 2315 vs 2130 (+8.7%),
  biomasa campo A 0.2522 vs 0.1876 densidad (+34%), E móvil 91.96k vs 58.94k, births 1760 vs 1638,
  deaths 406 vs 470, predators 11 vs 10. Predicción (+25% luz → más biomasa A y consumers) confirmada.
- total_wall_ms 4.207s·10³ (≈70 min, poblaciones ~2k consumers).

## Coste ≤5%: overhead del brazo
e2e secuencial midió arm/native = 1.083 (>5%). A/B interleaved sobre el MISMO snapshot
(ab_bench.txt, 3 rondas x60s alternadas): ratios 0.991 / 1.012 / 0.988 → overhead ≈ 0%.
El 8.3% secuencial es ruido/GC del orden de ejecución (native medido al final, memoria ya
compactada), no coste del mecanismo. Criterio coste ≤5%: PASS con medición controlada.

## Checks finales
parity_bit_exact ✓ · samples_len ✓ · same_seed_design ✓ · report_schema ✓ · report_version ✓ ·
same_seed ✓ · prng_state ✓ · overhead ≤5% ✓ (A/B interleaved). Suite node test.js: 98/98 PASS.

## Notas
- Sin cambios de ecuaciones: solo observación/export (implementación CP1, ca607e7).
- Restante fuera de alcance de este corte: validación con 4/5 usuarios reales del ciclo UI
  (requiere sesión humana); la cobertura headless del flujo Mundo>Experimento>Datos está aquí.
