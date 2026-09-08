# task_921 — Sensibilidad del reciclaje de detrito (opción A)

Continuación de task_921_options_analysis.md. Misma base: flujos medios en
ventana estable t>1800s de los 5 runs ON 60m (dt 1/60, migr OFF, eta .5, 18 E/mass).
Primer orden: el reciclaje de fracción f del detrito devuelve f·detritus al campo A;
respuestas poblacionales de segundo orden no incluidas.

Definición: f* = -system_net / conservDetritus (fracción que anula el déficit).
Identidad de cierre: con f = f*, la pérdida residual (1-f)·detritus ≈ input solar,
es decir, metabolismo se paga con sol y el resto del ciclo es cerrado.

| seed | f* | pérdida residual (E/s) | fotosíntesis (E/s) | retención/ciclo R | stock campo E |
|---|---|---|---|---|---|
| 12345 | 86.4% | 92.6 | 90.7 | 0.932 | 6289 |
| 20264 | 86.6% | 91.7 | 90.7 | 0.933 | 6483 |
| 28183 | 86.7% | 90.3 | 90.4 | 0.933 | 6162 |
| 36102 | 87.2% | 87.3 | 90.7 | 0.936 | 6182 |
| 44021 | 87.1% | 88.6 | 91.1 | 0.935 | 6327 |

## Sensibilidad (seed 12345 como representante; rango entre seeds <±2%)

| escenario | net con f*=f0 (E/s) | minutos hasta agotar/inundar stock campo (~6.3k E) |
|---|---|---|
| base (f=f*) | +0.0 | ∞ |
| popC +10% (metab +10%) | -63.9 | 1.6 |
| popC -10% | +63.9 | 1.6 |
| detrito -10% (dieta más asimilable) | -59.0 | 1.8 |
| detrito +10% | +59.0 | 1.8 |
| peor caso combinado (+10% popC, -10% detrito) | -122.8 | 0.9 |

## Lectura para la decisión (Jared)

1. f* = 86.4–87.2% entre seeds: fracción estable, no un número mágico por seed.
2. Con f=f*, la pérdida residual (1-f)·detritus ≈ 90–92 E/s ≈ input solar (90–97 E/s).
   El cierre termodinámico es coherente: entra sol, sale metabolismo, el ciclo interno
   retiene R ≈ 0.93 por pasada. Esa R tan alta es el precio de cerrar el ciclo: eta deja
   de ser el control principal del sistema (riesgo ya anotado en options analysis).
3. Sensibilidad dominante: respuesta poblacional de popC. ±10% de popC mueve el net
   ±~64 E/s y agota/inunda el stock del campo (~6.3k E) en solo ~1.6 min de sim. Un f
   fijo sin regulación de población NO mantiene el equilibrio: necesitaría pérdida de reciclaje dependiente de
   stock (p.ej. saturación del detritívoro) o control de popC, que es mecánica nueva.
4. Recomendación: si Jared aprueba la vía A, la tarjeta debe incluir explícitamente el
   mecanismo de pérdida en el reciclaje y el criterio de estabilidad bajo respuesta
   poblacional (pendiente <=5%/10m ya usado en cp2), con flag OFF por defecto.

Artefacto generado por recycle-sizing-task921.js; datos: paired_on_60m/.
