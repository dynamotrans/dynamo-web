# Calendario de temas — posts (martes, jueves y sábado 8:00)

Tono: cercano y profesional. Tú, frases cortas, sin tecnicismos vacíos. Siempre con un dato o consejo útil.
Nunca precios, nunca nombres de clientes ni de transportistas. Cerrar con una llamada a la acción (WhatsApp / dynamotrans.com).
Todos los datos de Dynamo salen de la web (`index.html` y hojas públicas); si un dato no está en la web, no se afirma. Nunca nombres, marcas ni logos de empresas clientes, aunque estén en la web.

## Cómo se eligen los temas (sin repetir)
1. Se coge el siguiente tema de la tabla que no esté en el histórico (en orden).
2. Cuando queden **3 o menos** sin publicar, antes de repetir se **añaden 10 temas nuevos** al final de la tabla, sacados de la web (servicios, vehículos, tipos de mercancía, sectores, países, horarios, preguntas que resuelve el blog). Nunca un tema que ya esté en la tabla con otras palabras.
3. Solo se vuelve a un tema ya publicado si no se puede sacar ninguno nuevo útil de la web, si han pasado **al menos 3 meses** desde la última vez y con un **ángulo distinto** al anotado en el histórico.
4. El tema 31 es una serie (un país por post): se puede usar varias veces, un país distinto cada vez, anotando cuál.
5. Las historias en vídeo usan la misma tabla con su propio histórico (`HISTORIAS.md`); que un tema salga como post y otro día como historia está permitido.

## Rotación de estilo (para no repetir imagen ni forma de titular)
Cada semana se usa el siguiente estilo de la secuencia **v1 → v2 → v3 → v4 → v1…** (ver `render.py --help`) y el siguiente tipo de titular de **pregunta → dato → consejo → pregunta…**. Nunca dos semanas seguidas el mismo estilo. Se anota en el histórico.

- v1 tarjeta morada + camión: titular de pregunta o afirmación + 2–3 frases.
- v2 dato grande (navy + palets): kicker + número/cifra protagonista + 1–2 frases.
- v3 foto real (velo morado arriba, camión abajo): titular + 1–2 frases; `--photo alt` alterna la foto de los dos camiones.
- v4 fondo claro + mapa de ruta: titular + lista de 3 puntos (consejos, requisitos, pasos).

