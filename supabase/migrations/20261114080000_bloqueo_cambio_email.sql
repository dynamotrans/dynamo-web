-- =====================================================================================
-- EL CAMBIO DE EMAIL TAMBIÉN PASA POR LA LISTA DE BLOQUEO (usuario, 2026-11-14)
-- =====================================================================================
-- «Mi cuenta» deja cambiar el email de acceso. La web ya comprueba la lista de bloqueo
-- de altas (bloqueos_alta), pero quien llame a la API de acceso directamente se la
-- saltaba: el sincronizador del email (el disparador que copia el cambio al perfil)
-- rechaza ahora un email vetado, con lo que el cambio entero falla. Y nada más cambia:
-- los contadores de uso (consultas, cancelaciones, envíos) van por el id del usuario,
-- no por el email, así que cambiar el correo no reinicia nada.

create or replace function fn_sincronizar_email_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    if alta_bloqueada(new.email) then
      raise exception 'alta_bloqueada' using errcode = '42501';
    end if;
    update usuarios set email = new.email where id = new.id;
  end if;
  return new;
end $$;
comment on function public.fn_sincronizar_email_usuario() is '[Gestión interna] Disparador del acceso (auth.users): cuando cambia el email, lo copia al perfil (usuarios.email) para que acceso y perfil nunca se desincronicen; y si el email nuevo está en la lista de bloqueo (bloqueos_alta), rechaza el cambio entero — un veto de email o dominio no se esquiva cambiándose el correo. El resto de la cuenta no se toca: los contadores de uso van por el id del usuario, no por el email. Quién: el disparador; nadie por la API. Argumentos: ninguno (NEW/OLD).';
