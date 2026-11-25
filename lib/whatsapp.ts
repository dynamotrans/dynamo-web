// WHATSAPP (usuario, 2026-11-25): lo que llega de Meta, leído y comprobado. Sin red ni claves:
// funciones puras, con pruebas unitarias (tests/unit/whatsapp.test.ts); se usan también en el
// navegador. La firma de Meta (node:crypto) está en lib/whatsappFirma.ts; lo que habla con Meta,
// en lib/servidor/whatsapp.ts.
/** Teléfono en formato WhatsApp (+ y cifras con prefijo). Igual que tel_whatsapp() de la base de datos. */
export function telWhatsApp(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && /^[6789]/.test(d)) return `+34${d}`;
  if (d.startsWith('00')) return `+${d.slice(2)}`;
  return `+${d}`;
}

export type TipoMensaje = 'texto' | 'imagen' | 'documento' | 'audio' | 'video' | 'ubicacion' | 'contacto' | 'reaccion' | 'otro';

/** Un mensaje que llega, listo para whatsapp_registrar_entrada. */
export type Entrada = {
  telefono: string; nombre: string | null; wa_id: string; tipo: TipoMensaje; texto: string | null;
  meta_archivo_id: string | null; archivo_tipo: string | null; archivo_nombre: string | null; cuando: number | null;
};
/** Un aviso de estado de un mensaje que salió. */
export type Estado = { wa_id: string; estado: 'enviado' | 'entregado' | 'leido' | 'fallido'; error: string | null; cuando: number | null };

type Obj = Record<string, unknown>;
const o = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);
const num = (x: unknown): number | null => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };

const TIPOS: Record<string, TipoMensaje> = {
  text: 'texto', image: 'imagen', document: 'documento', audio: 'audio', voice: 'audio', video: 'video', sticker: 'imagen',
  location: 'ubicacion', contacts: 'contacto', reaction: 'reaccion',
};

function leerMensaje(m: Obj, nombres: Map<string, string>): Entrada | null {
  const wa = txt(m.id), de = txt(m.from);
  if (!wa || !de) return null;
  const tipoMeta = String(m.type ?? '');
  const tipo = TIPOS[tipoMeta] ?? 'otro';
  let texto: string | null = null, archivo: Obj = {};
  switch (tipoMeta) {
    case 'text': texto = txt(o(m.text).body); break;
    case 'image': case 'document': case 'audio': case 'voice': case 'video': case 'sticker':
      archivo = o(m[tipoMeta]); texto = txt(archivo.caption); break;
    case 'location': {
      const l = o(m.location);
      texto = [txt(l.name), txt(l.address), l.latitude != null && l.longitude != null ? `${l.latitude}, ${l.longitude}` : null].filter(Boolean).join(' · ') || null;
      break;
    }
    case 'contacts': {
      const c = (Array.isArray(m.contacts) ? m.contacts : []).map((x) => {
        const k = o(x); const nom = txt(o(k.name).formatted_name);
        const tel = (Array.isArray(k.phones) ? k.phones : []).map((p) => txt(o(p).phone)).filter(Boolean).join(', ');
        return [nom, tel].filter(Boolean).join(' ');
      }).filter(Boolean);
      texto = c.length ? `Contacto: ${c.join(' · ')}` : null;
      break;
    }
    case 'reaction': texto = txt(o(m.reaction).emoji); break;
    case 'button': texto = txt(o(m.button).text); break;
    case 'interactive': {
      const i = o(m.interactive);
      texto = txt(o(i.button_reply).title) ?? txt(o(i.list_reply).title);
      break;
    }
    default: texto = null;
  }
  return {
    telefono: telWhatsApp(de)!, nombre: nombres.get(de) ?? null, wa_id: wa, tipo,
    texto: texto ? texto.slice(0, 4096) : null,
    meta_archivo_id: txt(archivo.id), archivo_tipo: txt(archivo.mime_type), archivo_nombre: txt(archivo.filename),
    cuando: num(m.timestamp),
  };
}

const ESTADOS: Record<string, Estado['estado']> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };

/** Lo que trae un aviso de Meta: los mensajes que llegan y los estados de los que salieron. */
export function leerAviso(cuerpo: unknown): { entradas: Entrada[]; estados: Estado[] } {
  const entradas: Entrada[] = [], estados: Estado[] = [];
  const raiz = o(cuerpo);
  if (raiz.object !== 'whatsapp_business_account') return { entradas, estados };
  for (const e of Array.isArray(raiz.entry) ? raiz.entry : []) {
    for (const c of Array.isArray(o(e).changes) ? (o(e).changes as unknown[]) : []) {
      const v = o(o(c).value);
      const nombres = new Map<string, string>();
      for (const k of Array.isArray(v.contacts) ? v.contacts : []) {
        const id = txt(o(k).wa_id), n = txt(o(o(k).profile).name);
        if (id && n) nombres.set(id, n.slice(0, 120));
      }
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        const x = leerMensaje(o(m), nombres);
        if (x) entradas.push(x);
      }
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
        const so = o(s), id = txt(so.id), est = ESTADOS[String(so.status ?? '')];
        if (!id || !est) continue;
        const err = (Array.isArray(so.errors) ? so.errors : []).map((x) => {
          const eo = o(x); return [eo.code != null ? `(${eo.code})` : null, txt(eo.title), txt(o(eo.error_data).details)].filter(Boolean).join(' ');
        }).filter(Boolean).join(' · ');
        estados.push({ wa_id: id, estado: est, error: err ? err.slice(0, 500) : null, cuando: num(so.timestamp) });
      }
    }
  }
  return { entradas, estados };
}

/** Extensión para guardar un archivo según su tipo. */
export function extensionDe(mime: string | null | undefined, nombre?: string | null): string {
  const n = String(nombre ?? '').match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  if (n) return n;
  const m = String(mime ?? '').split(';')[0].trim().toLowerCase();
  return ({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'text/plain': 'txt',
  } as Record<string, string>)[m] ?? 'bin';
}

/** ¿Se puede contestar con texto libre? Meta: dentro de las 24 h siguientes al último mensaje de la persona. */
export function dentroDe24h(ultimaEntrada: string | null | undefined, ahora = Date.now()): boolean {
  if (!ultimaEntrada) return false;
  const t = new Date(ultimaEntrada).getTime();
  return Number.isFinite(t) && ahora - t < 24 * 3600 * 1000;
}
