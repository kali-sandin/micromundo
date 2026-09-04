# task_919 Corte 2 - estado
- Batch 5x30m OFF lanzado 03:09 (bg, seeds 12345..44021, dt 1/60, sample 10s).
- Script corre analyze-task919.js automaticamente al terminar -> corte2_analysis.txt.
- Al terminar: evaluar gates (residual<=2%, stock>0, intake/metab .8-1.2 >=4/5,
  CV<=25%, pend<=5%/10m, diversidad>=80%, coste<=5%), deploy artefactos, DONE si ok.
- Corte 1 publicado: commit 96d1893 (paridad .135%, nsCum 0, suite 90/90).
- ETA fin batch ~06:15 CEST.
- 03:45 monitor: seed 12345 t=1380/1800 (wall 2138s, ~1.55x), pop estable 1739 tras pico 2300; proceso sano (98% cpu). JSON por seed se escribe al final de cada run.
- 04:30 monitor: relanzado detached (setsid 04:15). seed 12345 t=660/1800, pop 2179 subiendo (transitorio), wall ~1.16x, proceso sano. Batch reanudable (skip JSONs hechos) + analyze auto. ETA fin ~08:30-09:00 CEST.
- 04:45 monitor: seed 12345 t=1140/1800 (wall 1762s), pop 1739 estable tras pico 2300; proceso sano.
- 05:15 monitor: seed 12345 terminado (JSON publicado, extinciones pred t=270 y pC t=440). seed 20264 en curso t=660/1800, proceso sano. Batch va por 2/5.
- Preliminar seed1: FALLA. system_net -615.8 E/s final, residual_max 13.4%, extinciones 2. Patron consistente con 918 pre-correccion: predator y pC colapsan tambien con ledger corregido (*dt aplicado, Corte1 96d1893).
- 05:30 monitor: seed 20264 t=1140/1800 (3/5 pendientes). Causal seed1 (ventana t>=600): fotosintesis 86 E/s vs metabolismo 685 E/s; tAmp 567 E/s subsidia el pool consumer. Refutacion estructural: input solar ~7x menor que demanda metabolica; predator muere con predIncome ~0. Ledger corregido no cambia el patron 918.
