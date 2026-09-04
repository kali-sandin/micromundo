# task_919 Corte 2 - estado
- Batch 5x30m OFF lanzado 03:09 (bg, seeds 12345..44021, dt 1/60, sample 10s).
- Script corre analyze-task919.js automaticamente al terminar -> corte2_analysis.txt.
- Al terminar: evaluar gates (residual<=2%, stock>0, intake/metab .8-1.2 >=4/5,
  CV<=25%, pend<=5%/10m, diversidad>=80%, coste<=5%), deploy artefactos, DONE si ok.
- Corte 1 publicado: commit 96d1893 (paridad .135%, nsCum 0, suite 90/90).
- ETA fin batch ~06:15 CEST.
- 03:45 monitor: seed 12345 t=1380/1800 (wall 2138s, ~1.55x), pop estable 1739 tras pico 2300; proceso sano (98% cpu). JSON por seed se escribe al final de cada run.
