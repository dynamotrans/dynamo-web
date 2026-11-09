// Etiqueta ÚNICA de los formularios de toda la plataforma (criterio del usuario,
// 2026-11-09): cada campo que puede quedar vacío dice SIEMPRE si es obligatorio (rojo)
// u opcional (gris). Los interruptores y selectores con valor por defecto no la llevan.
// `util`: tercera variante «· Muy útil» (verde negrita) — no es obligatorio pero
// conviene mucho (p. ej. el email de los sitios, para avisar de recogidas/entregas).
export default function Req({ si = true, util = false }: { si?: boolean; util?: boolean }) {
  if (util) return <span className="campo-util">· Muy útil</span>;
  return si
    ? <span className="campo-oblig">· obligatorio</span>
    : <span className="campo-opc">· opcional</span>;
}
