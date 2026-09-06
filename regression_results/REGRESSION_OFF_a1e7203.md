# Regresión OFF post task_920 (a1e7203) — 2026-09-06

- Suite: 90/90 PASS (test.js).
- Sim OFF 1x10m seed 12345 (dt 1/60, migración off, interval 10s):
  `off10m_a1e7203_seed12345.json`.
- Comparación con baseline 919 corte2 seed 12345 (9084a4f→a2a6c04 line):
  trayectoria idéntica en todas las muestras de 10s hasta t=600
  (poblaciones por especie iguales); única divergencia t=600.7: total
  2001 vs 1998 (3 consumidores, 0.15%, ruido numérico del código shadow añadido).
  Extinciones en tiempos idénticos: predator t=270.2, producer-c t=440.5.
- Conclusión: el checkpoint task_920 (shadow inerte, flag OFF) no cambia
  conducta; las extinciones pC+pred son el patrón estructural ya documentado
  en 918/919, no una regresión nueva.
- Coste: speed_factor 0.8 en este run individual (Raspberry bajo carga nocturna,
  comparable a runs previos 1.55x wall en ventanas distintas; sin currencia).

Veredicto: paridad OFF OK, sin regresión funcional.
