# Regresión OFF post-task_917 — consolidado (2-sep-2026)

Modo `--migration=off`, dt=1/60, sample 30s, HEAD sucesivos tras `ba4587f`.
Objetivo: verificar que los checkpoints de 917 no introdujeron regresiones nuevas
más allá del patrón estructural OFF ya conocido (pérdida de predator y pC).

## Ejecuciones 10m (1 seed por checkpoint)

| seed  | commit  | pA dens | pB | pC | consumers | predator | extinciones |
|-------|---------|---------|----|----|-----------|----------|-------------|
| 12345 | bf531e9 | 0.452   | 72 | 0  | 1926      | extinto  | 2 (pC+pred) |
| 777   | 3c87454 | 0.436   | 72 | 0  | 2013      | ext t≈360| 2 (pC t≈390, pred t≈360) |
| 51940 | 52f667c | 0.456   | 72 | 0  | 1941      | extinto  | 2 |
| 61111 | 269617d | 0.450   | 72 | 0  | 1987      | extinto  | 2 |
| 42424 | 52fc6ef | 0.479   | 72 | 0  | 1880      | extinto  | 2 |
| 88888 | ce41d16 | 0.448   | 72 | 0  | 1952      | ext t≈230 | 2 (pC t≈270, pred t≈230) |

Previa 3m OFF seed12345 en `ba4587f` (head_ba4587f_3m_off.json): consumers 707,
pB 72, pC 12, predator 24 (declive predator OFF conocido, coherente).

## Batch 10m OFF 3 seeds en 13cecd3 (seed54321)

pB 72, pC 3.7±0.5, consumers 1808±77, predator extinto; 0 extinciones formales
registradas en contador (carreras cortas con declive parcial). Mismo patrón.

## Conclusión

- Patrón estructural OFF reproducible en 7 commits y ≥7 seeds: predator y pC
  tienden a extinguirse sin migración; consumers 1851-2013 en régimen; pB
  clavado en 72; pA density 0.44-0.48.
- Ninguna regresión nueva atribuible a los checkpoints de task_917 (ledger
  shadow, flags OFF). Suite OK en cada checkpoint.
- Coherente con línea base histórica 20x30m OFF (20/20 pierden predator+pC).

## Artefactos

- `reg10m_off_head_bf531e9_seed12345.json`
- `head_3c87454_10m_off_seed777.{json,log}`
- `reg10m_off_head_52f667c_seed51940.{json,log}`
- `reg10m_off_head_269617d_seed61111.{json,log}`
- `reg10m_off_head_52fc6ef_seed42424.{json,log}`
- `reg10m_off_head_ce41d16_seed88888.{json,log}` (suite 90/90 OK en el mismo commit)
- `reg10m_off_head_13cecd3_seed54321.json`
- `head_ba4587f_3m_off.json`
- `reg10m_off_head_8f62a2c_seed55005.{json,log}` (suite 90/90 OK en el mismo commit; predator ext t=340, pC ext t=420, pB 72, consumers 1851)
