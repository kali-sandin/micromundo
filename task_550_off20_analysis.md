# task_550 — Baseline OFF 20×30m consolidado

Fecha: 2026-08-22 05:2x · análisis: `task_550_off20_analysis.json` (analyze_batch_fix.js sobre batch_30m_results_off, 20/20 runs terminados 2026-08-19)

## Resultado agregado (20 seeds, migración OFF, ablación off)

- **Extinciones: 40/40 runs pierden producerC y predator** (pC→0, pred→0 en todos los runs, entre 160-310s).
- Finales estables y muy reproducibles: pA 0.31±0.01 (CV 4.1%), pB 71.9±0.4 (CV 0.6%), consumers 1757±25 (CV 1.4%).
- Flujos 2ª mitad: graze 74.1, metab 629.4, repro 19.7, predation 0.
- Drift NET +27.0±2.4 E/s (causa conocida gain:bite 18x; pendiente decisión, ver task_908 docs).
- Perf: speed 0.75x±0.06 bajo carga del runner factorial (contención 1 core).
- Residual entity max 85.7% — elevado; señal a vigilar, no bloquea la comparación.

## Veredicto

Baseline OFF reproduce el patrón del smoke y de los 3 seeds previos en las 20 seeds:
sin pC ni predator no hay rescate que evite el colapso de esas guildas. CV < 5% entre
seeds ⇒ la señal para el contraste factorial (cc vs oc vs oo) es estable.

El batch factorial oo 30m sigue corriendo con throttling HW (ver task_550_phase2_blocker.md).
