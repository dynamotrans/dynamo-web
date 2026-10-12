# Migraciones de Supabase — Dynamo

Cada fichero se ejecuta **una vez y en orden** en el **SQL Editor** de Supabase
(Dashboard → SQL Editor → New query → pegar → Run). Están numerados a propósito: el
0002 tiene que estar antes de cualquier tabla de datos.

## Cómo ejecutarlas

1. Abrir el fichero, copiar **todo** el contenido.
2. Pegarlo en el SQL Editor de Supabase y pulsar **Run**.
3. Si sale verde, seguir con el siguiente. Si sale rojo, **parar** y pegarme el error.
4. Después de cada una, comprobar la regla 12:
   ```sql
   select * from v_tablas_sin_rastro;   -- debe devolver 0 filas
   ```

No hace falta instalar nada ni usar la CLI de Supabase. Y **no me hace falta ninguna
clave tuya**: yo escribo el SQL, tú lo ejecutas.

## Estado

| Fichero | Qué monta | Estado |
|---|---|---|
| `0001_enums_y_secuencias.sql` | Enums, catálogo de recargos por tipo de lugar, secuencias de código (incluida la del GX con paso +7) | ✅ listo |
| `0002_auditoria_y_sellos.sql` | Tabla `auditoria` append-only, `fn_sellar()`, `fn_auditar()`, `activar_rastro()` | ✅ listo |
| `0003_clientes_transportistas_contactos.sql` | `clientes`, `transportistas`, `contactos` | ✅ listo |
| `0004_usuarios_y_roles.sql` | `usuarios` sobre Supabase Auth, perfil automático al registrarse, protección del último admin | ✅ listo |
| `0005_lugares.sql` | `lugares` con dirección partida y borrado suave, `lugar_notas_cliente` | ✅ listo |
| `0006_vehiculos_conductores.sql` | `vehiculos` (matrículas) y `conductores` | ✅ listo |
| `0007_envios.sql` | `envios` | pendiente |
| `0008_envio_puntos_hitos_ofertas.sql` | ruta, los 14 hitos, ofertas a transportistas | pendiente |
| `0009_operativa.sql` | `tickets`, `penalizaciones`, `almacenamientos`, `documentos`, `firmas_cmr` | pendiente |
| `0010_tarifas_parametros_plantillas.sql` | tarifas con vigencia, parámetros, plantillas de texto | pendiente |
| `0011_vistas_holded_wtransnet.sql` | vistas de exportación + métricas de cliente/transportista | pendiente |
| `0012_rls_politicas.sql` | seguridad por filas (RLS) por rol | pendiente |

## Verificado en local

Las 0001-0006 se han ejecutado contra un **PostgreSQL 16 real** (el mismo motor que usa
Supabase) con un stub mínimo de `auth.users` y `auth.uid()`. Pruebas que pasan:

- Alta de cliente → código `C-10000` automático, `creado_en` y `creado_por` sellados.
- **Regla 10**: `B-91234567` y `b91234567 ` se reconocen como el mismo CIF y el segundo
  se rechaza. El mismo CIF **sí** entra a la vez como cliente y como transportista.
- El riesgo **manual manda** sobre el de CESCE, y al vaciarlo vuelve a mandar CESCE.
- **Regla 12**: la auditoría registra el antes/después y el email de quien lo hizo;
  un intento de falsear `creado_en` se revierte solo; `UPDATE` y `DELETE` sobre
  `auditoria` se bloquean con excepción.
- Un `factor_tarifa` de −45% se rechaza (rango −30/+30).
- Un teléfono polaco `+48221234567` entra (el regex `^\+34\d{9}$` del Sheet lo
  rechazaba, y ya tienes transportistas polacos en la hoja).
- Un contacto con dos dueños a la vez, o sin ningún canal de contacto, se rechaza.
- La secuencia GX da `GX100888689` → `GX100888696` → `GX100888703`: 11 caracteres y
  paso +7, como manda el diccionario del Sheet.
- `v_tablas_sin_rastro` devuelve 0 filas: no hay ninguna tabla que se pueda tocar sin
  dejar rastro.

### Añadido al verificar las 0004-0006

- El alta de un usuario crea su perfil sola, **sin rol admin y sin activar**
  (`pendiente_verificacion`). Cambiar el email en Auth se propaga al perfil.
- Una cuenta **no se puede activar** con rol cliente sin engancharla a su cliente, ni
  pertenecer a un cliente y a un transportista a la vez.
- **No se puede degradar, suspender ni borrar al único admin activo** — la regla que el
  panel comprobaba en JavaScript ahora la impone la base de datos, y cada cambio de rol
  queda en la auditoría con el antes y el después.
- Un lugar **no se puede marcar borrado sin fecha de borrado**. Los CP no españoles
  entran bien: `2400-016` (PT), `85-453` (PL), `N41 RW27` (IE), y `08185` conserva el cero.
- Una nota de cliente sobre un lugar es **una sola por pareja** cliente+lugar.
- `8221-LXV`, `8221 lxv` y `8221LXV` se reconocen como **la misma matrícula** y la segunda
  se rechaza. Pero si el camión se vende, marcándolo inactivo **sí** entra en el otro
  transportista (el UNIQUE es parcial a propósito).
- El mismo DNI no se da de alta dos veces como conductor del mismo transportista
  (`71357921F` == `71357921-f`).

### ⚠️ Fallo encontrado al probar (y por eso se prueba)

La primera versión de la 0004 exigía **siempre** que un usuario con rol `cliente`
tuviera un `cliente_id`. El trigger que crea el perfil al registrarse no puede saber
todavía a qué empresa pertenece, así que fallaba: **nadie podía darse de alta**.
Corregido — la pertenencia solo se exige cuando la cuenta pasa a `activa`, que son las
tres fases que ya tiene el portal (se registra → Dynamo lo verifica y lo engancha →
se activa). Revisando el SQL a ojo no se veía; ejecutándolo, salió en la primera prueba.
