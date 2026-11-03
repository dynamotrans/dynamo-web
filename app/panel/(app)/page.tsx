import { redirect } from 'next/navigation';
import { sesion } from '@/lib/sesion';

// /panel → el Dashboard cliente (también al entrar). El transportista no tiene
// dashboard: su pantalla de inicio es «Mis viajes».
export default async function Inicio() {
  const s = await sesion();
  redirect(s?.perfil?.rol === 'transportista' ? '/panel/envios' : '/panel/dashboard');
}
