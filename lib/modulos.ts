// MÓDULOS APAGADOS de la plataforma. Un módulo apagado no aparece en ningún sitio (menú,
// pantallas, desplegables, parámetros), pero su código y sus datos se quedan: para
// recuperarlo basta con encenderlo aquí.

// ALMACENAMIENTOS y ALMACENES DYNAMO (usuario, 2026-11-16: «almacenamientos vamos a
// quitar de toda la plataforma, de admin y todo; dejaremos para v4. No deben aparecer ya
// nunca y tampoco esos almacenes Dynamo deben ser seleccionables»). Apagado quita:
//   · las pantallas «Almacenamientos» y «Almacenes Dynamo» y sus entradas del menú;
//   · las proformas de almacenamiento de «Administración»;
//   · los almacenes Dynamo como recogida o entrega al crear o modificar un envío;
//   · sus parámetros (precio por semana y por reparto).
// Se retoma en la v4.
export const ALMACENAMIENTOS = false;

// PACKS DE GRUPAJE (usuario, 2026-11-23: «dejamos eso del pack para v3 mejor, no quiero liar
// ahora mucho; déjalo planteado y en otra fase»). Apagado quita:
//   · la pantalla «Packs de grupaje» y su entrada del menú;
//   · el recuadro «Se puede agrupar / Pack de grupaje» de la ficha del envío;
//   · las acciones del servidor (no contestan nada con el módulo apagado).
// La base de datos (tabla packs, envios.pack_id y sus funciones) se queda como está: sin
// pantalla no se crea ningún pack, y sin packs el disparador no hace nada.
// Lo que falta para la v3 («ofrecer el pack entero») está escrito como borrador en docs/v3/.
// Se retoma en la v3.
export const PACKS_GRUPAJE = false;
