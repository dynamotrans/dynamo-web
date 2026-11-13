-- =====================================================================================
-- AVISO DE ENTREGA AL DESTINATARIO (tarea 88, usuario 2026-11-13)
-- =====================================================================================
-- Al asignar transportista, cada sitio de ENTREGA con emails de aviso recibe un email
-- TRANSACCIONAL (como los avisos de los courier): quién le envía (el cliente de Dynamo),
-- cuándo está prevista la entrega y la matrícula si ya se sabe. Va por Postmark con el
-- mismo registro de siempre; aquí solo se admite el tipo nuevo en el registro.
-- Reglas: ni una palabra comercial (solo el pie de marca); con discreción comercial NO
-- se manda; clave única por envío y parada (no se repite jamás).

alter table emails_enviados drop constraint emails_enviados_tipo_check;
alter table emails_enviados add constraint emails_enviados_tipo_check
  check (tipo in ('matriculas', 'vispera', 'orden_carga', 'firma_cmr', 'cmr_completo', 'difusion', 'difusion_fin', 'aviso_entrega'));

comment on column public.emails_enviados.tipo is 'formato: texto | rango: no aplica | lista: matriculas · vispera · orden_carga · firma_cmr · cmr_completo · difusion · difusion_fin · aviso_entrega | obligatorio | Qué aviso es. Ej. OK: matriculas';
