'use client';

// Marco del panel (menú lateral + barra superior): copia de dashboard.html con las
// mismas clases. Lo interactivo (abrir menús, menú lateral en el móvil) vive aquí.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ICONOS, menuDe, type Enlace, type Grupo } from '@/lib/menu';
import { esDynamo, esSoloLectura, type Rol } from '@/lib/roles';
import { CONTACTO, HORARIO_ONLINE, estadoAtencion, horarioTelefono, semanaFestivaTexto } from '@/lib/atencion';
import { useIdiomaGT } from '@/components/SelectorIdioma';
import Modal from './Modal';

// Idiomas del menú del usuario (los del mockup). Banderas: excepción de la regla 0-ter.
const BANDERA_CA = <svg className="flag-svg" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#fcdd09" /><rect y="1.78" width="24" height="1.78" fill="#da121a" /><rect y="5.33" width="24" height="1.78" fill="#da121a" /><rect y="8.89" width="24" height="1.78" fill="#da121a" /><rect y="12.44" width="24" height="1.78" fill="#da121a" /></svg>;
const BANDERA_EU = <svg className="flag-svg" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#d52b1e" /><path d="M0 0 24 16M24 0 0 16" stroke="#009b3a" strokeWidth="4.2" /><rect x="10" width="4" height="16" fill="#fff" /><rect y="6" width="24" height="4" fill="#fff" /></svg>;
const IDIOMAS_PANEL: [string, React.ReactNode, string][] = [
  ['es', '🇪🇸', 'Español'], ['ca', BANDERA_CA, 'Català'], ['eu', BANDERA_EU, 'Euskara'], ['pt', '🇵🇹', 'Português'],
  ['en', '🇬🇧', 'English'], ['fr', '🇫🇷', 'Français'], ['ar', '🇸🇦', 'العربية'], ['de', '🇩🇪', 'Deutsch'], ['it', '🇮🇹', 'Italiano'],
  ['nl', '🇳🇱', 'Nederlands'], ['pl', '🇵🇱', 'Polski'], ['ro', '🇷🇴', 'Română'], ['uk', '🇺🇦', 'Українська'], ['zh-CN', '🇨🇳', '中文'],
];

export type Contadores = Partial<Record<'envios_sin_asignar' | 'incidencias' | 'penalizaciones' | 'alm_sin_confirmar' | 'alm_sin_pagar' | 'altas', number>>;
export type Cobertura = 'disponible' | 'nulo' | 'sinclasif' | null;

// Números del menú lateral por pantalla: [naranja, rojo] y qué significa cada uno.
function numerosDe(slug: string, c: Contadores): { n: number; t: string; rojo?: boolean }[] {
  const x = (n: number | undefined, t: string, rojo = false) => (n ? [{ n, t, rojo }] : []);
  switch (slug) {
    case 'envios': return x(c.envios_sin_asignar, 'Envíos sin transportista asignado');
    case 'incidencias': return x(c.incidencias, 'Incidencias abiertas');
    case 'penalizaciones': return x(c.penalizaciones, 'Penalizaciones pendientes de confirmar');
    case 'almacenamientos': return [...x(c.alm_sin_confirmar, 'Pendiente confirmar almacén'), ...x(c.alm_sin_pagar, 'Almacenamientos pendientes de pago', true)];
    case 'altas': return x(c.altas, 'Altas pendientes de revisar');
    default: return [];
  }
}

const COBERTURA: Record<Exclude<Cobertura, null>, { chip: string; badge: string; label: string; clasif: string; clasifCls: string; nota: React.ReactNode }> = {
  disponible: { chip: 'cesce-status-ok', badge: 'cesce-b-ok', label: 'Con crédito disponible', clasif: 'Clasificado', clasifCls: 'ok',
    nota: <>CESCE es la compañía aseguradora de crédito que respalda esta cuenta: garantiza el cobro de los envíos, por eso puedes trabajar <strong>a crédito</strong> y pagar por transferencia o domiciliación.</> },
  sinclasif: { chip: 'cesce-status-warn', badge: 'cesce-b-warn', label: 'Sin clasificar', clasif: 'Sin clasificar', clasifCls: 'none',
    nota: <>Tu empresa está <strong>sin clasificar</strong> por CESCE (el trámite aún no se ha realizado), así que los envíos se cobran <strong>por adelantado</strong>. Puedes solicitar que CESCE clasifique tu empresa para trabajar a crédito.</> },
  nulo: { chip: 'cesce-status-none', badge: 'cesce-b-none', label: 'Crédito nulo (CESCE autoriza 0)', clasif: 'Clasificado · límite 0', clasifCls: 'none',
    nota: <>CESCE ha evaluado tu empresa y de momento <strong>no autoriza crédito</strong> (límite 0), así que los envíos se cobran <strong>por adelantado</strong>. Puedes contactar con CESCE para revisar tu clasificación.</> },
};
const CESCE_CONTACTO = { tel: '900 30 40 50', telHref: 'tel:+34900304050', email: 'clientes@cesce.es' };

