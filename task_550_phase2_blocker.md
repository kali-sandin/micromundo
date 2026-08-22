# task_550 phase2 — bloqueo de entorno del batch 20x30m oo

Fecha: 2026-08-22 05:0x (Europe/Madrid) · git 15db457 (último deploy b7b8db5 + 56de38e)

## Síntoma

Batch secuencial 20×30m celda oo (run-task550-phase2.sh). Run 1/20 (seed 12345)
sano en sim (pop 2830 estable, 0 fallos, t=1140/1800s), pero wall por cada 60s de
sim degrada progresivamente: 192s → 830s (13.8x). ETA estimada del batch: >100h.

## Descarte de leak de software

- `sim.carcasses`: cap 400 + swap-and-pop (app.js:1156, 1055-1057). Acotado.
- `sim.graph`, `sim.geneHistory`: RingBuffers acotados (HISTORY_MAX_POINTS).
- Harness: samples/metrics crecen 1 por intervalo de 10s (180 por run de 30m). Trivial.
- `rebuildGrid` con dirty-cell tracking correcto; `compactIfNeeded` activo.
- RSS del proceso: 198MB, sin crecimiento explosivo.

## Causa raíz confirmada (hardware)

```
vcgencmd get_throttled  -> 0xe0000   (freq cap + throttled + soft temp limit ACTIVOS)
vcgencmd measure_temp   -> 74.1'C
vcgencmd measure_clock  -> 2400MHz nominal, pero caps activos
nproc = 1 ; load avg ~2
```

La RPi monocore se auto-limita por temperatura bajo carga sostenida del 98% de CPU.
No es un bug del sim ni del harness: es throttling térmico del host.

## Estado de evidencia ya válida (smoke_fixed, 5m)

| celda | n | pC colapso | pC final |
|-------|---|-----------|----------|
| cc | 2 | 2/2 | 0 |
| oc | 4 | 0/4 | 264.8 |
| oo | 4 | 0/4 | 279.8 |

Contraste limpio: ablación corregida restaura conservación de pC en 8/8 runs.

## Decisión pendiente de Jared (no la tomo sola)

1. **Seguir** el batch tal cual: >100h wall, ocupando el único core.
2. **Reducir N o duración** (p.ej. 5×30m o 20×10m): protocolo modificado, suya la firma.
3. **Perf-fix del sim**: no abordado; el wall/sim base ya era ~3.2x antes del throttling.
4. **Cerrar 550 con evidencia actual** (smoke 10 runs + run1 30m cuando aterrice).

Mientras decide, run 1 sigue corriendo (63% de sim-t); los 19 restantes no arrancan
hasta decisión. Tests: 83/84 + 1 perf warn solo por contención del batch en core único.
