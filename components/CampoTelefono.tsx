'use client';

// Teléfono con PREFIJO DE PAÍS (desplegable con buscador y bandera) + número.
// El valor que entra y sale es el teléfono completo, sin espacios: "+34600111222".
// Si el número está vacío, devuelve '' (el prefijo elegido se recuerda igualmente).
import { useState } from 'react';
import { partirTel } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';

export default function CampoTelefono({ id, valor, onCambio, placeholder = '600 000 000', disabled }: {
  id?: string; valor: string; onCambio: (tel: string) => void; placeholder?: string; disabled?: boolean;
}) {
  const t = partirTel(valor);
  const [prefVacio, setPrefVacio] = useState(t.pref);
  // Con número, el prefijo sale del propio valor; sin número, del último elegido.
  const pref = t.num ? t.pref : prefVacio;
  // Sin cifras no hay teléfono: antes, con letras o signos, salía el prefijo solo («+34»),
  // que contaba como teléfono puesto aunque la casilla se viera vacía.
  const poner = (p: string, n: string) => { const cifras = n.replace(/\D/g, ''); onCambio(cifras ? p + cifras : ''); };
  return (
    <div className="campo-tel">
      <SelectorPais modo="prefijo" valor={pref} disabled={disabled} onCambio={(v) => { setPrefVacio(v); poner(v, t.num); }} />
      <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={t.num} placeholder={placeholder} disabled={disabled}
        onChange={(e) => poner(pref, e.target.value)} />
    </div>
  );
}
