// Estado vacío con propósito (tarea 83, revisión de usabilidad 2026-11-12): cuando una
// lista no tiene NADA todavía (primer uso), en vez de un «no hay datos» seco se explica
// para qué sirve la pantalla y se ofrece el primer paso. Sirve igual desde componentes
// de servidor (acción = <Link>) y de cliente (acción = <button onClick>): el botón lo
// pone quien llama. Los «sin resultados con este filtro» NO usan esto: ahí el texto
// corto de siempre basta.
export default function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', padding: '1rem 0.5rem', textAlign: 'center' }}>
      <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 'var(--fs-d1)' }}>{titulo}</span>
      <p style={{ margin: 0, maxWidth: 560, color: 'var(--gray-600)', fontSize: 'var(--fs-m)', lineHeight: 1.55 }}>{texto}</p>
      {accion}
    </div>
  );
}
