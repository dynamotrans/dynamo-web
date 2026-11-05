// Recibe los informes de la CSP (lo que el navegador habría bloqueado) y los deja en los
// registros de Vercel (Logs → buscar «[CSP]»). No guarda nada más ni devuelve datos.
export const dynamic = 'force-dynamic';

const MAX = 16 * 1024;   // un informe normal ocupa ~1 KB: lo demás se ignora

export async function POST(req: Request) {
  try {
    const texto = (await req.text()).slice(0, MAX);
    const datos = JSON.parse(texto);
    // Dos formatos: el antiguo { "csp-report": {...} } y el nuevo [{ type, body }].
    const lista = Array.isArray(datos) ? datos.map((r) => r?.body ?? r) : [datos?.['csp-report'] ?? datos];
    for (const r of lista.slice(0, 20)) {
      const directiva = r?.['effective-directive'] ?? r?.effectiveDirective ?? r?.['violated-directive'] ?? '?';
      const bloqueado = r?.['blocked-uri'] ?? r?.blockedURL ?? '?';
      const pagina = r?.['document-uri'] ?? r?.documentURL ?? '?';
      const muestra = String(r?.['script-sample'] ?? r?.sample ?? '').slice(0, 80);
      // Las direcciones /carga/<llave> y /cmr/<llave> son llaves de acceso: no se guardan.
      const sinLlave = (u: unknown) => String(u).split('?')[0].replace(/\/(carga|cmr)\/[^/#]+/g, '/$1/…').slice(0, 200);
      console.warn('[CSP]', JSON.stringify({ directiva, bloqueado: sinLlave(bloqueado), pagina: sinLlave(pagina), muestra }));
    }
  } catch { /* informe roto: se ignora */ }
  return new Response(null, { status: 204 });
}
