# Repaso de textos legales de la plataforma — listado para validar

Fecha: 2026-11-24 · Rama `pruebas` · **No se ha cambiado ningún texto legal**: esto es la lista de lo que habría que cambiar, para que la valides.

**Cómo leerlo**

- **[Visto]** = lo dice el texto o el código tal cual (comprobado).
- **[Abogado]** = opinión jurídica; la tiene que confirmar tu asesor antes de tocar nada. Yo no soy abogado.
- En cada punto: marca **SÍ / NO / HABLARLO**.
- Los puntos 1, 2, 16, 18, 21 y 25 son de **derecho de transporte**; los 3, 8, 11, 12, 28, 31 y 32, de **protección de datos**. Puede que necesites dos asesores distintos.

**Lo que está bien y no hay que tocar:** teléfono fijo igual en todas partes · plazo de pago por adelantado (los textos lo calculan, no va escrito a mano) · «se anula solo» · tarjeta o transferencia · cancelar gratis sin camión / 9:00 del día hábil anterior · DeCA guardado 1 año · ventanas de carga.

---

## A. Hay que resolverlo antes de abrir (13)

### 1. Dynamo dice que no responde de la mercancía, pero firma como porteador y la web anuncia un seguro de 250.000 €
- **Dónde:** condiciones generales, apdo. 10 · CMR (casilla 16 = Dynamo) · web pública.
- **Dice hoy:** condiciones: «Dynamo no asumirá ninguna responsabilidad económica por daño, pérdida, robo o siniestro de la mercancía». Web: «Seguro de mercancías de 250.000 € con MAPFRE» y «Garantizamos que la mercancía llega en tiempo y en perfectas condiciones».
- **[Visto]** Los tres textos se contradicen.
- **[Abogado]** Quien contrata el transporte en nombre propio responde ante su cliente como porteador (Ley 15/2009) y las cláusulas que rebajan esa responsabilidad se tienen por no puestas. La cláusula seguramente no protege y la publicidad puede obligar.
- **Propuesta:** cambiar el apdo. 10 por una cláusula con los límites legales de indemnización, plazos de reclamación y lo que cubre de verdad la póliza. Ajustar la web a la póliza.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 2. Se manda al cliente a reclamar «al transportista efectivo», pero el cliente no sabe quién es
- **Dónde:** condiciones, apdos. 10 y 11.
- **[Visto]** La plataforma oculta el transportista al cliente (decisión tuya).
- **Propuesta:** una sola versión: el cliente reclama a Dynamo (coherente con el punto 1). Reescribir el apdo. 11 sin «transportistas presentados por Dynamo».
- ☐ SÍ ☐ NO ☐ HABLARLO

### 3. La política de privacidad que se acepta al registrarse es la de la web de 2020
- **Dónde:** registro → texto de la web pública.
- **Dice hoy:** fecha «1 de junio 2020»; Dynamo como su propio «Delegado de Protección de Datos»; redes «Google+»…
- **[Visto]** No habla de la plataforma: cuentas, DNI, conductores, firmas, ubicación, pagos, ni de los proveedores (Supabase, Vercel, Postmark, Stripe, Google, Cloudflare…), ni de plazos concretos. Dentro del panel no hay enlace a privacidad ni a aviso legal.
- **[Abogado]** La empresa no puede ser su propio delegado; si no hace falta, se quita.
- **Propuesta:** política nueva de la plataforma, con fecha y versión, enlazada en registro, pie del panel, páginas públicas (carga, matrículas, CMR, DeCA) y emails.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 4. Las condiciones generales no dicen nada del precio ni del pago
- **[Visto]** Solo salen en pantallas y emails, no en el texto que el cliente acepta: pago por adelantado y sus motivos, plazo y anulación automática, tarjeta/transferencia, precio provisional y su revisión, crédito, penalizaciones, suspensión de cuenta. Las devoluciones de tarjeta (total o parcial, y lo retenido como penalización) no están escritas en ningún sitio.
- **Propuesta:** apartado nuevo «Precio, pago y devoluciones» (remitiendo a los plazos «indicados al confirmar», sin cifras a mano) y otro «Cuenta y suspensión».
- ☐ SÍ ☐ NO ☐ HABLARLO

