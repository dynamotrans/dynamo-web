'use client';

// ---- Una sola forma de elegir la hora en toda la plataforma (usuario, 2026-11-21) ----------
// Desplegable en formato 24 h (00:00 a 23:45), igual en cualquier móvil u ordenador: el
// <input type="time"> del navegador sale en AM/PM o con otro aspecto según el sistema.
// Pasos de 15 minutos (o los que diga `paso`); si el valor guardado no cae en un paso, se
// añade a la lista para no perderlo. Valor «HH:MM»; '' = sin hora (solo si `vacio`).

const lista = (paso: number) => Array.from({ length: Math.floor(1440 / paso) }, (_, i) => {
  const m = i * paso;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

export default function CampoHora({ value, onChange, id, paso = 15, vacio, className, style, disabled, 'aria-label': ariaLabel }: {
  value: string; onChange: (v: string) => void; id?: string;
  paso?: number;            // minutos entre opciones
  vacio?: string;           // texto de la opción «sin hora» (p. ej. «Sin hora»); sin él, no hay opción vacía
  className?: string; style?: React.CSSProperties; disabled?: boolean; 'aria-label'?: string;
}) {
  const horas = lista(paso);
  const opciones = !value || horas.includes(value) ? horas : [...horas, value].sort();
  return (
    <select id={id} className={className} style={{ width: 110, minWidth: 0, ...style }} value={value} disabled={disabled} aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}
