# task_913 — Aparato de captura cono+tether

## Objetivo

Comprobar de forma reversible si un aparato morfológico de captura puede cerrar el funnel energético del depredador sin cambiar ganancias, metabolismo, genética ni el resto de reglas ecológicas.

La implementación queda protegida por `__SPIKE.predTether` y apagada por defecto. El navegador normal conserva el comportamiento anterior.

## Gate 1: shadow-only

- 5 semillas × 10 minutos, `dt=1/60`, migración desactivada.
- La medición reutiliza `nearby`; no cambia conducta ni añade una query espacial.
- El upper bound generoso proyectó ratio ingreso/metabolismo de 21,66–41,58 (media 30,40).
- Resultado: **PASA** como filtro para implementar y medir el Gate 2.

## Gate 2: cono+tether activo

Comparación pareada con las cinco semillas OFF de `task_912` (`008bd9f`) frente a cinco ejecuciones ON de 10 minutos:

- depredadores vivos al final: **0/5**;
- extinción del depredador: 290–350 s;
- ratio ingreso/metabolismo: **0,044–0,092**, muy por debajo del éxito 0,8–1,2;
- consumidores finales: 99–102 % del OFF, sin colapso de presas;
- contacto/prey-near: 0,361–1,568 %; solo una semilla supera el 1 %;
- CV de consumidores: 0,349–0,399, por encima del límite 0,25;
- el coste de simulación no empeora el umbral del 5 %.

## Veredicto

**HIPÓTESIS REFUTADA.** El tether aumenta algo el contacto y las capturas, pero no se acerca al ingreso necesario para sostener al depredador. La feature permanece apagada por defecto y no debe continuarse con tuning, ganancias, metabolismo o genética dentro de esta tarea.

Artefactos reproducibles: `task_913_results/`, `analyze-task913.js`, `sim-harness.js`.