### 5. Varias cláusulas describen la forma antigua de trabajar por email y contradicen la plataforma
- **Dónde:** condiciones, apdos. 1, 2, 5, 13 y 14.
- **Dice hoy:** «Cualquier documento enviado por vía digital no será tenido en cuenta… al no llevar impresora los camiones» · «ausencia de rechazo escrito a este email en un plazo de 8 horas» · «El único medio válido es el email… No se aceptarán notificaciones por WhatsApp» · «este presupuesto».
- **[Visto]** Hoy hay CMR y DeCA digitales, el envío se confirma con un botón, la matrícula se ve en la plataforma y hay botones de WhatsApp en casi todas las pantallas.
- **Propuesta:** reescribirlas: documentos digitales válidos; aceptar = pulsar «Confirmar envío»; comunicaciones válidas = plataforma y email.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 6. Aviso legal de 2020: fuero de Madrid y dice que la web «no crea relación contractual»
- **[Visto]** La orden de carga dice Sevilla; el domicilio es Sevilla. No aparece el número de autorización de operador de transporte (en los PDF sí).
- **[Abogado]** La ley de servicios de internet pide los datos de la autorización cuando la actividad la necesita.
- **Propuesta:** aviso legal nuevo + unas «Condiciones de uso de la plataforma» (cuentas, compañeros, contraseñas, suspensión, ley y fuero). Hoy esas reglas no están en ningún texto aceptado.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 7. El transportista acepta cargas y se da de alta sin ver ni aceptar ningún texto legal
- **[Visto]** La orden remite a `dynamotrans.com/condiciones-transportistas`, que **no existe** (ya estaba anotado). En la página de «ACEPTAR envío» no hay casilla, ni enlace a condiciones, ni aviso de privacidad, y se piden CIF, teléfono y conductor.
- **Propuesta:** crear esa página y poner «Al aceptar, aceptas las condiciones y la política de privacidad» con enlaces, guardando fecha y versión.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 8. Firma del CMR: la información de privacidad se queda corta y el PDF público enseña DNI y ubicación
- **Dice hoy:** «Nunca se usa para publicidad ni se cede a terceros ajenos al envío»; «Cuánto tiempo: 6 años».
- **[Visto]** No nombra a los proveedores. El registro de firmas (nombre, DNI completo, ubicación) va en un PDF que abre cualquiera que tenga el enlace o el QR, sin cuenta.
- **[Abogado]** Valorar si el DNI debe ir tapado en parte en la versión pública.
- **Propuesta:** completar el texto y decidir si se tapa el DNI fuera del panel.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 9. La ubicación de la firma estaba bloqueada por la propia web — ARREGLADO
- **[Visto]** La configuración de Vercel prohibía la ubicación en todas las páginas, también en la de firmar el CMR: en la web publicada se firmaba **sin ubicación y sin avisar** (en las pruebas automáticas no se notaba porque no pasan por Vercel).
- **Hecho (2026-11-24):** se permite la ubicación solo en las páginas del CMR. **Falta que lo compruebes tú** firmando un CMR de prueba en la preview desde el móvil.

### 10. «Urgencias 24 h» en un teléfono que tiene horario de oficina
- **Dónde:** condiciones apdo. 5, aviso de siniestro, orden de carga (10 idiomas), avisos y firma de los emails.
- **[Visto]** El horario real es L-J 9-14 y 15-17, V 9-14, y del 6 al 27 de agosto sin teléfono.
- **[Abogado]** La orden exige al transportista avisar de un siniestro «en ese mismo momento» a ese número; si nadie contesta, la exigencia pierde fuerza.
- **Propuesta:** o hay un número de guardia de verdad, o se cambia a «en horario de atención; fuera de él, email o WhatsApp».
- ☐ SÍ ☐ NO ☐ HABLARLO

### 11. Se promete borrar a los 6 años, pero está decidido no borrar nada
- **[Visto]** A quien firma o se da de baja se le dice «6 años / 4 años / 1 año»; la decisión interna es guardar sin límite y la limpieza automática está apagada.
- **Propuesta:** o se enciende la limpieza con los plazos que confirme el asesor, o los textos dicen lo que se hace de verdad y por qué.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 12. Cookies y traductor de Google dentro de la plataforma, sin aviso
- **[Visto]** A quien tiene el navegador en otro idioma se le carga solo el traductor de Google: el contenido de la página (nombres, DNI, direcciones) pasa por Google y se graban cookies, sin banner. La política de cookies no cita esas cookies, ni las de sesión, ni Stripe, ni Cloudflare, ni la etiqueta de Google Ads de la web.
- **Propuesta:** actualizar la política de cookies y decidir si la traducción arranca sola o solo al pulsar.
- ☐ SÍ ☐ NO ☐ HABLARLO

