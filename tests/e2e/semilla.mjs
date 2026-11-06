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
insert into clientes (razon_social, nombre_comercial, cif, pais_codigo_iso)
  values ('Cliente Pruebas S.L.', 'Cliente Pruebas', 'B12345674', 'ES') on conflict do nothing;
insert into transportistas (razon_social, nombre_comercial, cif, bolsa, codigo_bolsa, estado_operativo)
  values ('Transportes Prueba S.L.', 'Transportes Prueba', 'B76543214', 'wtransnet', 'E2E-1', 'activo') on conflict do nothing;
update usuarios set rol = 'admin', estado = 'activa' where id = '${ids.dynamo}';
update usuarios set rol = 'cliente', estado = 'activa', cliente_id = (select id from clientes where cif = 'B12345674') where id = '${ids.cliente}';
update usuarios set rol = 'transportista', estado = 'activa', transportista_id = (select id from transportistas where cif = 'B76543214') where id = '${ids.transportista}';
insert into sitios (cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)
  select c.id, x.n, 'almacen_nave', x.d, x.cp, x.p, x.pr, 'ES' from clientes c,
    (values ('Almacén Sevilla', 'Calle Uno 1', '41001', 'Sevilla', 'Sevilla'), ('Nave Madrid', 'Calle Dos 2', '28001', 'Madrid', 'Madrid')) x(n, d, cp, p, pr)
   where c.cif = 'B12345674' and not exists (select 1 from sitios s where s.cliente_id = c.id and s.nombre_empresa = x.n);
`;
execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: 'inherit' });
console.log('semilla lista', ids);
