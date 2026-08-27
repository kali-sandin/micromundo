# task_911 — Spike persecución intermitente (flag __SPIKE)

Baseline d39a020; flag reversible (OFF por defecto). 5 seeds OFF x8m (12345,20264,28183,36102,44021).

## Resultado: FALLO (hipótesis refutada)
- Supervivencia predator: 0/5 (todas extintas <8m).
- ingreso/metab: 0.020–0.036 (objetivo 0.8–1.2).
- contacto/prey-near: 0.003–0.208% (objetivo >=1%).
- Consumers: 84–86% del baseline (criterio >50% OK).
- Duty chase ~0.6; penalización velocidad presa -20% a -50%.
- Tests: 84/84 pass. wall/sim comparable a baseline.

## Conclusión
El burst-coast con fatiga no corrige el déficit: la brecha es de orden de magnitud
en conversión contacto->captura y en ingreso por captura vs metabolismo.
Viabilidad del predator requiere trabajo de diseño nuevo (Jared), no tuning del spike.
Rollback: flag OFF por defecto; sin cambios de reglas en path sin flag.
