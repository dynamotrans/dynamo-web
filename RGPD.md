# RGPD — Plataforma Dynamo (BORRADOR para revisar con el asesor)

> **Borrador técnico, no es asesoramiento legal.** Lo ha preparado el equipo técnico a partir
> de lo que la plataforma guarda de verdad (base de datos en `supabase/migrations/`). Las
> bases jurídicas y los plazos son **propuestas** que tiene que confirmar el asesor de
> protección de datos antes de abrir el portal a clientes (punto 13 de `PRODUCCION.md`).
> Última revisión: 2026-11-05.

## 1. Responsable

**Dynamo** (razón social y CIF: los de `parametros` → `dynamo_razon_social` / `dynamo_cif`).
Contacto para protección de datos: **info@dynamotrans.com** · +34 955 225 945.

¿Hace falta Delegado de Protección de Datos (DPD)? Probablemente no (no hay tratamiento a gran
escala de categorías especiales ni seguimiento sistemático a gran escala), pero **lo decide el
asesor**.

## 2. Qué datos personales guarda la plataforma

| # | Tratamiento | De quién | Datos | Para qué | Base jurídica (propuesta) | Conservación (propuesta) |
|---|---|---|---|---|---|---|
| 1 | **Cuentas de la plataforma** (`usuarios`) | Personas de clientes y transportistas; equipo Dynamo | Email, nombre, teléfono, cargo, DNI (opcional), idioma | Dar acceso, avisos del servicio | Contrato (art. 6.1.b) | Mientras la cuenta esté activa; después, bloqueados 6 años y anonimizados |
| 2 | **Uso de la plataforma** (`conexion_minutos`, `consultas_precio`, último acceso) | Usuarios | Tiempo conectado, consultas de precio, fechas | Seguridad, antifraude, suspensión automática | Interés legítimo (6.1.f) | 12 meses |
| 3 | **Contactos** (`contactos`) | Personas de clientes, transportistas y sitios de carga | Nombre, cargo, teléfono, email | Coordinar recogidas y entregas | Interés legítimo / contrato | Mientras la empresa o el sitio estén activos |
| 4 | **Conductores** (`conductores`, datos del envío) | Conductores de los transportistas | Nombre, DNI/NIE, teléfono, matrícula | Identificar quién recoge la mercancía (antifraude), CMR | Contrato de transporte + obligación legal (CMR) + interés legítimo (seguridad de la carga) | DNI: 6 años desde el último transporte. Teléfono: borrar si pasan 2 años sin viajes |
| 5 | **Firmas del CMR digital** (`firmas_cmr`, imagen de la firma) | Quien firma: cargador, conductor, destinatario | Nombre, DNI/NIE, email, firma, IP, navegador, hora | Prueba de la carga y la entrega | Contrato + obligación legal (Convenio CMR) + interés legítimo (defensa ante reclamaciones) | 6 años (art. 30 Código de Comercio). Las reclamaciones CMR prescriben en 1 año (3 si hay dolo), pero el CMR es documento mercantil |
| 6 | **Documentos subidos** (almacén de archivos) | Clientes, transportistas, conductores | Hoja CIF, DNI, seguro, tarjeta de transporte, albaranes, fotos | Alta y verificación; prueba del servicio | Contrato / obligación legal | Mientras dure la relación + 6 años; DNI del alta: hasta verificar, salvo que haga falta después |
| 7 | **Facturación y pagos** (Holded, Stripe) | Clientes (personas de contacto) | Datos de facturación; el número de tarjeta **lo trata Stripe, Dynamo no lo ve** | Cobrar y facturar | Contrato + obligación legal (fiscal) | 6 años (mercantil); 4 años mínimo (fiscal, art. 66 LGT) |
| 8 | **Registros de seguridad** (`auditoria`, `intentos_carga_publica`, alta online) | Cualquiera que use la plataforma o los enlaces públicos | Quién hizo qué y cuándo (email), IP en los intentos | Seguridad, prueba de cambios | Interés legítimo (6.1.f) | Auditoría: 6 años (anonimizada si se pide la supresión). IPs: **90 días** (se borran solas cada noche) |
| 9 | **Avisos de la campana** (`avisos`) | Clientes, transportistas, Dynamo | Texto del aviso, envío relacionado | Informar del servicio | Contrato | 90 días (ya se borran solos) |
| 10 | **Notas internas** (`notas_internas`) | Usuarios, clientes, transportistas, conductores | Lo que escriba el equipo | Gestión interna | Interés legítimo | Mientras dure la relación. **Escribir solo lo necesario y nada ofensivo**: el interesado puede pedir verlas (derecho de acceso) |

