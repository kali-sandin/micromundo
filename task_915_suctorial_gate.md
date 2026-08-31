# task_915 — Gate shadow: viabilidad de alimentación suctorial persistente

**Resultado: Gate 1 REFUTADO 0/5. Hipótesis suctorial cerrada sin implementar.**

- Commit de implementación shadow-only: `d5c6d56` (inerte sin flag, 90/90 tests).
- Protocolo: 5 seeds (12345, 20264, 28183, 36102, 44021) x 10m, dt=1/60,
  migración off, `--shadow=pred-suctorial=on`, muestreo 10s.
- Corrección de solapes de task_913: adquisición = episodio continuo de contacto
  físico (eatRange) con la misma presa, contado 1 vez; transferencia solo si el
  episodio se sostiene >= 1.8s o alcanza cap 30s, techo 1.3x energía de la presa.
  Proyección ratio(eta) = eta * transferPerPred / metabPerPred, eta .3/.5/.7.

## Gate 1 (datos en `gate1_analysis.txt`, runs `run_sh_*.json`)

| seed | pred avg | acq | held | attach | transfer E | metab E/s/pred | real | ratioProj .7 |
|------|----------|-----|------|--------|------------|----------------|------|--------------|
| 12345 | 10.4 | 0 | 0 | 0.4s | 0 | 0.0643 | 0.0027 | 0 |
| 20264 | 10.5 | 0 | 0 | 0.2s | 0 | 0.0630 | 0.0030 | 0 |
| 28183 | 12.0 | 0 | 0 | 0.0s | 0 | 0.0625 | 0.0033 | 0 |
| 36102 | 9.7  | 0 | 0 | 0.1s | 0 | 0.0627 | 0.0037 | 0 |
| 44021 | 10.1 | 0 | 0 | 0.3s | 0 | 0.0658 | 0.0014 | 0 |

- Coste shadow: overhead wallSim **1.29%** vs shadow913 (<=5% ok, irrelevante).
- Predador extinto en 5/5 (t=270-310s), igual que baseline: shadow no altera conducta.
- Gate exige 5/5 ratioProj(.7) >= 0.8 → **0/5, media 0.000**.

## Lectura causal

La deduplicación corrige el UB inflado de task_913 (21-42x), pero el resultado
es más severo: con `shSucNear` (presas gape-compatibles cerca) >4600/sample en
seed 12345, el contacto físico sostenido es **inexistente** (attach total
0.0-0.4s por seed, 0 episodios). El cuello no es duración de manejo ni
solapamiento de conteo: el predador casi nunca entra en eatRange y cuando lo
roza el contacto dura <<1.8s. Cualquier esquema de alimentación persistente
anclado al contacto actual proyecta transferencia cero a cualquier eta.

## Conclusión para Jared/Richard

910-915 convergen: funnel falla en **llegar/contactar**, no en selección
(914), morfología de captura (913) ni manejo persistente (915). La vía
suctorial queda descartada sin implementación. El siguiente rediseño debe
atacar el acercamiento (velocidad relativa/emboscada real con ocultación
efectiva), no la fase post-contacto.

## Evidencia

- Implementación shadow-only inert-by-default: `app.js` + `sim-harness.js` (task_915).
- Tests: 90/90 pass.
- Artefactos: `task_915_results/` (5 runs, batch.log, gate1_analysis.txt, smoke).
