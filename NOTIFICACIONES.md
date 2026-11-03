# Notificaciones (WhatsApp y email) — plan de trabajo

> Abierto el 2026-11-03 a petición del usuario: *"es un apartado muy muy importante, para avisos de
> todo tipo"*. Este documento es la lista de **qué se avisa, a quién, por qué canal y cuándo**, y
> cómo se monta. Se repasa caso a caso con el usuario antes de programar cada bloque.

---

## 1. Los proveedores

| Canal | Proveedor | Estado | Qué hace falta |
|---|---|---|---|
| **WhatsApp** | **API de WhatsApp Business de Meta** (Cloud API) | El usuario tiene la API dada de alta y el número **confirmado y activo** | ID del número, ID de la cuenta de WhatsApp Business y un **token permanente** (usuario de sistema). Y las **plantillas aprobadas por Meta** (ver §4) |
| **Email de la plataforma** (avisos, órdenes de carga, contraseñas) | **Postmark** (DECIDIDO por el usuario el 2026-11-03, ver §1.1) | Sin crear (el usuario se dará de alta más adelante) | Cuenta, **dominio verificado** (`dynamotrans.com`: registros SPF, DKIM y Return-Path en el DNS) y un token de servidor |
| **Email comercial** (campañas, prospección) | **Brevo** | Ya funciona | Nada: se queda como está |
| **Mapas y direcciones** | **Google Maps API** (regla 13) | El usuario la tiene dada de alta | Clave en Vercel (`NEXT_PUBLIC_GOOGLE_MAPS_KEY`, solo *Preview*), **restringida** a la URL de pruebas y a Places, Geocoding y Routes |

**Dónde van las claves**: en Vercel → Settings → Environment Variables, **las pega el usuario**, nunca
en el chat. Las de WhatsApp y Postmark van **sin** `NEXT_PUBLIC_` (solo las ve el servidor: con
ellas cualquiera mandaría mensajes en nombre de Dynamo). La de Google Maps sí es pública por fuerza
(la usa el navegador), y su protección son las restricciones de la clave.

### 1.1 ¿Por qué no la API de Gmail para los avisos?

Se puede, pero no es lo recomendable para esto:

- **Gmail está pensado para el buzón de una persona, no para avisos automáticos.** Tiene tope diario
  de envíos (unos 2.000 en Google Workspace) y, si un día sale una tanda grande (ofertar una carga
  a 100 transportistas), Google puede **bloquear temporalmente el buzón**.
- **Se juega la reputación del buzón principal.** Si unos cuantos avisos acaban en spam, el que
  sufre es `info@dynamotrans.com`, que es por donde entran los clientes.
- **No da** lo que hace falta para auditar (regla 12): saber si cada email **llegó**, **rebotó** o
  lo marcaron como spam, con un aviso automático a la plataforma.

**Postmark** está hecho justo para esto (emails de aplicación: avisos, contraseñas, órdenes), tiene
de las mejores tasas de entrega a la bandeja de entrada, guarda el historial de cada envío y avisa
de rebotes. Ya estaba elegido en el stack del 2026-06-20. Precio orientativo: de pago por volumen,
con un plan de entrada de unos 15 $/mes para 10.000 emails (comprobar en su web al darse de alta).

Los emails **salen desde `dynamotrans.com`** igual (p. ej. `avisos@dynamotrans.com`), con respuesta
a `info@`. Gmail sigue siendo el buzón donde el equipo lee y contesta.

Alternativa aceptable si se prefiere un proveedor menos: **la parte transaccional de Brevo**. Va
peor en entrega que Postmark, y mezclar campañas y avisos en la misma cuenta hace que un mal
resultado de una campaña afecte a los avisos.

---

## 2. Cómo se monta (para que no se pierda ningún aviso)

1. **Cola en la base de datos** (tabla `notificaciones`): cada aviso es una fila con tipo, canal,
   destinatario, plantilla, datos, idioma, `programada_para`, estado (pendiente → enviada →
   entregada / leída / fallida), intentos, id del proveedor y error. **Nunca se borra** (regla 12):
   es la prueba de que se avisó, y cuándo.
2. **Los avisos los genera la base de datos**, con triggers, cuando pasa algo (transportista
   asignado, envío cancelado, incidencia…): igual que la auditoría, así no hay forma de saltárselos.
3. **Un enviador** (función en el servidor que se ejecuta cada minuto) coge los pendientes, los manda
   por WhatsApp o email y apunta el resultado. Si falla, **reintenta** y, si un WhatsApp no llega, se
   puede **pasar a email**.
4. **Los avisos programados** ("faltan 24 h y no hay matrícula") los mete en la cola una tarea
   periódica de la base de datos.
5. **Los proveedores avisan de vuelta** (webhooks): entregado, leído, rebotado, y las **respuestas**
   por WhatsApp (p. ej. el transportista contesta con la matrícula).

**¿Y n8n?** La plataforma manda sus avisos **por código**, porque son críticos y tienen que quedar
auditados. n8n encaja para las **automatizaciones de la oficina** (Holded, el Sheet, informes,
lectura de correos y adjuntos), conectado a la misma base de datos. Se decide caso a caso.

---

## 3. Catálogo de avisos (a revisar uno a uno con el usuario)

Canal: **W** = WhatsApp · **E** = email · **W+E** = los dos. Lo marcado con ⏰ es programado (sale
solo, a una hora o cuando falta X tiempo).