Fuera de la plataforma, pero relacionado: la **web pública** (`dynamotrans.com`): formulario
del tarifador, WhatsApp, email, Google Translate, cookies y analítica. Revisar el aviso legal,
la política de privacidad (`/#privacidad`) y la de cookies con el asesor.

## 3. Encargados de tratamiento (proveedores)

| Proveedor | Para qué | Dónde están los datos | Comprobar |
|---|---|---|---|
| **Supabase** | Base de datos, cuentas, archivos | **Irlanda (eu-west-1), UE** | DPA firmado; asistente de IA con compartición **desactivada** (ya está) |
| **Vercel** | Alojamiento de la web y la plataforma | Global (EE. UU.) | DPA + cláusulas contractuales tipo / Marco de Privacidad UE-EE. UU. |
| **Stripe** | Cobro con tarjeta | UE / EE. UU. | Es responsable propio de los datos de tarjeta; DPA |
| **Holded** | Facturación | España / UE | DPA |
| **Postmark** (pendiente) | Emails de la plataforma | EE. UU. | DPA + garantías de transferencia |
| **Brevo** | Emails comerciales | Francia, UE | DPA; base para comerciales = consentimiento o interés legítimo B2B |
| **Google** | Maps (pendiente), Translate (web) | EE. UU. | Condiciones de tratamiento de datos de Google Cloud |
| **WhatsApp / Meta** | Contacto con clientes y transportistas | EE. UU. | Si se usa para avisos automáticos, WhatsApp Business con DPA |
| **OpenStreetMap (Nominatim)** | Buscador de direcciones de la web pública (hoy) | UE | Se va a sustituir por Google Maps |

## 4. Derechos de las personas

Acceso, rectificación, supresión, oposición, limitación y portabilidad: por email a
info@dynamotrans.com, respuesta en **un mes**.

**El choque a resolver:** la auditoría y las firmas del CMR son **inalterables** a propósito
(son prueba). Ante una petición de **supresión**:

- Se **anonimiza** el dato en la ficha (nombre → «Persona eliminada», DNI y teléfono → vacíos o
  un código), **no se borran** las filas de auditoría.
- Las **firmas del CMR** y los datos necesarios para defender una reclamación se **conservan
  bloqueados** hasta que pase el plazo (art. 17.3.e RGPD: formulación, ejercicio o defensa de
  reclamaciones), y entonces se anonimizan.

## 5. Medidas de seguridad que ya tiene la plataforma

- Cada usuario solo ve los datos de **su empresa**: lo impone la base de datos (seguridad por
  filas), no la pantalla. Comprobado con 121 pruebas automáticas antes de cada cambio.
- **Notas internas** de Dynamo en una tabla que solo lee Dynamo.
- **Auditoría** de cada alta, cambio y baja: quién, qué y cuándo.
- **Archivos** en almacenamiento privado; se abren con enlaces firmados de un minuto.
- El **contacto del conductor** deja de verlo el cliente unas horas después de la entrega.
- **Límites de intentos** en los enlaces públicos (CIF, alta online, PIN) y suspensión
  automática por uso anómalo.
- **Modo mantenimiento** que bloquea también la base de datos.
- Conexión cifrada (HTTPS), contraseñas gestionadas por Supabase (nunca en tablas propias).
- **Pendiente del usuario:** verificación en dos pasos en Supabase, Vercel y GitHub; copia de
  seguridad con restauración probada.

## 6. Pendientes

**Técnicos (equipo técnico):**
- [x] Limpieza automática cada noche (`purgar_datos_personales`, pg_cron 4:53): IP de reservas e intentos a los 90 días; tiempo conectado y consultas de precio a los 12 meses (hecho 2026-11-05).
- [x] «**Anonimizar**» (solo Admin Master): botón en la ficha del usuario; contacto y conductor con `anonimizar_contacto(id)` / `anonimizar_conductor(id)` desde Supabase. La auditoría apunta qué se borró, sin los valores (hecho 2026-11-05).
- [x] «**Exportar datos**» (JSON): cada usuario desde Mi cuenta → Editar mis datos; Dynamo desde la ficha del usuario (hecho 2026-11-05).
- [x] Teléfono de los conductores sin viajes en 2 años: lo borra la limpieza nocturna (hecho 2026-11-05).
- [x] Cláusula informativa en la página de firma del CMR (hecho 2026-11-05).

**Del usuario con el asesor:**
- [ ] Confirmar bases jurídicas y plazos de §2.
- [ ] Política de privacidad y aviso legal actualizados (web, registro, página de la carga, CMR).
- [ ] Registro de actividades de tratamiento (la tabla de §2 es la base).
- [ ] Firmar los DPA de §3 y guardar las copias.
- [ ] Decidir si hace falta DPD.
- [ ] Procedimiento para atender derechos (quién responde, en qué plazo, cómo se verifica la identidad).
