// Pruebas de CARGA con k6 (tarea 67): ¿aguanta la plataforma gente a la vez?
//
// Qué mide: las páginas públicas renderizadas por el servidor (entrar, aceptar carga,
// CMR) — cada una pasa por Next y por la base de datos (mantenimiento_activo,
// oferta_publica…) — y, si se le dan las señas de Supabase, la puerta pública de la
// base de datos llamada directamente (como la llamaría una avalancha de transportistas).
//
// Perfiles (--env PERFIL=…):
//   humo    (por defecto) · 5 usuarios, 30 s — canario del CI: detecta regresiones gordas.
//   carga   · sube hasta 40 usuarios en 4 min — el día a día esperado, multiplicado.
//   estres  · sube hasta 120 usuarios en 6 min — buscar el límite ANTES de producción.
//
// Cómo se corre (k6: https://k6.io, binario suelto, sin instalación):
//   BASE_URL=https://<preview>.vercel.app k6 run tools/k6/carga.js --env PERFIL=carga
//   (añadiendo SUPABASE_URL y SUPABASE_ANON_KEY también machaca la puerta de la BD)
// En el CI corre el perfil humo contra la pila local tras las pruebas de navegador.
//
// ⚠ El perfil estres solo contra la PREVIEW (nunca producción con clientes dentro), y
//   mirando el panel de Supabase: el plan gratuito tiene topes de conexiones.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const SB = __ENV.SUPABASE_URL || '';
const ANON = __ENV.SUPABASE_ANON_KEY || '';

const PERFILES = {
  humo: { vus: 5, duration: '30s' },
  carga: { stages: [{ duration: '1m', target: 15 }, { duration: '2m', target: 40 }, { duration: '1m', target: 0 }] },
  estres: { stages: [{ duration: '2m', target: 40 }, { duration: '3m', target: 120 }, { duration: '1m', target: 0 }] },
};

export const options = {
  ...(PERFILES[__ENV.PERFIL || 'humo'] || PERFILES.humo),
  thresholds: {
    // Umbrales holgados a propósito (el CI corre en una máquina compartida): son el
    // canario de una regresión GORDA, no el examen fino — ese se hace a mano con
    // `carga`/`estres` contra la preview, mirando los percentiles del resumen.
    http_req_failed: ['rate<0.01'],          // menos del 1 % de errores
    http_req_duration: ['p(95)<3000'],       // 95 % por debajo de 3 s
  },
};

// Un token con formato válido que no existe: recorre TODO el camino real (Next → RPC →
// índice de la tabla) y responde «enlace no válido» sin tocar datos de nadie.
const tokenFalso = () => `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`;

export default function () {
  const paginas = [
    ['entrar', `${BASE}/panel/entrar`],
    ['carga publica', `${BASE}/carga/${tokenFalso()}`],
    ['cmr publico', `${BASE}/cmr/${tokenFalso()}`],
  ];
  for (const [nombre, url] of paginas) {
    const r = http.get(url, { tags: { pagina: nombre } });
    check(r, { [`${nombre}: responde 200`]: (x) => x.status === 200 });
  }
  if (SB && ANON) {
    const cab = { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' } };
    const r = http.post(`${SB}/rest/v1/rpc/oferta_publica`, JSON.stringify({ p_token: tokenFalso() }), { ...cab, tags: { pagina: 'rpc oferta_publica' } });
    check(r, { 'rpc oferta_publica: responde 200': (x) => x.status === 200 });
  }
  sleep(1);
}
