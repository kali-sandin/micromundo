# task_921 — Análisis causal de la refutación cp2 (ON 5x60m)

Turno de consolidación (sin cambios de runtime). Objetivo: dejar explícita la causa
del fallo de los gates de energía (criterios 3, 5 y 7) para la decisión de Jared.

## Datos (seed12345, ventana t≈3193–3323s, muestra 10s, dt 1/60, migr OFF)

| flujo | E/s (típico) |
|---|---|
| photosynth (input verdadero) | 93–97 |
| trophicAmplification (path legacy x18) | 627–657 |
| conservIn (ingesta bruta A→consumer) | 1377–1456 |
| conservAssim (eta=.5) | 684–723 |
| conservDetritus (1−eta) | 692–733 |
| metabolism (consumer) | 634–649 |
| reproduction | 12–78 |
| destruction | 672–719 |
| system_net | **−578 a −626** |

Patrón idéntico en las 5 seeds (deriva E 86–98%, pend 7.8–13.4%/10m).

## Causa raíz

1. **El input solar verdadero (~93 E/s) es ~7x menor que el mantenimiento
   consumer (~700 E/s).** El sistema OFF solo se sostenía porque el path legacy
   x18 (trophicAmplification ~635 E/s) *creaba* energía neta. El gate de 10m
   pasaba porque el stock transitorio del campo A (~7.4k E) amortigua ~60m al
   ritmo de −600 E/s; a 60m el déficit ya es inequívoco.
2. **eta=.5 manda a detrito ~712 E/s sin ruta de reciclaje en el horizonte**:
   conservDetritus es sumidero muerto (no retorna al campo A), así que la
   asimilación (700) apenas cubre metabolismo+repro (~710) y cualquier pérdida
   marginal se acumula como deriva.
3. La escala de ingesta (~1400 E/s) es ~15x el input solar: con o sin
   conservación, el presupuesto actual de consumer es insostenible sin la
   creación legacy. La conversión 18 E/mass no cambia esto; solo fija cuánto
   stock del campo se consume por segundo.

## Conclusión para Jared

La vía "transferencia conservativa A→consumer" refuta **por dimensionamiento del
input**, no por la mecánica de transferencia: la asimilación llega a cubrir el
mantenimiento (ratio ~1.0) pero el sistema entero depende de un stock finito
recargado solo a ~93 E/s. Opciones que el gate no puede decidir solo:
(a) reciclar detrito hacia el campo A (cerrar el ciclo), (b) elevar input
solar/fotosíntesis, o (c) reducir demanda (metabolismo/población) — cada una es
mecánica nueva y requiere tarea propia con hipótesis y gates.

Artefactos: `task_921_results/paired_on_60m/` (5 seeds + analizador). Commit de
cierre: c036762. Flag `--conserve=trophic-a` sigue OFF por defecto.
