# PRODUCCIÓN — checklist de lanzamiento de la plataforma Dynamo

> **Qué es esto.** La lista que hay que repasar **antes de poner la plataforma real en
> producción** (Supabase + Next.js + código, ya sin Sheet de por medio). No aplica al
> mockup estático de hoy: muchos puntos no se pueden cumplir todavía porque no existe
> ni backend ni base de datos.
>
> **Por qué existe.** Para que el día del despliegue no se nos olvide nada de seguridad
> por ir con prisa. Partimos de una checklist de 10 puntos de *production readiness*
> (guía de Hugo Calderón, junio 2026) y le añadimos **4 que faltaban** y que para un
> operador de transporte pesan más que la mitad de los otros.
>
> **Cómo se usa.** Cada punto tiene: qué exige · estado hoy · qué hay que hacer en la
> plataforma real · **cómo se comprueba** (si no se puede comprobar, no está hecho).
>
> ⚠️ **ESTA LISTA ES UNA PUERTA, NO UNA SUGERENCIA** (petición del usuario, 2026-10-25:
> *"cuando montemos en real, debe estar todo muy seguro, acuérdate de revisarlo"*).
> El día que el usuario autorice publicar el portal (regla 7 de `CLAUDE.md`), **lo
> primero que se hace es repasar esto entero, antes del merge**. Un punto solo pasa a
> cumplido con una comprobación que lo demuestre; *"creo que sí"* no cumple nada.
> Los seis que más pesan, por orden: **permisos por fila probados · quitar el login
> demo de `portal.html` · vistas por rol (RLS filtra filas, NO columnas) · copias con
> restauración probada · RGPD · CSP**. Detalle en la regla 14-bis de `CLAUDE.md`.

### Estado (repaso del 2026-11-05, plataforma Next.js + Supabase en la rama `pruebas`)

Leyenda: ✅ hecho y comprobado · 🟡 hecho en parte · ❌ falta · 👤 lo tiene que hacer el usuario.

