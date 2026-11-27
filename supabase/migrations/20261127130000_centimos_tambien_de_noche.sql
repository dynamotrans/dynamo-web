-- LA CUENTA DEL CÉNTIMO TAMBIÉN DE NOCHE (usuario, 2026-11-27: «ok» a mirarla cada 15 minutos de
-- noche solo cuando haya algún cliente esperando su verificación). De 8:00 a 22:00 la tarea pone al
-- día la facturación entera (y con ella los céntimos); de noche, solo a las 00:00 y 04:00. Ahora,
-- fuera de esas horas, si hay alguna empresa sin verificar que ha avisado de su transferencia, se
-- pide al servidor SOLO la revisión de la cuenta del céntimo (body {"solo":"centimos"}), que gasta
-- una o dos consultas a la facturación y no toca la copia de facturas.
do $$ declare v text; n text; begin
  v := pg_get_functiondef('public.facturas_avisar()'::regprocedure);
  n := replace(v,
    $r$  if not facturas_toca_pasada(v_hora, extract(minute from v_ahora)::int) then return false; end if;
  v_base := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
  if v_base !~ '^https://' or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  begin
    execute $q$select net.http_post(url := $1, body := $2, headers := plataforma_cabeceras())$q$
      using v_base || '/api/facturas/sincronizar', '{}'::jsonb;$r$,
    $r$  v_base := rtrim(coalesce(parametro('url_plataforma') #>> '{}', ''), '/');
  if v_base !~ '^https://' or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  if not facturas_toca_pasada(v_hora, extract(minute from v_ahora)::int) then
    -- De noche: solo la cuenta del céntimo, y solo si alguien espera su verificación por transferencia.
    if not exists (select 1 from clientes where estado_verificacion = 'no_verificada' and verificacion_solicitada = 'transferencia') then return false; end if;
    begin
      execute $q$select net.http_post(url := $1, body := $2, headers := plataforma_cabeceras())$q$
        using v_base || '/api/facturas/sincronizar', '{"solo":"centimos"}'::jsonb;
    exception when others then return false;
    end;
    return true;
  end if;
  begin
    execute $q$select net.http_post(url := $1, body := $2, headers := plataforma_cabeceras())$q$
      using v_base || '/api/facturas/sincronizar', '{}'::jsonb;$r$);
  if n = v then raise exception 'facturas_avisar no tiene el texto esperado'; end if;
  execute n;
end $$;
comment on function public.facturas_avisar() is '[Precio y pago] Tarea de cada 15 minutos: si la copia de facturas está encendida y toca (todos los días de 8 a 22, cada 15 minutos; de noche, cada 4 horas), le pide al servidor (/api/facturas/sincronizar) que la ponga al día. De noche, si alguna empresa espera su verificación por transferencia, le pide solo la revisión de la cuenta del céntimo. Quién: solo el sistema (pg_cron).';
