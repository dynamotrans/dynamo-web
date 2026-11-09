// Etiqueta ÚNICA de los formularios de toda la plataforma (criterio del usuario,
// 2026-11-09): cada campo que puede quedar vacío dice SIEMPRE si es obligatorio (rojo)
// u opcional (gris). Los interruptores y selectores con valor por defecto no la llevan.
export default function Req({ si = true }: { si?: boolean }) {
  return si
    ? <span className="campo-oblig">· obligatorio</span>
    : <span className="campo-opc">· opcional</span>;
}
