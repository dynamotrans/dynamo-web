-- =====================================================================================
-- OFERTAR = ENVÍO PUNTUAL A TRANSPORTISTAS, NO «PUBLICAR EN BOLSA» (usuario, 2026-11-09)
-- =====================================================================================
-- El modal «Ofrecer envío» preguntaba «Para: bolsa de cargas / un transportista» y «Por
-- dónde se le manda: Bolsa · Wtransnet…». No procede: una oferta es un ENLACE que Dynamo
-- manda puntualmente a un transportista (por WhatsApp, email o donde sea), y quien lo
-- abre se identifica con su CIF al aceptar (el buscador público de la 20261109090000).
-- Fuera los dos selectores; el canal de esas ofertas pasa a ser «enlace». Los canales
-- antiguos siguen valiendo (hay ofertas guardadas con ellos y n8n podrá usarlos).
-- =====================================================================================

alter table envio_ofertas drop constraint envio_ofertas_canal_check;
alter table envio_ofertas add constraint envio_ofertas_canal_check check (canal in
  ('enlace','email','whatsapp','telefono','bolsa_wtransnet','bolsa_teleroute',
   'bolsa_otra','panel'));

-- Una oferta SIN transportista era «de bolsa» por obligación; ahora lo normal es el
-- enlace abierto (quien lo abre se identifica). Las de bolsa antiguas siguen valiendo.
alter table envio_ofertas drop constraint ck_ofertas_bolsa_sin_transportista;
alter table envio_ofertas add constraint ck_ofertas_abierta_enlace_o_bolsa check (
  transportista_id is not null or canal = 'enlace' or canal like 'bolsa_%'
);

comment on column public.envio_ofertas.canal is 'formato: texto | rango: no aplica | lista: enlace (envío puntual del enlace; el del panel), email, whatsapp, telefono, bolsa_wtransnet, bolsa_teleroute, bolsa_otra, panel (panel del transportista) | obligatorio | Por dónde se ofertó. Desde el panel siempre «enlace»; el resto queda para las ofertas antiguas y los avisos automáticos. Ej. OK: enlace · Ej. mal: sms';
