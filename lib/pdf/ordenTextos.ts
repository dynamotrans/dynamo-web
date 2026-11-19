// Textos de la ORDEN DE CARGA en los idiomas de los transportistas (usuario, 2026-11-10:
// «cuando el idioma del transportista es polaco, orden en polaco y español; y así con
// todos — primero el idioma del transportista y luego el español»).
//
// Las CONDICIONES legales largas solo van en las páginas en ESPAÑOL (que acompañan
// SIEMPRE a las traducidas); las copias en otro idioma llevan la nota de que la versión
// española prevalece. Los datos que vienen de la base (nombres, direcciones, horarios,
// anotaciones) se quedan tal cual están escritos.

export type IdiomaOrden = 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'nl' | 'pl' | 'cs' | 'ro';

/** Idioma de la orden según el país del transportista (ISO-3166). Sin país o sin idioma propio: inglés. */
export function idiomaDePais(iso: string | null | undefined): IdiomaOrden {
  const m: Record<string, IdiomaOrden> = {
    ES: 'es', AD: 'es', PT: 'pt', FR: 'fr', MC: 'fr', LU: 'fr', BE: 'fr',
    DE: 'de', AT: 'de', CH: 'de', LI: 'de', IT: 'it', SM: 'it', NL: 'nl',
    PL: 'pl', CZ: 'cs', SK: 'cs', RO: 'ro', MD: 'ro',
  };
  return m[(iso ?? '').toUpperCase()] ?? (iso ? 'en' : 'es');
}

