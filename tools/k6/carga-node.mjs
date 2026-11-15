// ESPEJO EN NODE de tools/k6/carga.js (tarea 67), para entornos donde no se puede
// ejecutar el binario de k6 (p. ej. el sandbox de Claude): mismas páginas (entrar,
// /carga/<token falso>, /cmr/<token falso>) y mismos perfiles (humo 5×30s · carga
// 15→40 en 4 min · estres 40→120 en 6 min). Uso:
//   npm i undici   (una vez, donde se vaya a correr)
//   BASE_URL=https://<preview>.vercel.app VERCEL_JWT=<cookie _vercel_jwt> \
//     node tools/k6/carga-node.mjs [humo|carga|estres]
// La cookie sale del «acceso temporal» de Vercel (la preview va con SSO): abrir el
// enlace compartible y copiar la cookie _vercel_jwt, o pedirla por la API. Respeta
// HTTPS_PROXY si existe. El guion canónico sigue siendo carga.js (k6).
import { Agent, ProxyAgent, request } from 'undici';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL;
if (!BASE) { console.error('Falta BASE_URL (la preview)'); process.exit(1); }
const JWT = (process.env.VERCEL_JWT ?? '').trim();
const dispatcher = process.env.HTTPS_PROXY
  ? new ProxyAgent({ uri: process.env.HTTPS_PROXY, connect: process.env.PROXY_CA ? { ca: readFileSync(process.env.PROXY_CA) } : undefined, connections: 256 })
  : new Agent({ connections: 256 });

const tokenFalso = () => `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`;
const paginas = () => [
  ['entrar', `${BASE}/panel/entrar`],
  ['carga', `${BASE}/carga/${tokenFalso()}`],
  ['cmr', `${BASE}/cmr/${tokenFalso()}`],
];

// Un «usuario virtual»: recorre las 3 páginas en bucle hasta que se acabe el tiempo.
async function usuario(finEn, stats) {
  while (Date.now() < finEn) {
    for (const [nombre, url] of paginas()) {
      const t0 = performance.now();
      try {
        const r = await request(url, { dispatcher, headers: { cookie: `_vercel_jwt=${JWT}` }, headersTimeout: 30000, bodyTimeout: 30000 });
        await r.body.text();
        const ms = performance.now() - t0;
        const s = stats[nombre];
        s.n++; s.ms.push(ms);
        if (r.statusCode !== 200) s.err++;
      } catch {
        const s = stats[nombre];
        s.n++; s.err++; s.ms.push(performance.now() - t0);
      }
      if (Date.now() >= finEn) break;
    }
  }
}

function pct(xs, p) { const a = [...xs].sort((x, y) => x - y); return a.length ? Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]) : 0; }

async function tramo(nombre, vus, segundos, stats) {
  const finEn = Date.now() + segundos * 1000;
  process.stderr.write(`  tramo ${nombre}: ${vus} usuarios · ${segundos}s\n`);
  await Promise.all(Array.from({ length: vus }, () => usuario(finEn, stats)));
}

const PERFILES = {
  humo: [[5, 30]],
  carga: [[15, 60], [40, 120], [10, 60]],
  estres: [[40, 120], [120, 180], [20, 60]],
};

const perfil = process.argv[2] ?? 'humo';
const stats = { entrar: { n: 0, err: 0, ms: [] }, carga: { n: 0, err: 0, ms: [] }, cmr: { n: 0, err: 0, ms: [] } };
const t0 = Date.now();
for (const [vus, seg] of PERFILES[perfil]) await tramo(perfil, vus, seg, stats);
const durS = (Date.now() - t0) / 1000;

let totN = 0, totE = 0; const todas = [];
console.log(`\nPERFIL ${perfil} · ${Math.round(durS)}s totales`);
for (const [nombre, s] of Object.entries(stats)) {
  totN += s.n; totE += s.err; todas.push(...s.ms);
  console.log(`  ${nombre.padEnd(7)} n=${String(s.n).padStart(5)}  errores=${s.err}  p50=${pct(s.ms, 50)}ms  p95=${pct(s.ms, 95)}ms  p99=${pct(s.ms, 99)}ms  max=${Math.round(Math.max(0, ...s.ms))}ms`);
}
console.log(`  TOTAL   n=${totN}  errores=${totE} (${(100 * totE / Math.max(1, totN)).toFixed(2)}%)  p95 global=${pct(todas, 95)}ms  ~${(totN / durS).toFixed(1)} peticiones/s`);
if (totE / Math.max(1, totN) > 0.01) { console.log('  ⚠ UMBRAL SUPERADO: más del 1% de errores'); process.exit(1); }
