import { IconoTipo, nombreTipo } from './TipoSitio';

// La pastilla de una parada: «1 · Recogida» (naranja) o «2 · Entrega» (verde) con el icono
// del tipo de sitio en blanco. Es la MISMA de «Nuevo envío» y se usa en las listas y fichas
// de envíos de todos los roles (usuario, 2026-11-19: «que se vea color, número e icono»).
export default function EtiquetaParada({ num, tipo, tipoSitio, mini, style }: {
  num: number; tipo: 'carga' | 'descarga'; tipoSitio?: string | null; mini?: boolean; style?: React.CSSProperties;
}) {
  const rec = tipo === 'carga';
  return (
    <span className={`ptar-route-tag ${rec ? 'rec' : 'ent'}${mini ? ' ptar-route-tag-mini' : ''}`} style={style}
      title={`${rec ? 'Recogida' : 'Entrega'} · ${nombreTipo(tipoSitio)}`}>
      {num} · {rec ? 'Recogida' : 'Entrega'}<IconoTipo tipo={tipoSitio} blanco />
    </span>
  );
}
