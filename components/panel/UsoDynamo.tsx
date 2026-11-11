// «Uso de Dynamo» (usuario, 2026-11-11): el cliente ve cuánto lleva contra los límites
// de uso de la plataforma (los de la suspensión automática), con los valores VIVOS de
// Parámetros — al estilo del panel de uso de Claude: etiqueta y detalle a la izquierda,
// barra fina redondeada y «X de Y · Z %» a la derecha. Los números siempre van en texto
// (el color solo acompaña: morado normal, ámbar cerca del límite, rojo pasado).
import type { MiAutosusp } from './nuevoEnvio/comun';

function Fila({ titulo, sub, valor, max }: { titulo: string; sub: string; valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  const nivel = pct >= 100 ? 'mal' : pct >= 70 ? 'ojo' : 'ok';
  return (
    <div className="uso-fila">
      <div className="uso-izq">
        <div className="uso-tit">{titulo}</div>
        <div className="uso-sub">{sub}</div>
      </div>
      <div className="uso-barra" role="img" aria-label={`${titulo}: ${valor} de ${max} (${pct} %)`}>
        <i className={`uso-fill ${nivel}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className={`uso-der ${nivel}`}>{valor} de {max} · {pct} %</div>
    </div>
  );
}

export default function UsoDynamo({ datos, empresa = null, equipoSinVista = false }: { datos: MiAutosusp | null; empresa?: string | null; equipoSinVista?: boolean }) {
  if (!datos) {
    return (
      <section className="section active">
        <div className="sec-header"><h2>Uso de Dynamo</h2></div>
        <div className="pt-aviso info" style={{ maxWidth: 640 }}><div>
          {equipoSinVista
            ? <>Esta pantalla enseña el uso de UN cliente: elige arriba <strong>«Ver como»</strong> un cliente concreto y vuelve aquí (al cliente le sale en su menú de usuario, debajo de Soporte).</>
            : empresa
            ? <>Esta empresa todavía no tiene ninguna cuenta de usuario de cliente, así que no hay uso que enseñar.</>
            : <>Esta pantalla es para las cuentas de cliente.</>}
        </div></div>
      </section>
    );
  }
  const c = datos.consultas, k = datos.cancelaciones;
  const pctEnv = k.envios > 0 ? Math.round((k.propias / k.envios) * 100) : 0;
  return (
    <section className="section active" id="sec-uso">
      <div className="sec-header"><h2>Uso de Dynamo{empresa ? ` · ${empresa}` : ''}</h2></div>
      {empresa && <div className="pt-aviso info" style={{ maxWidth: 760, marginBottom: '0.8rem' }}><div>
        Estás viendo el uso de <strong>{empresa}</strong> («Ver como»): los contadores de su titular, tal y como los ve él.
      </div></div>}
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 1rem', maxWidth: 760 }}>
        Límites de uso de la plataforma, con los valores vigentes (pueden cambiar). Pasarse de alguno puede conllevar la
        <strong> suspensión temporal o definitiva</strong> de la cuenta; si llegas al límite por trabajo real, escríbenos y lo ampliamos.
        {!datos.activa && <> <strong>A tu cuenta ahora mismo no se le aplican</strong> (control desactivado).</>}
      </p>

      <div className="uso-grupo">
        <h3 className="uso-grupo-tit">Consultas de precio</h3>
        <p className="uso-grupo-sub">Cada solicitud de precio cuenta, se cree o no el envío después.</p>
        <Fila titulo="Hoy" sub="Últimas 24 horas" valor={c.hoy} max={c.max_hoy} />
        <Fila titulo="Esta semana" sub="Últimos 7 días" valor={c.semana} max={c.max_semana} />
        <Fila titulo="Este mes" sub="Últimos 30 días" valor={c.mes} max={c.max_mes} />
      </div>

      <div className="uso-grupo">
        <h3 className="uso-grupo-tit">Cancelaciones con coste</h3>
        <p className="uso-grupo-sub">
          Solo cuentan las que hacen daño: con camión ya asignado, o tarde (después de las 9:00 del día hábil anterior a la
          recogida). Cancelar sin camión y con tiempo es gratis y no cuenta.
        </p>
        <Fila titulo="Recientes" sub={`Últimos ${k.dias_recientes} días`} valor={k.recientes} max={k.max_recientes} />
        {k.envios >= k.min_envios
          ? <Fila titulo="Sobre tus envíos" sub={`${k.propias} de ${k.envios} envíos cancelados`} valor={pctEnv} max={k.max_pct} />
          : <p className="uso-nota">El límite del <strong>{k.max_pct} %</strong> de envíos cancelados se aplica a partir de {k.min_envios} envíos
              (llevas {k.envios}{k.propias > 0 ? `, con ${k.propias} ${k.propias === 1 ? 'cancelado' : 'cancelados'} con coste` : ''}).</p>}
      </div>

      <p className="uso-nota" style={{ maxWidth: 760 }}>
        Los contadores se actualizan al momento. También puede suspenderse una cuenta que pide precios sin que su empresa
        genere ningún envío durante mucho tiempo, o que no entra en la plataforma durante cientos de días. La reactivación
        es siempre a mano: llámanos y lo vemos.
      </p>
    </section>
  );
}
