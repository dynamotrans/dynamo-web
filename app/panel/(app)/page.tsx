import { redirect } from 'next/navigation';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe } from '@/lib/vista';
import { inicioDe } from '@/lib/vistaTipo';

// /panel → la pantalla de inicio de cada perfil: Dashboard cliente; el transportista no
// tiene dashboard (su inicio es «Mis viajes»); el equipo de Dynamo, la de la vista elegida.
export default async function Inicio() {
  const s = await sesion();
  const rol = s?.perfil?.rol;
  if (s && esDynamo(rol)) redirect(inicioDe((await vistaDe(s.supabase, rol)).tipo));
  redirect(rol === 'transportista' ? '/panel/envios' : '/panel/dashboard');
}
