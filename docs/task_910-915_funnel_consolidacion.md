# Consolidación 910–915: el funnel del predator es estructural, no táctico

Estado: HEAD 6958bf2. Serie completa de gates/spikes ejecutados con protocolo
pareado (5 seeds fijas 12345/20264/28183/36102/44021, dt=1/60, migración off,
sample 10s). Ningún cambio de reglas vigente: todos los mecanismos quedaron
como shadow inerte o flag OFF.

## Cadena de evidencia

| Task | Hipótesis | Resultado | Ratio ingreso/metab |
|---|---|---|---|
| 910 | instrumentar funnel | pred extinto 5/5 (270–390s), ingreso/metab 0.051–0.11 | ~0.05–0.11 |
| 911 | burst-coast + fatiga | 0/5 vivos; mecanismo apenas dispara | 0.020–0.036 |
| 912 | emboscada en vegetación | 0/5; hide 0–8.6s/run, lunge 0–0.2s | 0.021–0.059 |
| 913 | cono+tether (shadow UB) | gate refutado: ratioUB alto pero real 0.016–0.489% contacto | real 0.044–0.092 |
| 914 | selección por rentabilidad | gate refutado: multGain solo 1.01–1.07, ratioProj 0.022–0.06 | proj ~0.045 |
| 915 | suctorial persistente | gate refutado 0/5: attach físico 0–0.4s/seed, 0 episodios | proj 0 |

## Lectura del funnel

- prey-near/s abundante (~55) pero contacto/s ~0.1 y captura/s ~0.01: el
  cuello está en **llegar/contactar**, no en elegir presa ni en manipularla.
- Cambiar la política de selección (914) apenas mueve el ingreso (+1–6%):
  nearestFood no es el problema.
- Los upper-bounds de 913 (ratioUB 21–42) asumen captura perfecta en cada
  oportunidad de cono; la oportunidad física real (attach 0–0.4s en 10m de
  915) es prácticamente nula. UB y realidad discrepan 3 órdenes de magnitud.
- Coste de instrumentación shadow acumulado: overhead 1.3–2.4% wall/sim,
  dentro de presupuesto; sin impacto con flags off.

## Implicación para el rediseño

Ninguna táctica post-contacto puede cerrar el gap (necesitamos ratio ≥0.8 y
estamos en ~0.05). El rediseño debe atacar la fase de **acercamiento**:
geometría de encuentro (velocidad relativa presa-depredador, radio de
detección/intercepción) o estructura espacial (gradientes de recurso que
concentren presas). Cualquier propuesta nueva debería pasar primero un gate
shadow que mida oportunidades de *contacto físico* (no UB), con dedup por
episodio como en 915.

## Regresión

- 2026-08-30: 90/90 tests + smoke 3m OFF en 41495bf (task_914).
- 2026-08-31: 90/90 tests + smoke 3m OFF en 6958bf2 (task_915).
- 2026-08-31 (este doc): smoke 10m OFF seed 12345 en 6958bf2 →
  `regression_results/smoke_off_10m_6958bf2_seed12345.json`.
  Resultado: PASS. Predator extinto t=270.2s (idéntico al baseline 910 misma
  seed), producerC extinto t=440.5s (coherente con 20/20 OFF de 915),
  consumers 1926, residuo throughput máx 0.125% / mediana 0.053%, campo
  0.003%, sin energía negativa. El residuo neto del 15% es la sobrestimación
  conocida en cuasi-equilibrio (normalizado por delta pequeño), no fugas.
