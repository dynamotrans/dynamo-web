// Datos de prueba para las pruebas en navegador, en un Supabase LOCAL (supabase start):
// usuarios de Dynamo, cliente y transportista con sus empresas y la agenda del cliente.
// Uso: SUPABASE_URL=… SERVICE_ROLE_KEY=… DB_URL=… node tests/e2e/semilla.mjs
// Nunca contra el Supabase de verdad: se niega si la URL no es local.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!/127\.0\.0\.1|localhost/.test(URL) || !/127\.0\.0\.1|localhost/.test(DB)) throw new Error('La semilla solo va contra un Supabase local.');
const sb = createClient(URL, process.env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export const CLAVE = 'Prueba-2026!';
export const USUARIOS = { dynamo: 'dynamo@e2e.test', cliente: 'cliente@e2e.test', transportista: 'transportista@e2e.test' };

const ids = {};
for (const [k, email] of Object.entries(USUARIOS)) {
  const { data: lista } = await sb.auth.admin.listUsers();
  const ya = lista.users.find((u) => u.email === email);
  if (ya) { ids[k] = ya.id; continue; }
  const { data, error } = await sb.auth.admin.createUser({ email, password: CLAVE, email_confirm: true, user_metadata: { nombre: `Prueba ${k}` } });
  if (error) throw error;
  ids[k] = data.user.id;
}

// Empresas, roles y agenda: como superusuario (lo que en producción se hace desde Supabase).
const sql = `
insert into clientes (razon_social, cif, pais_codigo_iso)
  values ('Cliente Pruebas S.L.', 'B12345674', 'ES') on conflict do nothing;
insert into transportistas (razon_social, cif, bolsa, codigo_bolsa, estado_operativo)
  values ('Transportes Prueba S.L.', 'B76543214', 'wtransnet', 'E2E-1', 'activo') on conflict do nothing;
update usuarios set rol = 'admin', estado = 'activa' where id = '${ids.dynamo}';
-- El cliente de pruebas queda EXENTO de la suspensión automática: entre todas las pruebas
-- pide más precios en un día de los que se le permiten a una cuenta normal (regla 3: 15) y
-- se quedaba suspendido a mitad de la pasada. Las reglas de suspensión se prueban en la
-- suite de la base de datos, no aquí.
update usuarios set rol = 'cliente', estado = 'activa', exento_autosuspension = true, cliente_id = (select id from clientes where cif = 'B12345674') where id = '${ids.cliente}';
update usuarios set rol = 'transportista', estado = 'activa', transportista_id = (select id from transportistas where cif = 'B76543214') where id = '${ids.transportista}';
-- Con coordenadas (2026-11-22): el mapa del envío las usa para situar paradas y camión.
insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon)
  select c.id, x.n, 'almacen_nave', x.d, x.cp, x.p, x.pr, 'ES', x.la, x.lo from clientes c,
    (values ('Almacén Sevilla', 'Calle Uno 1', '41001', 'Sevilla', 'Sevilla', 37.3891, -5.9845), ('Nave Madrid', 'Calle Dos 2', '28001', 'Madrid', 'Madrid', 40.4250, -3.6830)) x(n, d, cp, p, pr, la, lo)
   where c.cif = 'B12345674' and not exists (select 1 from sitios s where s.cliente_id = c.id and s.nombre_empresa = x.n);
-- Teléfono y email del contacto del sitio son obligatorios al crear envío (2026-11-09).
insert into contactos (sitio_id, nombre, telefono, email, es_principal)
  select s.id, 'Contacto ' || s.nombre_empresa, '+34600123123', 'sitio@pruebas.es', true
    from sitios s join clientes c on c.id = s.cliente_id
   where c.cif = 'B12345674' and not exists (select 1 from contactos k where k.sitio_id = s.id);
`;
execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: 'inherit' });
console.log('semilla lista', ids);
