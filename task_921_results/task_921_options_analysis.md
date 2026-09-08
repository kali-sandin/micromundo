# task_921 — Opciones de equilibrio energético (análisis de consolidación)

Post-refutación cp2. Pregunta: ¿qué magnitud necesita cada opción para que
`system_net ≈ 0` en ON (flag conservativo activo)?

Método: media de flujos en ventana estable t>1800s de los 5 runs ON 60m
(dt 1/60, migr OFF, eta .5, conversión 18 E/mass). Sin simulaciones nuevas:
aritmética de primer orden sobre flujos medidos. Interacciones de segundo
orden (respuestas poblacionales) NO están incluidas: son cotas de arranque,
no predicciones.

| seed | n | photosynth | detritus | metab | net | popC | metab/C | f reciclar detrito | m solar | r metab |
|---|---|---|---|---|---|---|---|---|---|---|
| 12345 | 181 | 90.7 | 682.4 | 645.6 | -589.7 | 1547 | 0.417 | 86% | 7.5x | 91% |
| 20264 | 181 | 90.7 | 686.4 | 651.2 | -594.7 | 1517 | 0.429 | 87% | 7.55x | 91% |
| 28183 | 181 | 90.4 | 677 | 643.6 | -586.6 | 1570 | 0.41 | 87% | 7.49x | 91% |
| 36102 | 181 | 90.7 | 684.5 | 654.8 | -597.2 | 1568 | 0.418 | 87% | 7.59x | 91% |
| 44021 | 181 | 91.1 | 687.7 | 655.6 | -599 | 1569 | 0.418 | 87% | 7.57x | 91% |

Rangos entre seeds:
- **Opción A — reciclar detrito al campo A**: fracción necesaria
  86–87%
  del detrito conservativo (~677–688 E/s).
  Con reciclaje total el net sería ≈ +78 E/s (exceso; el
  stock del campo lo amortiza). Es la única opción que cierra el ciclo sin
  tocar la escala del input ni del metabolismo. Riesgo: convierte eta en un
  parámetro casi neutro (todo vuelve) y puede necesitar pérdida de reciclaje
  documentada para no recrear creación neta encubierta.
- **Opción B — subir input solar**: multiplicador 7.5–7.6x
  sobre photosynth (~90–91 E/s actuales
  → ~677–691 E/s).
  Cambia el régimen ecológico global (productividad primaria ~7x) y arrastra
  re-tuning de productores.
- **Opción C — bajar demanda consumer**: reducción de ~91–91%
  del metabolismo aggregate (~644–656 E/s,
  ~0.41–0.43 E/s por consumer con popC
  1517–1570). Equivalente: misma reducción vía menos
  population (cap/regulación) con metab igual.

Nota transversal: conservIn (~1.3–1.5k E/s) sigue siendo ~15x el input solar;
cualquiera de las tres opciones deja el sistema dependiendo de stock del campo
A a corto plazo y de la opción elegida a largo. La opción A es la de menor
impacto lateral y la única que conserva el dimensionamiento actual.

Artefacto generado por options-task921.js; datos: task_921_results/paired_on_60m/.
