import type { Perfil } from '@/lib/sesion';
import Documentos from './Documentos';
import { CONTACTO } from '@/lib/atencion';
import { creadoTxt } from '@/lib/envios';

// Cuenta sin activar o suspendida: se avisa en lugar de enseñar datos. Mientras se
// verifica el alta, el cliente puede adelantar la hoja del CIF y su DNI (como en
// registro.html): Dynamo los ve en «Altas» y la verificación va más rápida.
// Suspendida: el motivo en palabras sencillas (sin los límites exactos, para que nadie
// ajuste su uso al número) y cómo pedir que se reactive.

// Motivo para el usuario a partir del guardado («Automática · Regla 3: …» o a mano).
function motivoVisible(m: string | null | undefined): string {
  const r = /Regla (\d)/.exec(m ?? '')?.[1];
  switch (r) {
    case '1': return 'Durante un tiempo se han pedido precios sin que tu empresa haya hecho ningún envío.';
    case '2': return 'La cuenta llevaba mucho tiempo sin usarse. Es una medida de seguridad.';
    case '3': return 'Se ha superado el número de consultas de precio permitido.';
    case '4': return 'Se ha cancelado una parte alta de los envíos pedidos desde esta cuenta.';
    case '5': return 'Se han cancelado varios envíos en pocos días.';
    default: return 'El equipo de Dynamo ha suspendido la cuenta. Te contamos el motivo al contactar.';
  }
}

export default function AvisoCuenta({ perfil }: { perfil: Perfil | null }) {
  if (perfil?.estado === 'suspendida') return <Suspendida perfil={perfil} />;
  const [titulo, texto, clase] = !perfil
    ? ['Tu usuario no tiene perfil en la plataforma.', 'Avisa a Dynamo para que lo revise.', 'error']
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

function Suspendida({ perfil }: { perfil: Perfil }) {
  const automatica = (perfil.suspension_motivo ?? '').startsWith('Automática');
  const asunto = 'Reactivar mi cuenta en la plataforma';
  const cuerpo = `Hola, mi cuenta (${perfil.email}) está suspendida y quiero reactivarla.`;
  const boton = (href: string, texto: string, bg: string, fuera = false) => (
    <a href={href} target={fuera ? '_blank' : undefined} rel={fuera ? 'noopener' : undefined}
       style={{ background: bg, color: '#fff', fontWeight: 800, borderRadius: 10, padding: '0.6rem 1.1rem', textDecoration: 'none', display: 'inline-block' }}>{texto}</a>
  );
  return (
    <section className="section active">
      <div className="account-card" style={{ maxWidth: 640, borderColor: '#fca5a5' }}>
        <div className="account-card-title" style={{ color: '#b42318' }}>Tu cuenta está suspendida</div>
        <p className="account-card-desc" style={{ marginBottom: '0.6rem' }}>
          Mientras esté suspendida no puedes ver ni crear envíos.{perfil.suspendida_en ? <> Suspendida el {creadoTxt(perfil.suspendida_en)}.</> : null}
        </p>
        <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>
          <strong>Motivo{automatica ? ' (automático)' : ''}:</strong> {motivoVisible(perfil.suspension_motivo)}
        </div></div>
        <p className="account-card-desc" style={{ marginBottom: '0.7rem' }}>
          <strong>Para reactivarla, contacta con nosotros</strong>: lo revisamos contigo y, si todo está bien, la reactivamos enseguida.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {boton(`mailto:${CONTACTO.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`, 'Escribir un email', 'var(--purple)')}
          {boton(`${CONTACTO.waHref}?text=${encodeURIComponent(cuerpo)}`, 'WhatsApp', '#16a34a', true)}
          {boton(CONTACTO.telHref, `Llamar ${CONTACTO.telefono}`, 'var(--navy)')}
        </div>
        <form action="/panel/salir" method="post" style={{ marginTop: '0.9rem' }}>
          <button type="submit" className="btn-ghost">Cerrar sesión</button>
        </form>
      </div>
    </section>
  );
}
