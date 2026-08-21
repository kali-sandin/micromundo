# task_550: paridad harness con hooks de ablación vs baseline task_908 (OFF)

Fecha: 2026-08-21 03:30 (Europe/Madrid)

Propósito: verificar que los hooks de ablación consumer-pC/predator-pC añadidos en 89aec34,
ejecutados **sin flags** (celda control `cc`), no alteran la simulación respecto al baseline
consolidado de task_908 (migración OFF).

Método: comparación bit a bit de `factorial_2x2_results/cc/run_1_seed12345.json` (600s sim,
commit 2baea29) contra `batch_30m_results_off/run_1_seed12345.json` (1800s sim) en la ventana
solapada t=0..591 (60 muestras @ interval 10s).

Resultado: **0 diferencias** en populations, energy, flows y rates en las 60 muestras comunes.
Wall-time por sim-s equivalente (2.49s vs 2.32s; diferencia ~7% explicable por carga del host,
la Pi corre 4 sims en paralelo).

Conclusión: los hooks son inertes sin flags; el control `cc` del factorial es reproducible
desde el baseline. La señal causal temprana (colapso pC solo con consumer-pC activo) es
comparable con el baseline previo. Falta confirmar con 20 seeds.

Estado batch a las 03:15: cc=2, co=2, oc=1, oo=1 de 20 por celda. ETA ~09:30.
