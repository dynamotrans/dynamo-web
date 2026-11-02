-- =====================================================================================
-- QUITAR `tiene_whatsapp` Y `pais_matricula` (decisión del usuario, 2026-11-02)
-- =====================================================================================
-- 1. `tiene_whatsapp` (contactos y conductores): ir mirando uno a uno quién tiene
--    WhatsApp es un lío que nadie va a mantener. Regla del usuario: SI ES MÓVIL, SE DA
--    POR HECHO QUE TIENE WHATSAPP. Eso lo decide la app mirando el número; no se guarda.
-- 2. `pais_matricula` (vehículos): fuera. Con él se va la comprobación estricta del
--    formato español, que dependía de saber el país (sin el país, una matrícula polaca
--    se rechazaría como española mal escrita). Queda la comprobación suave de siempre:
--    entre 4 y 15 letras o números, y sin duplicados.
-- =====================================================================================

alter table contactos   drop column tiene_whatsapp;
alter table conductores drop column tiene_whatsapp;

alter table vehiculos drop constraint ck_vehiculos_matricula_es;
drop index if exists ux_vehiculos_matricula_activa;
alter table vehiculos drop column pais_matricula;
drop function if exists matricula_es_valida(text, tipo_vehiculo);

-- El UNIQUE vuelve a ser sobre la matrícula limpia ("1234-lbc" = "1234 LBC").
create unique index ux_vehiculos_matricula_activa
  on vehiculos (normaliza_matricula(matricula)) where activo;
