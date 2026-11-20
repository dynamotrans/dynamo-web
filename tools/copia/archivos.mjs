// Copia de los archivos subidos (Supabase Storage) a una carpeta: todos los buckets, todas
// las carpetas. Lo usa tools/copia/hacer-copia.sh. Necesita SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY (secretos de GitHub, nunca en el repo).
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const destino = process.argv[2] ?? 'archivos';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function listar(bucket, carpeta = '') {
  const salida = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(carpeta, { limit: 1000, offset: desde });
    if (error) throw new Error(`${bucket}/${carpeta}: ${error.message}`);
    for (const o of data) {
      const ruta = carpeta ? `${carpeta}/${o.name}` : o.name;
      if (o.id === null) salida.push(...(await listar(bucket, ruta)));   // es una carpeta
      else salida.push(ruta);
    }
    if (data.length < 1000) break;
  }
  return salida;
}

const { data: buckets, error } = await sb.storage.listBuckets();
if (error) throw new Error(error.message);
let n = 0;
for (const b of buckets) {
  for (const ruta of await listar(b.name)) {
    const { data, error: e } = await sb.storage.from(b.name).download(ruta);
    if (e) throw new Error(`${b.name}/${ruta}: ${e.message}`);
    const f = join(destino, b.name, ruta);
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, Buffer.from(await data.arrayBuffer()));
    n++;
  }
}
console.log(`${n} archivos copiados de ${buckets.length} buckets.`);