const ROL_TXT: Record<Rol, string> = { admin: 'Admin Master', empleado: 'Empleado gestor', admin_lectura: 'Admin lectura', empleado_lectura: 'Empleado lectura', cliente: 'Cliente', transportista: 'Transportista' };

function Ico({ k, size = 18 }: { k: keyof typeof ICONOS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         dangerouslySetInnerHTML={{ __html: ICONOS[k] }} />
  );
}
const Chev = ({ cls, size = 12, w = 3 }: { cls: string; size?: number; w?: number }) => (
  <svg className={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);

type Props = {
  rol: Rol; nombre: string; email: string; empresa: string; iniciales: string;
  contadores?: Contadores; cobertura?: Cobertura; festivos?: string[];
  children: React.ReactNode;
};

export default function Marco({ rol, nombre, email, empresa, iniciales, contadores = {}, cobertura = null, festivos = [], children }: Props) {
  const ruta = usePathname();
  const [lateral, setLateral] = useState(false);
  const [menu, setMenu] = useState<null | 'usuario' | 'soporte' | 'campana' | 'cesce'>(null);
  const [idiomas, setIdiomas] = useState(false);
  const [horarios, setHorarios] = useState(false);
  const [idioma, elegirIdioma] = useIdiomaGT(IDIOMAS_PANEL.map(([c]) => c));
  // Estado de Álvaro («En línea» / «He salido · Vuelvo…»), recalculado cada minuto.
  const fest = useMemo(() => new Set(festivos), [festivos]);
  const [atencion, setAtencion] = useState<{ online: boolean; texto: string; tel: string }>({ online: true, texto: 'En línea · Respondo enseguida', tel: 'Lunes a Jueves 9-14 y 15-17 · Viernes 9-14' });
  useEffect(() => {
    const poner = () => { const e = estadoAtencion(fest); setAtencion({ ...e, tel: horarioTelefono() }); };
    poner(); const t = setInterval(poner, 60000); return () => clearInterval(t);
  }, [fest]);
  const [grupos, setGrupos] = useState<Record<string, boolean>>({});
  const barra = useRef<HTMLElement>(null);

  const activo = (slug: string) => ruta === `/panel/${slug}` || ruta.startsWith(`/panel/${slug}/`);

  // Al cambiar de pantalla: cerrar el menú lateral del móvil y los desplegables.
  useEffect(() => { setLateral(false); setMenu(null); }, [ruta]);
  // Un grupo con la pantalla activa dentro se abre solo.
  useEffect(() => {
    for (const b of menuDe(rol)) for (const it of b.items)
      if ('grupo' in it && it.enlaces.some((e) => activo(e.slug))) setGrupos((g) => ({ ...g, [it.grupo]: true }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta, rol]);
  // Clic fuera o Escape: cerrar desplegables.
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => { if (!barra.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('click', fuera); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', fuera); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const insignias = (ns: { n: number; t: string; rojo?: boolean }[]) =>
    ns.map((b, i) => <span key={i} className={`badge${b.rojo ? ' sb-red' : ''}`} title={b.t} aria-label={`${b.n} · ${b.t}`}>{b.n}</span>);
  const enlace = (e: Enlace) => (
    <Link key={e.slug} href={`/panel/${e.slug}`}
          className={`sidebar-link${e.destacado ? ' sidebar-link-featured' : ''}${activo(e.slug) ? ' active' : ''}`}
          aria-current={activo(e.slug) ? 'page' : undefined}>
      <Ico k={e.icono} />
      <span className="sl-txt">{e.titulo}</span>
      {insignias(numerosDe(e.slug, contadores))}
    </Link>
  );
  // Un grupo cerrado enseña la suma de los números de sus pantallas (al abrirlo, cada uno el suyo).
  const sumaGrupo = (g: Grupo) => {
    const todos = g.enlaces.flatMap((e) => numerosDe(e.slug, contadores));
    const nar = todos.filter((b) => !b.rojo).reduce((a, b) => a + b.n, 0);
    const roj = todos.filter((b) => b.rojo).reduce((a, b) => a + b.n, 0);
    // Un solo número (cabe junto al nombre); rojo si dentro hay algún pago pendiente.
    const total = nar + roj;
    return total ? [{ n: total, t: roj ? `${total} pendientes (${roj} de pago)` : `${total} pendientes`, rojo: roj > 0 }] : [];
  };
  const grupo = (g: Grupo) => {
    const abierto = !!grupos[g.grupo];
    return (
      <div key={g.grupo}>
        <button type="button" className={`sidebar-link${abierto ? ' sg-open' : ''}`}
                id={g.grupo === 'admin' ? 'sgAdminBtn' : 'sgOtrasBtn'} aria-expanded={abierto}
                onClick={() => setGrupos((x) => ({ ...x, [g.grupo]: !abierto }))}>
          <Ico k={g.icono} />
          <span className="sl-txt">{g.titulo}</span>
          {!abierto && insignias(sumaGrupo(g))}
          <Chev cls="sg-chev" size={15} w={2.4} />
        </button>
        <div className="sidebar-sub" hidden={!abierto}>{g.enlaces.map(enlace)}</div>
      </div>
    );
  };
  const salir = (
    <form action="/panel/salir" method="post">
      <button type="submit" className="sidebar-link" style={{ marginTop: '0.4rem' }}>
        <Ico k="salir" /> Cerrar sesión
      </button>
    </form>
  );

  // El logo lleva al Dashboard cliente; el transportista no tiene dashboard → Mis viajes.
  const inicio = rol === 'transportista' ? '/panel/envios' : '/panel/dashboard';

  // Campana: lo que hay pendiente (mismos números que el menú lateral).
  const ICO_AVISO = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
  const ICO_CIRCULO = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
  const ICO_DOC = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>';
  const ICO_PERSONA = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>';
  const avisos = [
    { href: '/panel/incidencias', t: 'Incidencias abiertas', s: 'Pendientes de resolver', cero: 'Sin incidencias abiertas', n: contadores.incidencias ?? 0, color: 'inc', ico: ICO_AVISO },
    { href: '/panel/penalizaciones', t: 'Penalizaciones abiertas', s: 'Pendientes de confirmar', cero: 'Ninguna pendiente', n: contadores.penalizaciones ?? 0, color: 'inc', ico: ICO_CIRCULO },
    ...(esDynamo(rol) ? [{ href: '/panel/almacenamientos?tab=pago', t: 'Pagos pendientes', s: 'Almacenamientos por pagar', cero: 'Nada pendiente de pago', n: contadores.alm_sin_pagar ?? 0, color: 'fac', ico: ICO_DOC }] : []),
    ...(esDynamo(rol) ? [{ href: '/panel/altas', t: 'Altas pendientes', s: 'Clientes por revisar', cero: 'Ninguna pendiente', n: contadores.altas ?? 0, color: 'inc', ico: ICO_PERSONA }] : []),
  ];
  const totalAvisos = avisos.reduce((a, x) => a + x.n, 0);

  return (
    <>
      <aside className={`sidebar${lateral ? ' open' : ''}`} id="sidebar">
        <Link href={inicio} className="sidebar-brand" aria-label="Ir al inicio del panel">
          <img src="/images/2.png" alt="Dynamo" />
          <span className="sidebar-brand-slogan notranslate" translate="no">Always<br />Moving.</span>
        </Link>
        <nav className="sidebar-nav">
          {menuDe(rol).map((b, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {b.sep && <div className="sidebar-sep"><span>{b.sep}</span></div>}
              {b.items.map((it) => ('grupo' in it ? grupo(it) : enlace(it)))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{iniciales}</div>
            <div>
              <div className="sidebar-user-name">{nombre}</div>
              <div className="sidebar-user-sub">{empresa}</div>
            </div>
          </div>
          {salir}
        </div>
      </aside>
      <div className={`sidebar-backdrop${lateral ? ' show' : ''}`} onClick={() => setLateral(false)} />

      <div className="main">
        <header className="topbar" ref={barra}>
          <div className="topbar-left">
            <button className="sidebar-toggle" onClick={() => setLateral((v) => !v)} aria-label="Menú">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            <div className="topbar-actions topbar-leftbar">
              <Link href={inicio} className="topbar-brand" aria-label="Ir al inicio del panel">
                <img src="/images/2.png" alt="Dynamo" />
              </Link>
              {(
                <div className="topbar-contact-wrap">
                  <button type="button" className={`topbar-contact-btn${atencion.online ? '' : ' offline'}`} aria-haspopup="menu" aria-expanded={menu === 'soporte'}
                          aria-label="Soporte con Álvaro" onClick={() => setMenu(menu === 'soporte' ? null : 'soporte')}>
                    <span className="topbar-contact-avatar">
                      <img src="/images/ALVARO_circular_ZOOM.png" alt="Álvaro - Contacto Dynamo Transportes" />
                      <span className="topbar-contact-dot" aria-hidden="true" />
                    </span>
                    <span className="topbar-contact-label"><span className="t-pre">Soporte:</span> <span className="t-name">Álvaro</span></span>
                    <Chev cls="topbar-contact-arrow" />
                  </button>
                  <div className={`topbar-contact-menu${menu === 'soporte' ? ' open' : ''}`} role="menu" aria-hidden={menu !== 'soporte'}>
                    <div className="topbar-contact-head">
                      <img src="/images/ALVARO_circular_ZOOM.png" alt="" aria-hidden="true" />
                      <div className="topbar-contact-head-body">
                        <div className="topbar-contact-name">Álvaro Blanco</div>
                        <div className={`topbar-contact-status${atencion.online ? '' : ' offline'}`}>{atencion.texto}</div>
                      </div>
                    </div>
                    <div className="topbar-contact-sep" />
                    <a className="topbar-contact-item act-email" role="menuitem" href="mailto:info@dynamotrans.com?subject=Consulta%20portal%20cliente">
                      <span className="topbar-contact-icon act-email-bg"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg></span>
                      <div className="topbar-contact-text"><span className="t">{CONTACTO.email}</span><span className="h">{HORARIO_ONLINE}</span></div>
                    </a>
                    <a className="topbar-contact-item act-wa" role="menuitem" target="_blank" rel="noopener" href="https://wa.me/34628995709">
                      <span className="topbar-contact-icon act-wa-bg"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg></span>
                      <div className="topbar-contact-text"><span className="t">WhatsApp {CONTACTO.whatsapp}</span><span className="h">{HORARIO_ONLINE}</span></div>
                    </a>
                    <a className="topbar-contact-item act-call" role="menuitem" href="tel:+34955225945">
                      <span className="topbar-contact-icon act-call-bg"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.18z" /></svg></span>
                      <div className="topbar-contact-text"><span className="t">Llamar {CONTACTO.telefono}</span><span className="h">{atencion.tel}</span></div>
                    </a>
                    <div className="topbar-contact-sep" />
                    <button type="button" className="topbar-contact-hor" role="menuitem" style={{ width: '100%', background: 'none', border: 'none', fontFamily: 'inherit' }}
                            onClick={() => { setMenu(null); setHorarios(true); }}>Ver todos los horarios del año</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-bell-wrap">
              <button type="button" className={`topbar-ind topbar-ind-inc ${totalAvisos ? 'has-open' : 'no-open'}`} aria-haspopup="menu" aria-expanded={menu === 'campana'}
                      aria-label={`Notificaciones: ${totalAvisos}`} title="Notificaciones" onClick={() => setMenu(menu === 'campana' ? null : 'campana')}>
                <span className="topbar-ind-badge">{totalAvisos}</span>
              </button>
              <div className={`bell-menu${menu === 'campana' ? ' open' : ''}`} role="menu" aria-hidden={menu !== 'campana'}>
                <div className="bell-menu-title">Notificaciones</div>
                {avisos.map((a) => (
                  <Link key={a.href} href={a.href} className="bell-item" role="menuitem" onClick={() => setMenu(null)} style={{ textDecoration: 'none' }}>
                    <span className={`bell-item-ico ${a.color}`}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: a.ico }} /></span>
                    <span className="bell-item-body"><span className="bell-item-t">{a.t}</span><span className="bell-item-s">{a.n ? a.s : a.cero}</span></span>
                    <span className={`bell-item-count ${a.n ? a.color : 'zero'}`}>{a.n}</span>
                  </Link>
                ))}
                {totalAvisos === 0 && <div className="bell-empty">Todo al día</div>}
              </div>
            </div>
            {rol === 'cliente' && cobertura && (
              <div className="topbar-cesce-wrap">
                <button type="button" className={`topbar-ind topbar-ind-cesce ${COBERTURA[cobertura].chip}${menu === 'cesce' ? ' cesce-open' : ''}`} aria-haspopup="menu" aria-expanded={menu === 'cesce'}
                        title="Cobertura de crédito CESCE" aria-label="Cobertura de crédito CESCE" onClick={() => setMenu(menu === 'cesce' ? null : 'cesce')}>
                  <span className="topbar-cesce-dot" aria-hidden="true" />
                </button>
                <div className={`cesce-menu${menu === 'cesce' ? ' open' : ''}`} role="menu" aria-hidden={menu !== 'cesce'}>
                  <div className="cesce-menu-head">
                    <img className="cesce-menu-logo" src="/images/cesce-azul.webp" alt="CESCE" />
                    <div><div className="cesce-menu-head-t">Cobertura de crédito</div><div className="cesce-menu-head-s">Asegurada por CESCE</div></div>
                  </div>
                  <div className={`cesce-menu-badge ${COBERTURA[cobertura].badge}`}><span className="dot" />{COBERTURA[cobertura].label}</div>
                  <div className="cesce-rows"><div className="cesce-row"><span className="k">Clasificación</span><span className={`v ${COBERTURA[cobertura].clasifCls}`}>{COBERTURA[cobertura].clasif}</span></div></div>
                  <div className="cesce-note warn">{COBERTURA[cobertura].nota}</div>
                  {cobertura === 'sinclasif' && (
                    <a className="cesce-reclamar" style={{ textDecoration: 'none' }}
                       href={`mailto:${CONTACTO.email}?subject=${encodeURIComponent(`Solicitud de clasificación CESCE · ${empresa}`)}&body=${encodeURIComponent(`Hola, queremos que CESCE clasifique a ${empresa} para poder trabajar a crédito.\r\n\r\nGracias.`)}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" /></svg>
                      Reclamar clasificación
                    </a>
                  )}
                  {cobertura === 'nulo' && (
                    <div className="cesce-contact">
                      <div className="cesce-contact-t">¿No estás conforme con tu crédito? Contacta con CESCE</div>
                      <a href={CESCE_CONTACTO.telHref}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.18z" /></svg>{CESCE_CONTACTO.tel}</a>
                      <a href={`mailto:${CESCE_CONTACTO.email}?subject=${encodeURIComponent('Consulta sobre mi línea de crédito')}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>{CESCE_CONTACTO.email}</a>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="topbar-user-wrap">
              <button type="button" className="topbar-user" aria-haspopup="menu" aria-expanded={menu === 'usuario'}
                      onClick={() => setMenu(menu === 'usuario' ? null : 'usuario')}>
                <div className="topbar-user-avatar">{iniciales}</div>
                <div className="topbar-user-name">{nombre}</div>
                <Chev cls="topbar-user-arrow" />
              </button>
              <div className={`user-menu${menu === 'usuario' ? ' open' : ''}`} role="menu" aria-hidden={menu !== 'usuario'}>
                <div className="user-menu-head">
                  <div className="user-menu-head-avatar">{iniciales}</div>
                  <div className="user-menu-head-body">
                    <div className="user-menu-head-name">{nombre}</div>
                    <div className="user-menu-head-email">{email}</div>
                    <span className="user-menu-role">{ROL_TXT[rol]}</span>
                  </div>
                </div>
                <div className="user-menu-sep" />
                <Link href="/panel/mi-cuenta" className="user-menu-item" role="menuitem">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  Mi cuenta
                </Link>
                <button type="button" className="user-menu-item" role="menuitem" onClick={(ev) => { ev.stopPropagation(); setMenu('soporte'); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  Soporte
                </button>
                <div className="user-menu-sep" />
                <button type="button" className="user-menu-item user-menu-item-expand" role="menuitem" aria-expanded={idiomas} onClick={() => setIdiomas((x) => !x)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                  Idioma
                  <span className="user-menu-right notranslate" translate="no">{(() => { const i = IDIOMAS_PANEL.find(([c]) => c === idioma) ?? IDIOMAS_PANEL[0]; return <><span className="flag">{i[1]}</span> {i[2]}</>; })()}</span>
                  <svg className="user-menu-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className={`user-menu-submenu notranslate${idiomas ? ' open' : ''}`} translate="no" role="menu" aria-hidden={!idiomas}>
                  {IDIOMAS_PANEL.map(([c, f, n]) => (
                    <button key={c} type="button" className={`lang-pill${c === idioma ? ' active' : ''}`} onClick={() => { elegirIdioma(c); setIdiomas(false); setMenu(null); }}>
                      <span className="flag">{f}</span> {n}
                    </button>
                  ))}
                </div>
                <div className="user-menu-sep" />
                <form action="/panel/salir" method="post">
                  <button type="submit" className="user-menu-item user-menu-item-danger" role="menuitem">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONOS.salir }} />
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>
        </header>
        <div className="content">
          {esSoloLectura(rol) && (
            <div className="maint-block aviso-lectura" role="note">
              <div className="maint-block-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </div>
              <div className="maint-block-body">
                <strong>Modo solo lectura · {ROL_TXT[rol]}</strong>
                <span>Puedes ver toda la plataforma, pero no crear, cambiar ni borrar nada. Si pulsas un botón de guardar, te dirá que no tienes permiso.</span>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
      <div id="google_translate_element" style={{ display: 'none' }} />
      {horarios && (
        <Modal abierto titulo="Horarios de atención" sub="Teléfono según temporada · Email y WhatsApp todo el año." onCerrar={() => setHorarios(false)}
          icono={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          pie={<button className="btn-primary" style={{ flex: 1 }} onClick={() => setHorarios(false)}>Entendido</button>}>
          <div className="hor-group">
            <div className="hor-group-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg> Email y WhatsApp</div>
            <div className="hor-row"><span className="hor-when">Todo el año</span><span className="hor-time">Lunes a Viernes 8:00–18:00</span></div>
          </div>
          <div className="hor-group">
            <div className="hor-group-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg> Teléfono</div>
            <div className="hor-row"><span className="hor-when">Horario habitual</span><span className="hor-time">L–J 9:00–14:00 y 15:00–17:00 · V 9:00–14:00</span></div>
            <div className="hor-row"><span className="hor-when">Jornada intensiva</span><span className="hor-time">8:30–15:30</span></div>
            <ul className="hor-intensiva">
              <li>Verano<span className="hor-i-when">15 jun – 1 sep · L–V</span></li>
              <li>Navidad<span className="hor-i-when">22 dic – 6 ene · L–V</span></li>
              <li>Semana Santa<span className="hor-i-when">Lun–Mié Santo</span></li>
              <li>Semana festiva local<span className="hor-i-when">{semanaFestivaTexto()}</span></li>
            </ul>
            <div className="hor-row closed"><span className="hor-when">Agosto (6–27)</span><span className="hor-time">Solo email y WhatsApp</span></div>
          </div>
          <div className="hor-group">
            <div className="hor-group-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" /></svg> Festivos (teléfono cerrado)</div>
            <p className="hor-note" style={{ marginTop: 0 }}>Año Nuevo (1 ene) · Reyes (6 ene) · Día del Trabajo (1 may) · Asunción (15 ago) · Fiesta Nacional (12 oct) · Todos los Santos (1 nov) · Constitución (6 dic) · Inmaculada (8 dic) · Navidad (25 dic) · Jueves y Viernes Santo.</p>
          </div>
          <p className="hor-note">Horario peninsular (Europe/Madrid), se ajusta solo en cada temporada. Email y WhatsApp también cierran domingos y festivos.</p>
        </Modal>
      )}
    </>
  );
}
