'use client';

// Fila de tabla que se abre al pulsarla (como en el mockup: cualquier fila abre su
// "Ver detalle"). Los enlaces y botones de dentro siguen funcionando por su cuenta.
import { useRouter } from 'next/navigation';

export default function FilaEnlace({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr className={className} style={{ cursor: 'pointer' }} tabIndex={0}
      onClick={(ev) => { if ((ev.target as HTMLElement).closest('a,button,input,select')) return; router.push(href, { scroll: false }); }}
      onKeyDown={(ev) => { if (ev.key === 'Enter') router.push(href, { scroll: false }); }}>
      {children}
    </tr>
  );
}
