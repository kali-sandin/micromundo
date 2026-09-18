# task_927 — gate de rendimiento reproducible

El gate compara el loop nativo con `experimentRunArmSync` desde el mismo snapshot y seed.

Protocolo:

- warmup determinista de 120 s simulados y calentamiento JIT de ambos caminos;
- cinco bloques balanceados ABBA/BAAB, dos ejecuciones por camino y bloque;
- `process.cpuUsage()` como reloj primario para excluir esperas por contencion externa;
- ratio por bloque, p50/p95 descriptivos y ratio agregado como decision;
- PASS si el overhead agregado es `<= 5%`.

Ejecucion:

```bash
node task_923_results/ab_bench.js
```

La salida versionada queda en `task_927_results/perf_gate.json`. Se pueden ampliar duracion y bloques con
`TASK_927_DURATION_S` y `TASK_927_BLOCKS`; reducirlos invalida la evidencia de cierre.

## Resultado 2026-09-18

- ratio CPU agregado: `1.0058` (`+0.58%`);
- ratio por bloque p50: `1.0085`;
- ratio por bloque p95: `1.0312`;
- umbral: overhead agregado `<=5%`;
- resultado: **PASS**.

Las cuatro medidas previas (`-5.3%`, `+3.5%`, `+6.1%`, `+7.5%`) usaban reloj mural,
dos grupos no alternados y el minimo de cada grupo. Median desprogramacion, deriva y GC como si fueran
coste del brazo. El gate nuevo elimina esas tres fuentes de sesgo sin relajar el umbral.