### 13. Verificación de identidad con Stripe Identity (aún sin construir)
- **[Abogado]** Antes de encenderla: consentimiento expreso y aparte, alternativa sin foto, evaluación de impacto, papel de Stripe y envío de datos a EE. UU., plazo de borrado de foto y selfie, añadirlo a la política, y guardar solo el resultado.
- ☐ SÍ ☐ NO ☐ HABLARLO

---

## B. Recomendable antes de abrir (19)

| N.º | Qué pasa | Propuesta | Decisión |
|---|---|---|---|
| 14 | La casilla de aceptar nace **marcada**, dice «He leído» (no «acepto») y no se guarda qué versión se aceptó. | «He leído y acepto», con versión y fecha; guardar la versión; condiciones descargables. | ☐ |
| 15 | Paralizaciones al cliente: «20,00 €/h — 40,00 €/h (referencia 2024)» es ambiguo y viejo. | «2 × IPREM diario vigente por hora o fracción», sin cifra fija. **[Abogado]** comprobar el artículo. | ☐ |
| 16 | Al transportista se le limita la paralización (un día, máx. 400 €) y al cliente se le dice que «por ley» el transportista puede cobrar el servicio completo. Se contradicen. | Quitar «por ley» de la pantalla del cliente y revisar las dos cláusulas de la orden. **[Abogado]** | ☐ |
| 17 | Aceptación por silencio: 30 minutos al transportista, 8 horas al cliente. | Apoyarse en los botones de aceptar, que ya existen; el silencio, solo de refuerzo. **[Abogado]** | ☐ |
| 18 | Fuerza mayor incluye averías y enfermedad del conductor. | Dejar solo causas realmente ajenas. **[Abogado]** la ley no deja excusarse por fallos del vehículo. | ☐ |
| 19 | «El servicio solo se considera confirmado cuando se entrega», aunque el cliente ya haya pagado. No dice que, si no hay camión, se devuelve lo pagado. | Añadir la devolución íntegra en ese caso y suavizar la frase. | ☐ |
| 20 | «Se presume que ningún cliente cargaría mercancía de alto valor sin verificar las matrículas… eximiendo a Dynamo». | Convertirlo en obligación clara: «el cargador comprobará las matrículas antes de cargar». **[Abogado]** | ☐ |
| 21 | Destrucción de la mercancía a los 30 días. | **[Abogado]** la ley prevé depósito y venta por la Junta Arbitral o el juzgado. | ☐ |
| 22 | No contratar con los transportistas de Dynamo: 18 meses y 6.000 €. | **[Abogado]** revisar si es proporcionado y cómo se prueba. | ☐ |
| 23 | Fuero: tres versiones (cliente: nada · transportista: Sevilla · web: Madrid). | Una sola cláusula igual en los tres textos; decidir Juntas Arbitrales. **[Abogado]** | ☐ |
| 24 | Pago al transportista «a 60 días de la fecha de factura». | **[Abogado]** el máximo legal son 60 días; comprobar desde cuándo se cuenta y que nadie tenga más. | ☐ |
| 25 | DeCA: «de no recibirlas, entenderemos que el transportista gestiona el DeCA… quedando nuestra empresa exenta de cualquier responsabilidad». | **[Abogado]** la obligación alcanza también a quien contrata; una nota propia no exime ante la inspección. Comprobar también los artículos citados de la orden del DeCA. | ☐ |
| 26 | «100 % seguro, digital y legal. Protocolo eIDAS» y la advertencia penal de la firma. | «Firma electrónica con validez legal (Reglamento eIDAS)» y «puede ser constitutivo de delito». | ☐ |
| 27 | Se habla de graneles («mínimo facturable de 25 Tn»), que Dynamo no hace. | Quitar las frases. | ☐ |
| 28 | Datos de los conductores (nombre, DNI, teléfono): nadie les informa y no hay cláusula con el transportista. | Cláusula en las condiciones del transportista y mención en la política. | ☐ |
| 29 | Almacenamiento: se puede pedir, pero no tiene condiciones. | Condiciones propias (responsabilidad, seguro, plazo, qué pasa si no se retira). | ☐ |
| 30 | Textos legales del cliente y de la firma solo en español, traducidos con el traductor automático. | Añadir «prevalece el español» donde falta; valorar inglés fijo para la privacidad de la firma. | ☐ |
| 31 | El DNI es obligatorio en el registro, y los documentos internos dicen «opcional». | Justificarlo (antifraude) o volver a opcional. **[Abogado]** | ☐ |
| 32 | A quien pidió el borrado se le bloquea con «La plataforma no está operativa en este momento» (no es verdad). | Mensaje verdadero y que conste en la política. **[Abogado]** | ☐ |

