-- «Editar empresa» del usuario del cliente (usuario, 2026-11-17): la ventana enseña en gris,
-- solo lectura, los datos fiscales de su empresa, y entre ellos el SECTOR, que mi_empresa()
-- no devuelve. Esta función se lo da (solo el suyo).
create or replace function public.mi_empresa_sector()
returns text language sql stable security definer set search_path = public as $$
  select c.sector from clientes c where c.id = cliente_del_usuario()
$$;
revoke execute on function public.mi_empresa_sector() from public, anon;
grant execute on function public.mi_empresa_sector() to authenticated;
comment on function public.mi_empresa_sector() is '[Clientes y cuentas] El sector de la empresa del usuario cliente que llama (vacío si no tiene o si quien llama no es de un cliente). Quién: el usuario de un cliente. Argumentos: sin argumentos.';
