'use client';

// «Vista: Lista / Vista: Calendario» de la pantalla de Envíos (mockup). Cambiar de vista
// conserva el buscador y los filtros de operador y creador; la de calendario añade el mes.
import { useRouter } from 'next/navigation';

export default function SelectorVistaEnvios({ vista, q, op, por, f }: { vista: 'lista' | 'calendario'; q: string; op: string; por: string; f: string }) {
  const router = useRouter();
  const ir = (v: string) => {
    const u = new URLSearchParams();
    const campos: Record<string, string> = v === 'calendario' ? { vista: 'calendario', q, op, por } : { f, q, op, por };
    Object.entries(campos).forEach(([k, x]) => { if (x) u.set(k, x); });
    router.replace(`/panel/envios${u.toString() ? `?${u}` : ''}`, { scroll: false });
  };
  return (
    <select className="vista-select" value={vista} aria-label="Tipo de vista de envíos" onChange={(ev) => ir(ev.target.value)}>
      <option value="lista">Vista: Lista</option>
      <option value="calendario">Vista: Calendario</option>
    </select>
  );
}
