-- =====================================================================================
-- PARÁMETROS: solo el ADMINISTRADOR los cambia, y los datos bancarios NUNCA desde la web
-- =====================================================================================
-- Dos cosas, a raíz de la pregunta del usuario «¿puede alguien cambiar el IBAN?»:
--
-- 1. Hueco cerrado: la política de `parametros` usaba es_admin(), que incluye a los
--    EMPLEADOS. La pantalla solo deja guardar al administrador, pero un empleado podía
--    escribir en la tabla llamando a la API directamente (el front no es seguridad).
--    Ahora: Dynamo (admin y empleado) LEE; solo el ADMINISTRADOR escribe.
--
-- 2. Datos que deciden a quién paga el cliente (IBAN, banco, BIC, titular y CIF): NO se
--    cambian desde la plataforma, ni siquiera un administrador. Es el fraude clásico
--    (alguien entra con una contraseña robada y cambia el IBAN de las proformas). Solo
--    se cambian en Supabase (Table Editor → parametros), que va con otra cuenta y otra
--    contraseña. Lo impone un trigger: cualquier sesión de la web (roles anon y
--    authenticated) que intente tocarlos se rechaza.

drop policy if exists parametros_admin on parametros;

create or replace function es_administrador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'admin' and estado = 'activa')
$$;
revoke execute on function es_administrador() from public, anon;
grant execute on function es_administrador() to authenticated;

create policy parametros_leer   on parametros for select using (es_admin());
create policy parametros_alta   on parametros for insert with check (es_administrador());
create policy parametros_cambio on parametros for update using (es_administrador()) with check (es_administrador());
create policy parametros_baja   on parametros for delete using (es_administrador());

create or replace function fn_parametros_blindados()
returns trigger language plpgsql set search_path = public as $$
declare v_clave text := coalesce(new.clave, old.clave);
begin
  if v_clave in ('dynamo_iban', 'dynamo_banco', 'dynamo_bic', 'dynamo_razon_social', 'dynamo_cif')
     and current_user in ('anon', 'authenticated') then
    raise exception 'Los datos bancarios y fiscales de Dynamo no se cambian desde la plataforma: solo en Supabase (Table Editor → parametros).'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function fn_parametros_blindados() from public, anon, authenticated;

create trigger tg_parametros_blindados before insert or update or delete on parametros
  for each row execute function fn_parametros_blindados();

comment on function fn_parametros_blindados() is
  'IBAN, banco, BIC, razón social y CIF de Dynamo: solo se cambian en Supabase, nunca desde la web (anti-fraude de cambio de IBAN).';