| # | Punto | Estado | Qué falta |
|---|---|---|---|
| 01 | Front sin secretos | ✅ En el navegador solo van `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (públicas por diseño). Clave de servicio, Stripe y Holded, solo en el servidor. | 👤 Comprobar en Vercel que las claves secretas están marcadas *Sensitive* y sin `NEXT_PUBLIC_`. |
| 02 | RLS en la base de datos | ✅ Todas las tablas con permisos por fila. **122 pruebas automáticas** (`tools/probar-migraciones`) antes de cada cambio. | Repetirlas contra el proyecto real el día del lanzamiento. `FORCE RLS` **no**: las funciones del sistema tienen que saltarse la RLS a propósito (con su propia comprobación de quién llama). |
| 03 | Control de versiones | ✅ Git + migraciones numeradas que nunca se editan. | — |
| 04 | APIs de verdad (precio en el servidor) | 🟡 **Ojo (repaso 2026-11-23):** desde el 08-nov el cliente crea y modifica envíos con el precio del tarifador, y ese precio llega **desde su navegador**: la base de datos solo comprueba que esté entre 0 y 100.000 €. Contraofertas, revisión de precio y cancelaciones sí se validan en la BD. | **Recalcular el precio en el servidor** al crear/modificar (misma fórmula del tarifador) y usar ese, no el que llega. Antes de clientes reales. |
| 05 | Hosting y deploy | ✅ Vercel, preview por rama. | — |
| 06 | Seguridad (CSP, cabeceras) | 🟡 Plataforma en modo **bloquear** (2026-11-22); web pública en *solo avisar*. | Pasar la web pública a bloquear con su rama de `main`. |
| 07 | Rate limiting | 🟡 Límites en la base de datos: consultas de precio (suspensión automática), intentos de CIF por carga y por reserva, alta online (3 por carga, 30 al día), contraofertas del cliente (3 en 24 h), PIN (3 fallos), cancelaciones. Login: los de Supabase Auth. | 👤 Revisar *Rate Limits* de Supabase Auth; valorar Vercel Firewall por IP. |
| 08 | Caché | ✅ Las pantallas con datos de usuario son dinámicas (`force-dynamic`), no se cachean. | — |
| 09 | Escalabilidad | 🟡 Plan gratuito de Supabase y Vercel Hobby. | 👤 Pasar a planes de pago antes de clientes reales (copias, límites, soporte). |
| 10 | Monitoreo | 🟡 Uptime de la web pública; errores en los registros de Vercel. | Alertas de errores de la plataforma: Sentry instalado, falta el DSN del usuario. |
| 11 | **Copias con restauración probada** | 🟡 Copia diaria de Supabase (plan de pago). **Hecha (2026-11-20)** la copia propia semanal, cifrada, fuera de Supabase, con los archivos subidos y **restauración automática comprobada** (`tools/copia/LEEME.md`). | 👤 Poner los 4 secretos en GitHub para que empiece a funcionar. |
| 12 | **Auditoría** | ✅ Cada alta, cambio y baja; historial «quién y cuándo» en cada ficha. | — |
| 13 | **RGPD** | 🟡 Borrador completo en `RGPD.md`; cláusula en la firma del CMR; notas internas solo para Dynamo. | 👤 Revisarlo con el asesor; política de privacidad; DPA de proveedores. Técnico: anonimizar, exportar datos, borrar IPs a los 90 días. |
| 14 | **Control de coste** | ❌ | 👤 Límite de gasto y alertas en Vercel, Supabase y Google Cloud. |
| 15 | **Repaso de seguridad 2026-11-03** | 🟡 Ver la tabla de abajo. | `SITE_URL`, Redirect URLs, 2FA, Stripe, aviso al email antiguo (Postmark). |
| 16 | **Revisión de seguridad 2026-11-04** | ✅ Dos revisores independientes sobre 30 migraciones: sin escaladas ni fugas entre empresas; los huecos de reglas de negocio, cerrados (migraciones `revision_seguridad`, `seguridad_puntos_bajos`, `notas_internas`). | Repetir una revisión así antes del lanzamiento sobre todo lo nuevo. |

**Además, imprescindible el día del lanzamiento:** que `portal.html` (login demo) no llegue a
producción; mantenimiento probado; pg_cron activo (suspensiones, ofertas, limpieza de avisos, `dynamo-pagos-caducados` cada 15 min, `dynamo-revision-precios` cada hora).

---

## 01 · Front-end sin secretos

**Qué exige**: que el código del navegador no lleve claves ni lógica sensible.

**Hoy**: no hay bundler ni build, así que no hay source maps. 0 secretos en el repo
(comprobado en todo el historial de git: nunca se ha commiteado un `.env`).

**En la plataforma real** (Next.js), tres reglas que son la trampa habitual:

- **La clave `anon` de Supabase es PÚBLICA por diseño** y va en el front: eso es
  correcto y no es una fuga. Pero solo es segura **si RLS está activo** (punto 02). Sin
  RLS, la clave anon es una llave maestra.
- **La clave `service_role` NUNCA toca el navegador.** Se salta toda la seguridad de la
  base de datos. Solo en funciones de servidor, y nunca en una variable `NEXT_PUBLIC_*`.
- **La clave de Google Maps es pública obligatoriamente** (la usa el navegador). La
  única protección real son las **restricciones de la clave**: ver punto 06.

**Cómo se comprueba**: buscar en el bundle de producción `service_role`, `sk_live`,
`SUPABASE_SERVICE` y cualquier `secret`. Y comprobar que todo lo que empieza por
`NEXT_PUBLIC_` es algo que se puede publicar en un periódico sin problema.

---

## 02 · RLS — seguridad por filas

**Qué exige**: que cada usuario solo lea y modifique sus propias filas, impuesto por la
base de datos y no por el front.

**Hoy** (2026-11-03): **políticas por rol HECHAS y PROBADAS** en `dynamo-pruebas`
(migración `20261103010000_permisos_por_rol.sql`). El arnés `tools/probar-migraciones/probar.sh`
recorre **74 comprobaciones** (a 2026-11-03) con dos clientes, un transportista, un empleado y dos admins,
también las de las etapas B y C (el cliente pide y acepta su precio; el transportista marca su viaje, sube
su albarán y descarga su orden de carga) y el **modo mantenimiento impuesto en la base de datos** (70).
El mockup sigue mostrando todo a todos, a propósito: la web aún no está conectada.

**El modelo** (la frase clave: *la seguridad por filas filtra FILAS, no COLUMNAS*):
- **Dynamo** (admin/empleado) lee y escribe las tablas.
- **Cliente y transportista leen por FUNCIONES** que devuelven solo sus filas y solo sus
  columnas: `mis_envios()`, `mis_viajes()`, `mis_ofertas()`, `mi_empresa()`,
  `mi_empresa_transportista()`, `mis_penalizaciones()`, `mis_penalizaciones_transportista()`.
  **No leen** `envios`, `envio_paradas`, `clientes`, `transportistas` ni `penalizaciones`.
- **Los envíos los escriben solo Dynamo y el servidor**: el cliente no toca la tabla. Pide su envío
  con `crear_solicitud_envio()` (sin precio: se lo pone Dynamo), lo acepta con
  `responder_precio_solicitud()` y lo cancela con `cancelar_mi_envio()`. El transportista solo avanza
  SU viaje con `marcar_mi_viaje()` (hacia delante). Cuando llegue el tarifador, el precio lo calculará
  el servidor, nunca el navegador.
- Lo que el cliente gestiona solo y no lleva dinero (sus sitios, operadores, contactos,
  incidencias, almacenamientos) va por tabla con su política.

**Comprobación rápida en cualquier base (pruebas o real)**:
`select * from v_tablas_sin_rls;` → **0 filas**.

**Cumplido y probado:**
- ✅ `ENABLE ROW LEVEL SECURITY` en **todas** las tablas, en la propia migración de cada una;
  toda vista con `security_invoker = true`.
- ✅ **Regla 11**: `mis_envios()` quita nombre y teléfono del conductor al entregar o cancelar.
- ✅ **El cliente NUNCA ve** factor de tarifa, riesgo, precio del transportista ni margen
  (comprobaciones 26, 33, 38, 41). Tampoco puede **ponerse el precio** (38).
- ✅ **El transportista NUNCA ve** su estado operativo, su valoración, su pronto pago, su email
  de contabilidad, el precio del cliente ni quién es el cliente (40).
- ✅ **Sitios, operadores, incidencias, documentos y almacenamientos**: cada cliente lo suyo (21-36).
- ✅ **Roles**: nadie se cambia su propio rol; solo un admin concede admin (41).

**Pendiente:**
- `FORCE ROW LEVEL SECURITY`: sin él, el dueño de la tabla se salta las políticas. No aplica a
  la API (entra como `anon`/`authenticated`), pero sí a una conexión directa con la contraseña
  de la base. **Activarlo a ciegas rompe** los triggers `SECURITY DEFINER` que escriben como
  dueño (el perfil al registrarse, la auditoría, los hitos). Se decide antes del lanzamiento,
  tabla a tabla, con el arnés verde. Mientras: la contraseña de la base, solo en el gestor.
- **La función del servidor** que crea y modifica envíos (recalcula el precio) y las que envuelven
  reservar/aceptar carga: es código de la app, no de la base. Cuando exista, probarla igual.

**Cómo se comprueba**: tests de aislamiento. Dos clientes, cada uno con un envío; con el
token del cliente A pedir el envío del cliente B por su id directo y **esperar 0 filas**,
no un error. Y repetirlo para cada tabla.

---

## 03 · Control de versiones

**Qué exige**: historial, ramas y `.gitignore` con los secretos fuera.

**Hoy**: ✅ cumplido y por encima. `main` + preview, ramas cortas `fix/`, reglas 1, 7, 8
y 9 escritas en `CLAUDE.md`. `.gitignore` con `.env*`, `*.pem`, `*.key`, `node_modules/`,
`.next/`, `.vercel/` (añadido el 2026-10-12).

**En la plataforma real**: se mantiene igual. Y las migraciones de Supabase van
versionadas en `supabase/migrations/`, numeradas y en orden — nunca editando una ya
ejecutada, siempre añadiendo la siguiente.

---

## 04 · APIs de verdad

**Qué exige**: endpoints claros, validación de entrada, errores consistentes.

**Hoy**: no hay. El mockup calcula todo en el navegador con datos de prueba.

**En la plataforma real**, y esto es lo más importante del punto:

- **El precio se calcula SIEMPRE en el servidor.** El tarifador del navegador es una
  estimación para que el usuario vea algo; el precio que se guarda lo recalcula el
  backend con la tabla `tarifas`. Si el precio viaja del navegador al servidor y se
  guarda tal cual, cualquiera se pone un envío a 1 €.
- **Idempotencia al crear envíos**: la clave de idempotencia ya está anotada como
  pendiente desde julio. Sin ella, un doble clic o un reintento de red crea dos envíos.
- Validación de entrada con esquemas (Zod), errores con el mismo formato, y la lógica de
  negocio separada de las rutas HTTP.
- **Replicar server-side las validaciones que hoy solo están en el front**: emails sin
  espacios y con `@`, teléfonos solo dígitos, CIF con checksum, y los `UNIQUE` de la
  regla 10 (que ya los impone la migración 0003).

**Cómo se comprueba**: mandar a mano una petición con un precio manipulado y confirmar
que el servidor lo ignora y guarda el suyo.

---

## 05 · Hosting y deploy

**Qué exige**: estar en producción de verdad, con despliegue automático.

**Hoy**: ✅ cumplido. Vercel conectado a GitHub, push a `main` → `dynamotrans.com`,
preview por rama, plan Pro.

**En la plataforma real**:
- Variables de entorno **separadas por entorno** (producción / preview / desarrollo), y
  la base de datos de preview **nunca apuntando a la de producción**.
- La protección de preview de Vercel ya está en `all_except_custom_domains`: las URLs
  `*.vercel.app` piden login y solo `dynamotrans.com` es pública. Se mantiene.
- **Regla 7 intacta**: el portal no llega a producción sin frase explícita del usuario.

---

## 06 · Seguridad

**Qué exige**: auth sólida, sanitización, cabeceras.

**Hoy**: 🟡 6 cabeceras en `vercel.json` (nosniff, X-Frame-Options DENY, XSS-Protection,
Referrer-Policy, Permissions-Policy, HSTS 1 año). **Falta la CSP.** No hay auth: el login
del mockup es un bypass a propósito.

**En la plataforma real**:

- **CSP de la PLATAFORMA — EN MODO BLOQUEAR desde el 2026-11-22** (`BLOQUEAR = true` en `lib/csp.ts`):
  comprobado con las 114 pruebas de navegador (Chrome y móvil) en modo bloquear y una sonda que escucha
  los avisos en /panel/entrar, /panel/registro, /panel/olvido, /panel/confirmar y /carga. Al hacerlo
  salió que **/carga y /panel/confirmar se generaban fijas** (sin llave → sus scripts bloqueados, p. ej.
  los enlaces de invitación y de «he olvidado mi contraseña»): ahora se generan en cada visita
  (`dynamic = 'force-dynamic'`). ⚠️ **Regla**: toda página nueva bajo /panel, /carga, /cmr, /deca, /baja,
  /matriculas o /cargas-de-vuelta tiene que ser dinámica (en el `next build` no debe salir con ○).
  Sin `upgrade-insecure-requests` (todo va por https con HSTS y en local rompería). Lo que queda: la
  **web pública** sigue en solo avisar (abajo).
- **CSP** — **puesta en modo *solo avisar* (Report-Only) en `pruebas` el 2026-11-04**:
  · **Plataforma** (`/panel`, `/carga`, `/cmr`): estricta, con **llave de un solo uso (nonce)
    por página** y `'strict-dynamic'` (la pone `middleware.ts`; reglas en `lib/csp.ts`).
    Comprobado en Chromium: todos los scripts de Next.js llevan la llave y no salta ningún aviso.
  · **Web pública** estática: lista de los servicios que ya usa (`next.config.mjs` → `CSP_PUBLICA`),
    con `'unsafe-inline'` porque es HTML fijo y no admite llave.
  · Los avisos llegan a `/api/csp-informe` y se ven en **Vercel → Logs**, buscando `[CSP]`.
  · **Para activarla de verdad**: con unos días de informes limpios en pruebas, poner
    `BLOQUEAR = true` en `lib/csp.ts` y cambiar la cabecera de `next.config.mjs` a
    `Content-Security-Policy` (+ `upgrade-insecure-requests`). Probar antes Google Translate,
    los PDF (orden, CMR, proforma), la firma del CMR y la subida de archivos.
  · En `main` (dynamotrans.com) todavía **no** hay CSP: va con la web pública por su rama, cuando
    la de pruebas esté limpia. ⚠️ Una CSP mal puesta rompe Google Translate y el tarifador en
    silencio, sin error visible.
- **Auth**: Supabase Auth. **2FA obligatorio para los roles admin y empleado** — son los
  que ven los precios de compra, los márgenes y todos los clientes.
- **2FA en las cuentas de servicio** (Supabase, GitHub y Vercel) del dueño: son las tres llaves
  de la plataforma. Supabase es además el ÚNICO sitio donde se cambian el IBAN y los datos
  fiscales de Dynamo (migración `parametros_blindados`). Comprobación: en cada una, la página de
  seguridad de la cuenta dice «Two-factor authentication: enabled» y hay códigos de
  recuperación guardados.
- **Las reglas del cambio de rol** ya decididas: solo un admin concede admin, nunca a sí
  mismo, re-autenticación antes del cambio, y siempre ≥1 admin activo (esto último ya lo
  impone la migración 0004 con un trigger). El resto va en el endpoint + RLS.
- **La clave de Google Maps**: es pública por fuerza, así que la protección son las
  restricciones. Sin ellas, cualquiera la copia de tu web y te factura sus consultas.
  - Restricción por **referente HTTP**: solo `dynamotrans.com` y `*.dynamotrans.com`.
  - Restricción por **API**: solo las que de verdad usas (Places, Geocoding, Distance
    Matrix), ninguna más.
  - **Cuota diaria** por API, por debajo de lo que te dolería pagar.
  - Clave **distinta** para preview y para producción.
- **El enlace público de aceptar carga**: hoy es `?e=GX…` sin token. Y el GX es un
  correlativo de paso fijo +7 → **enumerable**: 1 de cada 7 números acierta. Antes de
  producción ese enlace necesita un **token aleatorio** (`envios.token_publico`), no el
  GX. El GX se queda para operativa y facturación.
- **Las firmas del CMR** necesitan valor probatorio real: token de un solo uso, OTP por
  SMS, hash del documento, sello de tiempo y auditoría. Ya está anotado desde julio.

**Cómo se comprueba**: la CSP, con la consola del navegador en cada página; las
restricciones de la clave de Maps, intentando usarla desde otro dominio (debe fallar).

---

## 07 · Rate limiting

**Qué exige**: un tope de peticiones para que nadie te queme el saldo.

**Hoy**: no hay, y **no hay nada que quemar**: la web es estática. El único servicio de
pago por uso será Google Maps (ver abajo).

**En la plataforma real**, por orden de lo que cuesta dinero:

- **Google Maps API** (autocompletado de direcciones, geocodificación, distancias): se
  paga por petición. Es el que más riesgo tiene, porque se llama **desde el navegador**
  y en cada tecleo. Mitigaciones: debounce (ya lo hay, 350 ms), **sesiones de
  autocompletado** (Places las factura por sesión, no por tecla, si se usan bien),
  **caché de las búsquedas repetidas** — la mayoría son los mismos polígonos y CP de
  siempre — y las cuotas del punto 06.
- **Brevo / email y WhatsApp**: se pagan por envío. Límite por usuario y por día.
- **Endpoints de creación**: envíos, presupuestos, incidencias. Los límites por usuario
  **ya existen como columnas** en la tabla `usuarios` (`limite_consultas_precio_diario`,
  `limite_envios_diario`, venían de tu Sheet) — solo hay que cablearlos.
- **Login y recuperación de contraseña**: límite por IP, o te prueban contraseñas.
- Devolver **429** con un mensaje claro, y **registrar quién abusa**.

---

## 08 · Caché

**Hoy**: ✅ de facto. Sitio estático servido por el CDN de Vercel. Cachés propias en
`localStorage` para festivos (30 días) y país por IP.

**En la plataforma real** — y aquí hay una trampa que cuesta un disgusto:

- **NUNCA cachear en una caché compartida una respuesta con datos de un usuario.** Es
  la forma más fácil de servirle a un cliente los envíos de otro, y pasa por encima de
  todo el RLS que hayas escrito. Lo que se cachea: catálogos, tarifas, festivos, páginas
  públicas. Lo que no: nada que dependa de quién pregunta.
- Las consultas de "último precio de esta ruta" no necesitan caché: con el índice de la
  migración 0007 responden en menos de 1 ms.
- Caché agresiva **sí** para las llamadas a Google Maps (punto 07): ahí ahorra dinero.

---

## 09 · Escalabilidad

**Hoy**: ✅ de facto, HTML estático escala solo.

**En la plataforma real**:
- **Los índices ya están escritos** en las migraciones, incluido el de "último precio de
  esta ruta para este cliente".
- **Pooling de conexiones**: obligatorio con Vercel. Cada función serverless abre su
  conexión y Postgres se queda sin cupo. Supabase da el pooler (Supavisor) — hay que usar
  **la cadena de conexión del pooler**, no la directa.
- **A colas lo que tarda**: generar PDFs (CMR, orden, proforma), publicar en bolsas de
  carga, mandar emails y WhatsApp. Nada de eso debe bloquear la respuesta al usuario.
- La **publicación diferida en bolsas** (3 minutos tras crear o modificar, ya decidida)
  es justo un trabajo en cola.
- **Plataforma en vivo (Supabase Realtime, 2026-11-06)** — ✅ hecho en `pruebas`. Cada cambio
  manda una señal **sin datos** por un canal privado («dynamo», «cliente:<id>»,
  «transportista:<id>»; migración `en_vivo`) y la pantalla se vuelve a pedir con sus permisos.
  Una señal por sentencia, nunca bloquea un cambio. Coste: cada tanda de cambios = 2 refrescos
  de la página abierta por cada usuario conectado que le toque (uno + uno de confirmación).
  Plan gratuito de Supabase: 200 conexiones de Realtime a la vez y 2 M de mensajes al mes,
  de sobra hoy; vigilarlo al crecer. **Al lanzar**: en Supabase → Realtime → Settings,
  **quitar «Allow public access»** para que solo existan canales privados (la plataforma ya
  solo usa privados; así nadie puede abrir uno público).

---

## 10 · Monitoreo

**Hoy**: 🟡 workflow de GitHub Actions que comprueba `dynamotrans.com` cada 2 h y manda
email si cae. Cubre "¿está en pie?", nada más.

**En la plataforma real**:
- **Captura de errores (Sentry)** — 🟡 **instalada y apagada** (2026-11-06). Se enciende sola
  al poner el DSN en Vercel; sin él no se carga ni se envía nada. Captura: errores del
  servidor (páginas, acciones, rutas, vía `instrumentation.ts`) y del navegador (pantallas
  de error `app/global-error.tsx` y `app/panel/(app)/error.tsx`, vía `lib/avisoError.ts`,
  que descarga Sentry solo si hay DSN). Sin datos personales (`sendDefaultPii: false`),
  sin medir rendimiento y sin grabar pantallas. La CSP de la plataforma ya admite
  `*.ingest.sentry.io` / `*.ingest.de.sentry.io`.
  **Para activarla (usuario):**
  1. Crear cuenta en sentry.io eligiendo **región UE (Frankfurt)** — datos en la UE (RGPD).
     El plan gratuito (5.000 errores/mes) sobra.
  2. Crear proyecto tipo **Next.js**, copiar el **DSN** (Settings → Client Keys). El DSN no
     es secreto (solo sirve para enviar avisos), pero va en variables, no en el código.
  3. Vercel → dynamo-web → Settings → Environment Variables: `SENTRY_DSN` y
     `NEXT_PUBLIC_SENTRY_DSN`, ambas con el mismo DSN, en Preview (y Production el día del
     lanzamiento). Volver a desplegar.
  4. En Sentry → Alerts: regla «un error nuevo → email a info@dynamotrans.com».
  5. Opcional: subir los mapas de código para ver la línea exacta (`SENTRY_AUTH_TOKEN` +
     `withSentryConfig`); no hace falta para recibir los avisos.
- **Logs de Supabase** revisados, y alertas de los errores de las políticas de RLS: un
  pico de "permission denied" significa o un bug o alguien probando.
- **Alertas de lo que es dinero o compromiso**: una orden de transporte que no se envió,
  un email que rebotó, un pago que falló, un CMR sin firmar el día de la carga.
- **Métricas de negocio**, no solo técnicas: cuántos envíos se quedan sin transportista
  pasada la hora de corte. Eso lo da la tabla `envio_hitos` sin trabajo extra.

---

## 11 · Copias de seguridad CON restauración probada  🔴

**No está en la guía de los 10 puntos, y es lo más grave de todo.** Perder la base de
datos de una plataforma de transporte es perder los envíos, los albaranes, los CMR
firmados y la trazabilidad de las reclamaciones.

- Supabase hace backups diarios en el plan **Pro**; en **Free** son limitados y de
  retención corta. Antes de meter datos reales hay que estar en un plan con backups.
- **Un backup que nunca has restaurado no es un backup.** Hay que hacer una restauración
  completa a un proyecto aparte, al menos una vez, y cronometrarla: así sabes cuánto
  tardarías de verdad en volver a estar en pie.
- Además de los backups de Supabase: una **exportación periódica propia** (`pg_dump`) a
  otro sitio. Si se pierde la cuenta de Supabase, los backups de Supabase se van con ella.
- Los **ficheros** (CMR firmados, albaranes, adjuntos) viven en Supabase Storage: entran
  en el mismo plan de copias.

**Cómo se comprueba**: una restauración real, con fecha anotada. Repetir cada 6 meses.

---

## 12 · Auditoría  ✅

**Ya hecha** — es la **regla 12** de `CLAUDE.md` y la migración `20261102090200_auditoria_y_sellos.sql`:
las cuatro columnas en todas las tablas con hora del servidor, tabla `auditoria`
append-only con el antes y el después en `jsonb`, impuesta con **triggers** y no desde el
código, y la vista `v_tablas_sin_rastro` como chivato.

Tampoco está en la guía de los 10 puntos, y para defenderte de una reclamación vale más
que la caché y la escalabilidad juntas.

**Queda por hacer en producción**: los **14 hitos** del envío (`envio_hitos`, migración
0008) y revisar que `v_tablas_sin_rastro` devuelve 0 filas después de cada migración.

---

## 13 · RGPD  🔴

> **Borrador completo en `RGPD.md` (2026-11-05)**: inventario de datos, bases jurídicas y plazos propuestos, proveedores, derechos, medidas y pendientes. Para revisar con el asesor.

**Tampoco está en la guía.** La plataforma va a guardar **datos personales**: nombre,
DNI/NIE y teléfono de conductores, y **firmas de CMR con valor probatorio**.

- **Base jurídica** de cada tratamiento y **plazo de conservación** (el CMR tiene plazos
  legales propios; los teléfonos de conductores, no).
- **Encargados de tratamiento** que hay que listar: Supabase, Vercel, Brevo, Holded,
  Google (Maps y Translate), WhatsApp/Meta.
- **El choque que hay que resolver a mano**: el **derecho de supresión** contra la
  **auditoría append-only**. La salida es **anonimizar** — sustituir el dato personal por
  un marcador o un hash en la tabla de origen — y **no borrar** la fila de auditoría.
  Está ya comentado en el SQL de `conductores.documento` y `usuarios.documento`.
- Aviso de privacidad y registro de actividades de tratamiento actualizados antes de abrir.
- **Asistente de IA de Supabase: compartición de datos DESACTIVADA.** En *Ajustes de la
  organización → General → Privacidad de datos* hay un selector que decide si Supabase envía
  el esquema y/o los **registros** de la base de datos a proveedores de IA externos para que su
  asistente responda mejor. Con DNIs de conductores y firmas de CMR dentro, **no hay base
  jurídica** para eso. Hoy (2026-11-02) está en *Desactivado*; **cómo se comprueba**: abrir esa
  pantalla antes del lanzamiento y verificar que sigue en *Desactivado*. "Esquema solamente"
  sería discutible; "Esquema y registros" es inaceptable.

---

## 14 · Control de coste  🔴

**Tampoco está en la guía**, y es lo que convierte un pico de tráfico en una factura.

- **Límite de gasto** en Vercel y en Supabase, configurado antes de abrir el portal.
- **Cuotas diarias por API** en Google Cloud para la clave de Maps (punto 06).
- **Alerta de presupuesto** por email al 50 % y al 80 %.
- Vigilar el **plan de Supabase** según crezcan los datos: un salto de plan sorpresa a
  mitad de mes es mejor verlo venir.
- **Autorrelleno de datos de empresas (APIEmpresas.es)** — construido y apagado (2026-11-22). Para
  encenderlo: (1) cuenta en apiempresas.es; probar con las 100 consultas gratis usando CIF reales
  conocidos; (2) comprar el **bono de 9 € / 1.000 consultas** (no caduca; nada de suscripción);
  (3) crear la clave y pegarla en Vercel como `APIEMPRESAS_API_KEY` (Sensitive, Preview y
  Production; nunca en el chat ni en el repo); (4) en Parámetros → Plataforma: encender, y en
  «consultas que quedan» poner las del bono (p. ej. 1000). El aviso de saldo bajo llega solo.
  **Al encenderlo, comprobar con su documentación** las rutas de la API y los nombres de los
  campos (`lib/apiEmpresas.ts`; salieron de un ticket de Gemini) con una consulta real.

---

## 15 · Repaso de seguridad del 2026-11-03 — lo que quedó para el lanzamiento  🔴

Salió de revisar la plataforma en `pruebas` (detalle en `TODO.md`, bloque *Repaso de
seguridad del 2026-11-03*). Lo que ya estaba bien y lo arreglado ese día está allí; aquí
solo lo que **hay que hacer o comprobar antes de abrir el portal**.

| Qué | Qué hay que hacer | Cómo se comprueba |
|---|---|---|
| **Cambio de email de una cuenta** (puerta para quedarse con ella) | ✅ Solo el Admin Master (2026-11-04), con autor en la auditoría. Falta, con Postmark: **aviso al email antiguo**. | Con un Empleado gestor, intentar cambiar el email de un cliente → debe negarse (si así se decide). Tras un cambio permitido, llega el aviso al email viejo y la auditoría dice quién fue. |
| **Dirección fija de los enlaces de email** | En Vercel (Production): `SITE_URL=https://dynamotrans.com`. | Pedir «contraseña olvidada» en producción: el enlace del email lleva `dynamotrans.com`, nunca `*.vercel.app`. |
| **Redirect URLs de Supabase** | Dejar **solo** las direcciones propias (producción y, si hace falta, pruebas). **Ningún comodín `*`**. | Authentication → URL Configuration: la lista no tiene `*` ni dominios ajenos. |
| **CSP** (punto 06) | Ponerla primero en modo *Report-Only* en pruebas, revisar avisos, luego activarla. | La cabecera `Content-Security-Policy` sale en la respuesta real; Google Translate, el tarifador y los PDF siguen funcionando. |
| **Login demo de `portal.html`** | Que no llegue a producción (quitarlo o redirigir a `/panel/entrar`). | En `dynamotrans.com/portal.html` no se entra con un email y contraseña inventados. |
| **2FA** | Activar la verificación en dos pasos (passkey donde se pueda) en la cuenta de Google/email, Supabase, GitHub, Vercel, Holded, Postmark, Stripe y el dominio; códigos de recuperación en papel y gestor de contraseñas; un segundo administrador en Supabase, Vercel y GitHub; doble paso obligatorio del equipo encendido (lo hace el usuario; lista en `TODO.md`). | En la seguridad de cada cuenta figura 2FA activo; en **Usuarios** de la plataforma, todo el equipo con ✓. |
| **Límite de intentos** del código de 6 cifras y de «contraseña olvidada» | Revisar Authentication → Rate Limits al configurar Postmark. | Repetir el código mal varias veces → Supabase bloquea durante un rato. |
| **Clave de servicio** | Solo en Vercel, marcada *Sensitive*, sin `NEXT_PUBLIC_`. | En Vercel → Environment Variables; y buscar la clave en el JavaScript que descarga el navegador → 0 coincidencias. |
| **Captcha (Cloudflare Turnstile) de registro y olvido** | Está montado con las **claves de prueba** de Cloudflare (sale el rótulo «Testing only» y siempre pasa). Antes de producción, el usuario crea el sitio en su cuenta de Cloudflare (gratis, 2 min, dominio `dynamotrans.com`) y pone en Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública) y `TURNSTILE_SECRET_KEY` (*Sensitive*). | En `/panel/registro` y `/panel/olvido` el widget sale SIN el rótulo «Testing only»; un envío con el token manipulado devuelve «No hemos podido comprobar que no eres un robot». |
| **Pruebas de carga (k6)** | Antes de abrir a clientes, Claude corre `tools/k6/carga.js` con los perfiles `carga` y `estres` contra la PREVIEW (nunca contra producción con clientes dentro) mirando el panel de Supabase, y guarda el resumen en `tools/k6/`. El perfil `humo` ya corre solo en cada push (CI). | El resumen de la pasada: `http_req_failed` ~0 % y p95 razonable a 40 usuarios; sin avisos de conexiones en Supabase. |
| **Stripe (pago con tarjeta del previo pago)** | En Vercel, *Sensitive*: `STRIPE_SECRET_KEY` (clave secreta, `sk_live_…` en producción, `sk_test_…` en pruebas) y `STRIPE_WEBHOOK_SECRET` (`whsec_…`). En Stripe → Developers → Webhooks: `https://<dominio>/api/stripe/webhook`, eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`. Necesita también la clave de servicio de Supabase. | Pagar un envío de prueba con la tarjeta 4242 4242 4242 4242 en modo test → el envío pasa solo a «Pendiente de asignar» y Stripe muestra el webhook con 200. Un aviso con firma falsa da 400. |

## 16 · e-CMR con validez reforzada  🟡

**Hecho (2026-11-22)**: (1) la firma del CMR y sus reservas **solo las registra nuestro servidor** con la
clave de servicio: hora, IP, navegador y huella SHA-256 de lo firmado los pone él, y la base de datos rechaza
la clave pública (`solo_servidor`); necesita `SUPABASE_SERVICE_ROLE_KEY` en Vercel **también en Production**
(sin ella no se puede firmar). (2) **Código de 6 cifras al email** de quien firma, que sale solo al abrir la ventana de firma y se pide antes de firmar (sin código solo si no le llega): con él la firma
queda «email verificado» en la hoja y en el PDF; el código no se guarda (solo su huella), caduca a los 15 min,
5 intentos, topes por email y envío; sale al momento, sin copia a Dynamo. Necesita `POSTMARK_SERVER_TOKEN`
en Production.

**Antes de abrir**: (4) **sello electrónico de Dynamo** (PAdES) en el PDF del CMR, con un certificado de
SELLO de empresa de **Uanataca** (decidido: es el prestador de su gestor), comprado para esto (nunca el de
representante del administrador); (5) **confirmación del
asesor** de si vale como firma electrónica avanzada. **A futuro**: (3) sello de tiempo cualificado. Detalle en `TODO.md` (v1).

## 17 · Mapa del envío  🟡

**Hecho (2026-11-22)**: ventana con la ruta y el camión en su posición **estimada** (no es GPS), en las fichas
y en la lista de envíos, y el **mapa general** de envíos en curso (Dynamo y cliente). **Antes de abrir —
decidido: GOOGLE MAPS** para mapas, rutas, coordenadas y buscador de direcciones (Places). Cuenta de Google
Cloud con **tope de gasto**, claves restringidas a nuestro dominio y a esas APIs; sustituir las teselas de
OpenStreetMap (solo pruebas: su norma no admite uso intensivo de una empresa) y la búsqueda de CP de
Nominatim por Google, y dibujar la ruta por carretera.

## 18 · Entrada de albaranes desde Drive  🟡

**Hecho (2026-11-22)**: entrada `/api/documentos-entrada` (clave `ENTRADA_DOCUMENTOS_TOKEN`, comparada en
tiempo constante; el archivo va directo al almacén con un enlace firmado; se mira su contenido real y su
huella; tope de 300 al día) y pantalla «Verificación albaranes». **Antes de abrir**: clave en Vercel
**Production** (distinta de la de pruebas), el script de Google apuntando al dominio de producción y, si
la clave se viera alguna vez, cambiarla el mismo día (Vercel y propiedades del script).

---

## 19 · Control de pedidos: «revisar desde»  🟡

- [ ] En **Parámetros → Control de facturación → «revisar desde»**, poner el **día de arranque** en producción (en pruebas está en 2026-11-23). Así el control y el email de los lunes no cuentan los envíos antiguos que se carguen ni los de prueba (usuario, 2026-11-23: el email decía «30054 casos» por los ~15.000 envíos ficticios de pruebas).

## 20 · Repaso «que no me hackeen la app» (vídeo, 2026-11-23)  🟡

Repasados los 25 puntos de la lista del vídeo contra el código. Bien: autenticación (Supabase, contraseñas con hash, doble paso de Dynamo), permisos por fila en todas las tablas, HTTPS forzado (HSTS), cabeceras (CSP en modo bloquear en la plataforma), cookies seguras, ninguna clave en git ni en el navegador, validación de entradas en el servidor (Zod en las 193 acciones), consultas parametrizadas, rutas de Dynamo blindadas en la BD, enlaces que caducan, límite de tamaño y tipo de archivo, sin modo depuración, aviso de acceso nuevo, Sentry. Pendiente:
- [ ] **Precio en el servidor** (punto 04 de arriba): es el único hueco real.
- [ ] **Zod 3 → 4**: aviso «alto» de consumo de memoria con listas enormes; riesgo bajo (Next limita cada petición a 1 MB), pero hay que migrar.
- [ ] **Web pública**: CSP de «solo avisar» a «bloquear» (punto 06).
- [ ] **Límites de Supabase Auth** (intentos de entrada) y **Vercel Firewall** por IP (punto 07).
- [ ] Revisar dependencias cada mes (`npm audit`); hecho el 23-nov: Next 15.5.28 → 15.5.29 (5 avisos de Next y PostCSS). Quedan avisos solo de herramientas de compilación (PostCSS dentro de Next, glob/minimatch de Sentry), sin efecto en la web.

## Lo que NO cambia respecto a hoy

Todo esto convive con las reglas que ya están en `CLAUDE.md` y no las sustituye: precios
con 2 decimales (regla 0), PDFs en el visor y no descarga forzada (0-bis), iconos SVG
(0-ter), componentes del diseño actual (0-quater), medidas oficiales de los camiones
(0-quinquies), push automático a preview y confirmación para `main` (regla 1), el portal
nunca a `main` sin frase explícita (regla 7), cambios públicos desde `main` (regla 8),
altas sin duplicados (regla 10), contacto del transportista oculto al finalizar (regla 11)
y auditoría universal (regla 12).

## Carpeta privada `tarifa` (Supabase → Settings → API → Exposed schemas)
En **Exposed schemas** deben quedar solo `public` (y `graphql_public` si viene por defecto). **No añadir nunca `tarifa`**: ahí van los coeficientes y márgenes del tarifador y solo los leen las funciones de precio. La prueba 141 comprueba los permisos; lo de la API hay que mirarlo a mano en el panel de Supabase, en pruebas y en producción.

## Límite de filas de la API (Supabase → Settings → API → Max rows)

Por defecto, **1.000**. La plataforma lee las listas largas por tandas de 1.000
(`lib/leerTodo.ts`) y los conteos los hace la base de datos, así que funciona con ese valor.
**No bajarlo de 1.000** (si se baja, cambiar también `PAG` en `lib/leerTodo.ts`).

