import type { Perfil } from '@/lib/sesion';
import Documentos from './Documentos';

// Cuenta sin activar o suspendida: se avisa en lugar de enseñar datos. Mientras se
// verifica el alta, el cliente puede adelantar la hoja del CIF y su DNI (como en
// registro.html): Dynamo los ve en «Altas» y la verificación va más rápida.
export default function AvisoCuenta({ perfil }: { perfil: Perfil | null }) {
  const [titulo, texto, clase] = !perfil
    ? ['Tu usuario no tiene perfil en la plataforma.', 'Avisa a Dynamo para que lo revise.', 'error']
    : perfil.estado === 'suspendida'
      ? ['Tu cuenta está suspendida.', 'Ponte en contacto con Dynamo para reactivarla: info@dynamotrans.com · +34 955 225 945.', 'error']
      : ['Estamos verificando tu alta.', 'En cuanto Dynamo la active podrás ver y crear tus envíos. Te avisamos por email.', ''];
  const pendiente = perfil?.estado === 'pendiente_verificacion';
  return (
    <section className="section active">
      <div className={`pt-aviso ${clase} cuenta-aviso`}><div><strong>{titulo}</strong> {texto}</div></div>
      {pendiente && (
        <div className="account-card" style={{ marginTop: '1rem' }}>
          <div className="account-card-title">Documentación del alta</div>
          <p className="account-card-desc">
            Sube la <strong>hoja del CIF</strong> y tu <strong>DNI</strong> (PDF o foto). Sin ellos el alta puede tardar más en verificarse.
          </p>
          <Documentos dueno={{ campo: 'usuario_id', id: perfil!.id }} tipos={['hoja_cif', 'dni', 'otro']} sinQuitar />
        </div>
      )}
    </section>
  );
}
