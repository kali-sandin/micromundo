# Baseline OFF 5x60m — task_920 / comparador task_921

- Commit: 787c115 (flag 920 OFF, sin conducta nueva)
- Config: 5 seeds 12345/20264/28183/36102/44021, dt=1/60, migración OFF, sample 10s
- Fin: 2026-09-06T12:46:50+02:00 (5/5 completos, 3600s sim)

## Resultados
- Veredicto por estabilidad: 5/5 FAIL — en las 5 seeds se extinguen predator y ProducerC (2 extinciones/seed); sobreviven producerA + consumer.
- Consumers finales: media 1597, CV 2.7% (estable entre seeds).
- Ledger 2ª mitad (media): grazing 78.7 E/s IN vs metabolism 672.4 + reproduction 51.4 + excretion 1.1 E/s OUT → NET ≈ -646 E/s (deficit estructural del pool móvil sin transferencia conservativa).
- Wall/sim ~1.4-1.8 bajo carga; coste OK.

## Lectura
OFF pierde predator+ProducerC de forma determinista y consistente (0 diversidad genética en guilds extintos). Es exactamente el hueco que la transferencia trofica conservativa de 920/921 pretende cerrar: la línea base queda publicada aquí como comparador para el pareado ON 5x60m de task_921.

- run_*.json: series por seed (población, energía, ledger, genes).
- batch.log / nohup.log: progreso del batch. run.sh: comando reproducible.
