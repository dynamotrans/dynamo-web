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

| # | Punto | Hoy (mockup) | En la plataforma real |
|---|---|---|---|
| 01 | Front sin secretos | ✅ no aplica (sin build) | ⚠️ reglas nuevas con Next.js |
| 02 | RLS en la base de datos | ❌ no hay BD | 🔴 **crítico** — migración 0012 |
| 03 | Control de versiones | ✅ cumplido | ✅ se mantiene |
| 04 | APIs de verdad | ❌ no hay | 🔴 **crítico** — precio server-side |
| 05 | Hosting y deploy | ✅ cumplido | ✅ se mantiene |
| 06 | Seguridad | 🟡 parcial (falta CSP) | 🔴 **crítico** |
| 07 | Rate limiting | ❌ no hay | 🔴 **crítico** — ahora sí cuesta dinero |
| 08 | Caché | ✅ de facto (CDN) | 🟡 cuidado con cachear datos de usuario |
| 09 | Escalabilidad | ✅ de facto (estático) | 🟡 colas y pooling |
| 10 | Monitoreo | 🟡 solo uptime | 🔴 **crítico** |
| 11 | **Backups con restauración probada** | ❌ | 🔴 **lo más crítico de todo** |
| 12 | **Auditoría** | ✅ hecha (regla 12) | ✅ ya montada en la 0002 |
| 13 | **RGPD** | ❌ | 🔴 **crítico** — hay DNIs y firmas |
| 14 | **Control de coste** | ❌ | 🔴 **crítico** |

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

**Hoy**: no hay base de datos. El mockup muestra todo a todos a propósito, mientras se
diseña.

**En la plataforma real** — migración `0012_rls_politicas.sql`:

- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en **todas** las tablas.
  Sin `FORCE`, el dueño de la tabla se salta las políticas.
- Política por rol, partiendo de **denegar por defecto**: el cliente solo sus envíos, el
  transportista solo los viajes que tiene asignados, el empleado según la matriz, el
  admin todo.
- **Las reglas de negocio que YA están decididas y hay que imponer aquí**, no en el front:
  - **Regla 11 (anti-desintermediación)**: el teléfono del conductor y los datos de
    contacto del transportista **desaparecen para el cliente** cuando el envío pasa a
    entregado o cancelado. Hoy solo lo oculta `telConductorHTML()` en JavaScript, que no
    es seguridad: hay que filtrarlo en la política.
  - **El cliente NUNCA ve**: `factor_tarifa_porcentaje`, el precio del transportista ni
    el margen. Son columnas, así que hace falte una **vista** por rol, porque RLS filtra
    filas y no columnas.
  - **El transportista NUNCA ve** su `estado_operativo` ni su `valoracion_dynamo`.
  - Las **notas privadas de cliente sobre un lugar** (`lugar_notas_cliente`): la de un
    cliente no la puede leer otro.

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

- **CSP**. Es la que falta. Hay que construirla a medida porque la web carga Google
  Translate, GTM/Ads, `cdn.jsdelivr.net` y fuentes de Google. ⚠️ **Probarla en preview
  antes de `main`**: una CSP mal puesta rompe Google Translate y el tarifador en
  silencio, sin error visible.
- **Auth**: Supabase Auth. **2FA obligatorio para los roles admin y empleado** — son los
  que ven los precios de compra, los márgenes y todos los clientes.
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
  **ya existen como columnas** en la tabla `usuarios` (`limite_ppto_diario`,
  `limite_cargas_diario`, venían de tu Sheet) — solo hay que cablearlos.
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

---

## 10 · Monitoreo

**Hoy**: 🟡 workflow de GitHub Actions que comprueba `dynamotrans.com` cada 2 h y manda
email si cae. Cubre "¿está en pie?", nada más.

**En la plataforma real**:
- **Captura de errores** (Sentry o equivalente), front y backend.
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

**Ya hecha** — es la **regla 12** de `CLAUDE.md` y la migración `0002_auditoria_y_sellos.sql`:
las cuatro columnas en todas las tablas con hora del servidor, tabla `auditoria`
append-only con el antes y el después en `jsonb`, impuesta con **triggers** y no desde el
código, y la vista `v_tablas_sin_rastro` como chivato.

Tampoco está en la guía de los 10 puntos, y para defenderte de una reclamación vale más
que la caché y la escalabilidad juntas.

**Queda por hacer en producción**: los **14 hitos** del envío (`envio_hitos`, migración
0008) y revisar que `v_tablas_sin_rastro` devuelve 0 filas después de cada migración.

---

## 13 · RGPD  🔴

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

---

## 14 · Control de coste  🔴

**Tampoco está en la guía**, y es lo que convierte un pico de tráfico en una factura.

- **Límite de gasto** en Vercel y en Supabase, configurado antes de abrir el portal.
- **Cuotas diarias por API** en Google Cloud para la clave de Maps (punto 06).
- **Alerta de presupuesto** por email al 50 % y al 80 %.
- Vigilar el **plan de Supabase** según crezcan los datos: un salto de plan sorpresa a
  mitad de mes es mejor verlo venir.

---

## Lo que NO cambia respecto a hoy

Todo esto convive con las reglas que ya están en `CLAUDE.md` y no las sustituye: precios
con 2 decimales (regla 0), PDFs en el visor y no descarga forzada (0-bis), iconos SVG
(0-ter), componentes del diseño actual (0-quater), medidas oficiales de los camiones
(0-quinquies), push automático a preview y confirmación para `main` (regla 1), el portal
nunca a `main` sin frase explícita (regla 7), cambios públicos desde `main` (regla 8),
altas sin duplicados (regla 10), contacto del transportista oculto al finalizar (regla 11)
y auditoría universal (regla 12).
