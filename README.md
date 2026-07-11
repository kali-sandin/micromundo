# MicroMundo 3.0

Simulador web inicial de microecosistema con tres niveles:

- productores: biomasa fija agregada, móviles y colonias grandes
- consumidores primarios: móviles, comen productores y evolucionan genes simples
- depredadores: móviles, comen consumidores

La prioridad del proyecto es rendimiento: vanilla HTML/CSS/JS, Canvas 2D, sin build ni dependencias externas. La simulación usa una rejilla espacial para que alimentación, percepción y reproducción no dependan de comparar todos contra todos.

## Estado actual

Incluye:

- canvas a pantalla completa con zoom libre y pan
- mundo 16:9 con coordenadas reales, por defecto `16000 x 9000`
- tamaño configurable haciendo click en el readout superior del tamaño
- fog fuera del rectángulo del ecosistema
- pausa/play
- speed de `/5` a `x100`
- slider de energía del sistema/sol: acelera o frena el crecimiento de la biomasa primaria y la reproducción de productores móviles/grandes
- popup para añadir productores, consumidores y depredadores
- si se añade una única entidad, queda seleccionada automáticamente en el inspector
- los parámetros con rango del popup de creación son sliders con tooltip explicativo; las opciones discretas usan botones seleccionables
- genes/fenotipos configurables: tamaño, flagelos, cilios, reservas, quimiosensibilidad, pseudópodos, película/armadura, vacuola contráctil, modo de alimentación y movimiento
- productores Tipo A modelados como área/campo de biomasa con densidades distintas para escalar mejor
- productores Tipo B móviles que detectan consumidores cercanos y huyen con variación según algoritmo de movimiento; se reproducen lento, captan poca energía solar y son más lentos para evitar dominancia temprana
- productores Tipo C verdes/fijos como colonias: crecen con el sol, generan protuberancias/hojas comestibles, pueden alimentar consumidores sin morir inmediatamente y mueren por senescencia tras una vida larga
- reproducción lenta de productores B/C y reproducción sexual por recombinación/mutación en consumidores y depredadores
- los algoritmos de movimiento son combinables; los hijos recombinan la máscara de movimientos de los padres
- la herencia de genes numéricos queda acotada al rango parental con margen del 20% por ambos lados, respetando límites globales manejables
- metabolismo derivado: más tamaño y reservas permiten almacenar más energía, pero reducen velocidad y elevan coste; más locomoción aumenta velocidad y gasto; los flagelos tienen coste no lineal para que muchos no sean ventaja gratis
- comer seres u hojas da bastante más energía que la captación solar, para favorecer interacción frente a fotosíntesis pasiva
- depredadores más longevos: más energía inicial/máxima, algo más rápidos y perceptivos, y más retorno energético al comer consumidores
- debug de rangos muestra productores B/C, consumidores y depredadores; Tipo C muestra además rango amplio de reproducción/vecindad
- estadísticas movibles con iconos de seres reales y productores separados por Tipo A/B/C; Tipo A se muestra como densidad media por área
- gráfica de población movible/redimensionable, colocada inicialmente arriba a la izquierda, con productores A/B/C separados y rueda de ratón para ampliar o reducir el rango temporal visible
- panel movible de inspección por click con valores aplicables al tipo seleccionado; se cierra con la X o con Escape
- panel de histórico genético actualizado cada segundo, separado por Tipo A, Tipo B, Tipo C, consumidores y depredadores, mostrando solo genes/métricas aplicables y rueda de ratón para cambiar rango temporal

## Rutas

- Repo local: `/home/kali/.openclaw/workspace/projects/micromundo`
- Copia local web: `/home/kali/.openclaw/workspace/webs/micromundo`
- Servido por Nginx: `/var/www/webs/micromundo`
- URL local: `http://127.0.0.1/micromundo/`
- URL LAN: `http://192.168.1.252/micromundo/`
- GitHub: `https://github.com/kali-sandin/micromundo`

## Decisiones de arquitectura

- Sin framework por ahora: menos coste, menos build, menor latencia de arranque.
- Canvas 2D en vez de DOM/SVG: miles de criaturas con DOM no escalan bien.
- Productores Tipo A como `Float32Array` de densidad por celda, no como entidades individuales.
- Productores Tipo C no crean entidades para cada hoja: las hojas son energía agregada en la colonia y se renderizan como protuberancias.
- Rejilla espacial reconstruida por tick solo para entidades móviles/grandes.
- Histórico genético agregado una vez por segundo: no guarda serie por individuo, solo medias por tipo. Las gráficas usan escala temporal fija configurable con rueda; al ensanchar o hacer zoom out se muestran más segundos de histórico.
- Debug de rangos limitado para no destruir el FPS.
- El log visual de eventos se ha retirado: consumía atención y no aportaba una vista completa del sistema.
- El speed alto escala el delta de simulación y limita chunks por frame para no tumbar el navegador.

## TheOffice

Proyecto registrado como:

- ID: `micromundo`
- Título: `Micromundo`
- Repo: `/home/kali/.openclaw/workspace/projects/micromundo`
- URL pública: `https://kali-sandin.github.io/micromundo/`