| # | Tema | Idea |
|---|------|------|
| 1 | Grupaje vs carga completa | Cuándo compensa cada uno (13,30 m / 33 europalets) — PUBLICADO 05/11/2026 |
| 2 | Medios de carga y descarga | Carretilla, muelle, trampilla elevadora: qué hace falta en origen y destino — PUBLICADO 07/11/2026 |
| 3 | Palets: europeo vs americano | 120×80 vs 120×100; cuántos caben en un trailer (33 / 26) |
| 4 | Qué es un tauliner | Lona corredera: carga lateral, trasera y por techo — PUBLICADO 10/11/2026 |
| 5 | Ventana de carga 1–2 días | Por qué es más económica que fecha fija |
| 6 | Seguro MAPFRE 250.000 € | Mercancía protegida además del seguro del camión — PUBLICADO 12/11/2026 |
| 7 | Rígido con plataforma | 8 m / 14 Tn / transpaleta: entregas urbanas sin muelle |
| 8 | Import/Export Europa | Portugal, Francia, Alemania, Italia, Benelux, Austria, Polonia, Chequia — PUBLICADO 14/11/2026 |
| 9 | Pedir tarifa bien | Los 3 datos: tipo de mercancía, metros/peso, CP origen y destino |
| 10 | Mercancía no paletizada | Maquinaria, tubos, balas: cómo se carga y qué avisar |
| 11 | Operador autorizado | Tarjeta OT: qué significa trabajar con un operador de transporte |
| 12 | Festivos y plazos | Por qué los festivos (nacionales y de otros países) mueven la entrega |
| 13 | Eventos | Transporte para ferias, conciertos, deportes: horarios y accesos |
| 14 | NIMA | Qué es y cuándo lo pide un transporte de residuos |
| 15 | Sectores | Construcción, agro, industria, distribución: un ejemplo de cada |
| 16 | 24/7 incidencias | Qué hacer si algo falla en ruta |
| 17 | Qué NO transportamos | Solo tauliner y rígido con plataforma: sin frigorífico, granel ni piso móvil (y por qué decirlo ahorra tiempo) |
| 18 | Carga por techo | Apertura lateral, trasera y de techo del tauliner: cuándo hace falta cargar por arriba |
| 19 | Rígido: 20 europalets | Rígido de 8 m (14 Tn, 20 europalets / 16 americanos): cuándo compensa frente al trailer |
| 20 | Entregas en obra | Por qué hay que avisar al pedir tarifa si el destino es una obra (accesos, descarga) |
| 21 | Maquinaria | Maquinaria de construcción, equipos de laboratorio e industriales: qué contar al pedir el transporte |
| 22 | Distribución general | La mercancía del día a día: paletizada, de nave a nave |
| 23 | Nacional en 24 h | Servicio nacional en 24 h en la península: qué hace falta para llegar en plazo |
| 24 | Desde Sevilla a toda España | Base en Sevilla y oficinas en Madrid, Barcelona, Valencia y Bilbao |
| 25 | Importación desde Europa | Traer mercancía de Europa: recogida en origen y entrega en la puerta de tu empresa |
| 26 | Un único interlocutor | Internacional con una sola persona de contacto de principio a fin |
| 27 | Industria y construcción | Ejemplos de mercancía del sector (sin nombres de clientes) |
| 28 | Qué valoran nuestros clientes | 5,0 en Google y +480 clientes: qué se repite en las reseñas (solo agregado, sin nombres ni citas firmadas) |
| 29 | Cómo preparar la mercancía | Paletizado, film, etiquetado y documentación antes de que llegue el camión |
| 30 | Horarios de atención | Teléfono, email y WhatsApp: cuándo y por dónde te atendemos |
| 31 | Serie países | Un país de cobertura por post (Portugal, Francia, Alemania…): qué movemos y cómo |

## Histórico
Formato: fecha — tema — estilo — tipo de titular — **titular** — **enfoque en una frase** — imagen — id de Metricool. El titular y el enfoque sirven para no repetir el mismo post si un tema vuelve a salir.
- 2026-11-05 (publicado directo, no martes) — Tema 1 — estilo v1 — titular pregunta — titular «¿Grupaje o carga completa?» — enfoque: menos de 13,30 m compartes camión y pagas tu espacio; si llenas, va directo — `images/redes/2026-11-10-grupaje-o-carga-completa.jpg` — Metricool post 418299906 — https://www.instagram.com/p/DfYF65ciNbj/
- 2026-11-07 — Tema 2 (medios de carga y descarga) — estilo v3 (v2 sin cifra natural para el tema, se salta a v3; foto por defecto) — titular dato — titular «33 palets no se bajan a mano» — enfoque: confirmar carretilla, muelle o trampilla en origen y destino antes de pedir el camión — `images/redes/2026-11-07-medios-de-carga.jpg` — Metricool post 419570301 (IG + FB)
- 2026-11-10 — Tema 4 (qué es un tauliner) — enfoque: qué es y medidas — estilo v4 — titular consejo: "Lo que debes saber del tauliner" — `images/redes/2026-11-10-que-es-un-tauliner.jpg` — Metricool 422596804 (IG + FB)
- 2026-11-12 — Tema 6 (seguro MAPFRE 250.000 €) — enfoque: doble cobertura del envío — estilo v1 — titular pregunta: "¿Tu mercancía va asegurada?" — `images/redes/2026-11-12-seguro-mapfre.jpg` — Metricool 425140344 (IG + FB)
- 2026-11-14 — Tema 8 (Import/Export Europa) — enfoque: a qué países llegamos — estilo v2 — titular dato: "12 países de Europa, un único interlocutor" — `images/redes/2026-11-14-import-export-europa.jpg` — Metricool 427634214 (IG + FB)