const LOCALE: Record<IdiomaOrden, string> = { es: 'es-ES', en: 'en-GB', pt: 'pt-PT', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', nl: 'nl-NL', pl: 'pl-PL', cs: 'cs-CZ', ro: 'ro-RO' };

// «Wt. 10.11.26» en el idioma que toque (en español se usa el formato de la plataforma).
export function fechaLoc(iso: string | null | undefined, idioma: IdiomaOrden): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const dia = new Intl.DateTimeFormat(LOCALE[idioma], { weekday: 'short', timeZone: 'UTC' }).format(d).replace(/\.$/, '');
  const num = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(d);
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${num}`;
}
export function ventanaLoc(desde: string | null, hasta: string | null, idioma: IdiomaOrden, t: TextosOrden): string {
  if (!desde) return '';
  if (!hasta || hasta === desde) return fechaLoc(desde, idioma);
  return t.rango.replace('{a}', fechaLoc(desde, idioma)).replace('{b}', fechaLoc(hasta, idioma));
}

export type TextosOrden = {
  titulo: string; subRef: string; emitida: string;
  copiaConductor: string; copiaAdmin: string; sinEco: string; completa: string; prevalece: string;
  
  subConfirmado: string; origenL: string; destinoL: string; salidaL: string;
  transpRealiza: string; transp: string; gestionadaPor: string; ordenante: string; pendienteTransp: string;
  operadorTrafico: string; urgencias: string; operadorAut: string;
  nEnvio: string; fechaCargaL: string; matriculasAutL: string; referenciaL: string; pendAsignar: string;
  recogida: string; recogidas: string; entrega: string; entregas: string;
  secMercancia: string; secMatr: string; secImporte: string; secCond: string;
  fecha: string; horario: string; empresa: string; direccion: string; contacto: string; referencia: string;
  tipoSitio: string; atencion: string; indicaciones: string;
  estimada: string; porConfirmar: string; consultaDynamo: string; faltanEmpresa: string; citaPrevia: string; sinMedios: string;
  mercancia: string; tipoTransporte: string; tipoCarga: string; requisitos: string; importante: string; txtImportante: string;
  paletizada: string; noPaletizada: string; bulto: string; bultos: string; metrosLineales: string; rigido: string; tauliner: string; alturaMax: string;
  cargaCompleta: string; rigidoCompleto: string; grupaje: string; cargaLateral: string; cargaTrasera: string; cargaTecho: string;
  requiereNima: string; adr: string;
  pendMatrEnvia: string; conductor: string; pendComunicar: string; txtSoloMatr: string;
  importeL: string; pendiente: string; impuestosNo: string; formaPago: string; txtProntoPago: string; txtTransferencia: string;
  facturaL: string; txtFactura: string; txtDiscrecion: string; verCondEs: string;
  pagina: string; de: string; rango: string;
  decaManual: string; qrEscanea: string; qrPendiente: string;
  modifTitulo: string; modifNinguna: string; modifRuta: string; modifFecha: string;
  modifMatricula: string; modifTransQuitado: string; modifTransNuevo: string; modifMas: string;
  modifMatriculaAsig: string; modifTransAsig: string; modifEmision: string;
  modifMotivo: string; modifNuevo: string; modifAnterior: string;
  motAsig: string; motMatricula: string; motTrans: string; motQuitado: string; motRuta: string; motFecha: string;
  modifMercancia: string; motMercancia: string;
  motAsigIniciado: string; faltaRemolque: string;
  txtSinMatriculas: string; modifSinEmitir: string;
  ocultasTit: string; ocultas1: string; ocultas2: string;   // direcciones ocultas hasta recibir las matrículas (2026-11-19)
};

export const ORDEN_TXT: Record<IdiomaOrden, TextosOrden> = {
  es: {
    titulo: 'ORDEN DE CARGA', subRef: 'Referencia de envío', emitida: 'Emitida el',
    copiaConductor: 'COPIA CONDUCTOR', copiaAdmin: 'COPIA ADMINISTRACIÓN', sinEco: 'SIN INFORMACIÓN ECONÓMICA', completa: 'DOCUMENTO COMPLETO',
    
    subConfirmado: 'Servicio de transporte confirmado', origenL: 'Origen', destinoL: 'Destino', salidaL: 'Salida',
    prevalece: 'En caso de discrepancia entre versiones, prevalece la versión en español.',
    transpRealiza: 'TRANSPORTISTA EFECTIVO', transp: 'TRANSPORTISTA', gestionadaPor: 'GESTIONADA POR', ordenante: 'ORDENANTE',
    pendienteTransp: 'PENDIENTE DE ASIGNAR TRANSPORTISTA', operadorTrafico: 'Operador de tráfico',
    urgencias: 'Urgencias e incidencias 24 h', operadorAut: 'Operador autorizado de transporte · O.T.',
    nEnvio: 'Nº DE ENVÍO', fechaCargaL: 'FECHA DE CARGA', matriculasAutL: 'MATRÍCULAS AUTORIZADAS', referenciaL: 'REFERENCIA', pendAsignar: 'PENDIENTE DE ASIGNAR',
    recogida: 'RECOGIDA', recogidas: 'RECOGIDAS', entrega: 'ENTREGA', entregas: 'ENTREGAS',
    secMercancia: 'MERCANCÍA Y VEHÍCULO', secMatr: 'MATRÍCULAS Y CONDUCTOR', secImporte: 'IMPORTE', secCond: 'CONDICIONES DE LA ORDEN DE CARGA',
    fecha: 'Fecha', horario: 'Horario (hora local)', empresa: 'Empresa', direccion: 'Dirección', contacto: 'Contacto', referencia: 'Referencia',
    tipoSitio: 'Tipo de sitio', atencion: 'Atención', indicaciones: 'Indicaciones',
    estimada: '(estimada)', porConfirmar: 'Por confirmar', consultaDynamo: 'Consultar con Dynamo', faltanEmpresa: 'FALTAN DATOS DE EMPRESA / ALMACÉN',
    citaPrevia: 'Con cita previa', sinMedios: 'Sin medios de carga: el camión debe llevar plataforma elevadora',
    mercancia: 'Mercancía', tipoTransporte: 'Tipo de transporte', tipoCarga: 'Tipo de carga', requisitos: 'Requisitos', importante: 'Importante',
    txtImportante: 'El transportista solo está autorizado a recoger la mercancía descrita en esta orden. Si el cargador quiere cargar otra mercancía, avísanos antes para autorizarla. No está permitido el transbordo: si lo necesitas, avísanos antes para consultarlo con el cliente.',
    paletizada: 'Paletizada', noPaletizada: 'No paletizada', bulto: 'bulto', bultos: 'bultos', metrosLineales: 'metros lineales',
    rigido: 'Camión rígido con plataforma elevadora', tauliner: 'Tráiler tauliner (lona corredera)', alturaMax: 'altura máxima {m} m',
    cargaCompleta: 'Tráiler completo', rigidoCompleto: 'Rígido completo', grupaje: 'Grupaje', cargaLateral: 'carga lateral', cargaTrasera: 'carga trasera', cargaTecho: 'carga por techo',
    requiereNima: 'Requiere NIMA', adr: 'MERCANCÍA ADR (peligrosa)',
    pendMatrEnvia: 'PENDIENTE', conductor: 'Conductor', pendComunicar: 'Pendiente de comunicar',
    txtSoloMatr: 'Solo pueden cargar las matrículas autorizadas. Si cambian, avísanos antes de llegar a la carga.',
    importeL: 'Importe', pendiente: 'Pendiente', impuestosNo: '(impuestos aplicables no incluidos)', formaPago: 'Forma de pago',
    txtProntoPago: 'PRONTO PAGO: transferencia a {dias} días de la fecha de factura con un descuento del {pct} % (mínimo {min}). Cobrarás {neto}.',
    txtTransferencia: '**Transferencia a {dias} días** de la fecha de factura.', facturaL: 'Factura',
    txtFactura: 'Indica en tu factura nuestra ==**REFERENCIA DE VIAJE: {ref}.**== Envía la factura, los albaranes y los certificados por email a **{email}:** te contestaremos con un **«RECIBIDO».**',
    txtDiscrecion: 'DISCRECIÓN COMERCIAL: cliente solicita que en la carga no se informe del destino, ni en la entrega del origen.',
    verCondEs: 'Condiciones de la orden: en las páginas en ESPAÑOL de este documento.',
    pagina: 'Página', de: 'de', rango: 'del {a} al {b}',
    qrEscanea: 'Escanéalo con el móvil', qrPendiente: 'Pendiente de asignar transporte',
    modifTitulo: 'Histórico del documento', modifNinguna: 'Sin modificaciones desde la emisión', modifRuta: 'Ruta modificada', modifFecha: 'Fecha de carga movida',
    modifMatricula: 'Cambio de matrículas', modifTransQuitado: 'Transportista retirado', modifTransNuevo: 'Nuevo transportista asignado', modifMatriculaAsig: 'Asignación de matrículas', modifEmision: 'Emisión del documento', modifMotivo: 'Motivo', modifNuevo: 'Datos nuevos', modifAnterior: 'Datos anteriores — NO VÁLIDOS', motAsig: 'Asignación inicial, previa al inicio del transporte', motAsigIniciado: 'Asignación inicial', faltaRemolque: 'Falta la matrícula del semirremolque', ocultasTit: 'DIRECCIONES OCULTAS HASTA RECIBIR LAS MATRÍCULAS', ocultas1: 'El envío está CONFIRMADO. Envíanos las matrículas (tractora y semirremolque) y te mandamos AL MOMENTO esta orden con las direcciones de carga y descarga.', ocultas2: 'Sin matrículas no se carga: las comunicamos a los almacenes antes de que llegue el camión.', txtSinMatriculas: 'DeCA: Les rogamos nos faciliten las matrículas del vehículo; de no recibirlas, entenderemos que el transportista efectivo gestiona el DeCA conforme a la Orden FOM/2861/2012, quedando nuestra empresa exenta de cualquier responsabilidad derivada de su emisión u omisión.', modifSinEmitir: 'Documento pendiente de emisión: faltan las matrículas del vehículo', motMatricula: 'Por disponibilidad de camiones en la zona', motTrans: 'Sustitución del transportista efectivo', motQuitado: 'Retirada del transportista efectivo', motRuta: 'Por indicación del cliente', motFecha: 'Cambio de fecha indicado por el cargador contractual', modifMercancia: 'Mercancía modificada', motMercancia: 'Cambio de mercancía indicado por el cargador contractual', modifTransAsig: 'Asignación de transportista', modifMas: '… y {n} cambios anteriores',
    decaManual: 'Documento de control (DeCA) y carta de porte (CMR): transporte contratado directamente entre el ordenante y el transportista — se gestionan entre las partes. Esta orden no incluye QR de firma digital ni archivo del CMR.',
  },
  en: {
    titulo: 'LOADING ORDER', subRef: 'Shipment reference', emitida: 'Issued on',
    copiaConductor: 'DRIVER COPY', copiaAdmin: 'ADMINISTRATION COPY', sinEco: 'NO FINANCIAL INFORMATION', completa: 'FULL DOCUMENT',
    
    subConfirmado: 'Confirmed transport service', origenL: 'Origin', destinoL: 'Destination', salidaL: 'Departure',
    prevalece: 'In case of discrepancy between versions, the Spanish version prevails.',
    transpRealiza: 'ACTUAL CARRIER', transp: 'CARRIER', gestionadaPor: 'MANAGED BY', ordenante: 'ORDERING PARTY',
    pendienteTransp: 'CARRIER TO BE ASSIGNED', operadorTrafico: 'Traffic operator',
    urgencias: '24 h emergencies and incidents', operadorAut: 'Authorised transport operator · Licence',
    nEnvio: 'SHIPMENT NO.', fechaCargaL: 'LOADING DATE', matriculasAutL: 'AUTHORISED PLATES', referenciaL: 'REFERENCE', pendAsignar: 'TO BE ASSIGNED',
    recogida: 'PICK-UP', recogidas: 'PICK-UPS', entrega: 'DELIVERY', entregas: 'DELIVERIES',
    secMercancia: 'GOODS AND VEHICLE', secMatr: 'PLATES AND DRIVER', secImporte: 'AMOUNT', secCond: 'LOADING ORDER CONDITIONS',
    fecha: 'Date', horario: 'Hours (local time)', empresa: 'Company', direccion: 'Address', contacto: 'Contact', referencia: 'Reference',
    tipoSitio: 'Type of site', atencion: 'Attention', indicaciones: 'Instructions',
    estimada: '(estimated)', porConfirmar: 'To be confirmed', consultaDynamo: 'Check with Dynamo', faltanEmpresa: 'COMPANY / WAREHOUSE DETAILS MISSING',
    citaPrevia: 'By appointment', sinMedios: 'No loading equipment on site: the truck must carry a tail lift',
    mercancia: 'Goods', tipoTransporte: 'Type of transport', tipoCarga: 'Type of load', requisitos: 'Requirements', importante: 'Important',
    txtImportante: 'The carrier is only authorised to collect the goods described in this order. If the shipper wants to load other goods, tell us first so we can authorise them. Transhipment is not allowed: if you need it, tell us first so we can check with the customer.',
    paletizada: 'Palletised', noPaletizada: 'Not palletised', bulto: 'package', bultos: 'packages', metrosLineales: 'loading metres',
    rigido: 'Rigid truck with tail lift', tauliner: 'Tautliner trailer (sliding curtain)', alturaMax: 'maximum height {m} m',
    cargaCompleta: 'Full trailer load (FTL)', rigidoCompleto: 'Full rigid load', grupaje: 'Groupage', cargaLateral: 'side loading', cargaTrasera: 'rear loading', cargaTecho: 'top loading',
    requiereNima: 'NIMA required', adr: 'ADR GOODS (dangerous)',
    pendMatrEnvia: 'PENDING', conductor: 'Driver', pendComunicar: 'To be communicated',
    txtSoloMatr: 'Only the authorised plates may load. If they change, tell us before arriving at the loading point.',
    importeL: 'Amount', pendiente: 'Pending', impuestosNo: '(applicable taxes not included)', formaPago: 'Payment terms',
    txtProntoPago: 'EARLY PAYMENT: bank transfer {dias} days from the invoice date with a {pct} % discount (minimum {min}). You will receive {neto}.',
    txtTransferencia: '**Bank transfer {dias} days** from the invoice date.', facturaL: 'Invoice',
    txtFactura: 'Quote our ==**TRIP REFERENCE**== on your invoice: ==**{ref}.**== Send the invoice, delivery notes and certificates by email to **{email}:** we will reply with a **«RECEIVED».**',
    txtDiscrecion: 'COMMERCIAL DISCRETION: the customer requests that the destination is not disclosed at loading, nor the origin at delivery.',
    verCondEs: 'Order conditions: see the SPANISH pages of this document.',
    pagina: 'Page', de: 'of', rango: '{a} – {b}',
    qrEscanea: 'Scan it with your phone', qrPendiente: 'Transport pending assignment',
    modifTitulo: 'Document history', modifNinguna: 'No modifications since issue', modifRuta: 'Route changed', modifFecha: 'Loading date moved',
    modifMatricula: 'Plate change', modifTransQuitado: 'Carrier removed', modifTransNuevo: 'New carrier assigned', modifMatriculaAsig: 'Plates assigned', modifEmision: 'Document issued', modifMotivo: 'Reason', modifNuevo: 'New data', modifAnterior: 'Previous data — NO LONGER VALID', motAsig: 'Initial assignment, before the start of the transport', motAsigIniciado: 'Initial assignment', faltaRemolque: 'Semi-trailer plate missing', ocultasTit: 'ADDRESSES HIDDEN UNTIL WE RECEIVE THE PLATES', ocultas1: 'The shipment is CONFIRMED. Send us the registration plates (tractor and semi-trailer) and we will IMMEDIATELY send you this order with the loading and unloading addresses.', ocultas2: 'No plates, no loading: we notify the warehouses before the truck arrives.', txtSinMatriculas: 'DeCA: Please send us the vehicle registration plates; if we do not receive them, we will understand that the actual carrier manages the DeCA (Spanish administrative control document) under Order FOM/2861/2012, and our company shall be exempt from any liability arising from its issue or omission.', modifSinEmitir: 'Document not yet issued: vehicle registration plates missing', motMatricula: 'Due to truck availability in the area', motTrans: 'Replacement of the actual carrier', motQuitado: 'Actual carrier withdrawn', motRuta: 'As instructed by the customer', motFecha: 'Date change requested by the contracting shipper', modifMercancia: 'Goods changed', motMercancia: 'Goods change requested by the contracting shipper', modifTransAsig: 'Carrier assigned', modifMas: '… and {n} earlier changes',
    decaManual: 'Control document (DeCA) and consignment note (CMR): transport contracted directly between the ordering party and the carrier — handled between the parties. This order includes no digital-signature QR and no CMR filing.',
  },
  pt: {
    titulo: 'ORDEM DE CARGA', subRef: 'Referência do envio', emitida: 'Emitida em',
    copiaConductor: 'CÓPIA DO MOTORISTA', copiaAdmin: 'CÓPIA DA ADMINISTRAÇÃO', sinEco: 'SEM INFORMAÇÃO FINANCEIRA', completa: 'DOCUMENTO COMPLETO',
    
    subConfirmado: 'Serviço de transporte confirmado', origenL: 'Origem', destinoL: 'Destino', salidaL: 'Saída',
    prevalece: 'Em caso de divergência entre versões, prevalece a versão em espanhol.',
    transpRealiza: 'TRANSPORTADOR EFETIVO', transp: 'TRANSPORTADOR', gestionadaPor: 'GERIDA POR', ordenante: 'ORDENANTE',
    pendienteTransp: 'TRANSPORTADOR POR ATRIBUIR', operadorTrafico: 'Operador de tráfego',
    urgencias: 'Urgências e incidências 24 h', operadorAut: 'Operador de transporte autorizado · Alvará',
    nEnvio: 'N.º DE ENVIO', fechaCargaL: 'DATA DE CARGA', matriculasAutL: 'MATRÍCULAS AUTORIZADAS', referenciaL: 'REFERÊNCIA', pendAsignar: 'POR ATRIBUIR',
    recogida: 'RECOLHA', recogidas: 'RECOLHAS', entrega: 'ENTREGA', entregas: 'ENTREGAS',
    secMercancia: 'MERCADORIA E VEÍCULO', secMatr: 'MATRÍCULAS E MOTORISTA', secImporte: 'VALOR', secCond: 'CONDIÇÕES DA ORDEM DE CARGA',
    fecha: 'Data', horario: 'Horário (hora local)', empresa: 'Empresa', direccion: 'Morada', contacto: 'Contacto', referencia: 'Referência',
    tipoSitio: 'Tipo de local', atencion: 'Atenção', indicaciones: 'Indicações',
    estimada: '(estimada)', porConfirmar: 'Por confirmar', consultaDynamo: 'Confirmar com a Dynamo', faltanEmpresa: 'FALTAM DADOS DA EMPRESA / ARMAZÉM',
    citaPrevia: 'Com marcação prévia', sinMedios: 'Sem meios de carga: o camião deve levar plataforma elevatória',
    mercancia: 'Mercadoria', tipoTransporte: 'Tipo de transporte', tipoCarga: 'Tipo de carga', requisitos: 'Requisitos', importante: 'Importante',
    txtImportante: 'O transportador só está autorizado a recolher a mercadoria descrita nesta ordem. Se o carregador quiser carregar outra mercadoria, avise-nos antes para a autorizarmos. Não é permitido o transbordo: se precisar, avise-nos antes para o consultarmos com o cliente.',
    paletizada: 'Paletizada', noPaletizada: 'Não paletizada', bulto: 'volume', bultos: 'volumes', metrosLineales: 'metros lineares',
    rigido: 'Camião rígido com plataforma elevatória', tauliner: 'Reboque tautliner (lona corrediça)', alturaMax: 'altura máxima {m} m',
    cargaCompleta: 'Camião completo (FTL)', rigidoCompleto: 'Rígido completo', grupaje: 'Grupagem', cargaLateral: 'carga lateral', cargaTrasera: 'carga traseira', cargaTecho: 'carga pelo teto',
    requiereNima: 'Requer NIMA', adr: 'MERCADORIA ADR (perigosa)',
    pendMatrEnvia: 'PENDENTE', conductor: 'Motorista', pendComunicar: 'Por comunicar',
    txtSoloMatr: 'Só podem carregar as matrículas autorizadas. Se mudarem, avise-nos antes de chegar à carga.',
    importeL: 'Valor', pendiente: 'Pendente', impuestosNo: '(impostos aplicáveis não incluídos)', formaPago: 'Forma de pagamento',
    txtProntoPago: 'PRONTO PAGAMENTO: transferência a {dias} dias da data da fatura com um desconto de {pct} % (mínimo {min}). Receberá {neto}.',
    txtTransferencia: '**Transferência a {dias} dias** da data da fatura.', facturaL: 'Fatura',
    txtFactura: 'Indique na sua fatura a nossa ==**REFERÊNCIA DE VIAGEM: {ref}.**== Envie a fatura, as guias e os certificados por email para **{email}:** responderemos com um **«RECEBIDO».**',
    txtDiscrecion: 'DISCRIÇÃO COMERCIAL: o cliente solicita que na carga não se informe o destino, nem na entrega a origem.',
    verCondEs: 'Condições da ordem: nas páginas em ESPANHOL deste documento.',
    pagina: 'Página', de: 'de', rango: 'de {a} a {b}',
    qrEscanea: 'Digitalize com o telemóvel', qrPendiente: 'Transporte pendente de atribuição',
    modifTitulo: 'Histórico do documento', modifNinguna: 'Sem modificações desde a emissão', modifRuta: 'Rota alterada', modifFecha: 'Data de carga alterada',
    modifMatricula: 'Troca de matrícula', modifTransQuitado: 'Transportadora retirada', modifTransNuevo: 'Nova transportadora atribuída', modifMatriculaAsig: 'Atribuição de matrículas', modifEmision: 'Emissão do documento', modifMotivo: 'Motivo', modifNuevo: 'Dados novos', modifAnterior: 'Dados anteriores — NÃO VÁLIDOS', motAsig: 'Atribuição inicial, prévia ao início do transporte', motAsigIniciado: 'Atribuição inicial', faltaRemolque: 'Falta a matrícula do semirreboque', ocultasTit: 'MORADAS OCULTAS ATÉ RECEBERMOS AS MATRÍCULAS', ocultas1: 'O envio está CONFIRMADO. Envie-nos as matrículas (trator e semirreboque) e enviamos-lhe DE IMEDIATO esta ordem com as moradas de carga e descarga.', ocultas2: 'Sem matrículas não se carrega: comunicamo-las aos armazéns antes da chegada do camião.', txtSinMatriculas: 'DeCA: Solicitamos que nos indiquem as matrículas do veículo; caso não as recebamos, entenderemos que o transportador efetivo gere o DeCA nos termos da Ordem FOM/2861/2012, ficando a nossa empresa isenta de qualquer responsabilidade decorrente da sua emissão ou omissão.', modifSinEmitir: 'Documento pendente de emissão: faltam as matrículas do veículo', motMatricula: 'Por disponibilidade de camiões na zona', motTrans: 'Substituição do transportador efetivo', motQuitado: 'Retirada do transportador efetivo', motRuta: 'Por indicação do cliente', motFecha: 'Alteração de data indicada pelo carregador contratual', modifMercancia: 'Mercadoria alterada', motMercancia: 'Alteração de mercadoria indicada pelo carregador contratual', modifTransAsig: 'Atribuição de transportadora', modifMas: '… e {n} alterações anteriores',
    decaManual: 'Documento de controlo (DeCA) e guia de transporte (CMR): transporte contratado diretamente entre o ordenante e o transportador — geridos entre as partes. Esta ordem não inclui QR de assinatura digital nem arquivo do CMR.',
  },
  fr: {
    titulo: 'ORDRE DE CHARGEMENT', subRef: 'Référence de l’envoi', emitida: 'Émis le',
    copiaConductor: 'COPIE CONDUCTEUR', copiaAdmin: 'COPIE ADMINISTRATION', sinEco: 'SANS INFORMATION FINANCIÈRE', completa: 'DOCUMENT COMPLET',
    
    subConfirmado: 'Service de transport confirmé', origenL: 'Origine', destinoL: 'Destination', salidaL: 'Départ',
    prevalece: 'En cas de divergence entre versions, la version espagnole prévaut.',
    transpRealiza: 'TRANSPORTEUR EFFECTIF', transp: 'TRANSPORTEUR', gestionadaPor: 'GÉRÉ PAR', ordenante: 'DONNEUR D’ORDRE',
    pendienteTransp: 'TRANSPORTEUR À ASSIGNER', operadorTrafico: 'Exploitant transport',
    urgencias: 'Urgences et incidents 24 h', operadorAut: 'Commissionnaire de transport agréé · Licence',
    nEnvio: 'N° D’ENVOI', fechaCargaL: 'DATE DE CHARGEMENT', matriculasAutL: 'PLAQUES AUTORISÉES', referenciaL: 'RÉFÉRENCE', pendAsignar: 'À ASSIGNER',
    recogida: 'ENLÈVEMENT', recogidas: 'ENLÈVEMENTS', entrega: 'LIVRAISON', entregas: 'LIVRAISONS',
    secMercancia: 'MARCHANDISE ET VÉHICULE', secMatr: 'PLAQUES ET CONDUCTEUR', secImporte: 'MONTANT', secCond: 'CONDITIONS DE L’ORDRE DE CHARGEMENT',
    fecha: 'Date', horario: 'Horaires (heure locale)', empresa: 'Entreprise', direccion: 'Adresse', contacto: 'Contact', referencia: 'Référence',
    tipoSitio: 'Type de site', atencion: 'Attention', indicaciones: 'Consignes',
    estimada: '(estimée)', porConfirmar: 'À confirmer', consultaDynamo: 'Vérifier avec Dynamo', faltanEmpresa: 'DONNÉES ENTREPRISE / ENTREPÔT MANQUANTES',
    citaPrevia: 'Sur rendez-vous', sinMedios: 'Pas de moyens de chargement : le camion doit avoir un hayon élévateur',
    mercancia: 'Marchandise', tipoTransporte: 'Type de transport', tipoCarga: 'Type de chargement', requisitos: 'Exigences', importante: 'Important',
    txtImportante: 'Le transporteur n’est autorisé à enlever que la marchandise décrite dans cet ordre. Si le chargeur veut charger une autre marchandise, prévenez-nous avant pour l’autoriser. Le transbordement est interdit : si vous en avez besoin, prévenez-nous avant pour le voir avec le client.',
    paletizada: 'Palettisée', noPaletizada: 'Non palettisée', bulto: 'colis', bultos: 'colis', metrosLineales: 'mètres de plancher',
    rigido: 'Porteur avec hayon élévateur', tauliner: 'Semi-remorque tautliner (rideaux coulissants)', alturaMax: 'hauteur maximale {m} m',
    cargaCompleta: 'Camion complet (FTL)', rigidoCompleto: 'Porteur complet', grupaje: 'Groupage', cargaLateral: 'chargement latéral', cargaTrasera: 'chargement arrière', cargaTecho: 'chargement par le toit',
    requiereNima: 'NIMA requis', adr: 'MARCHANDISE ADR (dangereuse)',
    pendMatrEnvia: 'EN ATTENTE', conductor: 'Conducteur', pendComunicar: 'À communiquer',
    txtSoloMatr: 'Seules les plaques autorisées peuvent charger. En cas de changement, prévenez-nous avant d’arriver au chargement.',
    importeL: 'Montant', pendiente: 'En attente', impuestosNo: '(taxes applicables non comprises)', formaPago: 'Conditions de paiement',
    txtProntoPago: 'PAIEMENT ANTICIPÉ : virement à {dias} jours de la date de facture avec une remise de {pct} % (minimum {min}). Vous recevrez {neto}.',
    txtTransferencia: '**Virement à {dias} jours** de la date de facture.', facturaL: 'Facture',
    txtFactura: 'Indiquez sur votre facture notre ==**RÉFÉRENCE DE VOYAGE : {ref}.**== Envoyez la facture, les bons de livraison et les certificats par email à **{email}** : nous répondrons par un **« REÇU ».**',
    txtDiscrecion: 'DISCRÉTION COMMERCIALE : le client demande de ne pas révéler la destination au chargement, ni l’origine à la livraison.',
    verCondEs: 'Conditions de l’ordre : voir les pages en ESPAGNOL de ce document.',
    pagina: 'Page', de: 'sur', rango: 'du {a} au {b}',
    qrEscanea: 'Scannez-le avec le téléphone', qrPendiente: 'Transport en attente d\'affectation',
    modifTitulo: 'Historique du document', modifNinguna: 'Aucune modification depuis l’émission', modifRuta: 'Itinéraire modifié', modifFecha: 'Date de chargement déplacée',
    modifMatricula: 'Changement d’immatriculation', modifTransQuitado: 'Transporteur retiré', modifTransNuevo: 'Nouveau transporteur affecté', modifMatriculaAsig: 'Attribution des immatriculations', modifEmision: 'Émission du document', modifMotivo: 'Motif', modifNuevo: 'Nouvelles données', modifAnterior: 'Données précédentes — NON VALABLES', motAsig: 'Attribution initiale, préalable au début du transport', motAsigIniciado: 'Attribution initiale', faltaRemolque: 'Immatriculation de la semi-remorque manquante', ocultasTit: 'ADRESSES MASQUÉES JUSQU’À RÉCEPTION DES IMMATRICULATIONS', ocultas1: 'L’envoi est CONFIRMÉ. Envoyez-nous les immatriculations (tracteur et semi-remorque) et nous vous envoyons IMMÉDIATEMENT cet ordre avec les adresses de chargement et de livraison.', ocultas2: 'Sans immatriculations, pas de chargement : nous les communiquons aux entrepôts avant l’arrivée du camion.', txtSinMatriculas: 'DeCA : Merci de nous communiquer les immatriculations du véhicule ; à défaut, nous considérerons que le transporteur effectif gère le DeCA conformément à l’arrêté FOM/2861/2012, notre société étant dégagée de toute responsabilité découlant de son émission ou de son omission.', modifSinEmitir: 'Document en attente d’émission : immatriculations du véhicule manquantes', motMatricula: 'Selon la disponibilité des camions dans la zone', motTrans: 'Remplacement du transporteur effectif', motQuitado: 'Retrait du transporteur effectif', motRuta: 'Sur indication du client', motFecha: 'Changement de date demandé par le chargeur contractuel', modifMercancia: 'Marchandise modifiée', motMercancia: 'Changement de marchandise demandé par le chargeur contractuel', modifTransAsig: 'Attribution du transporteur', modifMas: '… et {n} modifications antérieures',
    decaManual: 'Document de contrôle (DeCA) et lettre de voiture (CMR) : transport contracté directement entre le donneur d\'ordre et le transporteur — gérés entre les parties. Cet ordre n\'inclut ni QR de signature numérique ni archivage du CMR.',
  },
  de: {
    titulo: 'LADEAUFTRAG', subRef: 'Sendungsreferenz', emitida: 'Ausgestellt am',
    copiaConductor: 'FAHRERKOPIE', copiaAdmin: 'VERWALTUNGSKOPIE', sinEco: 'OHNE FINANZINFORMATIONEN', completa: 'VOLLSTÄNDIGES DOKUMENT',
    
    subConfirmado: 'Bestätigte Transportleistung', origenL: 'Abgangsort', destinoL: 'Zielort', salidaL: 'Abfahrt',
    prevalece: 'Bei Abweichungen zwischen den Fassungen gilt die spanische Fassung.',
    transpRealiza: 'AUSFÜHRENDER FRACHTFÜHRER', transp: 'FRACHTFÜHRER', gestionadaPor: 'VERWALTET VON', ordenante: 'AUFTRAGGEBER',
    pendienteTransp: 'FRACHTFÜHRER NOCH ZUZUWEISEN', operadorTrafico: 'Disponent',
    urgencias: 'Notfälle und Zwischenfälle 24 h', operadorAut: 'Zugelassener Transportoperateur · Lizenz',
    nEnvio: 'SENDUNGS-NR.', fechaCargaL: 'LADEDATUM', matriculasAutL: 'ZUGELASSENE KENNZEICHEN', referenciaL: 'REFERENZ', pendAsignar: 'NOCH ZUZUWEISEN',
    recogida: 'ABHOLUNG', recogidas: 'ABHOLUNGEN', entrega: 'LIEFERUNG', entregas: 'LIEFERUNGEN',
    secMercancia: 'WARE UND FAHRZEUG', secMatr: 'KENNZEICHEN UND FAHRER', secImporte: 'BETRAG', secCond: 'BEDINGUNGEN DES LADEAUFTRAGS',
    fecha: 'Datum', horario: 'Zeiten (Ortszeit)', empresa: 'Firma', direccion: 'Adresse', contacto: 'Kontakt', referencia: 'Referenz',
    tipoSitio: 'Art des Standorts', atencion: 'Achtung', indicaciones: 'Hinweise',
    estimada: '(voraussichtlich)', porConfirmar: 'Noch zu bestätigen', consultaDynamo: 'Mit Dynamo klären', faltanEmpresa: 'FIRMEN-/LAGERDATEN FEHLEN',
    citaPrevia: 'Nur mit Termin', sinMedios: 'Keine Lademittel vor Ort: der Lkw braucht eine Ladebordwand',
    mercancia: 'Ware', tipoTransporte: 'Transportart', tipoCarga: 'Ladungsart', requisitos: 'Anforderungen', importante: 'Wichtig',
    txtImportante: 'Der Frachtführer darf nur die in diesem Auftrag beschriebene Ware übernehmen. Will der Verlader andere Ware laden, informieren Sie uns vorher zur Freigabe. Umladen ist nicht erlaubt: falls nötig, vorher melden, damit wir es mit dem Kunden klären.',
    paletizada: 'Palettiert', noPaletizada: 'Nicht palettiert', bulto: 'Packstück', bultos: 'Packstücke', metrosLineales: 'Lademeter',
    rigido: 'Motorwagen mit Ladebordwand', tauliner: 'Tautliner-Auflieger (Schiebeplane)', alturaMax: 'maximale Höhe {m} m',
    cargaCompleta: 'Komplettladung (FTL)', rigidoCompleto: 'Komplett (Motorwagen)', grupaje: 'Teilladung', cargaLateral: 'Seitenbeladung', cargaTrasera: 'Heckbeladung', cargaTecho: 'Beladung von oben',
    requiereNima: 'NIMA erforderlich', adr: 'ADR-GUT (Gefahrgut)',
    pendMatrEnvia: 'AUSSTEHEND', conductor: 'Fahrer', pendComunicar: 'Noch mitzuteilen',
    txtSoloMatr: 'Nur die zugelassenen Kennzeichen dürfen laden. Bei Änderung informieren Sie uns vor Ankunft an der Ladestelle.',
    importeL: 'Betrag', pendiente: 'Offen', impuestosNo: '(zzgl. anfallender Steuern)', formaPago: 'Zahlungsbedingungen',
    txtProntoPago: 'SKONTO: Überweisung {dias} Tage ab Rechnungsdatum mit {pct} % Abzug (mindestens {min}). Sie erhalten {neto}.',
    txtTransferencia: '**Überweisung {dias} Tage** ab Rechnungsdatum.', facturaL: 'Rechnung',
    txtFactura: 'Geben Sie auf Ihrer Rechnung unsere ==**FAHRTREFERENZ**== an: ==**{ref}.**== Senden Sie Rechnung, Lieferscheine und Nachweise per E-Mail an **{email}:** wir antworten mit **„ERHALTEN“.**',
    txtDiscrecion: 'VERTRAULICHKEIT: Der Kunde bittet darum, beim Laden das Ziel und bei der Lieferung die Herkunft nicht zu nennen.',
    verCondEs: 'Auftragsbedingungen: siehe die SPANISCHEN Seiten dieses Dokuments.',
    pagina: 'Seite', de: 'von', rango: '{a} – {b}',
    qrEscanea: 'Mit dem Handy scannen', qrPendiente: 'Transport noch nicht zugewiesen',
    modifTitulo: 'Dokumentverlauf', modifNinguna: 'Keine Änderungen seit der Ausstellung', modifRuta: 'Route geändert', modifFecha: 'Ladedatum verschoben',
    modifMatricula: 'Kennzeichenwechsel', modifTransQuitado: 'Frachtführer entfernt', modifTransNuevo: 'Neuer Frachtführer zugewiesen', modifMatriculaAsig: 'Kennzeichen zugewiesen', modifEmision: 'Ausstellung des Dokuments', modifMotivo: 'Grund', modifNuevo: 'Neue Daten', modifAnterior: 'Frühere Daten — NICHT MEHR GÜLTIG', motAsig: 'Erstzuweisung vor Beginn des Transports', motAsigIniciado: 'Erstzuweisung', faltaRemolque: 'Kennzeichen des Aufliegers fehlt', ocultasTit: 'ADRESSEN VERBORGEN, BIS WIR DIE KENNZEICHEN ERHALTEN', ocultas1: 'Der Transport ist BESTÄTIGT. Senden Sie uns die Kennzeichen (Zugmaschine und Auflieger), und wir schicken Ihnen SOFORT diesen Auftrag mit den Lade- und Entladeadressen.', ocultas2: 'Ohne Kennzeichen keine Beladung: Wir melden sie den Lagern, bevor der Lkw ankommt.', txtSinMatriculas: 'DeCA: Bitte teilen Sie uns die Kennzeichen des Fahrzeugs mit; andernfalls gehen wir davon aus, dass der ausführende Frachtführer das DeCA gemäß der Verordnung FOM/2861/2012 selbst führt, und unser Unternehmen ist von jeder Haftung für dessen Ausstellung oder Unterlassung befreit.', modifSinEmitir: 'Dokument noch nicht ausgestellt: Fahrzeugkennzeichen fehlen', motMatricula: 'Wegen der Lkw-Verfügbarkeit in der Region', motTrans: 'Austausch des ausführenden Frachtführers', motQuitado: 'Ausführender Frachtführer zurückgezogen', motRuta: 'Auf Anweisung des Kunden', motFecha: 'Terminänderung auf Anweisung des Auftraggebers', modifMercancia: 'Ware geändert', motMercancia: 'Warenänderung auf Anweisung des Auftraggebers', modifTransAsig: 'Frachtführer zugewiesen', modifMas: '… und {n} frühere Änderungen',
    decaManual: 'Kontrolldokument (DeCA) und Frachtbrief (CMR): Transport direkt zwischen Auftraggeber und Frachtführer vereinbart — beides regeln die Parteien untereinander. Dieser Auftrag enthält keinen QR zur digitalen Unterschrift und kein CMR-Archiv.',
  },
  it: {
    titulo: 'ORDINE DI CARICO', subRef: 'Riferimento spedizione', emitida: 'Emesso il',
    copiaConductor: 'COPIA AUTISTA', copiaAdmin: 'COPIA AMMINISTRAZIONE', sinEco: 'SENZA INFORMAZIONI ECONOMICHE', completa: 'DOCUMENTO COMPLETO',
    
    subConfirmado: 'Servizio di trasporto confermato', origenL: 'Origine', destinoL: 'Destinazione', salidaL: 'Partenza',
    prevalece: 'In caso di discrepanza tra le versioni, prevale la versione spagnola.',
    transpRealiza: 'VETTORE EFFETTIVO', transp: 'TRASPORTATORE', gestionadaPor: 'GESTITO DA', ordenante: 'COMMITTENTE',
    pendienteTransp: 'TRASPORTATORE DA ASSEGNARE', operadorTrafico: 'Operatore del traffico',
    urgencias: 'Urgenze e incidenti 24 h', operadorAut: 'Operatore di trasporto autorizzato · Licenza',
    nEnvio: 'N. SPEDIZIONE', fechaCargaL: 'DATA DI CARICO', matriculasAutL: 'TARGHE AUTORIZZATE', referenciaL: 'RIFERIMENTO', pendAsignar: 'DA ASSEGNARE',
    recogida: 'RITIRO', recogidas: 'RITIRI', entrega: 'CONSEGNA', entregas: 'CONSEGNE',
    secMercancia: 'MERCE E VEICOLO', secMatr: 'TARGHE E AUTISTA', secImporte: 'IMPORTO', secCond: 'CONDIZIONI DELL’ORDINE DI CARICO',
    fecha: 'Data', horario: 'Orari (ora locale)', empresa: 'Azienda', direccion: 'Indirizzo', contacto: 'Contatto', referencia: 'Riferimento',
    tipoSitio: 'Tipo di sito', atencion: 'Attenzione', indicaciones: 'Indicazioni',
    estimada: '(stimata)', porConfirmar: 'Da confermare', consultaDynamo: 'Verificare con Dynamo', faltanEmpresa: 'MANCANO I DATI AZIENDA / MAGAZZINO',
    citaPrevia: 'Su appuntamento', sinMedios: 'Senza mezzi di carico: il camion deve avere la sponda idraulica',
    mercancia: 'Merce', tipoTransporte: 'Tipo di trasporto', tipoCarga: 'Tipo di carico', requisitos: 'Requisiti', importante: 'Importante',
    txtImportante: 'Il trasportatore è autorizzato a ritirare solo la merce descritta in questo ordine. Se il caricatore vuole caricare altra merce, avvisaci prima per autorizzarla. Il trasbordo non è consentito: se ti serve, avvisaci prima per verificarlo con il cliente.',
    paletizada: 'Pallettizzata', noPaletizada: 'Non pallettizzata', bulto: 'collo', bultos: 'colli', metrosLineales: 'metri lineari',
    rigido: 'Motrice con sponda idraulica', tauliner: 'Semirimorchio tautliner (telone scorrevole)', alturaMax: 'altezza massima {m} m',
    cargaCompleta: 'Carico completo (FTL)', rigidoCompleto: 'Motrice completa', grupaje: 'Groupage', cargaLateral: 'carico laterale', cargaTrasera: 'carico posteriore', cargaTecho: 'carico dall’alto',
    requiereNima: 'NIMA richiesto', adr: 'MERCE ADR (pericolosa)',
    pendMatrEnvia: 'IN SOSPESO', conductor: 'Autista', pendComunicar: 'Da comunicare',
    txtSoloMatr: 'Possono caricare solo le targhe autorizzate. Se cambiano, avvisaci prima di arrivare al carico.',
    importeL: 'Importo', pendiente: 'In attesa', impuestosNo: '(imposte applicabili escluse)', formaPago: 'Condizioni di pagamento',
    txtProntoPago: 'PAGAMENTO ANTICIPATO: bonifico a {dias} giorni dalla data fattura con uno sconto del {pct} % (minimo {min}). Riceverai {neto}.',
    txtTransferencia: '**Bonifico a {dias} giorni** dalla data fattura.', facturaL: 'Fattura',
    txtFactura: 'Indica in fattura il nostro ==**RIFERIMENTO VIAGGIO: {ref}.**== Invia fattura, bolle e certificati via email a **{email}:** risponderemo con un **«RICEVUTO».**',
    txtDiscrecion: 'RISERVATEZZA COMMERCIALE: il cliente chiede di non rivelare la destinazione al carico, né l’origine alla consegna.',
    verCondEs: 'Condizioni dell’ordine: nelle pagine in SPAGNOLO di questo documento.',
    pagina: 'Pagina', de: 'di', rango: 'dal {a} al {b}',
    qrEscanea: 'Scansionalo con il cellulare', qrPendiente: 'Trasporto in attesa di assegnazione',
    modifTitulo: 'Cronologia del documento', modifNinguna: 'Nessuna modifica dall’emissione', modifRuta: 'Percorso modificato', modifFecha: 'Data di carico spostata',
    modifMatricula: 'Cambio targa', modifTransQuitado: 'Vettore rimosso', modifTransNuevo: 'Nuovo vettore assegnato', modifMatriculaAsig: 'Assegnazione targhe', modifEmision: 'Emissione del documento', modifMotivo: 'Motivo', modifNuevo: 'Nuovi dati', modifAnterior: 'Dati precedenti — NON PIÙ VALIDI', motAsig: 'Assegnazione iniziale, precedente all’inizio del trasporto', motAsigIniciado: 'Assegnazione iniziale', faltaRemolque: 'Manca la targa del semirimorchio', ocultasTit: 'INDIRIZZI NASCOSTI FINO AL RICEVIMENTO DELLE TARGHE', ocultas1: 'La spedizione è CONFERMATA. Inviateci le targhe (trattore e semirimorchio) e vi invieremo SUBITO questo ordine con gli indirizzi di carico e scarico.', ocultas2: 'Senza targhe non si carica: le comunichiamo ai magazzini prima dell’arrivo del camion.', txtSinMatriculas: 'DeCA: Vi preghiamo di comunicarci le targhe del veicolo; in mancanza, riterremo che il vettore effettivo gestisca il DeCA ai sensi dell’Ordinanza FOM/2861/2012, restando la nostra società esente da qualsiasi responsabilità derivante dalla sua emissione od omissione.', modifSinEmitir: 'Documento in attesa di emissione: mancano le targhe del veicolo', motMatricula: 'Per disponibilità di camion nella zona', motTrans: 'Sostituzione del vettore effettivo', motQuitado: 'Ritiro del vettore effettivo', motRuta: 'Su indicazione del cliente', motFecha: 'Cambio di data richiesto dal caricatore contrattuale', modifMercancia: 'Merce modificata', motMercancia: 'Cambio di merce richiesto dal caricatore contrattuale', modifTransAsig: 'Assegnazione vettore', modifMas: '… e {n} modifiche precedenti',
    decaManual: 'Documento di controllo (DeCA) e lettera di vettura (CMR): trasporto contrattato direttamente tra committente e vettore — gestiti tra le parti. Quest\'ordine non include QR di firma digitale né archiviazione del CMR.',
  },
  nl: {
    titulo: 'LAADOPDRACHT', subRef: 'Zendingsreferentie', emitida: 'Uitgegeven op',
    copiaConductor: 'KOPIE CHAUFFEUR', copiaAdmin: 'KOPIE ADMINISTRATIE', sinEco: 'ZONDER FINANCIËLE INFORMATIE', completa: 'VOLLEDIG DOCUMENT',
    
    subConfirmado: 'Bevestigde transportdienst', origenL: 'Herkomst', destinoL: 'Bestemming', salidaL: 'Vertrek',
    prevalece: 'Bij verschillen tussen versies geldt de Spaanse versie.',
    transpRealiza: 'FEITELIJKE VERVOERDER', transp: 'VERVOERDER', gestionadaPor: 'BEHEERD DOOR', ordenante: 'OPDRACHTGEVER',
    pendienteTransp: 'VERVOERDER NOG TOE TE WIJZEN', operadorTrafico: 'Planner',
    urgencias: 'Spoed en incidenten 24 u', operadorAut: 'Erkend vervoersoperator · Vergunning',
    nEnvio: 'ZENDINGSNR.', fechaCargaL: 'LAADDATUM', matriculasAutL: 'TOEGELATEN KENTEKENS', referenciaL: 'REFERENTIE', pendAsignar: 'NOG TOE TE WIJZEN',
    recogida: 'OPHALING', recogidas: 'OPHALINGEN', entrega: 'LEVERING', entregas: 'LEVERINGEN',
    secMercancia: 'GOEDEREN EN VOERTUIG', secMatr: 'KENTEKENS EN CHAUFFEUR', secImporte: 'BEDRAG', secCond: 'VOORWAARDEN VAN DE LAADOPDRACHT',
    fecha: 'Datum', horario: 'Tijden (lokale tijd)', empresa: 'Bedrijf', direccion: 'Adres', contacto: 'Contact', referencia: 'Referentie',
    tipoSitio: 'Type locatie', atencion: 'Let op', indicaciones: 'Aanwijzingen',
    estimada: '(geschat)', porConfirmar: 'Nog te bevestigen', consultaDynamo: 'Met Dynamo afstemmen', faltanEmpresa: 'BEDRIJFS-/MAGAZIJNGEGEVENS ONTBREKEN',
    citaPrevia: 'Op afspraak', sinMedios: 'Geen laadmiddelen aanwezig: de vrachtwagen moet een laadklep hebben',
    mercancia: 'Goederen', tipoTransporte: 'Type vervoer', tipoCarga: 'Type lading', requisitos: 'Vereisten', importante: 'Belangrijk',
    txtImportante: 'De vervoerder mag alleen de in deze opdracht beschreven goederen ophalen. Wil de verlader andere goederen laden, meld het ons vooraf voor toestemming. Overladen is niet toegestaan: indien nodig, meld het vooraf zodat wij het met de klant afstemmen.',
    paletizada: 'Gepalletiseerd', noPaletizada: 'Niet gepalletiseerd', bulto: 'collo', bultos: 'colli', metrosLineales: 'laadmeters',
    rigido: 'Bakwagen met laadklep', tauliner: 'Tautliner-oplegger (schuifzeil)', alturaMax: 'maximale hoogte {m} m',
    cargaCompleta: 'Volle lading (FTL)', rigidoCompleto: 'Volle bakwagen', grupaje: 'Groupage', cargaLateral: 'zijlading', cargaTrasera: 'achterlading', cargaTecho: 'lading via het dak',
    requiereNima: 'NIMA vereist', adr: 'ADR-GOEDEREN (gevaarlijk)',
    pendMatrEnvia: 'IN AFWACHTING', conductor: 'Chauffeur', pendComunicar: 'Nog mee te delen',
    txtSoloMatr: 'Alleen de toegelaten kentekens mogen laden. Bij wijziging, meld het ons vóór aankomst op de laadplaats.',
    importeL: 'Bedrag', pendiente: 'In afwachting', impuestosNo: '(toepasselijke belastingen niet inbegrepen)', formaPago: 'Betalingsvoorwaarden',
    txtProntoPago: 'SNELLE BETALING: overschrijving {dias} dagen na factuurdatum met {pct} % korting (minimaal {min}). U ontvangt {neto}.',
    txtTransferencia: '**Overschrijving {dias} dagen** na factuurdatum.', facturaL: 'Factuur',
    txtFactura: 'Vermeld op uw factuur onze ==**RITREFERENTIE: {ref}.**== Stuur factuur, vrachtbrieven en certificaten per e-mail naar **{email}:** wij antwoorden met **«ONTVANGEN».**',
    txtDiscrecion: 'COMMERCIËLE DISCRETIE: de klant verzoekt bij het laden de bestemming niet te melden, noch de herkomst bij levering.',
    verCondEs: 'Voorwaarden van de opdracht: zie de SPAANSE pagina’s van dit document.',
    pagina: 'Pagina', de: 'van', rango: '{a} – {b}',
    qrEscanea: 'Scan met je telefoon', qrPendiente: 'Transport nog toe te wijzen',
    modifTitulo: 'Documentgeschiedenis', modifNinguna: 'Geen wijzigingen sinds uitgifte', modifRuta: 'Route gewijzigd', modifFecha: 'Laaddatum verplaatst',
    modifMatricula: 'Kentekenwijziging', modifTransQuitado: 'Vervoerder verwijderd', modifTransNuevo: 'Nieuwe vervoerder toegewezen', modifMatriculaAsig: 'Kentekens toegewezen', modifEmision: 'Uitgifte van het document', modifMotivo: 'Reden', modifNuevo: 'Nieuwe gegevens', modifAnterior: 'Vorige gegevens — NIET MEER GELDIG', motAsig: 'Eerste toewijzing, vóór aanvang van het transport', motAsigIniciado: 'Eerste toewijzing', faltaRemolque: 'Kenteken van de oplegger ontbreekt', ocultasTit: 'ADRESSEN VERBORGEN TOT WE DE KENTEKENS ONTVANGEN', ocultas1: 'De zending is BEVESTIGD. Stuur ons de kentekens (trekker en oplegger) en we sturen u METEEN deze opdracht met de laad- en losadressen.', ocultas2: 'Geen kentekens, geen lading: we geven ze door aan de magazijnen voordat de vrachtwagen aankomt.', txtSinMatriculas: 'DeCA: Wij verzoeken u ons de kentekens van het voertuig door te geven; ontvangen wij deze niet, dan gaan wij ervan uit dat de feitelijke vervoerder het DeCA beheert overeenkomstig Order FOM/2861/2012, en is ons bedrijf vrijgesteld van elke aansprakelijkheid voor de afgifte of het ontbreken ervan.', modifSinEmitir: 'Document nog niet afgegeven: kentekens van het voertuig ontbreken', motMatricula: 'Wegens beschikbaarheid van vrachtwagens in de regio', motTrans: 'Vervanging van de feitelijke vervoerder', motQuitado: 'Feitelijke vervoerder teruggetrokken', motRuta: 'Op aanwijzing van de klant', motFecha: 'Datumwijziging op verzoek van de contractuele verlader', modifMercancia: 'Goederen gewijzigd', motMercancia: 'Goederenwijziging op verzoek van de contractuele verlader', modifTransAsig: 'Vervoerder toegewezen', modifMas: '… en {n} eerdere wijzigingen',
    decaManual: 'Controledocument (DeCA) en vrachtbrief (CMR): vervoer rechtstreeks overeengekomen tussen opdrachtgever en vervoerder — onderling te regelen. Deze opdracht bevat geen QR voor digitale ondertekening en geen CMR-archief.',
  },
  pl: {
    titulo: 'ZLECENIE TRANSPORTOWE', subRef: 'Numer referencyjny przewozu', emitida: 'Wystawiono',
    copiaConductor: 'KOPIA DLA KIEROWCY', copiaAdmin: 'KOPIA DLA ADMINISTRACJI', sinEco: 'BEZ INFORMACJI FINANSOWYCH', completa: 'PEŁNY DOKUMENT',
    
    subConfirmado: 'Potwierdzona usługa transportowa', origenL: 'Miejsce nadania', destinoL: 'Miejsce przeznaczenia', salidaL: 'Wyjazd',
    prevalece: 'W razie rozbieżności między wersjami obowiązuje wersja hiszpańska.',
    transpRealiza: 'PRZEWOŹNIK FAKTYCZNY', transp: 'PRZEWOŹNIK', gestionadaPor: 'ZARZĄDZANE PRZEZ', ordenante: 'ZLECENIODAWCA',
    pendienteTransp: 'PRZEWOŹNIK DO PRZYDZIELENIA', operadorTrafico: 'Spedytor',
    urgencias: 'Nagłe przypadki i incydenty 24 h', operadorAut: 'Licencjonowany operator transportu · Licencja',
    nEnvio: 'NR PRZESYŁKI', fechaCargaL: 'DATA ZAŁADUNKU', matriculasAutL: 'AUTORYZOWANE NR REJESTRACYJNE', referenciaL: 'REFERENCJA', pendAsignar: 'DO PRZYDZIELENIA',
    recogida: 'ZAŁADUNEK', recogidas: 'ZAŁADUNKI', entrega: 'ROZŁADUNEK', entregas: 'ROZŁADUNKI',
    secMercancia: 'TOWAR I POJAZD', secMatr: 'NR REJESTRACYJNE I KIEROWCA', secImporte: 'STAWKA', secCond: 'WARUNKI ZLECENIA TRANSPORTOWEGO',
    fecha: 'Data', horario: 'Godziny (czas lokalny)', empresa: 'Firma', direccion: 'Adres', contacto: 'Kontakt', referencia: 'Referencja',
    tipoSitio: 'Rodzaj miejsca', atencion: 'Uwaga', indicaciones: 'Wskazówki',
    estimada: '(szacowana)', porConfirmar: 'Do potwierdzenia', consultaDynamo: 'Skonsultować z Dynamo', faltanEmpresa: 'BRAK DANYCH FIRMY / MAGAZYNU',
    citaPrevia: 'Po wcześniejszym umówieniu', sinMedios: 'Brak środków załadunku: pojazd musi mieć windę załadowczą',
    mercancia: 'Towar', tipoTransporte: 'Rodzaj transportu', tipoCarga: 'Rodzaj ładunku', requisitos: 'Wymagania', importante: 'Ważne',
    txtImportante: 'Przewoźnik jest upoważniony do odbioru wyłącznie towaru opisanego w niniejszym zleceniu. Jeżeli załadowca chce załadować inny towar, należy nas wcześniej powiadomić w celu uzyskania zgody. Przeładunek jest niedozwolony: jeżeli okaże się konieczny, należy nas wcześniej powiadomić w celu uzgodnienia z klientem.',
    paletizada: 'Paletyzowany', noPaletizada: 'Niepaletyzowany', bulto: 'sztuka', bultos: 'sztuk', metrosLineales: 'metrów ładownych',
    rigido: 'Pojazd z windą załadowczą', tauliner: 'Naczepa typu firanka (tautliner)', alturaMax: 'maksymalna wysokość {m} m',
    cargaCompleta: 'Ładunek całopojazdowy (FTL)', rigidoCompleto: 'Pojazd solo (pełny)', grupaje: 'Drobnica', cargaLateral: 'załadunek boczny', cargaTrasera: 'załadunek tylny', cargaTecho: 'załadunek od góry',
    requiereNima: 'Wymagany NIMA', adr: 'TOWAR ADR (niebezpieczny)',
    pendMatrEnvia: 'OCZEKUJE', conductor: 'Kierowca', pendComunicar: 'Do przekazania',
    txtSoloMatr: 'Ładować mogą wyłącznie autoryzowane numery rejestracyjne. Każdą zmianę należy zgłosić przed przyjazdem na załadunek.',
    importeL: 'Stawka', pendiente: 'Oczekuje', impuestosNo: '(bez obowiązujących podatków)', formaPago: 'Warunki płatności',
    txtProntoPago: 'SZYBKA PŁATNOŚĆ: przelew {dias} dni od daty faktury z rabatem {pct} % (minimum {min}). Otrzymasz {neto}.',
    txtTransferencia: '**Przelew {dias} dni** od daty faktury.', facturaL: 'Faktura',
    txtFactura: 'Na fakturze należy podać naszą ==**REFERENCJĘ PRZEWOZU: {ref}.**== Fakturę, dokumenty dostawy i certyfikaty prosimy przesłać e-mailem na **{email}:** odpowiemy **«OTRZYMANO».**',
    txtDiscrecion: 'DYSKRECJA HANDLOWA: klient prosi, aby przy załadunku nie ujawniać miejsca przeznaczenia, a przy rozładunku miejsca pochodzenia.',
    verCondEs: 'Warunki zlecenia: na stronach w języku HISZPAŃSKIM tego dokumentu.',
    pagina: 'Strona', de: 'z', rango: '{a} – {b}',
    qrEscanea: 'Zeskanuj telefonem', qrPendiente: 'Transport oczekuje na przydział',
    modifTitulo: 'Historia dokumentu', modifNinguna: 'Bez zmian od wystawienia', modifRuta: 'Zmieniona trasa', modifFecha: 'Przesunięta data załadunku',
    modifMatricula: 'Zmiana rejestracji', modifTransQuitado: 'Przewoźnik usunięty', modifTransNuevo: 'Przydzielony nowy przewoźnik', modifMatriculaAsig: 'Przypisanie numerów rejestracyjnych', modifEmision: 'Wystawienie dokumentu', modifMotivo: 'Powód', modifNuevo: 'Nowe dane', modifAnterior: 'Poprzednie dane — NIEWAŻNE', motAsig: 'Pierwsze przypisanie, przed rozpoczęciem przewozu', motAsigIniciado: 'Pierwsze przypisanie', faltaRemolque: 'Brak numeru rejestracyjnego naczepy', ocultasTit: 'ADRESY UKRYTE DO CZASU OTRZYMANIA NUMERÓW REJESTRACYJNYCH', ocultas1: 'Przesyłka jest POTWIERDZONA. Prześlij nam numery rejestracyjne (ciągnik i naczepa), a NATYCHMIAST wyślemy to zlecenie z adresami załadunku i rozładunku.', ocultas2: 'Bez numerów rejestracyjnych nie ma załadunku: przekazujemy je magazynom przed przyjazdem ciężarówki.', txtSinMatriculas: 'DeCA: Prosimy o podanie numerów rejestracyjnych pojazdu; w razie ich nieotrzymania uznamy, że przewoźnik faktyczny prowadzi DeCA zgodnie z rozporządzeniem FOM/2861/2012, a nasza firma jest zwolniona z wszelkiej odpowiedzialności wynikającej z jego wystawienia lub braku.', modifSinEmitir: 'Dokument oczekuje na wystawienie: brak numerów rejestracyjnych pojazdu', motMatricula: 'Ze względu na dostępność ciężarówek w okolicy', motTrans: 'Zmiana przewoźnika faktycznego', motQuitado: 'Wycofanie przewoźnika faktycznego', motRuta: 'Na polecenie klienta', motFecha: 'Zmiana daty na polecenie załadowcy umownego', modifMercancia: 'Zmieniony towar', motMercancia: 'Zmiana towaru na polecenie załadowcy umownego', modifTransAsig: 'Przypisanie przewoźnika', modifMas: '… i {n} wcześniejszych zmian',
    decaManual: 'Dokument kontrolny (DeCA) i list przewozowy (CMR): transport zakontraktowany bezpośrednio między zleceniodawcą a przewoźnikiem — strony załatwiają je między sobą. To zlecenie nie zawiera kodu QR do podpisu cyfrowego ani archiwum CMR.',
  },
  cs: {
    titulo: 'NAKLÁDKOVÝ PŘÍKAZ', subRef: 'Referenční číslo zásilky', emitida: 'Vystaveno',
    copiaConductor: 'KOPIE PRO ŘIDIČE', copiaAdmin: 'KOPIE PRO ADMINISTRATIVU', sinEco: 'BEZ FINANČNÍCH INFORMACÍ', completa: 'ÚPLNÝ DOKUMENT',
    
    subConfirmado: 'Potvrzená přepravní služba', origenL: 'Místo odeslání', destinoL: 'Místo určení', salidaL: 'Odjezd',
    prevalece: 'V případě rozporu mezi verzemi platí španělská verze.',
    transpRealiza: 'SKUTEČNÝ DOPRAVCE', transp: 'DOPRAVCE', gestionadaPor: 'SPRAVUJE', ordenante: 'OBJEDNATEL',
    pendienteTransp: 'DOPRAVCE BUDE PŘIDĚLEN', operadorTrafico: 'Dispečer',
    urgencias: 'Pohotovost a incidenty 24 h', operadorAut: 'Licencovaný operátor dopravy · Licence',
    nEnvio: 'Č. ZÁSILKY', fechaCargaL: 'DATUM NAKLÁDKY', matriculasAutL: 'POVOLENÉ SPZ', referenciaL: 'REFERENCE', pendAsignar: 'BUDE PŘIDĚLENO',
    recogida: 'NAKLÁDKA', recogidas: 'NAKLÁDKY', entrega: 'VYKLÁDKA', entregas: 'VYKLÁDKY',
    secMercancia: 'ZBOŽÍ A VOZIDLO', secMatr: 'SPZ A ŘIDIČ', secImporte: 'CENA', secCond: 'PODMÍNKY NAKLÁDKOVÉHO PŘÍKAZU',
    fecha: 'Datum', horario: 'Hodiny (místní čas)', empresa: 'Firma', direccion: 'Adresa', contacto: 'Kontakt', referencia: 'Reference',
    tipoSitio: 'Typ místa', atencion: 'Pozor', indicaciones: 'Pokyny',
    estimada: '(odhad)', porConfirmar: 'Bude potvrzeno', consultaDynamo: 'Ověřit s Dynamo', faltanEmpresa: 'CHYBÍ ÚDAJE FIRMY / SKLADU',
    citaPrevia: 'Po předchozí domluvě', sinMedios: 'Bez nakládací techniky: vozidlo musí mít hydraulické čelo',
    mercancia: 'Zboží', tipoTransporte: 'Druh dopravy', tipoCarga: 'Druh nákladu', requisitos: 'Požadavky', importante: 'Důležité',
    txtImportante: 'Dopravce je oprávněn převzít pouze zboží popsané v tomto příkazu. Chce-li nakládající naložit jiné zboží, informujte nás předem kvůli schválení. Překládka není povolena: pokud ji potřebujete, informujte nás předem, abychom ji projednali se zákazníkem.',
    paletizada: 'Paletizované', noPaletizada: 'Nepaletizované', bulto: 'kus', bultos: 'kusů', metrosLineales: 'ložných metrů',
    rigido: 'Vozidlo s hydraulickým čelem', tauliner: 'Návěs tautliner (shrnovací plachta)', alturaMax: 'maximální výška {m} m',
    cargaCompleta: 'Celovozová přeprava (FTL)', rigidoCompleto: 'Celé sólo vozidlo', grupaje: 'Dokládka', cargaLateral: 'boční nakládka', cargaTrasera: 'zadní nakládka', cargaTecho: 'nakládka shora',
    requiereNima: 'Vyžadováno NIMA', adr: 'ZBOŽÍ ADR (nebezpečné)',
    pendMatrEnvia: 'ČEKÁ SE', conductor: 'Řidič', pendComunicar: 'Bude sděleno',
    txtSoloMatr: 'Nakládat smí pouze povolené SPZ. Při změně nás informujte před příjezdem na nakládku.',
    importeL: 'Cena', pendiente: 'Čeká', impuestosNo: '(bez příslušných daní)', formaPago: 'Platební podmínky',
    txtProntoPago: 'RYCHLÁ PLATBA: převod {dias} dní od data faktury se slevou {pct} % (minimálně {min}). Obdržíte {neto}.',
    txtTransferencia: '**Převod {dias} dní** od data faktury.', facturaL: 'Faktura',
    txtFactura: 'Na faktuře uveďte naši ==**REFERENCI JÍZDY: {ref}.**== Fakturu, dodací listy a certifikáty zašlete e-mailem na **{email}:** odpovíme **«PŘIJATO».**',
    txtDiscrecion: 'OBCHODNÍ DISKRÉTNOST: zákazník žádá, aby se při nakládce nesdělovalo místo určení a při vykládce místo původu.',
    verCondEs: 'Podmínky příkazu: na ŠPANĚLSKÝCH stránkách tohoto dokumentu.',
    pagina: 'Strana', de: 'z', rango: '{a} – {b}',
    qrEscanea: 'Naskenujte telefonem', qrPendiente: 'Doprava čeká na přidělení',
    modifTitulo: 'Historie dokumentu', modifNinguna: 'Beze změn od vystavení', modifRuta: 'Změněná trasa', modifFecha: 'Posunuté datum nakládky',
    modifMatricula: 'Změna SPZ', modifTransQuitado: 'Dopravce odebrán', modifTransNuevo: 'Přidělen nový dopravce', modifMatriculaAsig: 'Přidělení SPZ', modifEmision: 'Vystavení dokumentu', modifMotivo: 'Důvod', modifNuevo: 'Nové údaje', modifAnterior: 'Předchozí údaje — NEPLATNÉ', motAsig: 'První přiřazení, před zahájením přepravy', motAsigIniciado: 'První přiřazení', faltaRemolque: 'Chybí SPZ návěsu', ocultasTit: 'ADRESY SKRYTY, DOKUD NEOBDRŽÍME SPZ', ocultas1: 'Zásilka je POTVRZENA. Pošlete nám SPZ (tahač a návěs) a OKAMŽITĚ vám pošleme tento příkaz s adresami nakládky a vykládky.', ocultas2: 'Bez SPZ se nenakládá: sdělujeme je skladům před příjezdem kamionu.', txtSinMatriculas: 'DeCA: Prosíme o sdělení SPZ vozidla; pokud je neobdržíme, budeme mít za to, že skutečný dopravce vede DeCA v souladu s nařízením FOM/2861/2012, a naše společnost je zproštěna jakékoli odpovědnosti vyplývající z jeho vystavení nebo opomenutí.', modifSinEmitir: 'Dokument čeká na vystavení: chybí SPZ vozidla', motMatricula: 'Podle dostupnosti nákladních vozidel v oblasti', motTrans: 'Výměna skutečného dopravce', motQuitado: 'Odvolání skutečného dopravce', motRuta: 'Na pokyn zákazníka', motFecha: 'Změna data na pokyn smluvního odesílatele', modifMercancia: 'Změněné zboží', motMercancia: 'Změna zboží na pokyn smluvního odesílatele', modifTransAsig: 'Přidělení dopravce', modifMas: '… a {n} dřívějších změn',
    decaManual: 'Kontrolní dokument (DeCA) a nákladní list (CMR): přeprava sjednána přímo mezi objednatelem a dopravcem — řeší se mezi stranami. Tato objednávka neobsahuje QR pro digitální podpis ani archiv CMR.',
  },
  ro: {
    titulo: 'COMANDĂ DE ÎNCĂRCARE', subRef: 'Referința expedierii', emitida: 'Emisă la',
    copiaConductor: 'COPIE ȘOFER', copiaAdmin: 'COPIE ADMINISTRAȚIE', sinEco: 'FĂRĂ INFORMAȚII FINANCIARE', completa: 'DOCUMENT COMPLET',
    
    subConfirmado: 'Serviciu de transport confirmat', origenL: 'Origine', destinoL: 'Destinație', salidaL: 'Plecare',
    prevalece: 'În caz de neconcordanță între versiuni, prevalează versiunea în spaniolă.',
    transpRealiza: 'TRANSPORTATOR EFECTIV', transp: 'TRANSPORTATOR', gestionadaPor: 'GESTIONATĂ DE', ordenante: 'ORDONATOR',
    pendienteTransp: 'TRANSPORTATOR DE ALOCAT', operadorTrafico: 'Operator de trafic',
    urgencias: 'Urgențe și incidente 24 h', operadorAut: 'Operator de transport autorizat · Licență',
    nEnvio: 'NR. EXPEDIERE', fechaCargaL: 'DATA ÎNCĂRCĂRII', matriculasAutL: 'NUMERE AUTORIZATE', referenciaL: 'REFERINȚĂ', pendAsignar: 'DE ALOCAT',
    recogida: 'ÎNCĂRCARE', recogidas: 'ÎNCĂRCĂRI', entrega: 'LIVRARE', entregas: 'LIVRĂRI',
    secMercancia: 'MARFĂ ȘI VEHICUL', secMatr: 'NUMERE ȘI ȘOFER', secImporte: 'SUMĂ', secCond: 'CONDIȚIILE COMENZII DE ÎNCĂRCARE',
    fecha: 'Data', horario: 'Program (ora locală)', empresa: 'Firmă', direccion: 'Adresă', contacto: 'Contact', referencia: 'Referință',
    tipoSitio: 'Tip de locație', atencion: 'Atenție', indicaciones: 'Indicații',
    estimada: '(estimată)', porConfirmar: 'De confirmat', consultaDynamo: 'Verificați cu Dynamo', faltanEmpresa: 'LIPSESC DATELE FIRMEI / DEPOZITULUI',
    citaPrevia: 'Cu programare', sinMedios: 'Fără mijloace de încărcare: camionul trebuie să aibă lift hidraulic',
    mercancia: 'Marfă', tipoTransporte: 'Tip de transport', tipoCarga: 'Tip de încărcătură', requisitos: 'Cerințe', importante: 'Important',
    txtImportante: 'Transportatorul este autorizat să ridice doar marfa descrisă în această comandă. Dacă încărcătorul vrea să încarce altă marfă, anunțați-ne înainte pentru autorizare. Transbordarea nu este permisă: dacă este necesară, anunțați-ne înainte pentru a o verifica cu clientul.',
    paletizada: 'Paletizată', noPaletizada: 'Nepaletizată', bulto: 'colet', bultos: 'colete', metrosLineales: 'metri liniari',
    rigido: 'Camion rigid cu lift hidraulic', tauliner: 'Semiremorcă tautliner (prelată culisantă)', alturaMax: 'înălțime maximă {m} m',
    cargaCompleta: 'Camion complet (FTL)', rigidoCompleto: 'Rigid complet', grupaje: 'Grupaj', cargaLateral: 'încărcare laterală', cargaTrasera: 'încărcare prin spate', cargaTecho: 'încărcare pe sus',
    requiereNima: 'Necesită NIMA', adr: 'MARFĂ ADR (periculoasă)',
    pendMatrEnvia: 'ÎN AȘTEPTARE', conductor: 'Șofer', pendComunicar: 'De comunicat',
    txtSoloMatr: 'Pot încărca doar numerele autorizate. Dacă se schimbă, anunțați-ne înainte de a ajunge la încărcare.',
    importeL: 'Sumă', pendiente: 'În așteptare', impuestosNo: '(taxele aplicabile neincluse)', formaPago: 'Condiții de plată',
    txtProntoPago: 'PLATĂ RAPIDĂ: transfer la {dias} zile de la data facturii cu o reducere de {pct} % (minimum {min}). Veți primi {neto}.',
    txtTransferencia: '**Transfer la {dias} zile** de la data facturii.', facturaL: 'Factură',
    txtFactura: 'Menționați pe factură ==**REFERINȚA NOASTRĂ DE CURSĂ: {ref}.**== Trimiteți factura, avizele și certificatele pe email la **{email}:** vom răspunde cu **«PRIMIT».**',
    txtDiscrecion: 'DISCREȚIE COMERCIALĂ: clientul solicită ca la încărcare să nu se dezvăluie destinația, nici originea la livrare.',
    verCondEs: 'Condițiile comenzii: pe paginile în SPANIOLĂ ale acestui document.',
    pagina: 'Pagina', de: 'din', rango: '{a} – {b}',
    qrEscanea: 'Scanează-l cu telefonul', qrPendiente: 'Transport în așteptarea alocării',
    modifTitulo: 'Istoricul documentului', modifNinguna: 'Fără modificări de la emitere', modifRuta: 'Rută modificată', modifFecha: 'Dată de încărcare mutată',
    modifMatricula: 'Schimbare număr de înmatriculare', modifTransQuitado: 'Transportator retras', modifTransNuevo: 'Transportator nou atribuit', modifMatriculaAsig: 'Atribuire numere de înmatriculare', modifEmision: 'Emiterea documentului', modifMotivo: 'Motiv', modifNuevo: 'Date noi', modifAnterior: 'Date anterioare — NU MAI SUNT VALABILE', motAsig: 'Atribuire inițială, anterioară începerii transportului', motAsigIniciado: 'Atribuire inițială', faltaRemolque: 'Lipsește numărul de înmatriculare al semiremorcii', ocultasTit: 'ADRESE ASCUNSE PÂNĂ PRIMIM NUMERELE DE ÎNMATRICULARE', ocultas1: 'Transportul este CONFIRMAT. Trimiteți-ne numerele de înmatriculare (tractor și semiremorcă) și vă trimitem IMEDIAT această comandă cu adresele de încărcare și descărcare.', ocultas2: 'Fără numere de înmatriculare nu se încarcă: le comunicăm depozitelor înainte de sosirea camionului.', txtSinMatriculas: 'DeCA: Vă rugăm să ne comunicați numerele de înmatriculare ale vehiculului; în lipsa acestora, vom considera că transportatorul efectiv gestionează DeCA conform Ordinului FOM/2861/2012, societatea noastră fiind exonerată de orice răspundere care decurge din emiterea sau omiterea acestuia.', modifSinEmitir: 'Document în așteptarea emiterii: lipsesc numerele de înmatriculare ale vehiculului', motMatricula: 'În funcție de disponibilitatea camioanelor din zonă', motTrans: 'Înlocuirea transportatorului efectiv', motQuitado: 'Retragerea transportatorului efectiv', motRuta: 'La indicația clientului', motFecha: 'Schimbare de dată cerută de expeditorul contractual', modifMercancia: 'Marfă modificată', motMercancia: 'Schimbare de marfă cerută de expeditorul contractual', modifTransAsig: 'Atribuire transportator', modifMas: '… și {n} modificări anterioare',
    decaManual: 'Document de control (DeCA) și scrisoare de transport (CMR): transport contractat direct între ordonator și transportator — se gestionează între părți. Această comandă nu include QR de semnătură digitală și nici arhivarea CMR.',
  },
};

/** Rellena las plantillas «{clave}» de un texto del diccionario. */
export function rellena(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (_, k) => valores[k] ?? '');
}

/** Nombre del idioma, para la pantalla de envío («Se genera en polaco y español»). */
export const NOMBRE_IDIOMA: Record<IdiomaOrden, string> = {
  es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán',
  it: 'italiano', nl: 'neerlandés', pl: 'polaco', cs: 'checo', ro: 'rumano',
};