### 3.1 Transportistas
| # | Aviso | Canal | Cuándo |
|---|---|---|---|
| T1 | **Carga disponible** (oferta con su enlace personal) | W+E | Al publicar la carga, **3 min después** del último cambio (no ofertar 20 veces mientras se corrige) |
| T2 | Código de confirmación al aceptar | E | Al pulsar "Aceptar carga" |
| T3 | Carga aceptada / reservada: resumen y siguientes pasos | W+E | Al aceptar |
| T4 | **Orden de carga** (PDF) | E (+ W con enlace) | Al asignar, y de nuevo si cambia algo |
| T5 | ⏰ **Pedir matrículas y conductor** si aún no están | W (luego E) | A X horas de la carga, y recordatorios hasta tenerlas |
| T6 | ⏰ Recordatorio de la carga de mañana | W | Víspera, por la tarde |
| T7 | **Modificación de la carga** (fecha, horario, dirección, mercancía) | W+E | Al cambiar algo que le afecta |
| T8 | Carga cancelada | W+E | Al cancelar |
| T9 | Incidencia abierta / respondida | W+E | Al abrirla o cambiar |
| T10 | Firmar el CMR (enlace) | W | Al cargar / entregar |
| T11 | ⏰ Reclamar albarán / CMR firmado | E | 14 días sin documento |
| T12 | Pago / pronto pago realizado | E | Al pagar |
| T13 | ⏰ Seguro CMR a punto de vencer | E | 30 días antes |
| T14 | Alta aceptada / pendiente de revisión | E | Al dar de alta |

### 3.2 Clientes
| # | Aviso | Canal | Cuándo |
|---|---|---|---|
| C1 | Envío creado / confirmado (con su resumen) | E | Al confirmar |
| C2 | **Transportista asignado** (matrícula) | W+E | Al asignar |
| C3 | ⏰ Teléfono del conductor | W | 10:00 del día hábil anterior a la carga |
| C4 | Camión hacia la carga · cargado · **entregado** | W | Al pasar cada hito |
| C5 | Retraso o incidencia | W+E | Al detectarse |
| C6 | Modificación hecha por Dynamo | E | Al cambiar |
| C7 | Cancelación (y penalización, si la hay) | E | Al cancelar |
| C8 | Albarán / CMR firmado disponible | E | Al subirse |
| C9 | Proforma / pago pendiente (clientes sin crédito) | E | Al confirmar el envío |
| C10 | Cuenta creada, verificación, invitación de un usuario | E | Alta |

### 3.3 Sitios (almacenes de recogida y entrega)
| # | Aviso | Canal | Cuándo |
|---|---|---|---|
| S1 | Aviso de **recogida** / **entrega** prevista | E | Víspera, a los **emails de avisos del sitio** (`lugares.emails_avisos`). **Discreción total**: sin precios, sin otros clientes, sin origen/destino ajenos |

### 3.4 Cuentas (todos los usuarios)
| # | Aviso | Canal | Cuándo |
|---|---|---|---|
| U1 | **Crear contraseña** (usuario nuevo o invitado) | E | Al crear el usuario |
| U2 | **Restablecer contraseña** | E | Al pedirlo |
| U3 | Cambio de rol / cuenta suspendida / reactivada | E | Al cambiar |

U1 y U2 los manda **Supabase Auth**, pero **por Postmark** (se configura como su servidor de
correo) para que salgan con la marca y el dominio de Dynamo y no desde Supabase.

### 3.5 Internos de Dynamo
| # | Aviso | Canal | Cuándo |
|---|---|---|---|
| D1 | ⏰ Carga **sin transportista** a las 15:30 de la víspera | W | Programado |
| D2 | Alta de transportista pendiente de revisar | E | Al llegar |
| D3 | Contraoferta del ±30 % para revisar | W | Al llegar (máx. 2 min de respuesta) |
| D4 | Incidencia nueva | W | Al abrirse |
| D5 | Tres códigos fallidos (posible suplantación) | E | Al bloquear |

---

## 4. Reglas que hay que cumplir

- **WhatsApp exige plantillas aprobadas por Meta** para escribir primero a alguien (casi todos los
  avisos de arriba). Cada plantilla se redacta, se envía a aprobación (categoría *utilidad*) y va
  **por idioma**. Sin plantilla solo se puede contestar dentro de las 24 h siguientes a un mensaje
  de esa persona. Meta cobra por mensaje según tipo y país (comprobar la tarifa vigente en su web).
- **Idioma de cada contacto** (`contactos.idioma`): un transportista polaco recibe en polaco.
- **Discreción comercial** en los avisos a sitios y cuando el cliente la tiene activada.
- **Regla 11 (anti-desintermediación)**: después de la entrega, nada con el contacto del
  transportista llega al cliente.
- **Horas**: WhatsApp no comercial de noche; lo urgente sí.
- **Agrupar**: si se cambian tres cosas de un envío en un minuto, sale **un** aviso, no tres.
- **A quién**: solo a los contactos con `recibe_avisos` (y el email de contabilidad, solo facturas).
- **Todo queda registrado** (regla 12): qué se mandó, a quién, cuándo, y si llegó y se leyó.

---

## 5. Orden propuesto

1. Postmark + plantilla base de email con la marca, y contraseñas (U1, U2) por Postmark.
2. Cola `notificaciones` + enviador + webhooks de estado.
3. WhatsApp: credenciales, plantillas de T1, T5, C2, C4 y D1 a aprobación (tardan en aprobarse:
   conviene mandarlas pronto).
4. El resto del catálogo, bloque a bloque, a medida que se pasan las pantallas de envíos.
