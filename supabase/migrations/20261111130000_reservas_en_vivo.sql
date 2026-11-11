-- =====================================================================================
-- LAS RESERVAS DEL CMR TAMBIÉN MANDAN SEÑAL EN VIVO (usuario, 2026-11-11)
-- =====================================================================================
-- «He subido reserva con foto al CMR y no se actualiza; debe ser instantáneo»: la tabla
-- cmr_reservas nació el 2026-11-09, DESPUÉS de la lista de tablas de la plataforma en
-- vivo (migración en_vivo del 2026-11-06), y se quedó sin los tres disparadores de
-- señal — la foto (documentos) y la incidencia sí avisaban, pero la reserva no. Se le
-- ponen los mismos disparadores, en modo «envio» (avisa a Dynamo y al cliente y
-- transportista del envío). La prueba 194 barre además TODAS las tablas de negocio con
-- envio_id para que ninguna tabla futura vuelva a quedarse muda.
-- =====================================================================================

create trigger tg_zz_en_vivo_alta after insert on cmr_reservas
  referencing new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_cambio after update on cmr_reservas
  referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_borrado after delete on cmr_reservas
  referencing old table as viejas for each statement execute function fn_senal_en_vivo('envio');

-- envio_parada_pines (el PIN de entrega de cada parada, 2026-11-07) estaba igual de
-- muda: también se ve en el panel y en la carga del transportista.
create trigger tg_zz_en_vivo_alta after insert on envio_parada_pines
  referencing new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_cambio after update on envio_parada_pines
  referencing old table as viejas new table as nuevas for each statement execute function fn_senal_en_vivo('envio');
create trigger tg_zz_en_vivo_borrado after delete on envio_parada_pines
  referencing old table as viejas for each statement execute function fn_senal_en_vivo('envio');
