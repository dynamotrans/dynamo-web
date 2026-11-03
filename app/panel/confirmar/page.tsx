'use client';

// Aquí llegan los enlaces de los emails de Supabase (invitación y "he olvidado mi
// contraseña"). Según cómo venga el enlace, trae el permiso en la dirección (#…), como
// ?token_hash o como ?code. Se canjea por una sesión y se va a crear la contraseña.
import { useEffect, useState } from 'react';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import Cargando from '@/components/Cargando';
import { IcoAviso } from '@/components/Iconos';
import { supabaseNavegador } from '@/lib/supabase/navegador';

type Tipo = 'invite' | 'recovery' | 'signup' | 'email' | 'magiclink';

export default function Confirmar() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const sb = supabaseNavegador();
      if (!sb) { setError('La plataforma no está conectada a la base de datos.'); return; }
      const q = new URLSearchParams(window.location.search);
      const h = new URLSearchParams(window.location.hash.slice(1));
      if (h.get('error') || q.get('error')) {
        setError('Este enlace ya no vale: ha caducado o ya se usó. Pide otro desde «¿Olvidaste tu contraseña?» o a Dynamo.');
        return;
      }
      let r: { error: { message: string } | null } = { error: { message: 'sin datos' } };
      if (h.get('access_token') && h.get('refresh_token')) {
        r = await sb.auth.setSession({ access_token: h.get('access_token')!, refresh_token: h.get('refresh_token')! });
      } else if (q.get('token_hash')) {
        r = await sb.auth.verifyOtp({ type: (q.get('type') || 'invite') as Tipo, token_hash: q.get('token_hash')! });
      } else if (q.get('code')) {
        r = await sb.auth.exchangeCodeForSession(q.get('code')!);
      }
      if (r.error) {
        setError('Este enlace ya no vale: ha caducado o ya se usó. Pide otro desde «¿Olvidaste tu contraseña?» o a Dynamo.');
        return;
      }
      // Recarga completa: así el servidor ya ve la sesión en las cookies.
      window.location.replace('/panel/nueva-contrasena');
    })();
  }, []);
  return (
    <TarjetaAcceso titulo="Comprobando el enlace">
      {error
        ? <div className="pt-aviso error" role="alert"><IcoAviso /><div>{error}</div></div>
        : <Cargando texto="Comprobando el enlace" />}
    </TarjetaAcceso>
  );
}