---

## C. Menor (3)

| N.º | Qué pasa | Propuesta | Decisión |
|---|---|---|---|
| 33 | Datos de empresa escritos de varias formas (CIF con y sin «ES», dirección con y sin planta, «© 2025», «Operador de Transportes» / «Operador Logístico»). | Una sola forma en todas partes. | ☐ |
| 34 | Proforma: «Se emitirá factura al validar el pago» y «la validación puede tardar hasta 24 h». | Confirmar que es lo que se hace. | ☐ |
| 35 | El borrador interno de protección de datos no lista todos los proveedores, y los emails no enlazan la privacidad. | Completar la lista y añadir el enlace al pie. | ☐ |

---

## Preguntas para ti (de tus respuestas dependen varios puntos)

1. ¿Qué cubre exactamente la póliza de 250.000 € (daños a la mercancía o responsabilidad civil; por siniestro o por año; exclusiones)? → puntos 1 y 20.
2. Ante un siniestro, ¿el cliente te reclama a ti o al transportista? → punto 2.
3. ¿El teléfono fijo se atiende de verdad 24 h, o hay otro número de guardia? → punto 10.
4. ¿Se borran datos a los plazos propuestos o se guardan sin límite? → punto 11.
5. Fuero: ¿Sevilla para todos? ¿Juntas Arbitrales del Transporte sí o no? → punto 23.
6. Si un envío pagado se queda sin camión, ¿se devuelve todo siempre? Si cancela el cliente fuera de plazo, ¿cuánto se retiene? → puntos 4 y 19.
7. ¿El DNI del registro es imprescindible? ¿El DNI completo de quien firma debe verse en el PDF público del CMR? → puntos 8 y 31.
8. ¿La traducción automática arranca sola o solo al pulsar? → punto 12.
9. ¿Quitamos las menciones a graneles? → punto 27.
10. ¿Almacenamiento se abre a clientes desde el primer día? → punto 29.
11. Pago a transportistas: ¿60 días desde la factura o desde la entrega? ¿Alguno con más de 60? → punto 24.
12. ¿Quién firma los textos finales: tu gestor o un abogado de transporte?

## Lo que no se ha podido comprobar

- Que la ubicación de la firma funcione ya en la preview (punto 9): hay que firmar un CMR real.
- Si las maquetas antiguas de la web (`dashboard.html`, `registro.html`…) se siguen viendo en internet.
- Si el enlace público del CMR le llega al cliente (enseñaría el transportista).
- Los números de artículo de la orden del DeCA, la Resolución de 5-jun-2026 y el IPREM vigente.
- Los textos de los emails que viven en la base de datos: solo se han mirado los de pago y el diseño común.

## Añadido el 2026-11-25 · Página pública de pago

- La página `/pago/<llave>` (el botón «Pagar el envío» del email) se abre sin entrar en la plataforma, para que el cliente pueda reenviar el email a quien paga. Enseña la referencia, el nombre del cliente, el importe, la fecha de carga, la mercancía y las paradas (código postal, población, provincia, país y hora prevista; sin calle, sin empresa y sin contactos). **A validar con el asesor**: mencionarla en la política de privacidad (quién puede verla: quien tenga el enlace), y que pagar desde ahí no supone aceptar nada nuevo (las condiciones las aceptó quien creó el envío) ni cambia a nombre de quién va la factura.

