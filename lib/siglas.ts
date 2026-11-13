// Explicaciones cortas de las siglas del sector (tarea 86, usuario 2026-11-12:
// «tooltip sí, glosario NO»): cada sigla visible para un cliente lleva su ⓘ con una
// frase EN EL SITIO donde aparece (componente Tip). Una sola fuente para no contar la
// misma sigla de dos maneras. El eCMR y el DeCA ya se explican enteros en su propia
// sección de la ficha (CmrDigital), por eso no están aquí.
export const SIGLAS = {
  NIMA: 'Número de Identificación Medioambiental. Solo aplica si la mercancía son residuos: el transportista debe ir inscrito en el registro de residuos con su NIMA. Si no mueves residuos, déjalo en No.',
  ADR: 'Mercancía peligrosa por carretera (acuerdo europeo ADR): inflamables, químicos, baterías… Exige camión y conductor con autorización ADR, por eso encarece el envío.',
  CESCE: 'Compañía de seguros de crédito con la que Dynamo asegura los cobros. Clasifica a cada empresa, y de esa clasificación sale poder trabajar a crédito o con pago por adelantado.',
} as const;
