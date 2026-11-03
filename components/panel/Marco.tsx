'use client';

// Marco del panel (menú lateral + barra superior): copia de dashboard.html con las
// mismas clases. Lo interactivo (abrir menús, menú lateral en el móvil) vive aquí.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ICONOS, menuDe, type Enlace, type Grupo } from '@/lib/menu';
import type { Rol } from '@/lib/sesion';

const ROL_TXT: Record<Rol, string> = { admin: 'Administrador', empleado: 'Empleado', cliente: 'Cliente', transportista: 'Transportista' };
const PORTAL_TXT: Record<Rol, string> = { admin: 'Portal · Dynamo', empleado: 'Portal · Dynamo', cliente: 'Portal · Cliente', transportista: 'Portal · Transportista' };

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
  children: React.ReactNode;
};

export default function Marco({ rol, nombre, email, empresa, iniciales, children }: Props) {
  const ruta = usePathname();
  const [lateral, setLateral] = useState(false);
  const [menu, setMenu] = useState<null | 'usuario' | 'soporte'>(null);
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

  const enlace = (e: Enlace) => (
    <Link key={e.slug} href={`/panel/${e.slug}`}
          className={`sidebar-link${e.destacado ? ' sidebar-link-featured' : ''}${activo(e.slug) ? ' active' : ''}`}
          aria-current={activo(e.slug) ? 'page' : undefined}>
      <Ico k={e.icono} />
      <span className="sl-txt">{e.titulo}</span>
    </Link>
  );
  const grupo = (g: Grupo) => {
    const abierto = !!grupos[g.grupo];
    return (
      <div key={g.grupo}>
        <button type="button" className={`sidebar-link${abierto ? ' sg-open' : ''}`}
                id={g.grupo === 'admin' ? 'sgAdminBtn' : 'sgOtrasBtn'} aria-expanded={abierto}
                onClick={() => setGrupos((x) => ({ ...x, [g.grupo]: !abierto }))}>
          <Ico k={g.icono} />
          <span className="sl-txt">{g.titulo}</span>
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

  return (
    <>
      <aside className={`sidebar${lateral ? ' open' : ''}`} id="sidebar">
        <Link href="/panel/envios" className="sidebar-brand" aria-label="Ir al inicio del panel">
          <img src="/images/2.png" alt="Dynamo" />
          <div>
            <div className="sidebar-brand-name notranslate" translate="no">Logistics</div>
            <div className="sidebar-brand-sub">{PORTAL_TXT[rol]}</div>
          </div>
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
              <Link href="/panel/envios" className="topbar-brand" aria-label="Ir al inicio del panel">
                <img src="/images/2.png" alt="Dynamo" />
              </Link>
              {rol !== 'admin' && rol !== 'empleado' && (
                <div className="topbar-contact-wrap">
                  <button type="button" className="topbar-contact-btn" aria-haspopup="menu" aria-expanded={menu === 'soporte'}
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
                        <div className="topbar-contact-status">En línea · Respondo enseguida</div>
                      </div>
                    </div>
                    <div className="topbar-contact-sep" />
                    <a className="topbar-contact-item act-email" role="menuitem" href="mailto:info@dynamotrans.com?subject=Consulta%20portal%20cliente">
                      <span className="topbar-contact-icon act-email-bg"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg></span>
                      <div className="topbar-contact-text"><span className="t">info@dynamotrans.com</span></div>
                    </a>
                    <a className="topbar-contact-item act-wa" role="menuitem" target="_blank" rel="noopener" href="https://wa.me/34628995709">
                      <span className="topbar-contact-icon act-wa-bg"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg></span>
                      <div className="topbar-contact-text"><span className="t">WhatsApp +34 628 995 709</span></div>
                    </a>
                    <a className="topbar-contact-item act-call" role="menuitem" href="tel:+34955225945">
                      <span className="topbar-contact-icon act-call-bg"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.18z" /></svg></span>
                      <div className="topbar-contact-text"><span className="t">Llamar +34 955 225 945</span></div>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="topbar-actions">
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
        <div className="content">{children}</div>
      </div>
    </>
  );
}
