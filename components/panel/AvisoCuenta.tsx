import type { Perfil } from '@/lib/sesion';

// Cuenta sin activar o suspendida: se avisa en lugar de enseñar datos.
export default function AvisoCuenta({ perfil }: { perfil: Perfil | null }) {
  const [titulo, texto, clase] = !perfil
    ? ['Tu usuario no tiene perfil en la plataforma.', 'Avisa a Dynamo para que lo revise.', 'error']
    : perfil.estado === 'suspendida'
      ? ['Tu cuenta está suspendida.', 'Ponte en contacto con Dynamo para reactivarla: info@dynamotrans.com · +34 955 225 945.', 'error']
      : ['Estamos verificando tu alta.', 'En cuanto Dynamo la active podrás ver y crear tus envíos.', ''];
  return (
    <section className="section active">
      <div className={`pt-aviso ${clase} cuenta-aviso`}><div><strong>{titulo}</strong> {texto}</div></div>
    </section>
  );
}
