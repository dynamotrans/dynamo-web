import { IcoAviso } from './Iconos';

// Se enseña si faltan las dos variables de Supabase en Vercel, en vez de romper.
export default function SinConfigurar() {
  return (
    <div className="pt-entrar">
      <div className="pt-card">
        <img className="logo" src="/images/2.png" alt="Dynamo" />
        <div className="pt-aviso">
          <IcoAviso />
          <div>
            <strong>Falta conectar la base de datos.</strong> En Vercel → Settings →
            Environment Variables, añade para <em>Preview</em> (rama <code>pruebas</code>):
            <code> NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
            y vuelve a publicar.
          </div>
        </div>
      </div>
    </div>
  );
}
