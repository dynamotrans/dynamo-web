'use client';

// Banda roja de «Cuenta suspendida — solo lectura». Se quita SOLA en cuanto reactivan la
// cuenta (usuario, 2026-11-18: «ya le funciona todo, pero sigue saliendo el mensaje»). La
// pinta el marco del panel, que no se vuelve a pedir al servidor al pasar de una pantalla a
// otra: sin esto, la banda se quedaba hasta recargar la página a mano.
// Mientras esté a la vista pregunta por el estado de la cuenta al cambiar de pantalla, al
// volver a la pestaña y cada 15 segundos. Cuando ya está activa, se esconde y pide a «en
// vivo» que ponga la página al día (con sus reglas: nunca mientras se está escribiendo).
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { estadoDeMiCuenta } from '@/app/panel/vista';
import { EVENTO_SENAL } from './EnVivo';

export default function BandaSuspension({ telefono, email }: { telefono: string; email: string }) {
  const [activa, setActiva] = useState(false);
  const ruta = usePathname();
  useEffect(() => {
    if (activa) return;
    let vivo = true;
    const mirar = () => {
      if (document.hidden) return;
      estadoDeMiCuenta().then((e) => {
        if (!vivo || e !== 'activa') return;
        setActiva(true);
        window.dispatchEvent(new Event(EVENTO_SENAL));
      }).catch(() => {});
    };
    mirar();
    const reloj = setInterval(mirar, 15000);
    document.addEventListener('visibilitychange', mirar);
    return () => { vivo = false; clearInterval(reloj); document.removeEventListener('visibilitychange', mirar); };
  }, [activa, ruta]);
  if (activa) return null;
  return (
    <div className="pt-aviso error" role="status" id="banda-suspension" style={{ margin: '0 0 1rem' }}>
      <div><strong>Cuenta suspendida — solo lectura.</strong> Puedes consultarlo todo, pero no crear ni cambiar nada.
        Para reactivarla, llámanos al {telefono} o escribe a {email}.</div>
    </div>
  );
}
