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
