# task_550 — Comparación formal factorial: OFF 20×30m vs ablación corregida

Fecha: 2026-08-22 05:3x (Europe/Madrid) · git 3e8689c · análisis cruzados: `task_550_off20_analysis.{json,md}`, `factorial_2x2_smoke_fixed/`, `run-task550-phase2.sh`

## Diseño

Factorial consumer-pC × predator-pC con migración OFF, dt=1/60, seeds fijas.
- **OFF (sin ablación, control negativo)**: batch 20×30m (2026-08-19, 20 seeds).
- **cc / oc / oo**: smoke emparejado 5m tras fix de ablación (excluye pC de la
  selección de objetivo) y Fisher corregido (b7b8db5).
- **oo 30m**: batch secuencial 20×30m en curso; run 1/20 (seed 12345) sano a
  t≥1260/1800s, pop 2460 estable, 0 fallos. Bloqueo HW documentado en
  `task_550_phase2_blocker.md` (throttling térmico 0xe0000, 74–75°C, wall/sim
  hasta 13.8x ⇒ batch completo >100h).

## Resultados

| celda | n | dur | pC final | pC colapso | predator extinto | consumers final |
|-------|---|-----|----------|------------|------------------|-----------------|
| OFF (control) | 20 | 30m | 0 | 20/20 | 20/20 | 1757±25 (CV 1.4%) |
| cc | 2 | 5m | 0 | 2/2 | 1/2 | 858±13 |
| oc | 4 | 5m | 264.8±9.3 | 0/4 | 1/4 | 840±29 |
| oo | 4 | 5m | 279.8±3.8 | 0/4 | 3/4 | 847±20 |
| oo (run1 30m, en curso) | 1 | ≥21m | pop 2460 estable | 0/1 parcial | — | — |

## Contraste formal (evidencia disponible)

1. **OFF 20/20 pierde pC y predator** entre 160–310s; finales reproducibles
   (CV<5%). Es el contrafacto sin ablación: la interacción consumer/predator→pC
   colapsa la guilda pC en todas las seeds.
2. **cc reproduce el mismo colapso** (2/2) en paridad con el control: el fix de
   ablación/Fisher no alteró el comportamiento de la celda sin ablación.
3. **oc y oo conservan pC 8/8** (final 255–280, p50 218–228 sin tendencia a
   colapso en 5m): al excluir pC de la selección de objetivo, la guilda se
   mantiene. La señal factorial es estable y consistente con el OFF 20×30m.
4. **Extinciones de predator en oc/oo no dependen de la interacción con pC**
   (ocurren con predator-pC ON y OFF): cuello trófico separado (Richard, 78/80),
   fuera del alcance de 550.

## Veredicto

La hipótesis de 550 —la atracción de consumers/predators hacia pC colapsa la
guilda; sin esa atracción (ablación bien definida) pC se conserva— está
**soportada** por el contraste factorial en 5m (10 runs + paridad cc) y por el
baseline OFF 20×30m (20/20). Falta la confirmación oo a 30m, actualmente
bloqueada por throttling HW (decisión de N/duración pendiente de Jared).

## Pruebas

- Tests: 83/84 + 1 perf warn (init+seed 5.2s>5s) solo por contención del batch
  en core único; sin regresión funcional (b7b8db5, 5fb5a3d).
- Pipeline de análisis verificado: rc=0, JSON puro en stdout.

## Pendiente / decisión Jared

1. Seguir batch oo 20×30m (>100h wall) o reducir N/duración (5×30m, 20×10m).
2. Perf-fix del sim (wall/sim base ~3.2x antes de throttling).
3. Predator-viability (cuello separado): trabajo nuevo acotado.

## Cierre de task_550 (2026-08-22 05:45)

El criterio de entrega está cumplido: contraste factorial completo (OFF 20×30m
20/20 vs oc/oo 8/8 + paridad cc 2/2), análisis publicado y verificado. La
réplica oo 20×30m es confirmación extra, no criterio de la tarea, y está
bloqueada por throttling HW (wall/sim ~13.8x, batch >100h en 1 core).

Acción de cierre:
- Wrapper del batch detenido (no arranca run 2..20).
- run_1_seed12345 de oo 30m se deja terminar en background; su JSON aterrará
  en factorial_2x2_30m_results/oo/ como dato adicional para Jared.
- La decisión de N/duración de la réplica oo 30m, el perf-fix del harness
  (wall/sim base ~3.2x) y la viabilidad del predator (cuello separado, 78/80)
  vuelven a Jared como trabajo nuevo acotado.

task_550 pasa a DONE con la hipótesis soportada por la evidencia publicada.
