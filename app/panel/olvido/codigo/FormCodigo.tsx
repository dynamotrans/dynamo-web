'use client';

// Cajitas del código de RECUPERAR CONTRASEÑA: el componente compartido con sus acciones.
import CodigoOtp from '@/components/CodigoOtp';
import { comprobarCodigoOlvido, reenviarOlvido } from '../acciones';

export default function FormCodigo({ email }: { email: string }) {
  return <CodigoOtp email={email} comprobar={comprobarCodigoOlvido} reenviar={reenviarOlvido} />;
}
