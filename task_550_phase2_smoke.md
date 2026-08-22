# task_550 phase2 — smoke emparejado (5m, migración off, dt=1/60)

git 15db457 (Fisher corregido vs hipergeométrica + ablación excluye pC de selección de objetivo)

## Resultados

| celda | n | pC final | pC p50 | consumers | predators | pC colapso | predator extinto |
|-------|---|----------|--------|-----------|-----------|------------|------------------|
| cc (consumer-pC ON / predator-pC ON) | 2 | 0 | 2.5 | 858 | 0.5 | 2/2 | 1/2 |
| oc (consumer-pC OFF) | 4 | 264.8 | 218.3 | 840 | 1.8 | 0/4 | 1/4 |
| oo (ambos OFF) | 4 | 279.8 | 228.0 | 846 | 1.0 | 0/4 | 3/4 |

## Lectura

- **Contraste limpio restaurado**: cc colapsa pC 2/2; con ablación corregida (oc y oo) pC se conserva 8/8 (pC final 255–280). La atracción espuria de la ablación anterior desapareció.
- **Extinciones de predator en oc/oo son del cuello separado** (78/80 en Richard), no atribuibles a la interacción con pC: ocurren con predator-pC tanto ON como OFF.
- pC p50 ~218–228 vs final ~265–280: sin tendencia a colapso en 5m.

## Pendiente

- Batch 20x30m secuencial celda oo en curso (`run-task550-phase2.sh`, ~2.3h). Criterio Jared: 84/84 tests, informe/artefactos publicados, mover DONE.

Artefactos: `factorial_2x2_smoke_fixed/` (runs + report.json).
