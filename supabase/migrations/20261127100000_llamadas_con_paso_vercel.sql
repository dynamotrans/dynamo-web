-- LAS TAREAS AUTOMÁTICAS NO LLEGABAN A LA WEB DE PRUEBAS (2026-11-27). La base de datos llama a la
-- plataforma (pg_net) para poner al día la facturación y los céntimos de verificación
-- (/api/facturas/sincronizar), subir sitios a Brevo (/api/brevo/sitios) y cerrar en Stripe los
-- enlaces de pago caducados (/api/stripe/caducar). En la web de pruebas TODAS rebotaban con un
-- 401 «Protected by Vercel Authentication»: la preview de Vercel está detrás de su acceso, y la
-- llamada no llevaba el código de paso. En producción (dominio propio, sin esa protección) no pasa.
--
-- Arreglo: las tres llamadas usan las mismas cabeceras, y si en el Vault de Supabase hay un secreto
-- «vercel_bypass» (el código de «Protection Bypass for Automation» de Vercel, el mismo que lleva la
-- dirección del aviso de Stripe), se añade como cabecera x-vercel-protection-bypass. Lo pone el
-- usuario a mano en el Vault, nunca en el repositorio ni en el chat. Sin secreto, todo sigue igual.

create or replace function public.plataforma_cabeceras()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_paso text;
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_paso using 'vercel_bypass';
    exception when others then v_paso := null;
    end;
  end if;
  return jsonb_build_object('Content-Type', 'application/json')
      || case when coalesce(btrim(v_paso), '') <> '' then jsonb_build_object('x-vercel-protection-bypass', btrim(v_paso)) else '{}'::jsonb end;
end $$;
revoke all on function public.plataforma_cabeceras() from public, anon, authenticated;
comment on function public.plataforma_cabeceras() is '[Sistema y tareas automáticas] Cabeceras de las llamadas de la base de datos a la plataforma (facturación, sitios a Brevo, pagos caducados): JSON y, si en el Vault hay un secreto «vercel_bypass», el código de paso de Vercel para que la web de pruebas (protegida) las deje entrar. Quién: solo funciones internas. Argumentos: sin argumentos.';

-- Las tres funciones que llaman: solo cambian las cabeceras.
do $$ declare f text; d text; n text; begin
  foreach f in array array['public.facturas_avisar()', 'public.brevo_sitios_avisar()', 'public.caducar_pagos_pendientes()'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, $q$headers := jsonb_build_object('Content-Type', 'application/json'))$q$, $q$headers := plataforma_cabeceras())$q$);
    if n = d then raise exception '% no tiene las cabeceras esperadas', f; end if;
    execute n;
  end loop;
end $$;
