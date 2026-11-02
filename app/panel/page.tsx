import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import SinConfigurar from '@/components/SinConfigurar';
import { IcoAviso, IcoInfo, IcoSalir } from '@/components/Iconos';
import { euros, ventana, ESTADO_ENVIO, ESTADO_ASIGNACION, ROL } from '@/lib/formato';
import { salir } from './acciones';

export const dynamic = 'force-dynamic';

// Una fila de la tabla, venga de donde venga (tabla para Dynamo, funciones para los demás).
type Fila = {
  id: string;
  referencia_gx: string;
  estado: string;
  estado_asignacion?: string | null;
  es_manual?: boolean | null;
  fecha_carga_desde: string | null;
  fecha_carga_hasta?: string | null;
  poblacion_origen: string | null; cp_origen?: string | null;
  poblacion_destino: string | null; cp_destino?: string | null;
  cliente?: string | null;
  importe_cliente?: number | null;
  importe_transportista?: number | null;
  margen_euros?: number | null;
};

export default async function PaginaPanel() {
  const supabase = await supabaseServidor();
  if (!supabase) return <SinConfigurar />;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/panel/entrar');

  // Perfil: lo puede leer cada uno el suyo (política usuarios_sel).
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('nombre, email, rol, estado')
    .eq('id', user.id)
    .maybeSingle();

  const rol = perfil?.rol ?? 'cliente';
  const esDynamo = rol === 'admin' || rol === 'empleado';

  let filas: Fila[] = [];
  let errorCarga: string | null = null;

  if (perfil?.estado === 'activa') {
    if (esDynamo) {
      // Dynamo lee la tabla directamente (política envios_admin).
      const { data, error } = await supabase
        .from('envios')
        .select('id, referencia_gx, estado, estado_asignacion, es_manual, fecha_carga_desde, ' +
                'fecha_carga_hasta, poblacion_origen, cp_origen, poblacion_destino, cp_destino, ' +
                'importe_cliente, importe_transportista, margen_euros, clientes(nombre_visible)')
        .order('creado_en', { ascending: false })
        .limit(200);
      if (error) errorCarga = error.message;
      filas = (data ?? []).map((e: any) => ({ ...e, cliente: e.clientes?.nombre_visible ?? null }));
    } else if (rol === 'cliente') {
      // El cliente, por la función que solo da sus filas y sus columnas.
      const { data, error } = await supabase.rpc('mis_envios').limit(200);
      if (error) errorCarga = error.message;
      filas = (data ?? []) as Fila[];
    } else if (rol === 'transportista') {
      const { data, error } = await supabase.rpc('mis_viajes').limit(200);
      if (error) errorCarga = error.message;
      filas = (data ?? []) as Fila[];
    }
  }

  return (
    <>
      <header className="pt-top">
        <a className="pt-logo" href="/panel">
          <img src="/images/2.png" alt="Dynamo" />
          <span>Plataforma</span>
        </a>
        <div className="pt-user">
          <span><strong>{perfil?.nombre || user.email}</strong></span>
          <span className="pt-chip">{ROL[rol] ?? rol}</span>
          <form action={salir}>
            <button type="submit" className="btn-ghost" title="Cerrar sesión">
              <IcoSalir /> Salir
            </button>
          </form>
        </div>
      </header>

      <main className="pt-main">
        {!perfil && (
          <div className="warn error"><IcoAviso /><div>
            Tu usuario existe pero no tiene perfil en la plataforma. Avisa a Dynamo.
          </div></div>
        )}
        {perfil && perfil.estado === 'pendiente_verificacion' && (
          <div className="warn"><IcoAviso /><div>
            <strong>Estamos verificando tu alta.</strong> En cuanto Dynamo la active podrás ver tus envíos.
          </div></div>
        )}
        {perfil && perfil.estado === 'suspendida' && (
          <div className="warn error"><IcoAviso /><div>
            <strong>Tu cuenta está suspendida.</strong> Ponte en contacto con Dynamo para reactivarla.
          </div></div>
        )}

        {perfil?.estado === 'activa' && (
          <>
            <h1>{esDynamo ? 'Envíos' : rol === 'transportista' ? 'Mis viajes' : 'Mis envíos'}</h1>
            <p className="sub">
              {esDynamo ? 'Todos los envíos, los más recientes primero.'
                : rol === 'transportista' ? 'Los viajes que tienes asignados.'
                : 'Tus envíos, los más recientes primero.'}
            </p>

            {errorCarga && (
              <div className="warn error"><IcoAviso /><div>No se han podido cargar: {errorCarga}</div></div>
            )}

            <div className="pt-card table-wrap">
              {filas.length === 0 ? (
                <div className="vacio">
                  <IcoInfo /> Todavía no hay envíos en la base de datos.
                </div>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Envío</th>
                      {esDynamo && <th>Cliente</th>}
                      <th>Fecha de carga</th>
                      <th>Ruta</th>
                      {esDynamo && <th className="num">P. cliente</th>}
                      {esDynamo && <th className="num">P. transportista</th>}
                      {esDynamo && <th className="num">Margen</th>}
                      {rol === 'cliente' && <th className="num">Precio (sin IVA)</th>}
                      {rol === 'transportista' && <th className="num">Tu precio (sin IVA)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <div className="ref">#{f.referencia_gx}</div>
                          <span className={`badge ${f.estado}`}>{ESTADO_ENVIO[f.estado] ?? f.estado}</span>
                          {f.es_manual && <> <span className="badge manual">Manual</span></>}
                          {esDynamo && f.estado_asignacion && f.estado === 'programado' && (
                            <div className="muted">{ESTADO_ASIGNACION[f.estado_asignacion]}</div>
                          )}
                        </td>
                        {esDynamo && <td>{f.cliente ?? '—'}</td>}
                        <td className="ruta">{ventana(f.fecha_carga_desde, f.fecha_carga_hasta ?? null)}</td>
                        <td className="ruta">
                          <div><span className="dot o" />{f.poblacion_origen ?? '—'} <span className="muted">{f.cp_origen ?? ''}</span></div>
                          <div><span className="dot d" />{f.poblacion_destino ?? '—'} <span className="muted">{f.cp_destino ?? ''}</span></div>
                        </td>
                        {esDynamo && <td className="num">{euros(f.importe_cliente)}</td>}
                        {esDynamo && <td className="num">{euros(f.importe_transportista)}</td>}
                        {esDynamo && (
                          <td className={`num ${Number(f.margen_euros) < 0 ? 'margen-neg' : 'margen-pos'}`}>
                            {euros(f.margen_euros)}
                          </td>
                        )}
                        {rol === 'cliente' && <td className="num">{f.es_manual ? '—' : euros(f.importe_cliente)}</td>}
                        {rol === 'transportista' && <td className="num">{euros(f.importe_transportista)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
