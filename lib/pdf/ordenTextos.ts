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
  qrDeca: string; qrEscanea: string; qrPendiente: string;
};

export const ORDEN_TXT: Record<IdiomaOrden, TextosOrden> = {
  es: {
    titulo: 'ORDEN DE CARGA', subRef: 'Referencia de envío', emitida: 'Emitida el',
    copiaConductor: 'COPIA CONDUCTOR', copiaAdmin: 'COPIA ADMINISTRACIÓN', sinEco: 'SIN INFORMACIÓN ECONÓMICA', completa: 'DOCUMENTO COMPLETO',
    prevalece: 'En caso de discrepancia entre versiones, prevalece la versión en español.',
    transpRealiza: 'TRANSPORTISTA (realiza el servicio)', transp: 'TRANSPORTISTA', gestionadaPor: 'GESTIONADA POR', ordenante: 'ORDENANTE',
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
    pendMatrEnvia: 'PENDIENTE DE ASIGNAR: envíanoslas antes de la carga', conductor: 'Conductor', pendComunicar: 'Pendiente de comunicar',
    txtSoloMatr: 'Solo pueden cargar las matrículas autorizadas. Si cambian, avísanos antes de llegar a la carga.',
    importeL: 'Importe', pendiente: 'Pendiente', impuestosNo: '(impuestos aplicables no incluidos)', formaPago: 'Forma de pago',
    txtProntoPago: 'PRONTO PAGO: transferencia a {dias} días de la fecha de factura con un descuento del {pct} % (mínimo {min}). Cobrarás {neto}.',
    txtTransferencia: 'Transferencia a {dias} días de la fecha de factura.', facturaL: 'Factura',
    txtFactura: 'Indica en tu factura nuestra REFERENCIA DE VIAJE: {ref}. Envía la factura, los albaranes y los certificados por email a {email}: te contestaremos con un «RECIBIDO».',
    txtDiscrecion: 'DISCRECIÓN COMERCIAL: en la carga no informes del destino, ni en la entrega del origen. No enseñes a nadie precios ni esta orden.',
    verCondEs: 'Condiciones de la orden: en las páginas en ESPAÑOL de este documento.',
    pagina: 'Página', de: 'de', rango: 'del {a} al {b}',
    qrDeca: 'Documento de control del transporte (e-CMR / DeCA): el QR abre el documento completo, con la hoja de firmas, siempre al día.', qrEscanea: 'Escanéalo con el móvil', qrPendiente: 'Pendiente de asignar transporte',
  },
  en: {
    titulo: 'LOADING ORDER', subRef: 'Shipment reference', emitida: 'Issued on',
    copiaConductor: 'DRIVER COPY', copiaAdmin: 'ADMINISTRATION COPY', sinEco: 'NO FINANCIAL INFORMATION', completa: 'FULL DOCUMENT',
    prevalece: 'In case of discrepancy between versions, the Spanish version prevails.',
    transpRealiza: 'CARRIER (performs the service)', transp: 'CARRIER', gestionadaPor: 'MANAGED BY', ordenante: 'ORDERING PARTY',
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
    pendMatrEnvia: 'TO BE ASSIGNED: send them to us before loading', conductor: 'Driver', pendComunicar: 'To be communicated',
    txtSoloMatr: 'Only the authorised plates may load. If they change, tell us before arriving at the loading point.',
    importeL: 'Amount', pendiente: 'Pending', impuestosNo: '(applicable taxes not included)', formaPago: 'Payment terms',
    txtProntoPago: 'EARLY PAYMENT: bank transfer {dias} days from the invoice date with a {pct} % discount (minimum {min}). You will receive {neto}.',
    txtTransferencia: 'Bank transfer {dias} days from the invoice date.', facturaL: 'Invoice',
    txtFactura: 'Quote our TRIP REFERENCE on your invoice: {ref}. Send the invoice, delivery notes and certificates by email to {email}: we will reply with a «RECEIVED».',
    txtDiscrecion: 'COMMERCIAL DISCRETION: at loading do not disclose the destination, nor the origin at delivery. Do not show prices or this order to anyone.',
    verCondEs: 'Order conditions: see the SPANISH pages of this document.',
    pagina: 'Page', de: 'of', rango: '{a} – {b}',
    qrDeca: 'Transport control document (e-CMR / DeCA): the QR opens the full document, with the signature sheet, always up to date.', qrEscanea: 'Scan it with your phone', qrPendiente: 'Transport pending assignment',
  },
  pt: {
    titulo: 'ORDEM DE CARGA', subRef: 'Referência do envio', emitida: 'Emitida em',
    copiaConductor: 'CÓPIA DO MOTORISTA', copiaAdmin: 'CÓPIA DA ADMINISTRAÇÃO', sinEco: 'SEM INFORMAÇÃO FINANCEIRA', completa: 'DOCUMENTO COMPLETO',
    prevalece: 'Em caso de divergência entre versões, prevalece a versão em espanhol.',
    transpRealiza: 'TRANSPORTADOR (realiza o serviço)', transp: 'TRANSPORTADOR', gestionadaPor: 'GERIDA POR', ordenante: 'ORDENANTE',
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
    pendMatrEnvia: 'POR ATRIBUIR: envie-nos as matrículas antes da carga', conductor: 'Motorista', pendComunicar: 'Por comunicar',
    txtSoloMatr: 'Só podem carregar as matrículas autorizadas. Se mudarem, avise-nos antes de chegar à carga.',
    importeL: 'Valor', pendiente: 'Pendente', impuestosNo: '(impostos aplicáveis não incluídos)', formaPago: 'Forma de pagamento',
    txtProntoPago: 'PRONTO PAGAMENTO: transferência a {dias} dias da data da fatura com um desconto de {pct} % (mínimo {min}). Receberá {neto}.',
    txtTransferencia: 'Transferência a {dias} dias da data da fatura.', facturaL: 'Fatura',
    txtFactura: 'Indique na sua fatura a nossa REFERÊNCIA DE VIAGEM: {ref}. Envie a fatura, as guias e os certificados por email para {email}: responderemos com um «RECEBIDO».',
    txtDiscrecion: 'DISCRIÇÃO COMERCIAL: na carga não informe o destino, nem na entrega a origem. Não mostre a ninguém preços nem esta ordem.',
    verCondEs: 'Condições da ordem: nas páginas em ESPANHOL deste documento.',
    pagina: 'Página', de: 'de', rango: 'de {a} a {b}',
    qrDeca: 'Documento de controlo do transporte (e-CMR / DeCA): o QR abre o documento completo, com a folha de assinaturas, sempre atualizado.', qrEscanea: 'Digitalize com o telemóvel', qrPendiente: 'Transporte pendente de atribuição',
  },
  fr: {
    titulo: 'ORDRE DE CHARGEMENT', subRef: 'Référence de l’envoi', emitida: 'Émis le',
    copiaConductor: 'COPIE CONDUCTEUR', copiaAdmin: 'COPIE ADMINISTRATION', sinEco: 'SANS INFORMATION FINANCIÈRE', completa: 'DOCUMENT COMPLET',
    prevalece: 'En cas de divergence entre versions, la version espagnole prévaut.',
    transpRealiza: 'TRANSPORTEUR (réalise le service)', transp: 'TRANSPORTEUR', gestionadaPor: 'GÉRÉ PAR', ordenante: 'DONNEUR D’ORDRE',
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
    pendMatrEnvia: 'À ASSIGNER : envoyez-les-nous avant le chargement', conductor: 'Conducteur', pendComunicar: 'À communiquer',
    txtSoloMatr: 'Seules les plaques autorisées peuvent charger. En cas de changement, prévenez-nous avant d’arriver au chargement.',
    importeL: 'Montant', pendiente: 'En attente', impuestosNo: '(taxes applicables non comprises)', formaPago: 'Conditions de paiement',
    txtProntoPago: 'PAIEMENT ANTICIPÉ : virement à {dias} jours de la date de facture avec une remise de {pct} % (minimum {min}). Vous recevrez {neto}.',
    txtTransferencia: 'Virement à {dias} jours de la date de facture.', facturaL: 'Facture',
    txtFactura: 'Indiquez sur votre facture notre RÉFÉRENCE DE VOYAGE : {ref}. Envoyez la facture, les bons de livraison et les certificats par email à {email} : nous répondrons par un « REÇU ».',
    txtDiscrecion: 'DISCRÉTION COMMERCIALE : au chargement ne révélez pas la destination, ni l’origine à la livraison. Ne montrez à personne les prix ni cet ordre.',
    verCondEs: 'Conditions de l’ordre : voir les pages en ESPAGNOL de ce document.',
    pagina: 'Page', de: 'sur', rango: 'du {a} au {b}',
    qrDeca: 'Document de contrôle du transport (e-CMR / DeCA) : le QR ouvre le document complet, avec la feuille de signatures, toujours à jour.', qrEscanea: 'Scannez-le avec le téléphone', qrPendiente: 'Transport en attente d\'affectation',
  },
  de: {
    titulo: 'LADEAUFTRAG', subRef: 'Sendungsreferenz', emitida: 'Ausgestellt am',
    copiaConductor: 'FAHRERKOPIE', copiaAdmin: 'VERWALTUNGSKOPIE', sinEco: 'OHNE FINANZINFORMATIONEN', completa: 'VOLLSTÄNDIGES DOKUMENT',
    prevalece: 'Bei Abweichungen zwischen den Fassungen gilt die spanische Fassung.',
    transpRealiza: 'FRACHTFÜHRER (führt den Transport aus)', transp: 'FRACHTFÜHRER', gestionadaPor: 'VERWALTET VON', ordenante: 'AUFTRAGGEBER',
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
    pendMatrEnvia: 'NOCH ZUZUWEISEN: vor der Beladung an uns senden', conductor: 'Fahrer', pendComunicar: 'Noch mitzuteilen',
    txtSoloMatr: 'Nur die zugelassenen Kennzeichen dürfen laden. Bei Änderung informieren Sie uns vor Ankunft an der Ladestelle.',
    importeL: 'Betrag', pendiente: 'Offen', impuestosNo: '(zzgl. anfallender Steuern)', formaPago: 'Zahlungsbedingungen',
    txtProntoPago: 'SKONTO: Überweisung {dias} Tage ab Rechnungsdatum mit {pct} % Abzug (mindestens {min}). Sie erhalten {neto}.',
    txtTransferencia: 'Überweisung {dias} Tage ab Rechnungsdatum.', facturaL: 'Rechnung',
    txtFactura: 'Geben Sie auf Ihrer Rechnung unsere FAHRTREFERENZ an: {ref}. Senden Sie Rechnung, Lieferscheine und Nachweise per E-Mail an {email}: wir antworten mit „ERHALTEN“.',
    txtDiscrecion: 'VERTRAULICHKEIT: beim Laden das Ziel nicht nennen, bei der Lieferung nicht die Herkunft. Zeigen Sie niemandem Preise oder diesen Auftrag.',
    verCondEs: 'Auftragsbedingungen: siehe die SPANISCHEN Seiten dieses Dokuments.',
    pagina: 'Seite', de: 'von', rango: '{a} – {b}',
    qrDeca: 'Transport-Kontrolldokument (e-CMR / DeCA): Der QR-Code öffnet das vollständige Dokument mit dem Unterschriftenblatt, immer aktuell.', qrEscanea: 'Mit dem Handy scannen', qrPendiente: 'Transport noch nicht zugewiesen',
  },
  it: {
    titulo: 'ORDINE DI CARICO', subRef: 'Riferimento spedizione', emitida: 'Emesso il',
    copiaConductor: 'COPIA AUTISTA', copiaAdmin: 'COPIA AMMINISTRAZIONE', sinEco: 'SENZA INFORMAZIONI ECONOMICHE', completa: 'DOCUMENTO COMPLETO',
    prevalece: 'In caso di discrepanza tra le versioni, prevale la versione spagnola.',
    transpRealiza: 'TRASPORTATORE (esegue il servizio)', transp: 'TRASPORTATORE', gestionadaPor: 'GESTITO DA', ordenante: 'COMMITTENTE',
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
    pendMatrEnvia: 'DA ASSEGNARE: inviacele prima del carico', conductor: 'Autista', pendComunicar: 'Da comunicare',
    txtSoloMatr: 'Possono caricare solo le targhe autorizzate. Se cambiano, avvisaci prima di arrivare al carico.',
    importeL: 'Importo', pendiente: 'In attesa', impuestosNo: '(imposte applicabili escluse)', formaPago: 'Condizioni di pagamento',
    txtProntoPago: 'PAGAMENTO ANTICIPATO: bonifico a {dias} giorni dalla data fattura con uno sconto del {pct} % (minimo {min}). Riceverai {neto}.',
    txtTransferencia: 'Bonifico a {dias} giorni dalla data fattura.', facturaL: 'Fattura',
    txtFactura: 'Indica in fattura il nostro RIFERIMENTO VIAGGIO: {ref}. Invia fattura, bolle e certificati via email a {email}: risponderemo con un «RICEVUTO».',
    txtDiscrecion: 'RISERVATEZZA COMMERCIALE: al carico non rivelare la destinazione, né l’origine alla consegna. Non mostrare a nessuno prezzi o quest’ordine.',
    verCondEs: 'Condizioni dell’ordine: nelle pagine in SPAGNOLO di questo documento.',
    pagina: 'Pagina', de: 'di', rango: 'dal {a} al {b}',
    qrDeca: 'Documento di controllo del trasporto (e-CMR / DeCA): il QR apre il documento completo, con il foglio firme, sempre aggiornato.', qrEscanea: 'Scansionalo con il cellulare', qrPendiente: 'Trasporto in attesa di assegnazione',
  },
  nl: {
    titulo: 'LAADOPDRACHT', subRef: 'Zendingsreferentie', emitida: 'Uitgegeven op',
    copiaConductor: 'KOPIE CHAUFFEUR', copiaAdmin: 'KOPIE ADMINISTRATIE', sinEco: 'ZONDER FINANCIËLE INFORMATIE', completa: 'VOLLEDIG DOCUMENT',
    prevalece: 'Bij verschillen tussen versies geldt de Spaanse versie.',
    transpRealiza: 'VERVOERDER (voert de dienst uit)', transp: 'VERVOERDER', gestionadaPor: 'BEHEERD DOOR', ordenante: 'OPDRACHTGEVER',
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
    pendMatrEnvia: 'NOG TOE TE WIJZEN: stuur ze ons vóór het laden', conductor: 'Chauffeur', pendComunicar: 'Nog mee te delen',
    txtSoloMatr: 'Alleen de toegelaten kentekens mogen laden. Bij wijziging, meld het ons vóór aankomst op de laadplaats.',
    importeL: 'Bedrag', pendiente: 'In afwachting', impuestosNo: '(toepasselijke belastingen niet inbegrepen)', formaPago: 'Betalingsvoorwaarden',
    txtProntoPago: 'SNELLE BETALING: overschrijving {dias} dagen na factuurdatum met {pct} % korting (minimaal {min}). U ontvangt {neto}.',
    txtTransferencia: 'Overschrijving {dias} dagen na factuurdatum.', facturaL: 'Factuur',
    txtFactura: 'Vermeld op uw factuur onze RITREFERENTIE: {ref}. Stuur factuur, vrachtbrieven en certificaten per e-mail naar {email}: wij antwoorden met «ONTVANGEN».',
    txtDiscrecion: 'COMMERCIËLE DISCRETIE: meld bij het laden de bestemming niet, noch de herkomst bij levering. Toon niemand prijzen of deze opdracht.',
    verCondEs: 'Voorwaarden van de opdracht: zie de SPAANSE pagina’s van dit document.',
    pagina: 'Pagina', de: 'van', rango: '{a} – {b}',
    qrDeca: 'Controledocument van het vervoer (e-CMR / DeCA): de QR opent het volledige document, met het handtekeningenblad, altijd actueel.', qrEscanea: 'Scan met je telefoon', qrPendiente: 'Transport nog toe te wijzen',
  },
  pl: {
    titulo: 'ZLECENIE TRANSPORTOWE', subRef: 'Numer referencyjny przewozu', emitida: 'Wystawiono',
    copiaConductor: 'KOPIA DLA KIEROWCY', copiaAdmin: 'KOPIA DLA ADMINISTRACJI', sinEco: 'BEZ INFORMACJI FINANSOWYCH', completa: 'PEŁNY DOKUMENT',
    prevalece: 'W razie rozbieżności między wersjami obowiązuje wersja hiszpańska.',
    transpRealiza: 'PRZEWOŹNIK (wykonuje usługę)', transp: 'PRZEWOŹNIK', gestionadaPor: 'ZARZĄDZANE PRZEZ', ordenante: 'ZLECENIODAWCA',
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
    pendMatrEnvia: 'DO PRZYDZIELENIA: prosimy przesłać przed załadunkiem', conductor: 'Kierowca', pendComunicar: 'Do przekazania',
    txtSoloMatr: 'Ładować mogą wyłącznie autoryzowane numery rejestracyjne. Każdą zmianę należy zgłosić przed przyjazdem na załadunek.',
    importeL: 'Stawka', pendiente: 'Oczekuje', impuestosNo: '(bez obowiązujących podatków)', formaPago: 'Warunki płatności',
    txtProntoPago: 'SZYBKA PŁATNOŚĆ: przelew {dias} dni od daty faktury z rabatem {pct} % (minimum {min}). Otrzymasz {neto}.',
    txtTransferencia: 'Przelew {dias} dni od daty faktury.', facturaL: 'Faktura',
    txtFactura: 'Na fakturze należy podać naszą REFERENCJĘ PRZEWOZU: {ref}. Fakturę, dokumenty dostawy i certyfikaty prosimy przesłać e-mailem na {email}: odpowiemy «OTRZYMANO».',
    txtDiscrecion: 'DYSKRECJA HANDLOWA: przy załadunku nie ujawniaj miejsca przeznaczenia, a przy rozładunku miejsca pochodzenia. Nie pokazuj nikomu cen ani tego zlecenia.',
    verCondEs: 'Warunki zlecenia: na stronach w języku HISZPAŃSKIM tego dokumentu.',
    pagina: 'Strona', de: 'z', rango: '{a} – {b}',
    qrDeca: 'Dokument kontrolny przewozu (e-CMR / DeCA): kod QR otwiera pełny dokument z arkuszem podpisów, zawsze aktualny.', qrEscanea: 'Zeskanuj telefonem', qrPendiente: 'Transport oczekuje na przydział',
  },
  cs: {
    titulo: 'NAKLÁDKOVÝ PŘÍKAZ', subRef: 'Referenční číslo zásilky', emitida: 'Vystaveno',
    copiaConductor: 'KOPIE PRO ŘIDIČE', copiaAdmin: 'KOPIE PRO ADMINISTRATIVU', sinEco: 'BEZ FINANČNÍCH INFORMACÍ', completa: 'ÚPLNÝ DOKUMENT',
    prevalece: 'V případě rozporu mezi verzemi platí španělská verze.',
    transpRealiza: 'DOPRAVCE (provádí službu)', transp: 'DOPRAVCE', gestionadaPor: 'SPRAVUJE', ordenante: 'OBJEDNATEL',
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
    pendMatrEnvia: 'BUDE PŘIDĚLENO: zašlete nám je před nakládkou', conductor: 'Řidič', pendComunicar: 'Bude sděleno',
    txtSoloMatr: 'Nakládat smí pouze povolené SPZ. Při změně nás informujte před příjezdem na nakládku.',
    importeL: 'Cena', pendiente: 'Čeká', impuestosNo: '(bez příslušných daní)', formaPago: 'Platební podmínky',
    txtProntoPago: 'RYCHLÁ PLATBA: převod {dias} dní od data faktury se slevou {pct} % (minimálně {min}). Obdržíte {neto}.',
    txtTransferencia: 'Převod {dias} dní od data faktury.', facturaL: 'Faktura',
    txtFactura: 'Na faktuře uveďte naši REFERENCI JÍZDY: {ref}. Fakturu, dodací listy a certifikáty zašlete e-mailem na {email}: odpovíme «PŘIJATO».',
    txtDiscrecion: 'OBCHODNÍ DISKRÉTNOST: při nakládce nesdělujte místo určení, při vykládce místo původu. Nikomu neukazujte ceny ani tento příkaz.',
    verCondEs: 'Podmínky příkazu: na ŠPANĚLSKÝCH stránkách tohoto dokumentu.',
    pagina: 'Strana', de: 'z', rango: '{a} – {b}',
    qrDeca: 'Kontrolní dokument přepravy (e-CMR / DeCA): QR kód otevře úplný dokument s listem podpisů, vždy aktuální.', qrEscanea: 'Naskenujte telefonem', qrPendiente: 'Doprava čeká na přidělení',
  },
  ro: {
    titulo: 'COMANDĂ DE ÎNCĂRCARE', subRef: 'Referința expedierii', emitida: 'Emisă la',
    copiaConductor: 'COPIE ȘOFER', copiaAdmin: 'COPIE ADMINISTRAȚIE', sinEco: 'FĂRĂ INFORMAȚII FINANCIARE', completa: 'DOCUMENT COMPLET',
    prevalece: 'În caz de neconcordanță între versiuni, prevalează versiunea în spaniolă.',
    transpRealiza: 'TRANSPORTATOR (execută serviciul)', transp: 'TRANSPORTATOR', gestionadaPor: 'GESTIONATĂ DE', ordenante: 'ORDONATOR',
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
    pendMatrEnvia: 'DE ALOCAT: trimiteți-ni-le înainte de încărcare', conductor: 'Șofer', pendComunicar: 'De comunicat',
    txtSoloMatr: 'Pot încărca doar numerele autorizate. Dacă se schimbă, anunțați-ne înainte de a ajunge la încărcare.',
    importeL: 'Sumă', pendiente: 'În așteptare', impuestosNo: '(taxele aplicabile neincluse)', formaPago: 'Condiții de plată',
    txtProntoPago: 'PLATĂ RAPIDĂ: transfer la {dias} zile de la data facturii cu o reducere de {pct} % (minimum {min}). Veți primi {neto}.',
    txtTransferencia: 'Transfer la {dias} zile de la data facturii.', facturaL: 'Factură',
    txtFactura: 'Menționați pe factură REFERINȚA NOASTRĂ DE CURSĂ: {ref}. Trimiteți factura, avizele și certificatele pe email la {email}: vom răspunde cu «PRIMIT».',
    txtDiscrecion: 'DISCREȚIE COMERCIALĂ: la încărcare nu dezvăluiți destinația, nici originea la livrare. Nu arătați nimănui prețurile sau această comandă.',
    verCondEs: 'Condițiile comenzii: pe paginile în SPANIOLĂ ale acestui document.',
    pagina: 'Pagina', de: 'din', rango: '{a} – {b}',
    qrDeca: 'Document de control al transportului (e-CMR / DeCA): codul QR deschide documentul complet, cu fila de semnături, mereu actualizat.', qrEscanea: 'Scanează-l cu telefonul', qrPendiente: 'Transport în așteptarea alocării',
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
