'use client';

// Cajitas del código del ALTA: el componente compartido con las acciones del registro.
import CodigoOtp from '@/components/CodigoOtp';
import { comprobarCodigo, reenviarCodigo } from '../acciones';

export default function FormCodigo({ email }: { email: string }) {
  return <CodigoOtp email={email} comprobar={comprobarCodigo} reenviar={reenviarCodigo} />;
}
