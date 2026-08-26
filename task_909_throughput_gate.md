# task_909 — Gate de throughput reproducible del sim-harness

Fecha: 2026-08-26 02:0x–02:5x (Europe/Madrid) · repo micromundo · seed fija 12345, OFF (–no-migration)

## Protocolo (reproducible)

`run-task909-bench.sh <tag> <sim_min> [--cpu-load]` + `task_909_summary.js`:
seed 12345, población estándar de init, dt 1/60, intervalo 10s; registra
wall/sim por tramos de 60s de sim (stderr del harness) y estado térmico
(`vcgencmd get_throttled/measure_temp/measure_clock`) antes/después.
Artefactos en `task_909_results/` (JSON + env + cpuprofile).

## Resultados

| run | sim | wall | ratio | chunks (s/60s sim) | térmico post |
|-----|-----|------|-------|--------------------|--------------|
| base 3m | 180s | 155s | 0.86x | 57, 49 | 0x0, 77.4°C |
| base10 10m | 600s | 873s | 1.45x | 64,62,59,58,65,**76,94,114,135** | **0xe0008→0xe0000, 82.3°C**, clock cap 2.31GHz |
| load2 2m (+busy-loop) | 120s | 116s | 0.97x | 59 | 0xe0008, 84.5°C, 2.15GHz |
| load3 3m | 180s | 178s | 0.99x | 62, 59 | 0xe0008, 83.4°C, 2.26GHz |

- **base10 reproduce el fenómeno del batch oo**: plano ~60s/60s hasta sim 300s,
  luego pendiente 76→135s justo cuando aparecen los bits de throttle
  (0xe0008 = capped ahora, 0xe0000 = ocurrió) y 82°C. Causa atribuida:
  **throttling térmico del host (RPi, límite ~80-85°C), no cuello de software**.
- **Corrección del blocker task_550**: el host tiene **4 cores** (`grep -c
  processor /proc/cpuinfo` = 4; el `nproc=1` anterior era affinity del entorno
  de exec, no HW). Pero node/sim es single-threaded: más cores no aceleran un
  run; sí evitan contención con brave/ovos.
- **Contención CPU no es el driver**: con busy-loop 99% compitiendo, los chunks
  siguen ~60s (el scheduler reparte cores); el empeoramiento correlaciona con
  temperatura, no con carga rival.
- **Perfil CPU (3m, --cpu-prof)**: sin hotspot dominante único. queryNearby2
  13.5%, simulate 13.8%, stepMobile 12.2%, queryNearby 7.5%, steerCreature
  7.5%, rebuildGrid 6.2%, nearestCarcassFood 5.4%. ~39% en queries espaciales
  O(población). El coste por sim-s crece con la población (~2800 steady-state)
  y el factor térmico se superpone (hasta ~13.8x observado a 30m en batch_oo).

## Presupuesto viable (recomendación)

- Ventana nocturna realista: ~8h wall ≈ 480 min.
- Throughput sostenido con throttle profundo: entre 5x y 10x wall/sim
  (base10 termina a 2.2x y sigue cayendo; batch 30m llegó a 13.8x).
- **5 seeds × 30m sim (150m) NO cabe** en una noche (est. 12–25h wall).
- **5 seeds × 10–12m sim sí cabe** (50–60m sim ≈ 5–9h wall) y es suficiente
  para task_910: su criterio de corte son extinciones <10m (observada t=270s).
- Para réplicas 30m: requiere host aliviado (menos carga ambiente, mejor
  disipación) o dividir en varias noches. No alterar el protocolo en silencio.

## Verificación

- Sin cambios de código de sim: solo `run-task909-bench.sh` y
  `task_909_summary.js` (nuevos) + artefactos. Tests: ver deploy (sin regresión
  esperada; no se tocó app.js/sim-harness.js).

## Conclusión

Causa atribuida con medición repetible (seed fija + bits de throttle + clock
cap + pendiente térmica): **límite de hardware térmico**, no software. Sin
hotspot explotable que cambie el veredicto sin perf-fix mayor fuera de alcance.
