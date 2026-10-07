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
| `0004_usuarios_y_roles.sql` | `usuarios` sobre Supabase Auth | pendiente |
| `0005_lugares.sql` | `lugares`, `lugar_notas_cliente` | pendiente |
| `0006_vehiculos_conductores.sql` | `vehiculos`, `conductores` | pendiente |
| `0007_envios.sql` | `envios` | pendiente |
| `0008_envio_puntos_hitos_ofertas.sql` | ruta, los 14 hitos, ofertas a transportistas | pendiente |
| `0009_operativa.sql` | `tickets`, `penalizaciones`, `almacenamientos`, `documentos`, `firmas_cmr` | pendiente |
| `0010_tarifas_parametros_plantillas.sql` | tarifas con vigencia, parámetros, plantillas de texto | pendiente |
| `0011_vistas_holded_wtransnet.sql` | vistas de exportación + métricas de cliente/transportista | pendiente |
| `0012_rls_politicas.sql` | seguridad por filas (RLS) por rol | pendiente |

## Verificado en local

Las 0001-0003 se han ejecutado contra un **PostgreSQL 16 real** (el mismo motor que usa
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
