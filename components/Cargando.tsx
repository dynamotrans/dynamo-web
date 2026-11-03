// Cargador de la plataforma: el arco verde del logo de Dynamo girando sobre un aro
// morado, con el logo debajo, en mitad de la pantalla. Estilos en app/plataforma.css.
export default function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return (
    <div className="dyn-cargando" role="status" aria-live="polite">
      <div className="dyn-cargando-rueda" aria-hidden="true">
        <div className="dyn-cargando-aro" />
        <div className="dyn-cargando-arco" />
        <div className="dyn-cargando-centro" />
      </div>
      <img className="dyn-cargando-logo" src="/images/2.png" alt="Dynamo" />
      <div className="dyn-cargando-texto">{texto}</div>
    </div>
  );
}
