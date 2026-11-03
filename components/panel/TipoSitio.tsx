// Tipos de sitio y su icono (lista del usuario, 2026-11-03; iconos del mockup):
// fábrica = Almacén/Nave/Campa · cono = Obra en zona amplia · edificios = Obra en zona
// urbana · espiga = Finca. Todo lo que NO es Almacén/Nave lleva recargo: va en ROJO.
export const TIPOS_LUGAR: [string, string][] = [
  ['almacen_nave', 'Almacén / Nave / Campa'],
  ['obra_zona_amplia', 'Obra · acceso en zona amplia'],
  ['obra_zona_urbana', 'Obra · acceso en zona urbana'],
  ['finca', 'Finca / zona agrícola o rústica'],
];
export const nombreTipo = (t: string | null | undefined) => TIPOS_LUGAR.find(([k]) => k === t)?.[1] ?? 'Almacén / Nave';

const TRAZOS: Record<string, string[]> = {
  almacen_nave: ['M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M17 18h1', 'M12 18h1', 'M7 18h1'],
  obra_zona_amplia: ['M16.05 10.97a5 2.5 0 0 1-8.1 0', 'm16.92 14.05 4.48 2.04a1 1 0 0 1 0 1.83l-8.57 3.9a2 2 0 0 1-1.66 0l-8.58-3.91a1 1 0 0 1 0-1.83l4.49-2.04', 'M16.95 14.14a5 2.5 0 1 1-9.9 0L10.06 3.5a2 2 0 0 1 3.88 0z'],
  obra_zona_urbana: ['M3 8h7v13H3z', 'M14 3h7v18h-7z', 'M6 12h1', 'M6 16h1', 'M17 7h1', 'M17 11h1', 'M17 15h1'],
  finca: ['M2 22 16 8', 'M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z', 'M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z', 'M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z', 'M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z', 'M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z', 'M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z', 'M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z'],
};

export function IconoTipo({ tipo }: { tipo: string | null | undefined }) {
  const k = tipo && TRAZOS[tipo] ? tipo : 'almacen_nave';
  return (
    <span className="rf-tipo-ico" title={nombreTipo(k)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" style={k !== 'almacen_nave' ? { color: '#dc2626' } : undefined}>
        {TRAZOS[k].map((d, i) => <path key={i} d={d} />)}
      </svg>
    </span>
  );
}
