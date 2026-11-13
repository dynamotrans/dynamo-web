-- =====================================================================================
-- FUERA LOS DATOS DECLARADOS DEL SEGURO CMR Y EL «CAMIÓN HABITUAL» (usuario, 2026-11-13)
-- =====================================================================================
-- De la ficha del transportista sobran los datos ESCRITOS del seguro CMR (compañía,
-- nº de póliza, vence) y el tipo de camión «habitual»: lo que vale es la PÓLIZA EN PDF
-- de Documentos (tipo seguro_cmr, que se queda), y la flota se aprende sola de lo que
-- carga cada matrícula (tabla vehiculos). Se borran las cuatro columnas de la tabla
-- transportistas y las dos funciones del transportista quedan sin esos campos.
-- OJO: clientes.tipo_camion_defecto NO se toca (es otra cosa: el camión por defecto
-- del formulario de Nuevo envío del cliente).

-- Las dos funciones cambian de forma (una de columnas devueltas, otra de argumentos):
-- se quitan y se crean de nuevo.
drop function if exists mi_empresa_transportista();
drop function if exists guardar_mis_datos_transporte(text, text, text, date);

alter table transportistas
  drop column seguro_cmr_compania,
  drop column seguro_cmr_poliza,
  drop column seguro_cmr_vence,
  drop column tipo_camion_defecto;

-- Lo que el transportista ve de su propia empresa (sin estado operativo, valoración
-- interna, notas internas ni pronto pago, como siempre).
create function mi_empresa_transportista()
returns table (id uuid, codigo text, razon_social text, nombre_comercial text, cif text,
               direccion text, poblacion text, codigo_postal text, provincia text,
               pais_codigo_iso char, plazo_pago_dias integer, nima text,
               bolsa text, codigo_bolsa text)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.razon_social, t.nombre_comercial, t.cif, t.direccion,
         t.poblacion, t.codigo_postal, t.provincia, t.pais_codigo_iso,
         t.plazo_pago_dias, t.nima, t.bolsa, t.codigo_bolsa
    from transportistas t where t.id = transportista_del_usuario()
$$;
revoke execute on function mi_empresa_transportista() from public, anon;
grant execute on function mi_empresa_transportista() to authenticated;
comment on function public.mi_empresa_transportista() is '[Clientes y cuentas] Ficha de la empresa del transportista que llama: código, razón social, CIF, dirección, plazo de pago, NIMA, bolsa y código en la bolsa. El seguro CMR va como documento PDF (Documentos, tipo seguro_cmr), no como datos escritos. Quién: transportista. Argumentos: sin argumentos.';

-- Lo único que el transportista cambia a mano de su empresa: el NIMA.
create function guardar_mis_datos_transporte(p_nima text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t uuid := transportista_del_usuario();
begin
  if v_t is null then raise exception 'Solo un transportista con la cuenta activa puede cambiar estos datos.' using errcode = '42501'; end if;
  if length(coalesce(p_nima, '')) > 40 then
    raise exception 'El NIMA es demasiado largo.';
  end if;
  update transportistas set nima = nullif(trim(p_nima), '') where id = v_t;
end $$;
revoke execute on function guardar_mis_datos_transporte(text) from public, anon;
grant execute on function guardar_mis_datos_transporte(text) to authenticated;
comment on function public.guardar_mis_datos_transporte(text) is '[Clientes y cuentas] El transportista cambia el NIMA de su propia empresa (lo único editable a mano; el seguro CMR se sube en PDF a Documentos y el resto lo cambia Dynamo). Quién: transportista con la cuenta activa. Argumentos: p_nima: número NIMA o vacío para quitarlo.';

-- La descripción de la tabla ya no habla del seguro escrito.
comment on table public.transportistas is 'Red de transportistas de Dynamo (proveedores): datos fiscales (Holded), bolsa de carga y datos internos (estado, valoraciones). El seguro CMR va como documento PDF (Documentos, tipo seguro_cmr). Escribe Dynamo; el transportista lee con mi_empresa_transportista() y cambia su NIMA con guardar_mis_datos_transporte(). Alta online: alta_transportista_publica().';

-- ---- cargar_datos_de_prueba: la siembra ya no rellena seguro escrito ni camión habitual
-- (la función es la de 20261106170000 tal cual, con el insert de transportistas sin las
-- cuatro columnas borradas; el tipo_camion_defecto de CLIENTES sigue igual).
create or replace function public.cargar_datos_de_prueba(
  p_confirmacion   text,
  p_escala         numeric default 1,
  p_clave_cuentas  text    default null,
  p_cuentas_reales jsonb   default null)
returns jsonb
language plpgsql
set search_path = public, extensions
as $fn$
declare
  v_cmm text;
  k        numeric := p_escala;
  v_hoy    date := (now() at time zone 'Europe/Madrid')::date;
  v_t0     timestamptz := clock_timestamp();
  v_t      timestamptz;
  v_tiempos jsonb := '{}';
  v_marca  constant text := 'DATO DE PRUEBA · generado por cargar_datos_de_prueba(); se borra con borrar_datos_de_prueba()';
  v_ncli int; v_ntra int; v_nhist int;
  v_es int[]; v_eu int[]; v_pt int[]; v_fr int[]; v_de int[]; v_pl int[]; v_it int[];
  v_tot numeric; v_kf numeric; v_ac int[]; v_af int[]; v_as int[]; v_tc int[]; v_ta int[];
  v_cuentas jsonb := '[]'; v_reales jsonb := '[]';
  v_uid uuid; v_cli uuid; v_tra uuid; v_nombre text; v_mail text; v_rol text; v_tel text; v_x jsonb;
  v_supabase boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id');
  v_identities boolean := to_regclass('auth.identities') is not null;
  v_clave text;
  v_lote int;
  -- Nombre del conductor en los envíos de los dos últimos años (antes, solo la matrícula): cada
  -- nombre obliga a fn_envios_flota_alta() a recorrer todos los conductores (no hay índice).
  v_cond_dias int := 730;
  v_sectores text[] := array(select jsonb_array_elements_text(coalesce(parametro('sectores_cliente'), '[]')));
  ac record;
  -- Nombres y apellidos por país (con tildes, ñ, ç, ł, ß, ș, apóstrofos... a propósito).
  v_nom jsonb := jsonb_build_object(
    'ES', jsonb_build_array('Manuel','José','Antonio','Francisco','Juan','David','Javier','Daniel','Carlos','Miguel','Rafael','Pedro','Ángel','Alejandro','Fernando','Luis','Sergio','Pablo','Jorge','Alberto','Álvaro','Rubén','Iñaki','Jesús','Óscar','Raúl','Joaquín','Ramón','Adrián','Íñigo',
                            'María','Carmen','Ana','Isabel','Laura','Lucía','Cristina','Marta','Elena','Pilar','Rocío','Sara','Paula','Raquel','Begoña','Nuria','Montserrat','Inmaculada','Concepción','Ainhoa'),
    'PT', jsonb_build_array('João','José','António','Luís','Paulo','Rui','Nuno','Gonçalo','Tiago','Vítor','Maria','Ana','Inês','Conceição','Fátima'),
    'FR', jsonb_build_array('François','Jean','Pierre','Jérôme','Mathieu','Stéphane','Hélène','Céline','Amélie','Noël'),
    'DE', jsonb_build_array('Jürgen','Klaus','Stefan','Thomas','Michael','Uwe','Jörg','Andreas','Sabine','Jürgen'),
    'IT', jsonb_build_array('Giuseppe','Marco','Luca','Francesco','Alessandro','Niccolò','Giulia','Chiara'),
    'PL', jsonb_build_array('Łukasz','Michał','Paweł','Piotr','Krzysztof','Tomasz','Grzegorz','Wojciech','Małgorzata','Agnieszka'),
    'RO', jsonb_build_array('Ștefan','Ion','Mihai','Gheorghe','Vasile','Andrei','Constantin','Adrian','Ioana','Elena'),
    'BG', jsonb_build_array('Georgi','Ivan','Dimitar','Nikolay','Petar','Stoyan'),
    'LT', jsonb_build_array('Tomas','Mindaugas','Darius','Žydrūnas','Andrius','Jonas'),
    'NL', jsonb_build_array('Johannes','Pieter','Henk','Sander','Bram','Maarten'),
    'BE', jsonb_build_array('Wouter','Jef','Pieter','Luc','Benoît','Hélène'),
    'CZ', jsonb_build_array('Jiří','Petr','Tomáš','Josef','Martin','Lukáš'),
    'TR', jsonb_build_array('Mehmet','Mustafa','Ahmet','Hüseyin','Emre'),
    'IE', jsonb_build_array('Seán','Patrick','Ciarán','Siobhán','Niamh'),
    'MA', jsonb_build_array('Mohamed','Youssef','Hassan','Rachid','Abdelkader','Said'));
  v_ape jsonb := jsonb_build_object(
    'ES', jsonb_build_array('García','Fernández','González','Rodríguez','López','Martínez','Sánchez','Pérez','Gómez','Martín','Jiménez','Ruiz','Hernández','Díaz','Moreno','Muñoz','Álvarez','Romero','Alonso','Gutiérrez','Navarro','Torres','Domínguez','Vázquez','Ramos','Gil','Ramírez','Serrano','Blanco','Molina','Morales','Suárez','Ortega','Delgado','Castro','Ortiz','Rubio','Marín','Sanz','Núñez','Iglesias','Medina','Garrido','Cortés','Castillo','Santos','Lozano','Guerrero','Cano','Prieto','Méndez','Cruz','Calvo','Gallego','Peña','Ibáñez','Cabrera','Carrasco','Herrera','Montero','Aguirre','Etxeberria','Goikoetxea','Puig','Vilaró','Castaño','Belmonte','Pozo','Expósito','Zúñiga'),
    'PT', jsonb_build_array('Silva','Santos','Ferreira','Pereira','Oliveira','Costa','Rodrigues','Martins','Gonçalves','Simões','Magalhães','Conceição'),
    'FR', jsonb_build_array('Martin','Bernard','Dubois','Lefèvre','Moreau','Girard','Lefebvre','Rousseau','Fontaine','Bérard'),
    'DE', jsonb_build_array('Müller','Schmidt','Schneider','Fischer','Weiß','Groß','Köhler','Schäfer','Bäcker','Hoffmann'),
    'IT', jsonb_build_array('Rossi','Russo','Ferrari','Esposito','Bianchi','Colombo','Ricci','Marino','D''Angelo','Lombardi'),
    'PL', jsonb_build_array('Nowak','Kowalski','Wiśniewski','Wójcik','Kowalczyk','Kamiński','Lewandowski','Zieliński','Szymański','Dąbrowski','Woźniak','Mazur'),
    'RO', jsonb_build_array('Popescu','Ionescu','Popa','Dumitru','Stan','Stoica','Gheorghe','Munteanu','Rusu','Constantinescu','Mărgineanu','Țurcanu'),
    'BG', jsonb_build_array('Ivanov','Georgiev','Dimitrov','Petrov','Nikolov','Stoyanov'),
    'LT', jsonb_build_array('Kazlauskas','Jankauskas','Petrauskas','Stankevičius','Vasiliauskas','Žukauskas'),
    'NL', jsonb_build_array('de Jong','Jansen','de Vries','van den Berg','van Dijk','Bakker','Visser','Smit'),
    'BE', jsonb_build_array('Peeters','Janssens','Maes','Jacobs','Mertens','Willems','Dubois','Lambert'),
    'CZ', jsonb_build_array('Novák','Svoboda','Novotný','Dvořák','Černý','Procházka'),
    'TR', jsonb_build_array('Çelik','Yılmaz','Kaya','Demir','Şahin','Öztürk'),
    'IE', jsonb_build_array('O''Connor','O''Brien','Murphy','Kelly','O''Sullivan','McCarthy'),
    'MA', jsonb_build_array('El Amrani','Benali','El Idrissi','Bennani','Ouali','Haddad'));
  v_sector text[] := array['Distribuciones','Cerámicas','Industrias','Conservas','Aceites','Bodegas','Maderas','Hierros y Aceros','Plásticos','Papelera','Agrícola','Frutas','Embalajes','Muebles','Química','Textil','Materiales de Construcción','Áridos','Fertilizantes','Recambios','Electrodomésticos','Piensos','Vidrios','Aluminios','Paneles','Envases','Cartonajes','Hortofrutícola','Mármoles','Prefabricados','Logística','Suministros Industriales','Alimentación','Cervezas','Lácteos','Jamones','Azulejos','Sanitarios','Pinturas','Neumáticos'];
  v_core text[] := array['del Sur','del Norte','Levante','Guadalquivir','del Ebro','Cantábrica','del Duero','Mediterránea','Atlántica','Ibérica','Hispalense','Manchega','Bética','del Tajo','Riojana','Navarra','Gallega','Asturiana','Extremeña','Aragonesa','Catalana','Valenciana','Andaluza','Castellana','del Segura','Peninsular','Europea','Internacional','Hermanos Ruiz','Hermanos García','Martínez e Hijos','López y Pérez','Sánchez Morales','Peña Blanca','Nuestra Señora del Rocío','San José','Santa Ana','La Esperanza','El Pilar','Montesierra','Valdepeñas','Puerto Real','Los Olivos','La Vega','El Molino','Doña Ana','Castaño','Ibáñez','Núñez Hermanos','Muñoz'];
  v_forma text[] := array['SL','SL','SL','S.L.','SA','S.A.','SLU','S.L.U.','S.Coop.','SCA','SAT','SL','SL','S.L.'];
  v_merc text[] := array['Palets de azulejos','Bobinas de acero','Perfiles de aluminio','Sacos de cemento','Palets de agua mineral','Cajas de fruta','Aceite de oliva en garrafas','Vino embotellado','Muebles desmontados','Electrodomésticos','Neumáticos','Paneles sándwich','Tubería de PVC','Fertilizante en big bags','Pienso en sacos','Papel en bobinas','Cartón plegado','Maquinaria industrial','Ladrillos','Mármol en bloques','Conservas de pescado','Textil en cajas','Recambios de automóvil','Pinturas (sin ADR)','Envases de vidrio','Placas solares','Madera aserrada','Material eléctrico','Productos de limpieza','Jamones curados'];
  v_calle text[] := array['Calle Mayor','Avenida de Andalucía','Calle Real','Polígono Industrial Los Olivos, calle A','Polígono Industrial El Pino, calle Pino Silvestre','Avenida de la Constitución','Camino de Sevilla','Carretera de Madrid, km','Calle de la Industria','Polígono Industrial San Isidro, nave','Avenida de Europa','Calle del Comercio','Parque Empresarial La Florida, calle','Calle Ñandú','Calle de L''Hospitalet','Ronda Norte','Calle Artesanía','Avenida del Puerto','Polígono Industrial Malpica, calle E','Calle Peña Prieta'];
begin
  -- ---- 0. Comprobaciones de seguridad --------------------------------------------------
  if not es_consola_supabase() then
    raise exception 'Los datos de prueba solo se cargan desde la consola de Supabase (SQL Editor).' using errcode = '42501';
  end if;
  if p_confirmacion is distinct from 'SI, ES EL PROYECTO DE PRUEBAS' then
    raise exception 'Escribe exactamente «SI, ES EL PROYECTO DE PRUEBAS» para confirmar que esta base de datos es la de pruebas.' using errcode = '22023';
  end if;
  if k is null or k <= 0 or k > 1 then
    raise exception 'La escala tiene que estar entre 0 (sin incluir) y 1 (volumen completo).' using errcode = '22023';
  end if;
  if p_clave_cuentas is not null and length(p_clave_cuentas) < 12 then
    raise exception 'La contraseña de las cuentas de prueba tiene que tener al menos 12 caracteres.' using errcode = '22023';
  end if;
  if p_cuentas_reales is not null and (jsonb_typeof(p_cuentas_reales) <> 'array' or p_clave_cuentas is null) then
    raise exception 'p_cuentas_reales es una lista [{email, telefono, rol, nombre}] y necesita p_clave_cuentas.' using errcode = '22023';
  end if;
  if exists (select 1 from clientes where 'dato_de_prueba' = any (tags))
     or exists (select 1 from transportistas where 'dato_de_prueba' = any (tags))
     or exists (select 1 from usuarios where email ilike '%@prueba.invalid') then
    return jsonb_build_object('resultado', 'ya_cargados',
      'mensaje', 'Ya hay datos de prueba. Bórralos antes con borrar_datos_de_prueba(''SI, ES EL PROYECTO DE PRUEBAS'').',
      'clientes', (select count(*) from clientes where 'dato_de_prueba' = any (tags)),
      'transportistas', (select count(*) from transportistas where 'dato_de_prueba' = any (tags)));
  end if;
  if v_supabase and p_clave_cuentas is not null and to_regprocedure('extensions.crypt(text,text)') is null then
    raise exception 'Falta pgcrypto en el esquema extensions (crypt) para las contraseñas de las cuentas.';
  end if;

  -- Fechas y horas reales del pasado (como al migrar el Sheet) y revisión de precio a mano.
  perform set_config('dynamo.migracion', 'on', true);
  perform set_config('dynamo.revision_precio', 'on', true);
  perform setseed(0.20261106);

  v_ncli  := greatest(12, round(3000 * k));
  v_ntra  := greatest(25, round(20000 * k));
  v_nhist := greatest(150, round(9000 * 7 * k));

  -- ---- 1. Ciudades reales (paradas): capitales de provincia y ciudades logísticas ----------
  v_cmm := current_setting('client_min_messages');
  perform set_config('client_min_messages', 'warning', true);
  drop table if exists _dp_ciu, _dp_sede, _dp_dia, _dp_cli, _dp_tra, _dp_veh, _dp_con, _dp_sit, _dp_env, _dp_par, _dp_ofe, _dp_acc;
  perform set_config('client_min_messages', v_cmm, true);
  create temp table _dp_ciu (i serial primary key, nombre text, cpostal text, provincia text, pais_iso text, lat numeric, lon numeric, peso int) on commit drop;
  insert into _dp_ciu (nombre, cpostal, provincia, pais_iso, lat, lon, peso) values
    ('Madrid','28001','Madrid','ES',40.4168,-3.7038,40), ('Getafe','28901','Madrid','ES',40.3057,-3.7329,12), ('Coslada','28821','Madrid','ES',40.4238,-3.5613,10),
    ('Barcelona','08001','Barcelona','ES',41.3874,2.1686,30), ('El Prat de Llobregat','08820','Barcelona','ES',41.3275,2.0951,10),
    ('Valencia','46001','Valencia','ES',39.4699,-0.3763,22), ('Sevilla','41001','Sevilla','ES',37.3891,-5.9845,20), ('Zaragoza','50001','Zaragoza','ES',41.6488,-0.8891,16),
    ('Málaga','29001','Málaga','ES',36.7213,-4.4214,10), ('Murcia','30001','Murcia','ES',37.9922,-1.1307,14), ('Alicante','03001','Alicante','ES',38.3452,-0.4810,9),
    ('Bilbao','48001','Bizkaia','ES',43.2630,-2.9350,10), ('Vitoria-Gasteiz','01001','Araba/Álava','ES',42.8467,-2.6716,6), ('Donostia-San Sebastián','20001','Gipuzkoa','ES',43.3183,-1.9812,5),
    ('Pamplona','31001','Navarra','ES',42.8125,-1.6458,6), ('Logroño','26001','La Rioja','ES',42.4627,-2.4450,4), ('Burgos','09001','Burgos','ES',42.3439,-3.6969,5),
    ('Valladolid','47001','Valladolid','ES',41.6523,-4.7245,7), ('León','24001','León','ES',42.5987,-5.5671,3), ('Palencia','34001','Palencia','ES',42.0095,-4.5288,2),
    ('Salamanca','37001','Salamanca','ES',40.9701,-5.6635,3), ('Zamora','49001','Zamora','ES',41.5035,-5.7446,2), ('Segovia','40001','Segovia','ES',40.9429,-4.1088,2),
    ('Ávila','05001','Ávila','ES',40.6565,-4.6818,1), ('Soria','42001','Soria','ES',41.7665,-2.4790,1), ('Toledo','45001','Toledo','ES',39.8628,-4.0273,5),
    ('Guadalajara','19001','Guadalajara','ES',40.6326,-3.1660,6), ('Cuenca','16001','Cuenca','ES',40.0704,-2.1374,1), ('Ciudad Real','13001','Ciudad Real','ES',38.9848,-3.9274,3),
    ('Albacete','02001','Albacete','ES',38.9943,-1.8585,3), ('Badajoz','06001','Badajoz','ES',38.8794,-6.9707,3), ('Cáceres','10001','Cáceres','ES',39.4753,-6.3724,2),
    ('Huelva','21001','Huelva','ES',37.2614,-6.9447,4), ('Cádiz','11001','Cádiz','ES',36.5271,-6.2886,3), ('Algeciras','11201','Cádiz','ES',36.1408,-5.4562,5),
    ('Córdoba','14001','Córdoba','ES',37.8882,-4.7794,5), ('Jaén','23001','Jaén','ES',37.7796,-3.7849,4), ('Granada','18001','Granada','ES',37.1773,-3.5986,4),
    ('Almería','04001','Almería','ES',36.8340,-2.4637,7), ('Castellón de la Plana','12001','Castellón','ES',39.9864,-0.0513,7), ('Tarragona','43001','Tarragona','ES',41.1189,1.2445,6),
    ('Lleida','25001','Lleida','ES',41.6176,0.6200,4), ('Girona','17001','Girona','ES',41.9794,2.8214,4), ('Huesca','22001','Huesca','ES',42.1401,-0.4089,2),
    ('Teruel','44001','Teruel','ES',40.3456,-1.1065,1), ('A Coruña','15001','A Coruña','ES',43.3623,-8.4115,5), ('Lugo','27001','Lugo','ES',43.0097,-7.5568,2),
    ('Ourense','32001','Ourense','ES',42.3358,-7.8639,2), ('Vigo','36201','Pontevedra','ES',42.2406,-8.7207,6), ('Oviedo','33001','Asturias','ES',43.3614,-5.8593,5),
    ('Santander','39001','Cantabria','ES',43.4623,-3.8099,4), ('Palma','07001','Illes Balears','ES',39.5696,2.6502,0),
    ('Lisboa','1100-148','Lisboa','PT',38.7223,-9.1393,6), ('Porto','4000-322','Porto','PT',41.1579,-8.6291,5), ('Braga','4700-435','Braga','PT',41.5454,-8.4265,2),
    ('Rungis','94150','Île-de-France','FR',48.7470,2.3510,5), ('Lyon','69001','Auvergne-Rhône-Alpes','FR',45.7640,4.8357,4), ('Marseille','13001','Provence-Alpes-Côte d''Azur','FR',43.2965,5.3698,3),
    ('Toulouse','31000','Occitanie','FR',43.6047,1.4442,4), ('Bordeaux','33000','Nouvelle-Aquitaine','FR',44.8378,-0.5792,4), ('Lille','59000','Hauts-de-France','FR',50.6292,3.0573,3),
    ('Perpignan','66000','Occitanie','FR',42.6887,2.8948,4),
    ('Hamburg','20095','Hamburg','DE',53.5511,9.9937,3), ('Frankfurt am Main','60311','Hessen','DE',50.1109,8.6821,3), ('München','80331','Bayern','DE',48.1351,11.5820,3),
    ('Köln','50667','Nordrhein-Westfalen','DE',50.9375,6.9603,3), ('Stuttgart','70173','Baden-Württemberg','DE',48.7758,9.1829,2), ('Berlin','10115','Berlin','DE',52.5200,13.4050,2),
    ('Duisburg','47051','Nordrhein-Westfalen','DE',51.4344,6.7623,3),
    ('Milano','20121','Lombardia','IT',45.4642,9.1900,4), ('Torino','10121','Piemonte','IT',45.0703,7.6869,2), ('Bologna','40121','Emilia-Romagna','IT',44.4949,11.3426,2),
    ('Verona','37121','Veneto','IT',45.4384,10.9916,2), ('Roma','00118','Lazio','IT',41.9028,12.4964,2),
    ('Rotterdam','3011 AA','Zuid-Holland','NL',51.9244,4.4777,3), ('Venlo','5911 AA','Limburg','NL',51.3704,6.1724,2), ('Amsterdam','1012 AB','Noord-Holland','NL',52.3676,4.9041,1),
    ('Antwerpen','2000','Antwerpen','BE',51.2194,4.4025,3), ('Bruxelles','1000','Bruxelles-Capitale','BE',50.8503,4.3517,1), ('Liège','4000','Liège','BE',50.6326,5.5797,1),
    ('Luxembourg','1009','Luxembourg','LU',49.6116,6.1319,1), ('Wien','1010','Wien','AT',48.2082,16.3738,1), ('Linz','4020','Oberösterreich','AT',48.3069,14.2858,1),
    ('Warszawa','00-001','Mazowieckie','PL',52.2297,21.0122,2), ('Poznań','60-001','Wielkopolskie','PL',52.4064,16.9252,2), ('Wrocław','50-001','Dolnośląskie','PL',51.1079,17.0385,1),
    ('Łódź','90-001','Łódzkie','PL',51.7592,19.4560,1), ('Praha','110 00','Praha','CZ',50.0755,14.4378,1), ('Brno','602 00','Jihomoravský kraj','CZ',49.1951,16.6068,1),
    ('København','1050','Hovedstaden','DK',55.6761,12.5683,1), ('Aarhus','8000','Midtjylland','DK',56.1629,10.2039,1),
    ('Dublin','D01 F5P2','County Dublin','IE',53.3498,-6.2603,0), ('Basel','4001','Basel-Stadt','CH',47.5596,7.5886,0);

  select array_agg(i) into v_es from _dp_ciu, generate_series(1, peso) where pais_iso = 'ES';
  select array_agg(i) into v_eu from _dp_ciu, generate_series(1, peso) where pais_iso not in ('ES', 'IE', 'CH');
  select array_agg(i) into v_pt from _dp_ciu, generate_series(1, peso) where pais_iso = 'PT';
  select array_agg(i) into v_fr from _dp_ciu, generate_series(1, peso) where pais_iso = 'FR';
  select array_agg(i) into v_de from _dp_ciu, generate_series(1, peso) where pais_iso = 'DE';
  select array_agg(i) into v_pl from _dp_ciu, generate_series(1, peso) where pais_iso = 'PL';
  select array_agg(i) into v_it from _dp_ciu, generate_series(1, peso) where pais_iso = 'IT';

  -- Sedes de empresas: las mismas ciudades y algunas más (los transportistas del Este).
  create temp table _dp_sede on commit drop as
    select pais_iso, nombre, cpostal, provincia from _dp_ciu where nombre not in ('Palma', 'Basel', 'Dublin')
    union all values
      ('RO','București','010011','București'), ('RO','Cluj-Napoca','400001','Cluj'), ('RO','Timișoara','300001','Timiș'), ('RO','Arad','310001','Arad'),
      ('BG','Sofia','1000','Sofia-grad'), ('BG','Plovdiv','4000','Plovdiv'), ('LT','Vilnius','01001','Vilniaus apskritis'), ('LT','Kaunas','44001','Kauno apskritis'),
      ('IE','Cork','T12 X70A','County Cork'), ('PL','Gdańsk','80-001','Pomorskie'), ('PT','Leiria','2400-001','Leiria'), ('ES','Jerez de la Frontera','11401','Cádiz'),
      ('ES','Lucena','14900','Córdoba'), ('ES','Elche','03201','Alicante'), ('ES','Talavera de la Reina','45600','Toledo'), ('ES','Ponferrada','24401','León');
  v_tiempos := v_tiempos || jsonb_build_object('preparacion_s', round(extract(epoch from clock_timestamp() - v_t0), 1));

  -- ---- 2. Clientes ------------------------------------------------------------------------
  v_t := clock_timestamp();
  create temp table _dp_cli on commit drop as
  with b as (select g n, random()::numeric r1, random()::numeric r2, random()::numeric r3, random()::numeric r4, random()::numeric r5, random()::numeric r6, random()::numeric r7 from generate_series(1, v_ncli) g)
  select n, gen_random_uuid() id,
         case when n <= 16 then (array['ES','ES','IE','DE','PL','DE','ES','FR','ES','ES','ES','ES','ES','BG','NL','CZ'])[n]
              when r1 < .88 then 'ES' when r1 < .92 then 'PT' when r1 < .95 then 'FR' when r1 < .965 then 'DE'
              when r1 < .98 then 'IT' when r1 < .987 then 'NL' when r1 < .993 then 'BE' when r1 < .997 then 'PL' else 'RO' end pais_iso,
         r2, r3, r4, r5, r6, r7,
         case when n % 37 = 0 then 'pendiente_verificacion' when n % 31 = 0 then 'suspendida' else 'activa' end::estado_cuenta estado,
         (n % 10 = 3) sin_credito,
         row_number() over (order by random()) rk
    from b;
  alter table _dp_cli add column razon text, add column comercial text, add column cif text, add column poblacion text, add column cpostal text,
    add column provincia text, add column w numeric, add column cum numeric, add column w_fut numeric, add column cum_fut numeric, add column cum_sc numeric,
    add column n_sitios int, add column tiene_op boolean, add column nuevo boolean;
  update _dp_cli c set
    razon = case
      when n = 1 then 'Compañía Peninsular de Distribución, Almacenaje, Manipulación y Transporte Frigorífico de Productos Hortofrutícolas, Cárnicos, Lácteos y Derivados de la Cuenca del Guadalquivir y Sierra Morena, Sociedad Cooperativa Andaluza de Segundo Grado'
      when n = 2 then 'Ñu & Cía., S.L.'
      when n = 3 then 'O''Connor Freight Solutions Ltd'
      when n = 4 then 'Groß & Weiß Lebensmittel GmbH'
      when n = 5 then 'Zakłady Mięsne Wiśniewski i Synowie Sp. z o.o.'
      when n = 6 then 'Çelik Gıda Import-Export GmbH'
      when n = 7 then 'L''Hospitalet Logística Integral, S.L.'
      when n = 8 then 'Société Agricole du Midi « Les Vergers » SARL'
      when n = 9 then '  Distribuciones Con Espacios Delante y Detrás, S.L.  '
      when n = 10 then 'TRANSPORTES Y SUMINISTROS GARCÍA E HIJOS SL'
      when n = 11 then 'almacenes lópez y núñez, s.l.'
      when n = 12 then 'Bodegas "El Tío Pepe" & Cía., S.A.'
      when n = 13 then 'Frutas 🍊 del Sur 🌞, S.L.'
      when n = 14 then 'Транс Логистик ЕООД'
      when n = 15 then '上海华夏贸易有限公司 (Shanghai Huaxia Trading B.V.)'
      when n = 16 then 'Dřevozpracující družstvo Žďár nad Sázavou'
      when pais_iso = 'ES' then v_sector[1 + floor(r2 * cardinality(v_sector))::int] || ' ' || v_core[1 + floor(r3 * cardinality(v_core))::int] || ', ' || v_forma[1 + floor(r4 * cardinality(v_forma))::int]
      when pais_iso = 'PT' then (array['Transformadora','Conservas','Cortiças','Têxteis','Vinhos','Cerâmicas'])[1 + floor(r2 * 6)::int] || ' ' || (v_ape -> 'PT' ->> floor(r3 * 12)::int) || ', Lda'
      when pais_iso = 'FR' then (array['Société','Établissements','Comptoir','Coopérative'])[1 + floor(r2 * 4)::int] || ' ' || (v_ape -> 'FR' ->> floor(r3 * 10)::int) || (array[' SARL',' SAS',' SA'])[1 + floor(r4 * 3)::int]
      when pais_iso = 'DE' then (v_ape -> 'DE' ->> floor(r3 * 10)::int) || (array[' Logistik GmbH',' & Söhne KG',' Handels GmbH',' Maschinenbau AG'])[1 + floor(r2 * 4)::int]
      when pais_iso = 'IT' then (array['Fratelli ','Industrie ','Ceramiche ','Pastificio '])[1 + floor(r2 * 4)::int] || (v_ape -> 'IT' ->> floor(r3 * 10)::int) || (array[' S.r.l.',' S.p.A.'])[1 + floor(r4 * 2)::int]
      when pais_iso = 'NL' then (v_ape -> 'NL' ->> floor(r3 * 8)::int) || ' Trading B.V.'
      when pais_iso = 'BE' then 'Brouwerij ' || (v_ape -> 'BE' ->> floor(r3 * 8)::int) || ' NV'
      when pais_iso = 'PL' then 'Przedsiębiorstwo ' || (v_ape -> 'PL' ->> floor(r3 * 12)::int) || ' Sp. z o.o.'
      else (v_ape -> 'RO' ->> floor(r3 * 12)::int) || ' Distribuție SRL' end,
    comercial = case when r5 < .25 then v_sector[1 + floor(r6 * cardinality(v_sector))::int] || ' ' || initcap(substr(md5(n::text), 1, 5)) end,
    cif = prueba_id_fiscal(pais_iso, n % 23 = 5 and pais_iso = 'ES', 700000 + n),
    nuevo = (n % 53 = 7);
  -- Ubicación: una sede del país.
  update _dp_cli c set poblacion = s.nombre, cpostal = s.cpostal, provincia = s.provincia
    from (select c2.n, (select s from _dp_sede s where s.pais_iso = c2.pais_iso order by random() + c2.n * 0 limit 1) s from _dp_cli c2) x
         cross join lateral (select (x.s).nombre, (x.s).cpostal, (x.s).provincia) s(nombre, cpostal, provincia)
   where x.n = c.n;
  -- Peso de cada cliente en los envíos: unos pocos con miles, muchos con pocos, algunos sin ninguno.
  update _dp_cli set w = case when estado = 'pendiente_verificacion' or nuevo or n % 11 = 0 then 0 else 1 / power(rk, 0.85) end;
  update _dp_cli set w_fut = case when estado = 'activa' then w else 0 end;
  update _dp_cli c set cum = x.cum, cum_fut = x.cumf, cum_sc = x.cums
    from (select n, sum(w) over (order by n) / nullif(sum(w) over (), 0) cum,
                 sum(w_fut) over (order by n) / nullif(sum(w_fut) over (), 0) cumf,
                 sum(case when sin_credito then w_fut else 0 end) over (order by n) / nullif(sum(case when sin_credito then w_fut else 0 end) over (), 0) cums
            from _dp_cli) x where x.n = c.n;
  update _dp_cli set n_sitios = case when estado = 'pendiente_verificacion' then 0 when r7 < .12 then 0
                                     else 1 + floor(power(r6, 3) * 8)::int + case when rk <= greatest(3, v_ncli / 100) then floor(r5 * 40)::int else 0 end end,
                     tiene_op = (n % 25 = 4 and w > 0);
  create unique index on _dp_cli (n); create index on _dp_cli (id);
  analyze _dp_cli;

  insert into clientes (id, razon_social, nombre_comercial, cif, direccion, poblacion, codigo_postal, provincia, pais_codigo_iso,
                        plazo_pago_dias, riesgo_cesce_euros, riesgo_cesce_plazo_dias, riesgo_manual_euros, exento_pago_previo_primer_envio,
                        permite_contraoferta, discrecion_comercial, requiere_pin, estado, verificado, verificado_en, verificado_nota,
                        tipo_camion_defecto, forma_carga_defecto, requiere_plataforma_elevadora_defecto, recargo_equivalencia_pct,
                        tags, anotaciones, creado_en, sector)
  select id, razon, comercial, cif,
         v_calle[1 + floor(r2 * cardinality(v_calle))::int] || ' ' || (1 + floor(r3 * 120))::int,
         poblacion, cpostal, provincia, pais_iso,
         (array[0, 30, 60, 60, 90, 120, 120, 120])[1 + floor(r4 * 8)::int],
         case when sin_credito then case when r5 < .5 then null else 0 end
              else round((3000 + power(r5, 2) * 400000) / 500) * 500 end,
         case when not sin_credito then (array[30, 60, 90, 120])[1 + floor(r6 * 4)::int] end,
         case when not sin_credito and r7 < .05 then 1000000 end,
         not nuevo,
         r3 < .3, r4 < .05, n % 41 = 9, estado, estado = 'activa' and r6 < .8,
         case when estado = 'activa' and r6 < .8 then now() - make_interval(days => 400 + floor(r7 * 1500)::int) end,
         case when estado = 'activa' and r6 < .8 then 'Verificado en el Registro Mercantil y por CESCE.' end,
         case when r2 < .15 then 'rigido_plataforma' when r2 < .6 then 'trailer_tauliner' end::tipo_camion,
         case when r3 < .7 then 'paletizada_lateral' when r3 < .85 then 'no_paletizada_lateral' end::forma_carga,
         r4 < .04, case when n % 97 = 13 then 5.2 else 0 end,
         array['dato_de_prueba'] || case when rk <= 10 then array['grande'] else array[]::text[] end, v_marca,
         now() - make_interval(days => 30 + floor((1 - power(r6, 2)) * 2600)::int),
         -- Sector de la lista de Parámetros; ~30 % sin definir.
         case when r7 >= .3 and cardinality(v_sectores) > 0 then v_sectores[1 + floor(r2 * cardinality(v_sectores))::int] end
    from _dp_cli;
  analyze clientes;
  v_tiempos := v_tiempos || jsonb_build_object('clientes_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 3. Transportistas, su flota y sus conductores ----------------------------------------
  v_t := clock_timestamp();
  create temp table _dp_tra on commit drop as
  with b as (select g n, random()::numeric r1, random()::numeric r2, random()::numeric r3, random()::numeric r4, random()::numeric r5, random()::numeric r6, random()::numeric r7, random()::numeric r8 from generate_series(1, v_ntra) g)
  select n, gen_random_uuid() id,
         case when n in (4, 6, 7, 8) then (array['PL', null, 'BG', 'IE', 'DE'])[n - 3] when n = 5 then 'ES' when r1 < .72 then 'ES' when r1 < .80 then 'PT' when r1 < .85 then 'RO' when r1 < .90 then 'PL' when r1 < .93 then 'FR'
              when r1 < .95 then 'BG' when r1 < .965 then 'LT' when r1 < .975 then 'DE' when r1 < .985 then 'IT' when r1 < .99 then 'NL'
              when r1 < .995 then 'BE' else 'CZ' end pais_iso,
         r2, r3, r4, r5, r6, r7, r8
    from b;
  alter table _dp_tra add column autonomo boolean, add column persona_nombre text, add column persona_pais text, add column razon text, add column cif text,
    add column m int, add column n_rem int, add column n_con int, add column w numeric, add column cum numeric, add column cum_act numeric,
    add column estado_op estado_operativo_transportista, add column poblacion text, add column cpostal text, add column provincia text;
  update _dp_tra set autonomo = n > 8 and r2 < case pais_iso when 'ES' then .45 when 'PT' then .3 else .08 end,
                     persona_pais = case when pais_iso = 'ES' and r8 < .06 then (array['MA','RO','PT','TR'])[1 + floor(r7 * 4)::int] else pais_iso end;
  update _dp_tra set persona_nombre =
           coalesce(v_nom -> persona_pais ->> floor(r3 * jsonb_array_length(v_nom -> persona_pais))::int, 'José') || ' '
           || coalesce(v_ape -> persona_pais ->> floor(r4 * jsonb_array_length(v_ape -> persona_pais))::int, 'García')
           || case when persona_pais = 'ES' then ' ' || (v_ape -> 'ES' ->> floor(r5 * jsonb_array_length(v_ape -> 'ES'))::int) else '' end;
  update _dp_tra set razon = case
      when n = 1 then 'Transportes Internacionales Hermanos Ruiz-Peñalver de Logística Integral por Carretera, Almacenaje, Distribución Capilar y Grupaje Nacional e Internacional, Sociedad Limitada'
      when n = 2 then 'Transporton SL'
      when n = 3 then 'Logística Navarra SA'
      when n = 4 then 'TRANS-EUROPA ŁÓDŹ SP. Z O.O.'
      when n = 5 then 'TRANSPORTES Y SUMINISTROS GARCÍA E HIJOS SL'
      when n = 6 then 'Трансавто ЕООД'
      when n = 7 then 'O''Brien Haulage Ltd'
      when n = 8 then 'Spedition Groß & Söhne GmbH'
      when autonomo then persona_nombre
      when pais_iso = 'ES' then (array['Transportes ','Transportes Hermanos ','Trans ','Autotransportes ','Transportes y Excavaciones ','Logística ','Camiones '])[1 + floor(r5 * 7)::int]
                            || case when r6 < .6 then (v_ape -> 'ES' ->> floor(r4 * jsonb_array_length(v_ape -> 'ES'))::int) else v_core[1 + floor(r6 * cardinality(v_core))::int] end
                            || (array[' SL',', S.L.',' SA',' SLU',' S.Coop.'])[1 + floor(r7 * 5)::int]
      when pais_iso = 'PT' then 'Transportes ' || (v_ape -> 'PT' ->> floor(r4 * 12)::int) || ' & Filhos, Lda'
      when pais_iso = 'RO' then (v_ape -> 'RO' ->> floor(r4 * 12)::int) || (array[' Trans SRL',' Logistic SRL',' Expres Transport SRL'])[1 + floor(r5 * 3)::int]
      when pais_iso = 'PL' then (array['Trans Europa','Trans-Pol','Spedycja','Auto-Trans'])[1 + floor(r5 * 4)::int] || ' ' || (v_ape -> 'PL' ->> floor(r4 * 12)::int) || ' Sp. z o.o.'
      when pais_iso = 'FR' then 'Transports ' || (v_ape -> 'FR' ->> floor(r4 * 10)::int) || (array[' SARL',' SAS'])[1 + floor(r5 * 2)::int]
      when pais_iso = 'BG' then (v_ape -> 'BG' ->> floor(r4 * 6)::int) || ' Trans EOOD'
      when pais_iso = 'LT' then 'UAB „' || (v_ape -> 'LT' ->> floor(r4 * 6)::int) || ' transportas“'
      when pais_iso = 'DE' then 'Spedition ' || (v_ape -> 'DE' ->> floor(r4 * 10)::int) || ' GmbH & Co. KG'
      when pais_iso = 'IT' then 'Autotrasporti ' || (v_ape -> 'IT' ->> floor(r4 * 10)::int) || ' S.r.l.'
      when pais_iso = 'NL' then (v_ape -> 'NL' ->> floor(r4 * 8)::int) || ' Transport B.V.'
      when pais_iso = 'BE' then 'Transport ' || (v_ape -> 'BE' ->> floor(r4 * 8)::int) || ' BVBA'
      else 'Autodoprava ' || (v_ape -> 'CZ' ->> floor(r4 * 6)::int) || ' s.r.o.' end,
    cif = case when autonomo and pais_iso = 'ES' then prueba_id_fiscal('ES', true, 3000000 + n)
               when autonomo and pais_iso = 'PT' then 'PT' || prueba_id_fiscal('PT', true, 3000000 + n)
               else prueba_id_fiscal(pais_iso, false, 1900000 + n) end,
    estado_op = case when n <= 3 then 'activo' when r8 < .025 then 'suspendido' when r8 < .06 then 'no_ofertar' else 'activo' end::estado_operativo_transportista,
    -- Vehículos con motor: autónomos 1; empresas, de ninguno a cientos (los tres primeros, gigantes).
    m = case when n <= 3 then greatest(4, round((array[310, 140, 60])[n] * greatest(k, 0.02)))::int
             when autonomo then case when r6 < .05 then 0 else 1 end
             when r6 < .45 then 0 when r6 < .88 then 1 when r6 < .97 then 2 + floor(r7 * 2)::int
             when r6 < .995 then 4 + floor(r7 * 9)::int else 13 + floor(r7 * 48)::int end;
  update _dp_tra set n_rem = case when autonomo then case when m > 0 and r5 < .62 then 1 else 0 end else round(m * (0.3 + r5 * 0.6))::int end,
                     n_con = case when autonomo then case when m = 0 then 1 when r7 < .08 then 2 else 1 end
                                  when m = 0 then case when r5 < .4 then 1 + floor(r7 * 3)::int else 0 end
                                  else round(m * (1.2 + r8 * 1.2))::int end,
                     w = case when estado_op = 'activo' then m else m * 0.3 end;
  update _dp_tra t set cum = x.cum, cum_act = x.cuma
    from (select n, sum(w) over (order by n) / sum(w) over () cum,
                 sum(case when estado_op = 'activo' then w else 0 end) over (order by n) / sum(case when estado_op = 'activo' then w else 0 end) over () cuma
            from _dp_tra) x where x.n = t.n;
  update _dp_tra t set poblacion = s.nombre, cpostal = s.cpostal, provincia = s.provincia
    from (select t2.n, (select s from _dp_sede s where s.pais_iso = t2.pais_iso order by random() + t2.n * 0 limit 1) s from _dp_tra t2) x
         cross join lateral (select (x.s).nombre, (x.s).cpostal, (x.s).provincia) s(nombre, cpostal, provincia)
   where x.n = t.n;
  create unique index on _dp_tra (n); create index on _dp_tra (id);
  analyze _dp_tra;

  insert into transportistas (id, razon_social, nombre_comercial, cif, direccion, poblacion, codigo_postal, provincia, pais_codigo_iso, iva_pct, retencion_pct,
                              plazo_pago_dias, nima, bolsa, codigo_bolsa, tiene_almacen, estado_operativo, pronto_pago, tags, anotaciones, creado_en)
  select id, razon, case when n = 2 then 'TRANSPORTON' when not autonomo and r8 < .1 then upper(split_part(razon, ' ', 2)) end, cif,
         v_calle[1 + floor(r3 * cardinality(v_calle))::int] || ' ' || (1 + floor(r4 * 90))::int, poblacion, cpostal, provincia, pais_iso,
         case when pais_iso = 'ES' then 21 else 0 end, case when autonomo and pais_iso = 'ES' and r5 < .5 then 1 else 0 end,
         (array[0, 30, 60, 60, 60, 90])[1 + floor(r7 * 6)::int],
         case when r2 < .12 and pais_iso = 'ES' then 'NIMA' || lpad((n * 37 % 10000000000)::text, 10, '0') end,
         case when r3 < .3 then (array['wtransnet','teleroute','bursa_transport','123cargo'])[1 + floor(r4 * 4)::int] end,
         case when r3 < .25 then (100000 + n * 7)::text end,
         not autonomo and r6 < .08,
         estado_op, r7 < .7,
         array['dato_de_prueba'], v_marca,
         now() - make_interval(days => 20 + floor(r8 * 2500)::int)
    from _dp_tra;

  -- Vehículos: tractoras, rígidos (algunos con plataforma elevadora) y remolques; algunos ADR.
  create temp table _dp_veh on commit drop as
  select row_number() over () vn, t.n tra_n, t.id tra_id, t.pais_iso, x.tipo, gen_random_uuid() id, random()::numeric r1, random()::numeric r2, random()::numeric r3
    from _dp_tra t
    cross join lateral (
      select case when t.autonomo then case when t.n_rem > 0 then 'tractora' else 'rigido' end
                  when random() + g * 0 < .22 then 'rigido' else 'tractora' end tipo
        from generate_series(1, t.m) g
      union all select 'remolque' from generate_series(1, t.n_rem) g) x;
  alter table _dp_veh add column matricula text, add column plataforma boolean, add column activo boolean;
  update _dp_veh set matricula = prueba_matricula(pais_iso, tipo = 'remolque', 104729 + vn * 7919),
                     plataforma = tipo = 'rigido' and r1 < .45, activo = r2 >= .03;
  -- Matrículas repetidas (entre países o con las que ya hay): fuera.
  delete from _dp_veh v using (select vn, row_number() over (partition by normalizar_matricula(matricula) order by vn) rn from _dp_veh) d
   where d.vn = v.vn and d.rn > 1;
  delete from _dp_veh v where exists (select 1 from vehiculos x where x.activo and normalizar_matricula(x.matricula) = normalizar_matricula(v.matricula));
  insert into vehiculos (id, transportista_id, matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, tiene_plataforma_elevadora, activo, creado_en)
  select id, tra_id, matricula, tipo::tipo_vehiculo,
         case when r3 < .9 then v_hoy + (floor(r1 * 420) - 40)::int end,
         case when r3 < .8 then v_hoy + (floor(r2 * 380) - 20)::int end,
         case when r3 < .6 and tipo <> 'remolque' then v_hoy + (floor(r3 * 900) - 30)::int end,
         r3 < .07, plataforma, activo, now() - make_interval(days => floor(r2 * 1800)::int)
    from _dp_veh;
  -- Un camión dado de baja con la misma matrícula que uno activo (lo cambió de empresa).
  insert into vehiculos (transportista_id, matricula, tipo, activo, creado_en)
  select (select id from _dp_tra where n = 4), v.matricula, 'tractora', false, now() - interval '900 days'
    from _dp_veh v where v.tipo = 'tractora' and v.activo order by v.vn limit 1;

  -- Conductores: el propio autónomo o la plantilla de la empresa.
  create temp table _dp_con on commit drop as
  select row_number() over () cn, t.n tra_n, t.id tra_id, t.pais_iso, t.autonomo, g, gen_random_uuid() id, random()::numeric r1, random()::numeric r2, random()::numeric r3, random()::numeric r4,
         case when t.autonomo and g = 1 then t.persona_pais
              when t.pais_iso = 'ES' and random() + g * 0 < .12 then (array['MA','RO','PT','TR','ES'])[1 + floor(random() * 5)::int]
              else t.pais_iso end ppais,
         case when t.autonomo and g = 1 then t.persona_nombre end nombre0, case when t.autonomo and g = 1 then t.cif end doc0
    from _dp_tra t cross join lateral generate_series(1, t.n_con) g;
  alter table _dp_con add column nombre text, add column documento text, add column telefono text;
  update _dp_con set
    nombre = coalesce(nombre0, coalesce(v_nom -> ppais ->> floor(r1 * jsonb_array_length(v_nom -> ppais))::int, 'José') || ' '
                      || coalesce(v_ape -> ppais ->> floor(r2 * jsonb_array_length(v_ape -> ppais))::int, 'López')
                      || case when ppais = 'ES' then ' ' || (v_ape -> 'ES' ->> floor(r3 * jsonb_array_length(v_ape -> 'ES'))::int) else '' end),
    documento = case when doc0 is not null then regexp_replace(doc0, '^PT', '')
                     when r4 < .03 then null
                     when ppais in ('MA', 'TR') then prueba_id_fiscal('ES', true, 7 * (5000000 + cn))     -- NIE
                     else prueba_id_fiscal(ppais, true, 5000000 + cn) end,
    telefono = case when r4 < .06 then null else prueba_telefono(case when ppais in ('MA','TR') then 'ES' else ppais end, 900000 + cn * 3) end;
  delete from _dp_con c using (select cn, row_number() over (partition by normalizar_id_fiscal(documento) order by cn) rn from _dp_con where documento is not null) d
   where d.cn = c.cn and d.rn > 1;
  delete from _dp_con c where documento is not null and exists (select 1 from conductores x where x.activo and normalizar_id_fiscal(x.documento) = normalizar_id_fiscal(c.documento));
  -- Nombres en otros alfabetos y el mismo nombre en empresas distintas (son personas distintas).
  update _dp_con set nombre = 'Иван Петров Георгиев' where cn % 997 = 3 and nombre0 is null;
  update _dp_con set nombre = '王伟 (Wang Wei)' where cn % 997 = 5 and nombre0 is null;
  update _dp_con set nombre = 'José García López' where cn % 500 = 7 and nombre0 is null;
  insert into conductores (id, transportista_id, nombre, documento, documento_pais, telefono, activo, idioma, creado_en)
  select id, tra_id, nombre, documento, case when documento is null then null else case when ppais in ('MA','TR') then 'ES' else ppais end end,
         telefono, r1 >= .02,
         case ppais when 'ES' then 'es' when 'PT' then 'pt' when 'FR' then 'fr' when 'DE' then 'de' when 'IT' then 'it' when 'PL' then 'pl'
                    when 'RO' then 'ro' when 'BG' then 'bg' when 'LT' then 'lt' when 'NL' then 'nl' when 'BE' then 'nl' when 'CZ' then 'cs'
                    when 'MA' then 'ar' when 'TR' then 'tr' else 'es' end,
         now() - make_interval(days => floor(r2 * 1500)::int)
    from _dp_con;
  create index on _dp_veh (tra_n, tipo); create index on _dp_con (tra_n);
  alter table _dp_veh add column om int, add column orr int, add column opl int;
  update _dp_veh v set om = x.om, orr = x.orr, opl = x.opl from (
    select vn, case when activo and tipo <> 'remolque' then row_number() over (partition by tra_n, activo and tipo <> 'remolque' order by vn) end om,
               case when activo and tipo = 'remolque' then row_number() over (partition by tra_n, activo and tipo = 'remolque' order by vn) end orr,
               case when activo and tipo = 'rigido' and plataforma then row_number() over (partition by tra_n, activo and tipo = 'rigido' and plataforma order by vn) end opl
      from _dp_veh) x where x.vn = v.vn;
  alter table _dp_con add column oc int;
  update _dp_con c set oc = x.oc from (select cn, row_number() over (partition by tra_n order by cn) oc from _dp_con where r1 >= .02) x where x.cn = c.cn;
  alter table _dp_tra add column n_mot int, add column n_remv int, add column n_pla int, add column n_cact int;
  update _dp_tra set n_mot = 0, n_remv = 0, n_pla = 0, n_cact = 0;
  update _dp_tra t set n_mot = coalesce(x.a, 0), n_remv = coalesce(x.b, 0), n_pla = coalesce(x.c, 0)
    from (select tra_n, max(om) a, max(orr) b, max(opl) c from _dp_veh group by tra_n) x where x.tra_n = t.n;
  update _dp_tra t set n_cact = x.a from (select tra_n, max(oc) a from _dp_con group by tra_n) x where x.tra_n = t.n and x.a is not null;
  create index on _dp_veh (tra_n, om); create index on _dp_veh (tra_n, orr); create index on _dp_veh (tra_n, opl); create index on _dp_con (tra_n, oc);
  analyze _dp_veh; analyze _dp_con;
  analyze transportistas; analyze vehiculos; analyze conductores;
  v_tiempos := v_tiempos || jsonb_build_object('transportistas_flota_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 4. Sitios de los clientes y almacenes de Dynamo de prueba --------------------------
  v_t := clock_timestamp();
  create temp table _dp_sit on commit drop as
  select row_number() over () sn, c.n cli_n, c.id cli_id, gen_random_uuid() id, g, random()::numeric r1, random()::numeric r2, random()::numeric r3, random()::numeric r4,
         case when c.pais_iso = 'ES' then case when g = 1 then coalesce((select i from _dp_ciu u where u.nombre = c.poblacion), v_es[1 + floor(random() * cardinality(v_es))::int])
                                           else v_es[1 + floor(random() * cardinality(v_es))::int] end
              else coalesce((select i from _dp_ciu u where u.nombre = c.poblacion and u.pais_iso = c.pais_iso),
                            (select i from _dp_ciu u where u.pais_iso = c.pais_iso order by random() + g * 0 limit 1),
                            v_es[1 + floor(random() * cardinality(v_es))::int]) end ciu
    from _dp_cli c cross join lateral generate_series(1, c.n_sitios) g;
  create index on _dp_sit (cli_n); analyze _dp_sit;
  for v_lote in 0..4 loop
    insert into sitios (id, nombre_empresa, cif, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon, url_google_maps,
                        anotaciones, cliente_id, requiere_pin, requiere_cita, tiene_medios_carga, emails_avisos, verano_activo, verano_desde, verano_hasta, creado_en)
    select s.id,
           case when s.g = 1 then c.razon else (array['Almacén ','Nave ','Centro logístico ','Obra ','Finca ','Planta '])[1 + floor(s.r1 * 6)::int] || u.nombre
                || case when s.r2 < .3 then ' ' || s.g else '' end end,
           case when s.r3 < .3 then c.cif end,
           case when s.g = 1 or s.r1 < .7 then 'almacen_nave' when s.r1 < .8 then 'obra_zona_amplia' when s.r1 < .9 then 'obra_zona_urbana' else 'finca' end::tipo_sitio,
           v_calle[1 + floor(s.r2 * cardinality(v_calle))::int] || ' ' || (1 + floor(s.r3 * 150))::int,
           u.cpostal, u.nombre, u.provincia, u.pais_iso,
           round(u.lat + (s.r1 - .5) * .12, 6), round(u.lon + (s.r2 - .5) * .12, 6),
           case when s.r4 < .3 then 'https://maps.google.com/?q=' || round(u.lat, 4) || ',' || round(u.lon, 4) end,
           concat_ws(' · ', case when s.r3 < .15 then 'Muelle ' || (1 + floor(s.r4 * 12))::int || '. Avisar a portería al llegar.' when s.r3 < .17 then 'Acceso por camino de tierra: sin lluvias.' end, v_marca),
           c.id, s.r4 < .03, s.r4 > .9, s.r1 > .05,
           case when s.r2 < .1 then array['almacen.' || s.sn || '@prueba.invalid'] else '{}'::text[] end,
           s.r3 < .05, case when s.r3 < .05 then '06-15' end, case when s.r3 < .05 then '09-15' end,
           now() - make_interval(days => floor(s.r1 * 1800)::int)
      from _dp_sit s join _dp_cli c on c.n = s.cli_n join _dp_ciu u on u.i = s.ciu
     where case when v_lote = 0 then s.sn % 50 = 1 else s.sn % 50 <> 1 and s.sn % 4 = v_lote - 1 end;
    analyze sitios; analyze sitio_horarios;
  end loop;
  update clientes c set sitio_principal_id = s.id from _dp_sit s where s.cli_id = c.id and s.g = 1;
  insert into sitios (nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon, es_almacen_dynamo, disponible,
                      precio_almacenamiento_semana, precio_reparto, anotaciones)
  values ('Dynamo Almacén Sevilla (prueba)', 'almacen_nave', 'Polígono Industrial La Isla, calle Río Viejo 12', '41703', 'Dos Hermanas', 'Sevilla', 'ES', 37.2950, -5.9400, true, true, 240, 220, v_marca),
         ('Dynamo Almacén Madrid (prueba)', 'almacen_nave', 'Avenida de la Industria 40, nave 7', '28821', 'Coslada', 'Madrid', 'ES', 40.4238, -3.5613, true, true, 260, 230, v_marca),
         ('Dynamo Almacén Barcelona (prueba)', 'almacen_nave', 'Zona Franca, calle 4, nave 22', '08040', 'Barcelona', 'Barcelona', 'ES', 41.3400, 2.1300, true, true, 280, 240, v_marca);
  analyze sitios; analyze sitio_horarios;
  v_tiempos := v_tiempos || jsonb_build_object('sitios_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 5. Contactos y transportistas propios de los clientes (operadores) -----------------
  v_t := clock_timestamp();
  insert into contactos (cliente_id, nombre, funcion, telefono, email, es_principal, recibe_avisos, idioma, cargo)
  select c.id, x.nombre, x.funcion::funcion_contacto, case when x.funcion <> 'contabilidad' or c.r5 < .5 then prueba_telefono(c.pais_iso, 100000 + c.n * 4 + x.o) end,
         prueba_email(x.nombre, c.n * 4 + x.o), true, x.funcion = 'trafico', case c.pais_iso when 'ES' then 'es' when 'PT' then 'pt' when 'FR' then 'fr' when 'DE' then 'de' when 'IT' then 'it' else 'en' end,
         case x.funcion when 'trafico' then 'Jefe de tráfico' when 'contabilidad' then 'Administración' else 'Gerente' end
    from _dp_cli c cross join lateral (
      select o, f funcion,
             coalesce(v_nom -> (case when c.pais_iso in ('ES','PT','FR','DE','IT','PL','RO','NL','BE') then c.pais_iso else 'ES' end) ->> floor(random() * 6 + o * 0)::int, 'Ana') || ' '
             || coalesce(v_ape -> (case when c.pais_iso in ('ES','PT','FR','DE','IT','PL','RO','NL','BE') then c.pais_iso else 'ES' end) ->> floor(random() * 6)::int, 'Ruiz') nombre
        from unnest(array['trafico','contabilidad','general']) with ordinality u(f, o)
       where o = 1 or (o = 2 and c.r6 < .8) or (o = 3 and c.r7 < .3)) x
   where c.n % 19 <> 0;   -- algunos clientes sin ningún contacto
  insert into contactos (transportista_id, nombre, funcion, telefono, email, es_principal, recibe_avisos, idioma, cargo)
  select t.id, case when t.autonomo then t.persona_nombre else (v_nom -> 'ES' ->> floor(random() * 50 + t.n * 0)::int) || ' ' || (v_ape -> 'ES' ->> floor(random() * 60)::int) end,
         'trafico', prueba_telefono(t.pais_iso, 400000 + t.n), case when t.r2 < .9 then prueba_email(split_part(t.razon, ' ', 1) || ' trafico', t.n) end,
         true, t.r3 < .5, case t.pais_iso when 'ES' then 'es' when 'PT' then 'pt' when 'RO' then 'ro' when 'PL' then 'pl' when 'FR' then 'fr' else 'en' end,
         case when t.autonomo then 'Titular' else 'Tráfico' end
    from _dp_tra t;
  insert into contactos (sitio_id, nombre, funcion, telefono, email, es_principal, idioma, cargo)
  select s.id, (v_nom -> 'ES' ->> floor(s.r1 * 50)::int) || ' ' || (v_ape -> 'ES' ->> floor(s.r2 * 60)::int), 'general', prueba_telefono('ES', 600000 + s.sn),
         case when s.r3 < .5 then prueba_email('muelle', s.sn) end, true, 'es', 'Encargado de almacén'
    from _dp_sit s where s.r4 < .2;
  insert into operadores (cliente_id, razon_social, cif, telefono, email, persona_contacto)
  select c.id, 'Transportes ' || (v_ape -> 'ES' ->> floor(random() * 60 + g * 0)::int) || ' (propio de ' || split_part(c.razon, ' ', 1) || '), S.L.',
         prueba_id_fiscal('ES', false, 2500000 + c.n * 3 + g), prueba_telefono('ES', 700000 + c.n * 3 + g), prueba_email('operador', c.n * 3 + g),
         (v_nom -> 'ES' ->> floor(random() * 50)::int) || ' ' || (v_ape -> 'ES' ->> floor(random() * 60)::int)
    from _dp_cli c cross join lateral generate_series(1, 1 + (c.n % 3)) g where c.tiene_op;
  v_tiempos := v_tiempos || jsonb_build_object('contactos_operadores_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 6. Envíos: 7 años de histórico con estacionalidad + los próximos 2 meses -------------
  v_t := clock_timestamp();
  -- Peso de cada día: sin domingos, sábados flojos, pico en verano, bajón en agosto y Navidad,
  -- festivos nacionales casi vacíos y un poco más cada año.
  create temp table _dp_dia on commit drop as
  select d::date dia,
         (case extract(isodow from d) when 7 then 0 when 6 then .002 when 5 then .9 else 1 end)
         * (array[.85, .95, 1.05, 1.0, 1.1, 1.2, 1.25, .7, 1.1, 1.1, 1.0, .85])[extract(month from d)::int]
         * case when extract(month from d) = 8 and extract(day from d) between 8 and 24 then .6 else 1 end
         * case when (extract(month from d) = 12 and extract(day from d) >= 24) or (extract(month from d) = 1 and extract(day from d) <= 6) then .35 else 1 end
         * case when extract(isodow from d) < 6 and not es_dia_habil(d::date) then .01 else 1 end
         * (1 + 0.07 * extract(epoch from d - (v_hoy - interval '7 years')) / 31557600) w
    from generate_series(v_hoy - interval '7 years', v_hoy - interval '1 day', interval '1 day') d;
  select sum(w) into v_tot from _dp_dia;
  v_kf := v_nhist / v_tot;

  create temp table _dp_env (
    n bigserial primary key, id uuid default gen_random_uuid(), fase text, dia date, clase text, sub text,
    r1 numeric default random()::numeric, r2 numeric default random()::numeric, r3 numeric default random()::numeric, r4 numeric default random()::numeric,
    r5 numeric default random()::numeric, r6 numeric default random()::numeric, r7 numeric default random()::numeric, r8 numeric default random()::numeric,
    cli_n int, cliente_id uuid, sin_credito boolean, op_id uuid, tra_n int, transportista_id uuid,
    cam_tipo text, cam_mat text, rem_mat text, cond_nombre text, cond_tel text, cam_k int, cam_pla boolean, rem_k int, con_k int,
    np int, patron text, modo text, ndias int, hasta date, real date, ml numeric, tn numeric, forma text, plataforma boolean,
    km numeric, imp_c numeric, imp_t numeric, transito int,
    t_creado timestamptz, t_confirmado timestamptz, t_oferta timestamptz, t_asignado timestamptz, t_hacia timestamptz, t_cargando timestamptz,
    t_cargado timestamptz, t_entregado timestamptz, t_cancelado timestamptz, entrega_est date,
    estado text, est_asig text, est_pago text, est_sol text, est_rev text, prevista date, pa int, seg boolean default true,
    patron0 text, pt int, ancla_p int, ancla_h timestamptz) on commit drop;

  -- Histórico.
  insert into _dp_env (fase, dia)
  select 'hist', d.dia from _dp_dia d cross join lateral generate_series(1, floor(d.w * v_kf + random())::int) g;
  -- Hoy y los próximos 60 días (cada vez menos cuanto más lejos).
  insert into _dp_env (fase, dia)
  select 'fut', d::date from generate_series(v_hoy, v_hoy + 60, interval '1 day') d
   cross join lateral generate_series(1, greatest(case when (d::date - v_hoy) <= 1 then 2 else 0 end,
       floor(case extract(isodow from d) when 7 then .01 when 6 then .02 else 1 end * 60 * k * exp(-(d::date - v_hoy) / 14.0) + random())::int)) g;
  -- Solicitudes de precio (borradores) de los últimos días.
  insert into _dp_env (fase, dia) select 'sol', v_hoy + 1 + floor(random() * 25)::int + g * 0 from generate_series(1, greatest(10, round(160 * k))::int) g;
  -- Casos límite, a propósito.
  insert into _dp_env (fase, dia, clase) values
    ('esp', v_hoy + 3, 'multi'), ('esp', v_hoy + 2, 'corto'), ('esp', v_hoy + 4, 'largo'), ('esp', v_hoy + 5, 'minimo'), ('esp', v_hoy + 5, 'maximo'),
    ('esp', v_hoy + 6, 'baleares'), ('esp', v_hoy + 8, 'irlanda'), ('esp', v_hoy + 4, 'suiza'),
    ('esp', v_hoy, 'hoy'), ('esp', v_hoy + 1, 'manana'),
    ('esp', v_hoy + (6 - extract(isodow from v_hoy)::int + 7) % 7 + case when extract(isodow from v_hoy) = 6 then 7 else 0 end, 'sabado'),
    ('esp', v_hoy + (7 - extract(isodow from v_hoy)::int) + case when extract(isodow from v_hoy) = 7 then 7 else 0 end, 'domingo'),
    ('esp', coalesce((select g::date from generate_series(v_hoy + 1, v_hoy + 60, interval '1 day') g
                       where extract(isodow from g) < 6 and not es_dia_habil(g::date) order by g limit 1), v_hoy + 9), 'festivo'),
    ('esp', v_hoy - 32, 'atascado'), ('esp', v_hoy - 29, 'atascado'), ('esp', v_hoy - 3, 'retrasado'), ('esp', v_hoy - 2, 'retrasado'),
    ('esp', v_hoy - 1, 'hacia_ayer'),
    ('esp', v_hoy + 120, 'lejana'), ('esp', make_date(extract(year from v_hoy)::int, 12, 30), 'fin_anio'), ('esp', v_hoy + 3, 'ventana_larga'),
    ('esp', date '2024-02-29', 'bisiesto'), ('esp', date '2025-10-24', 'cambio_hora'), ('esp', date '2026-03-27', 'cambio_hora'),
    ('esp', date '2025-12-30', 'fin_anio_hist'), ('esp', date '2024-12-27', 'fin_anio_hist');
  -- Matriz «en marcha»: cada combinación de recogidas (C) y entregas (D) que admite la plataforma
  -- (2 a 4 paradas; crear_envio no deja más de 4) en cada etapa: yendo a la carga, en cada parada
  -- (cargando o descargando) y en ruta hacia cada parada. 3 de cada (una, con el automático en pausa).
  insert into _dp_env (fase, dia, clase, patron0, sub, pt)
  select 'marcha', v_hoy, 'marcha', pa.pat, st.sub, st.pt
    from unnest(array['CD','CCD','CDD','CCCD','CCDD','CDCD','CDDD']) pa(pat)
   cross join lateral (select 'h' sub, 1 pt union all select 'c', g from generate_series(1, length(pa.pat)) g
                       union all select 'r', g from generate_series(2, length(pa.pat)) g) st
   cross join generate_series(1, 3) rep;

  -- Clase de cada envío.
  update _dp_env set clase = case
      when r1 < .040 then (array['cancel_borr','cancel_sin','cancel_con','cancel_con'])[1 + floor(r2 * 4)::int]
      when r1 < .046 then 'borrador' when r1 < .049 then 'rechazada'
      else 'entregado' end where fase = 'hist';
  update _dp_env set clase = case
      when dia = v_hoy then case when r1 < .25 then 'hacia' when r1 < .40 then 'cargando' when r1 < .70 then 'en_ruta' when r1 < .78 then 'entregado' when r1 < .93 then 'prog_con' else 'sin_asig' end
      when r1 < .04 then case when r2 < .5 then 'cancel_con' else 'cancel_sin' end
      when r1 < .10 then 'pago_pend'
      when r1 < .13 then 'pagado'
      when r1 < .16 then 'borrador'
      when dia - v_hoy <= 7 then case when r2 < .62 then 'prog_con' when r2 < .94 then 'sin_asig' when r2 < .97 then 'rev_esp' else 'rev_revisar' end
      else case when r2 < .3 then 'prog_con' else 'prog_sin' end end where fase = 'fut';
  update _dp_env set clase = case when r1 < .4 then 'pendiente_precio' when r1 < .72 then 'precio_propuesto' when r1 < .9 then 'contraoferta' else 'rechazada' end
   where fase = 'sol';
  update _dp_env set sub = case when r3 < .5 then 'sin_asignar' when r3 < .85 then 'ofertada' else 'reservada' end where clase = 'sin_asig';
  analyze _dp_env;

  -- Cliente: por peso (los «sin pago» de entre los que no tienen crédito).
  -- Sorteo por peso con listas (cada cliente aparece tantas veces como pesa).
  select sum(w) into v_tot from _dp_cli;
  v_ac := array(select n from _dp_cli, generate_series(1, round(w * 100000 / v_tot)::int) where w > 0);
  v_af := array(select n from _dp_cli, generate_series(1, round(w_fut * 100000 / v_tot)::int) where w_fut > 0);
  v_as := array(select n from _dp_cli, generate_series(1, greatest(1, round(w_fut * 100000 / v_tot))::int) where w_fut > 0 and sin_credito);
  v_tc := array(select n from _dp_tra, generate_series(1, case when estado_op = 'activo' then 3 * m else m end) where m > 0);
  v_ta := array(select n from _dp_tra, generate_series(1, m) where m > 0 and estado_op = 'activo');
  update _dp_env set cli_n = v_ac[1 + floor(r4 * cardinality(v_ac))::int] where fase = 'hist';
  update _dp_env set cli_n = v_af[1 + floor(r4 * cardinality(v_af))::int] where fase in ('fut', 'sol', 'esp', 'marcha') and clase not in ('pago_pend', 'pagado');
  update _dp_env set cli_n = v_as[1 + floor(r4 * cardinality(v_as))::int] where clase in ('pago_pend', 'pagado');
  -- Algún cliente nuevo con su primer envío (pendiente de pago por ser el primero).
  insert into _dp_env (fase, dia, clase, cli_n) select 'fut', v_hoy + 2 + n % 5, 'primer_envio', n from _dp_cli where nuevo and estado = 'activa';
  update _dp_env e set cliente_id = c.id, sin_credito = c.sin_credito from _dp_cli c where c.n = e.cli_n;
  -- Clientes sin crédito: algunos envíos anulados porque no pagaron a tiempo.
  update _dp_env set clase = 'anulado' where fase = 'hist' and sin_credito and r5 < .07 and clase = 'entregado';
  -- Dos clientes que cancelan muchísimo (más de un tercio de sus envíos).
  update _dp_env e set clase = case when e.r2 < .5 then 'cancel_sin' else 'cancel_con' end
    from _dp_cli c where c.n = e.cli_n and c.rk in (15, 16) and e.fase = 'hist' and e.clase = 'entregado' and e.r5 < .38;
  -- Envíos manuales (con su propio transportista) de los clientes que los tienen.
  update _dp_env e set op_id = (select o.id from operadores o where o.cliente_id = e.cliente_id order by random() + e.n * 0 limit 1)
   where e.cliente_id in (select id from _dp_cli where tiene_op) and e.r6 < .3 and e.clase in ('entregado', 'cancel_sin', 'prog_sin', 'prog_con');
  update _dp_env set clase = 'prog_sin' where op_id is not null and clase = 'prog_con';

  -- Ruta: nº de paradas, carga/descarga y tipo de recorrido.
  update _dp_env set
    np = case when clase = 'multi' then 4 when clase in ('corto','largo','minimo','maximo','baleares','irlanda','suiza') then 2
              when r7 < .70 then 2 when r7 < .90 then 3 else 4 end,
    modo = case when clase = 'multi' then 'multi' when clase in ('corto', 'largo', 'baleares', 'irlanda', 'suiza') then clase
                when r8 < .74 then 'nac' when r8 < .83 then 'exp' when r8 < .91 then 'imp' when r8 < .94 then 'pt' when r8 < .96 then 'eu'
                when r8 < .98 then 'corto' else 'multi' end;
  update _dp_env set np = 4 where modo = 'multi';
  update _dp_env set patron = case np when 2 then 'CD' when 3 then (array['CCD','CDD'])[1 + floor(r6 * 2)::int]
                                      else (array['CCDD','CDCD','CDDD','CCCD'])[1 + floor(r6 * 4)::int] end;
  update _dp_env set patron = patron0, np = length(patron0), modo = 'nac' where clase = 'marcha';
  -- Mercancía y fechas.
  update _dp_env set
    ml = case when clase = 'minimo' then 0.40 when clase in ('maximo', 'baleares', 'irlanda') then 13.60
              when r5 < .32 then 13.60 else round((1 + floor(r6 * 30)) * 0.4, 2) end,
    forma = case when r7 < .72 then 'paletizada_lateral' when r7 < .9 then 'no_paletizada_lateral' else 'no_paletizada_techo' end,
    plataforma = r8 < .07 and clase not in ('maximo', 'baleares', 'irlanda'),
    ndias = case when clase in ('fin_anio', 'fin_anio_hist') then 4 when clase = 'ventana_larga' then 23
                 when r2 < .55 or clase in ('hoy', 'manana', 'sabado', 'domingo', 'festivo', 'marcha', 'bisiesto') then 1 when r2 < .85 then 2 else 4 end;
  update _dp_env set ml = least(ml, 8.0) where plataforma;
  update _dp_env set tn = case when clase = 'minimo' then 0.01 when clase = 'maximo' then 24.00
                               when r3 < .03 then null else round(least(24, greatest(0.05, ml * (0.3 + r4 * 1.5))), 2) end;
  update _dp_env set hasta = case when ndias = 1 then dia else sumar_dias_habiles(dia, ndias - 1) end;
  update _dp_env set real = case when ndias = 1 then dia else (select g::date from generate_series(dia, hasta, interval '1 day') g where es_dia_habil(g::date) or g::date = dia order by random() + n * 0 limit 1) end
   where fase in ('hist', 'esp') or dia = v_hoy;
  update _dp_env set real = case when dia > v_hoy then null else least(real, v_hoy) end;

  -- Estado final de cada envío.
  update _dp_env set estado = case clase
      when 'entregado' then 'entregado' when 'cancel_borr' then 'cancelado' when 'cancel_sin' then 'cancelado' when 'cancel_con' then 'cancelado'
      when 'borrador' then 'borrador' when 'rechazada' then 'cancelado' when 'anulado' then 'cancelado'
      when 'hacia' then 'hacia_la_carga' when 'cargando' then 'cargando' when 'en_ruta' then 'en_ruta'
      when 'pendiente_precio' then 'borrador' when 'precio_propuesto' then 'borrador' when 'contraoferta' then 'borrador'
      when 'atascado' then 'en_ruta' when 'retrasado' then 'programado' when 'hacia_ayer' then 'hacia_la_carga'
      when 'hoy' then 'hacia_la_carga'
      when 'bisiesto' then 'entregado' when 'cambio_hora' then 'entregado' when 'fin_anio_hist' then 'entregado'
      when 'marcha' then case sub when 'h' then 'hacia_la_carga' when 'c' then 'cargando' else 'en_ruta' end
      else 'programado' end;
  update _dp_env set estado = 'cargando' where clase = 'hoy';
  -- Tiempo en ruta (días hábiles): ~650 km al día.
  v_tiempos := v_tiempos || jsonb_build_object('envios_preparacion_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 7. Paradas: ciudades, sitios del cliente, distancias y precio -----------------------
  v_t := clock_timestamp();
  create temp table _dp_par on commit drop as
  select e.n en, e.id envio_id, e.cli_n, e.modo, o orden, case substr(e.patron, o::int, 1) when 'C' then 'carga' else 'descarga' end tipo, e.np,
         random()::numeric r1, random()::numeric r2, random()::numeric r3, random()::numeric r4,
         case e.modo
           when 'nac' then v_es[1 + floor(random() * cardinality(v_es))::int]
           when 'corto' then v_es[1 + floor(random() * cardinality(v_es))::int]
           when 'exp' then case when substr(e.patron, o::int, 1) = 'C' then v_es[1 + floor(random() * cardinality(v_es))::int] else v_eu[1 + floor(random() * cardinality(v_eu))::int] end
           when 'imp' then case when substr(e.patron, o::int, 1) = 'C' then v_eu[1 + floor(random() * cardinality(v_eu))::int] else v_es[1 + floor(random() * cardinality(v_es))::int] end
           when 'pt' then case when (substr(e.patron, o::int, 1) = 'C') = (e.r5 < .5) then v_es[1 + floor(random() * cardinality(v_es))::int] else v_pt[1 + floor(random() * cardinality(v_pt))::int] end
           when 'eu' then v_eu[1 + floor(random() * cardinality(v_eu))::int]
           when 'multi' then case o when 1 then v_es[1 + floor(random() * cardinality(v_es))::int] when 2 then v_fr[1 + floor(random() * cardinality(v_fr))::int]
                                    else case when e.r5 < .5 then v_de[1 + floor(random() * cardinality(v_de) + o * 0)::int] else v_it[1 + floor(random() * cardinality(v_it) + o * 0)::int] end end
           when 'largo' then (select i from _dp_ciu where nombre = case o when 1 then 'Lisboa' else 'Warszawa' end)
           when 'baleares' then (select i from _dp_ciu where nombre = case o when 1 then 'Valencia' else 'Palma' end)
           when 'irlanda' then (select i from _dp_ciu where nombre = case o when 1 then 'Zaragoza' else 'Dublin' end)
           when 'suiza' then (select i from _dp_ciu where nombre = case o when 1 then 'Basel' else 'Barcelona' end)
         end ciu
    from _dp_env e cross join lateral generate_series(1, e.np) o;
  create index on _dp_par (en, orden); analyze _dp_par;
  -- Recorrido corto: todas las paradas en la misma ciudad (sale el precio mínimo, 200 €).
  update _dp_par p set ciu = f.ciu from _dp_par f where f.en = p.en and f.orden = 1 and p.modo = 'corto' and p.orden > 1;
  -- En multi, la última parada en otra ciudad del mismo país que la tercera.
  alter table _dp_par add column id uuid default gen_random_uuid(), add column llegada timestamptz, add column salida timestamptz, add column realizado timestamptz,
    add column sitio_id uuid, add column nombre text, add column direccion text, add column cpostal text, add column poblacion text,
    add column provincia text, add column pais_iso text, add column lat numeric, add column lon numeric, add column km numeric;
  -- Recogidas en un sitio del cliente (la mayoría de las primeras) y alguna entrega en otro suyo.
  analyze _dp_par;
  -- (solo sitios en España: un sitio del cliente en Irlanda no admite grupaje, por ejemplo)
  update _dp_par p set sitio_id = (select s.id from _dp_sit s join _dp_ciu u on u.i = s.ciu where s.cli_n = p.cli_n and u.pais_iso = 'ES' order by random() + p.en * 0 limit 1)
   where ((p.orden = 1 and p.r1 < .65) or (p.tipo = 'descarga' and p.r1 < .08))
     and p.modo in ('nac', 'exp', 'corto', 'pt') and (p.modo <> 'exp' or p.tipo = 'carga')
     and exists (select 1 from _dp_sit s join _dp_ciu u on u.i = s.ciu where s.cli_n = p.cli_n and u.pais_iso = 'ES');
  update _dp_par p set nombre = s.nombre_empresa, direccion = s.direccion, cpostal = s.codigo_postal, poblacion = s.poblacion, provincia = s.provincia,
                       pais_iso = s.pais_codigo_iso, lat = s.lat, lon = s.lon
    from sitios s where s.id = p.sitio_id;
  update _dp_par p set
    nombre = case when p.r2 < .1 then null
                  when u.pais_iso = 'ES' then v_sector[1 + floor(p.r3 * cardinality(v_sector))::int] || ' ' || v_core[1 + floor(p.r4 * cardinality(v_core))::int] || ', ' || v_forma[1 + floor(p.r2 * cardinality(v_forma))::int]
                  else (v_ape -> (case when u.pais_iso in ('PT','FR','DE','IT','PL','NL','BE','CZ') then u.pais_iso else 'DE' end) ->> floor(p.r3 * 6)::int) || ' ' || (array['Logistics','Distribution','Warehouse','Handel','Logistique'])[1 + floor(p.r4 * 5)::int] end,
    direccion = case when p.r2 < .03 then null else v_calle[1 + floor(p.r3 * cardinality(v_calle))::int] || ' ' || (1 + floor(p.r4 * 200))::int end,
    cpostal = u.cpostal, poblacion = u.nombre, provincia = u.provincia, pais_iso = u.pais_iso,
    lat = round(u.lat + (p.r1 - .5) * case when p.modo = 'corto' then .04 else .1 end, 6),
    lon = round(u.lon + (p.r2 - .5) * case when p.modo = 'corto' then .04 else .1 end, 6)
    from _dp_ciu u where u.i = p.ciu and p.sitio_id is null;
  -- Distancia por carretera ≈ línea recta × 1,25.
  analyze _dp_par;
  update _dp_par p set km = x.km from (
    select en, orden, round(greatest(0.5, 1.25 * 2 * 6371 * asin(sqrt(
             power(sin(radians(lead(lat) over w - lat) / 2), 2)
             + cos(radians(lat)) * cos(radians(lead(lat) over w)) * power(sin(radians(lead(lon) over w - lon) / 2), 2))))::numeric, 2) km
      from _dp_par window w as (partition by en order by orden)) x
   where x.en = p.en and x.orden = p.orden and x.km is not null;
  update _dp_env e set km = x.km, imp_c = greatest(200, case when e.r2 < .25 then round(1.30 * x.km, 2) else round(1.30 * x.km) end),
                       transito = greatest(0, ceil(x.km / 650.0)::int - case when x.km < 300 then 1 else 0 end)
    from (select en, sum(km) km from _dp_par group by en) x where x.en = e.n;
  update _dp_env set imp_t = case when r1 > .995 then round(imp_c * 1.08, 2) when r2 < .25 then round(imp_c * (0.80 + r3 * 0.10), 2) else round(imp_c * (0.80 + r3 * 0.10)) end where op_id is null;  -- algún margen negativo
  update _dp_env set imp_c = null, imp_t = null where op_id is not null or clase = 'pendiente_precio';

  -- Envíos que aún van en ruta: cargados hace poco con entrega estimada a partir de hoy.
  update _dp_env set estado = 'en_ruta', clase = 'en_ruta'
   where fase = 'hist' and clase = 'entregado' and real >= v_hoy - 6 and sumar_dias_habiles(real, transito) >= v_hoy;
  update _dp_env set entrega_est = sumar_dias_habiles(coalesce(real, hasta, dia), transito) where dia is not null;

  -- Transportista, camión, remolque y conductor (de su propia flota).
  update _dp_env e set tra_n = v_tc[1 + floor(e.r7 * cardinality(v_tc))::int]
   where op_id is null and fase in ('hist', 'esp') and clase in ('entregado', 'cancel_con', 'en_ruta', 'atascado', 'hacia_ayer', 'multi', 'largo', 'maximo', 'hoy', 'irlanda', 'suiza', 'bisiesto', 'cambio_hora', 'fin_anio_hist');
  update _dp_env e set tra_n = v_ta[1 + floor(e.r7 * cardinality(v_ta))::int]
   where op_id is null and ((fase = 'fut' and (clase in ('hacia', 'cargando', 'en_ruta', 'entregado', 'prog_con', 'cancel_con') or (clase = 'pagado' and dia - v_hoy <= 7))) or fase = 'marcha');
  update _dp_env e set transportista_id = t.id from _dp_tra t where t.n = e.tra_n;
  -- Camión, remolque y conductor de su propia flota: número al azar dentro de su lista.
  -- (Las tablas de trabajo se analizan antes de cada cruce: sin eso el planificador cree que
  -- tienen una fila y los cruces se vuelven cuadráticos.)
  analyze _dp_env;
  update _dp_env e set cam_k = 1 + floor(random() * case when e.plataforma and t.n_pla > 0 then t.n_pla else t.n_mot end)::int,
                       cam_pla = e.plataforma and t.n_pla > 0,
                       rem_k = 1 + floor(random() * greatest(t.n_remv, 1))::int, con_k = 1 + floor(random() * greatest(t.n_cact, 1))::int
    from _dp_tra t
   where t.n = e.tra_n and t.n_mot > 0 and (e.fase <> 'fut' or e.clase <> 'prog_con' or e.dia - v_hoy <= 2 or e.r8 < .5);
  analyze _dp_env;
  update _dp_env e set cam_mat = v.matricula, cam_tipo = v.tipo from _dp_veh v
   where v.tra_n = e.tra_n and e.cam_k is not null and ((e.cam_pla and v.opl = e.cam_k) or (not e.cam_pla and v.om = e.cam_k));
  analyze _dp_env;
  update _dp_env e set rem_mat = v.matricula from _dp_veh v where v.tra_n = e.tra_n and v.orr = e.rem_k and e.cam_tipo = 'tractora';
  update _dp_env e set cond_nombre = c.nombre, cond_tel = c.telefono from _dp_con c
   where c.tra_n = e.tra_n and c.oc = e.con_k and e.cam_mat is not null and (e.fase <> 'hist' or e.dia >= v_hoy - v_cond_dias);
  v_tiempos := v_tiempos || jsonb_build_object('paradas_preparacion_s', round(extract(epoch from clock_timestamp() - v_t), 1));


  analyze _dp_env;
  -- ---- 8. Horas de cada paso, pago, solicitud, revisión de precio y cambios ---------------
  v_t := clock_timestamp();
  update _dp_env set t_creado = case
      when fase = 'sol' then now() - make_interval(mins => (20 + floor(r1 * 4000))::int)
      else least(now() - make_interval(mins => (15 + floor(r2 * 600))::int),
                 ((dia - (1 + floor(r1 * 9))::int) + time '07:30' + make_interval(mins => floor(r2 * 720)::int)) at time zone 'Europe/Madrid') end;
  update _dp_env set t_confirmado = t_creado + make_interval(mins => (2 + floor(r3 * 80))::int)
   where estado not in ('borrador') and clase not in ('cancel_borr', 'rechazada');
  update _dp_env set t_oferta = t_confirmado + make_interval(mins => (5 + floor(r4 * 120))::int)
   where t_confirmado is not null and (transportista_id is not null or sub in ('ofertada', 'reservada'));
  update _dp_env set t_asignado = least(now() - interval '5 minutes', t_oferta + make_interval(mins => (10 + floor(r5 * 600))::int),
                                        greatest(t_oferta + interval '5 minutes', (dia + time '07:00') at time zone 'Europe/Madrid'))
   where transportista_id is not null;
  -- Hacia la carga, cargando y cargado: el día real de carga (hoy, por la mañana y hasta ahora).
  update _dp_env set t_hacia = case when real = v_hoy then now() - make_interval(mins => (60 + floor(r6 * 240))::int)
                                    else (real + time '06:00' + make_interval(mins => floor(r6 * 300)::int)) at time zone 'Europe/Madrid' end
   where estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado');
  update _dp_env set t_hacia = now() - make_interval(mins => (5 + floor(r6 * 50))::int) where estado = 'hacia_la_carga' and real = v_hoy;
  update _dp_env set t_cargando = least(now() - interval '2 minutes', t_hacia + make_interval(mins => (30 + floor(r7 * 120))::int))
   where estado in ('cargando', 'en_ruta', 'entregado');
  update _dp_env set t_cargado = least(now() - interval '1 minute', t_cargando + make_interval(mins => (25 + floor(r8 * 70))::int))
   where estado in ('en_ruta', 'entregado');
  update _dp_env set t_entregado = least(now(), greatest(t_cargado + make_interval(mins => (30 + floor(km / 70 * 60))::int),
                          (sumar_dias_habiles(real, transito) + time '08:00' + make_interval(mins => floor(r1 * 540)::int)) at time zone 'Europe/Madrid'))
   where estado = 'entregado';
  -- En ruta: ya ha salido de la primera parada (cargó hace al menos una hora).
  update _dp_env set t_cargando = least(t_cargando, now() - interval '70 minutes'), t_hacia = least(t_hacia, now() - interval '110 minutes') where estado = 'en_ruta' and clase <> 'marcha';
  -- Matriz en marcha: la hora de llegada a la primera parada se elige para que AHORA esté justo
  -- en la etapa pedida (20 min dentro de la parada, o a mitad del tramo hacia ella).
  update _dp_env e set t_cargando = now() - case e.sub when 'c' then x.off_p + interval '20 minutes' else x.off_p - x.trav / 2 end
    from (select p.en, p.orden,
                 (p.orden - 1) * interval '60 minutes' + make_interval(mins => coalesce(sum(greatest(10, floor(p.km / 70 * 60))) over w, 0)::int) off_p,
                 make_interval(mins => coalesce(greatest(10, floor(lag(p.km) over (partition by p.en order by p.orden) / 70 * 60)), 0)::int) trav
            from _dp_par p window w as (partition by p.en order by p.orden rows between unbounded preceding and 1 preceding)) x
   where x.en = e.n and x.orden = e.pt and e.clase = 'marcha' and e.sub in ('c', 'r');
  update _dp_env set t_hacia = t_cargando - interval '90 minutes' where clase = 'marcha' and sub in ('c', 'r');
  update _dp_env set t_hacia = now() - interval '30 minutes', t_cargando = null where clase = 'marcha' and sub = 'h';
  update _dp_env set t_asignado = least(t_asignado, t_hacia - interval '40 minutes'), t_oferta = least(t_oferta, t_hacia - interval '60 minutes') where clase = 'marcha';
  -- Hora de llegada y de salida de cada parada: 1 h en cada una y el resto del tiempo repartido
  -- por los km de cada tramo (entregados); en marcha, a 70 km/h desde que llegó a la primera.
  update _dp_par p set llegada = x.llegada, salida = x.llegada + x.st
    from (select p2.en, p2.orden,
                 case when e.estado = 'entregado' then least(interval '60 minutes', (e.t_entregado - e.t_cargando) / (2 * e.np)) else interval '60 minutes' end st,
                 case when e.estado = 'entregado' then
                        e.t_cargando + (p2.orden - 1) * least(interval '60 minutes', (e.t_entregado - e.t_cargando) / (2 * e.np))
                        + ((e.t_entregado - e.t_cargando) - e.np * least(interval '60 minutes', (e.t_entregado - e.t_cargando) / (2 * e.np)))
                          * (coalesce(sum(p2.km) over w, 0) / greatest(e.km, 0.1))
                      else e.t_cargando + (p2.orden - 1) * interval '60 minutes' + make_interval(mins => coalesce(sum(greatest(10, floor(p2.km / 70 * 60))) over w, 0)::int) end llegada
            from _dp_par p2 join _dp_env e on e.n = p2.en
           where e.estado in ('cargando', 'en_ruta', 'entregado') and e.t_cargando is not null
          window w as (partition by p2.en order by p2.orden rows between unbounded preceding and 1 preceding)) x
   where x.en = p.en and x.orden = p.orden;
  -- Los camiones no circulan sábados, domingos ni festivos: en los entregados, una parada que caería
  -- en uno de esos días pasa a primera hora del siguiente día hábil (sin pasar de la entrega).
  update _dp_par p set
    llegada = least(e.t_entregado - make_interval(mins => ((e.np - p.orden) * 2 + 1)::int),
                    ((sumar_dias_habiles((p.llegada at time zone 'Europe/Madrid')::date, 1)) + time '08:00' + make_interval(mins => (p.orden * 2)::int)) at time zone 'Europe/Madrid'),
    salida = least(e.t_entregado - make_interval(mins => ((e.np - p.orden) * 2)::int),
                   ((sumar_dias_habiles((p.llegada at time zone 'Europe/Madrid')::date, 1)) + time '08:00' + make_interval(mins => (p.orden * 2 + 1)::int)) at time zone 'Europe/Madrid')
    from _dp_env e
   where e.n = p.en and e.estado = 'entregado' and p.llegada is not null and p.orden < e.np
     and (not es_dia_habil((p.llegada at time zone 'Europe/Madrid')::date) or not es_dia_habil((p.salida at time zone 'Europe/Madrid')::date));
  -- Y siempre en orden: cada parada después de salir de la anterior.
  for v_lote in 2..4 loop
    update _dp_par p set llegada = greatest(p.llegada, q.salida + interval '1 minute'),
                         salida = greatest(p.salida, greatest(p.llegada, q.salida + interval '1 minute') + interval '1 minute')
      from _dp_par q where q.en = p.en and q.orden = v_lote - 1 and p.orden = v_lote and p.llegada is not null and q.salida is not null
       and p.llegada <= q.salida;
  end loop;
  update _dp_env e set t_entregado = p.salida from _dp_par p where p.en = e.n and p.orden = e.np and e.estado = 'entregado' and p.salida > e.t_entregado;
  -- Parada actual: la 1.ª yendo a la carga o cargando; en ruta, la siguiente a la que aún no ha llegado.
  update _dp_env e set pa = case e.estado when 'hacia_la_carga' then 1 when 'cargando' then coalesce(e.pt, 1) when 'entregado' then e.np
                                 when 'en_ruta' then coalesce((select min(p.orden) from _dp_par p where p.en = e.n and p.orden >= 2 and p.llegada > now()), e.np) end
   where e.estado in ('hacia_la_carga', 'cargando', 'en_ruta', 'entregado');
  update _dp_par p set realizado = p.salida from _dp_env e
   where e.n = p.en and ((e.estado = 'entregado') or (e.estado in ('en_ruta', 'cargando') and p.orden < e.pa));
  update _dp_env e set t_cargado = p.salida from _dp_par p where p.en = e.n and p.orden = 1 and (e.estado in ('en_ruta', 'entregado') or (e.estado = 'cargando' and e.pa > 1));
  -- Día previsto de carga (el que dice quien asigna; obligatorio con ventana) y seguimiento
  -- automático (salvo los atascados a propósito, que se quedan como están).
  update _dp_env set prevista = case when real is not null then real when ndias = 1 then dia else sumar_dias_habiles(dia, floor(r3 * ndias)::int) end
   where transportista_id is not null;
  update _dp_env set seg = false where clase in ('atascado', 'retrasado', 'hacia_ayer') or (clase = 'marcha' and n % 3 = 0);
  -- Etapa marcada a mano por Dynamo: ya pasada (llegó antes) o futura (se atrasa: «llegará a las …»).
  update _dp_env e set ancla_p = 2 * e.pt, ancla_h = p.llegada - interval '15 minutes'
    from _dp_par p where p.en = e.n and p.orden = e.pt and e.clase = 'marcha' and e.sub = 'c' and e.n % 5 = 1;
  update _dp_env set ancla_p = 2 * pt, ancla_h = now() + interval '2 hours' where clase = 'marcha' and sub = 'r' and n % 5 = 2;
  update _dp_env set t_asignado = least(t_asignado, t_hacia - interval '30 minutes') where t_hacia is not null and t_asignado > t_hacia - interval '30 minutes';
  -- Cancelaciones: la mitad de las que tenían camión, tarde (después del corte: lleva penalización).
  update _dp_env set t_cancelado = case
      when clase = 'cancel_con' and r8 < .1 then least(now(), (coalesce(real, dia) + time '11:30' + make_interval(mins => floor(r6 * 90)::int)) at time zone 'Europe/Madrid')
      when clase = 'cancel_con' and r5 < .5 then least(now(), ((dia - 1) + time '10:00' + make_interval(mins => floor(r6 * 600)::int)) at time zone 'Europe/Madrid')
      else least(now(), t_creado + (coalesce(t_asignado, (dia + time '07:00') at time zone 'Europe/Madrid') - t_creado) * r6 + interval '1 minute') end
   where estado = 'cancelado';
  update _dp_env set t_asignado = least(t_asignado, t_cancelado - interval '1 minute') where estado = 'cancelado' and t_asignado is not null;
  update _dp_env set t_oferta = least(t_oferta, t_asignado - interval '1 minute') where t_asignado is not null and t_oferta >= t_asignado;
  update _dp_env set t_oferta = least(t_oferta, now() - interval '20 minutes'), t_asignado = least(t_asignado, now() - interval '10 minutes');

  update _dp_env set est_asig = case when transportista_id is not null then 'confirmada' when sub = 'ofertada' then 'ofertada'
                                     when sub = 'reservada' then 'reservada' else 'sin_asignar' end;
  update _dp_env set est_pago = case
      when op_id is not null then 'no_requerido'
      when clase = 'anulado' then 'pendiente'
      when not sin_credito or estado = 'borrador' or clase in ('cancel_borr', 'rechazada', 'pago_pend') then 'no_requerido'
      when r8 < .12 then 'exento' else 'pagado' end;
  update _dp_env set est_sol = case clase when 'pendiente_precio' then 'pendiente_precio' when 'precio_propuesto' then 'precio_propuesto'
                                          when 'contraoferta' then 'contraoferta' when 'rechazada' then 'rechazada' end;
  update _dp_env set est_sol = 'aceptada' where est_sol is null and estado <> 'borrador' and op_id is null and r3 > .95;
  update _dp_env set est_rev = case clase when 'rev_esp' then 'esperando_cliente' when 'rev_revisar' then 'revisar' end;
  update _dp_env set est_rev = 'hecha' where clase = 'prog_con' and r6 < .3;
  v_tiempos := v_tiempos || jsonb_build_object('horas_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  analyze _dp_env;
  -- ---- 9. Inserción de los envíos (por lotes: menos memoria en las señales «en vivo») -------
  v_t := clock_timestamp();
  for v_lote in 0..19 loop
    insert into envios (
      id, referencia_cliente, cliente_id, estado, estado_asignacion, transportista_id, matricula_camion, matricula_remolque,
      conductor_nombre, conductor_telefono, fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, fecha_entrega_estimada,
      descripcion_mercancia, toneladas, metros_lineales, paletizado, carga_lateral, carga_techo, carga_trasera, carga_lateral_bajo,
      requiere_plataforma_elevadora, requiere_nima, adr, importe_cliente, importe_transportista, plazo_pago_dias, precio_fijado_a_mano,
      publicado_en_bolsa_en, discrecion_comercial, anotaciones_cliente, creado_en, confirmado_en, primera_oferta_en, asignado_en,
      cargado_en, entregado_en, cancelado_en, operador_id, precio_acordado_operador, facturado_venta, facturado_compra,
      valoracion_transportista, valoracion_comentario, estado_solicitud, precio_caduca_en, condiciones_aceptadas_en,
      num_bultos, embalaje, volumen_m3, negociacion_pct, valoracion_cliente, valoracion_cliente_comentario, valoracion_cliente_en,
      estado_pago_previo, pago_motivo, pago_metodo, pagado_en, pago_exento_motivo, stripe_pago_ref,
      importe_contraoferta_cliente, contraoferta_cliente_en, importe_cliente_inicial, requiere_revision_precio,
      cambio_cliente, cambio_cliente_en, estado_cambio_cliente, cambio_cliente_nota, cancelado_en_nombre_cliente,
      estado_revision_precio, fecha_revision_precio, importe_revision_anterior, importe_revision_nuevo, revision_precio_en, cancelacion_sin_coste,
      fecha_carga_prevista, parada_actual, seguimiento_automatico, ancla_paso, ancla_hora)
    select e.id,
           case when e.r2 < .6 then (array['PED-','OC ','Pedido ','REF/',''])[1 + floor(e.r3 * 5)::int] || lpad((e.n * 37 % 1000000)::text, 6, '0') end,
           e.cliente_id, e.estado::estado_envio, e.est_asig::estado_asignacion, e.transportista_id, e.cam_mat, e.rem_mat,
           e.cond_nombre, e.cond_tel, e.dia, e.hasta, case when e.estado in ('cargando', 'en_ruta', 'entregado') then e.real end, e.entrega_est,
           case when e.r4 < .02 then 'Pinturas y disolventes (ADR clase 3, UN1263)' when e.r4 < .03 then 'Residuos de envases de papel y cartón (LER 150101)'
                else v_merc[1 + floor(e.r5 * cardinality(v_merc))::int] end,
           e.tn, e.ml, e.forma = 'paletizada_lateral', e.forma <> 'no_paletizada_techo', e.forma = 'no_paletizada_techo', e.r6 < .03, e.r6 > .98,
           e.plataforma, e.r4 between .02 and .03, e.r4 < .02, e.imp_c, case when e.transportista_id is not null or e.estado <> 'cancelado' then e.imp_t end,
           c.plazo_pago_dias, e.r7 < .02,
           case when e.sub = 'ofertada' and e.r4 < .4 then e.t_oferta when e.transportista_id is not null and e.r8 < .05 then e.t_oferta end,
           c.discrecion_comercial,
           case when e.n % 997 = 1 then repeat('Entrada por la puerta trasera del polígono. ', 22) || 'Fin.'
                when e.r1 < .15 then (array['Llamar 30 minutos antes de llegar.','Muelle 3. Horario de 8 a 14.','Imprescindible chaleco y botas.','Traer albaranes firmados por duplicado.','No apilar: mercancía frágil.','Cita previa en el portal del cliente.'])[1 + floor(e.r2 * 6)::int] end,
           e.t_creado, e.t_confirmado, e.t_oferta, e.t_asignado, e.t_cargado, e.t_entregado, e.t_cancelado,
           e.op_id, case when e.op_id is not null then round(greatest(150, 1.1 * e.km)) end,
           e.estado = 'entregado' and e.dia < v_hoy - 20 and e.r8 > .02, e.estado = 'entregado' and e.dia < v_hoy - 20 and e.r8 > .04 and e.op_id is null,
           case when e.estado = 'entregado' and e.transportista_id is not null and e.r6 < .25 then (array[5,5,5,5,5,5,4,4,4,4,4,3,3,2,1])[1 + floor(e.r7 * 15)::int] end,
           case when e.estado = 'entregado' and e.transportista_id is not null and e.r6 < .05 then (array['Muy puntual.','Llegó tarde a la carga.','Conductor muy amable.','Faltaba la documentación.'])[1 + floor(e.r8 * 4)::int] end,
           e.est_sol, case when e.est_sol = 'precio_propuesto' then e.t_creado + interval '24 hours' end,
           e.t_confirmado,
           case when e.forma = 'paletizada_lateral' then greatest(1, round(e.ml * 2.5)) when e.r3 < .5 then 1 + floor(e.r3 * 80)::int end,
           case when e.forma = 'paletizada_lateral' then (array['Europalé','Europalé','Palé americano','Palé de 1,20 × 1,20'])[1 + floor(e.r4 * 4)::int]
                when e.r3 < .3 then (array['Big bag','Cajas','Bobinas','Sacos','A granel en sacas'])[1 + floor(e.r5 * 5)::int] end,
           case when e.r8 < .2 then round(e.ml * 2.4 * 2.2, 2) end,
           case when e.est_sol = 'aceptada' and e.r4 < .5 then (array[0, 5, 10])[1 + floor(e.r5 * 3)::int] end,
           case when e.estado = 'entregado' and e.r7 < .15 then (array[5,5,5,4,4,4,3,2,1])[1 + floor(e.r8 * 9)::int] end,
           case when e.estado = 'entregado' and e.r7 < .02 then 'Todo correcto, repetiremos.' end,
           case when e.estado = 'entregado' and e.r7 < .15 then e.t_entregado + interval '20 hours' end,
           e.est_pago,
           case when e.est_pago in ('pagado', 'exento', 'pendiente') then case when c.riesgo_cesce_euros is null then 'Sin crédito: empresa sin clasificar por CESCE' else 'Sin crédito: CESCE autoriza 0,00 €' end end,
           case when e.est_pago = 'pagado' then case when e.r6 < .6 then 'stripe' else 'transferencia' end end,
           case when e.est_pago = 'pagado' then least(now(), e.t_confirmado + make_interval(mins => (20 + floor(e.r7 * 1000))::int)) end,
           case when e.est_pago = 'exento' then 'Cliente de confianza: lo pagará a su plazo.' end,
           case when e.est_pago = 'pagado' and e.r6 < .6 then 'pi_prueba_' || substr(md5(e.id::text), 1, 20) end,
           case when e.est_sol = 'contraoferta' then round(e.imp_c * 0.9) end,
           case when e.est_sol = 'contraoferta' then e.t_creado + interval '50 minutes' end,
           case when e.est_sol = 'contraoferta' then e.imp_c end,
           e.fase = 'fut' and e.estado = 'programado' and e.r6 between .04 and .05,
           case when e.fase = 'fut' and e.estado = 'programado' and e.op_id is null then case
                  when e.r6 < .04 then jsonb_build_object('fecha_desde', null, 'fecha_hasta', null, 'detalle', 'Cambiar la hora de carga a las 10:00 y añadir 2 palés.', 'con_camion', e.transportista_id is not null)
                  when e.r6 < .08 then jsonb_build_object('fecha_desde', null, 'fecha_hasta', null, 'detalle', 'La descarga pasa a otra nave del mismo polígono.', 'con_camion', e.transportista_id is not null)
                  when e.r6 < .11 and e.transportista_id is null then jsonb_build_object('fecha_desde', e.dia, 'fecha_hasta', e.hasta, 'antes_desde', e.dia - 2, 'antes_hasta', e.hasta - 2) end end,
           case when e.fase = 'fut' and e.estado = 'programado' and e.op_id is null and (e.r6 < .08 or (e.r6 < .11 and e.transportista_id is null)) then now() - make_interval(hours => (1 + floor(e.r7 * 40))::int) end,
           case when e.fase = 'fut' and e.estado = 'programado' and e.op_id is null then case
                  when e.r6 < .04 then 'pendiente' when e.r6 < .06 then 'aceptado' when e.r6 < .08 then 'rechazado'
                  when e.r6 < .11 and e.transportista_id is null then 'aplicado' end end,
           case when e.fase = 'fut' and e.estado = 'programado' and e.op_id is null then case
                  when e.r6 >= .04 and e.r6 < .06 then 'Hecho: cambiamos la hora de carga.' when e.r6 >= .06 and e.r6 < .08 then 'No es posible: el camión tiene otra carga ese día.' end end,
           e.estado = 'cancelado' and e.r7 < .3 and e.clase in ('cancel_con', 'cancel_sin'),
           e.est_rev,
           case when e.est_rev in ('esperando_cliente', 'revisar', 'hecha') then least(e.dia, v_hoy) end,
           case when e.est_rev in ('esperando_cliente', 'hecha') then e.imp_c end,
           case when e.est_rev = 'esperando_cliente' then round(e.imp_c * 1.12) when e.est_rev = 'hecha' then e.imp_c end,
           case when e.est_rev in ('esperando_cliente', 'hecha') then now() - make_interval(hours => (1 + floor(e.r5 * 20))::int) end,
           e.clase in ('cancel_borr', 'cancel_sin', 'rechazada') or (e.clase = 'cancel_con' and e.r5 >= .5),
           e.prevista, e.pa, e.seg, e.ancla_p, e.ancla_h
      from _dp_env e join clientes c on c.id = e.cliente_id
     where e.n % 20 = v_lote
     order by e.dia, e.n;
    -- Estadísticas al día dentro de la propia transacción: si no, el planificador cree que las
    -- tablas siguen vacías (como las dejó el último análisis) y cada disparador las recorre enteras.
    if v_lote in (0, 1, 5) then analyze envios; analyze clientes; analyze vehiculos; analyze conductores; end if;
  end loop;
  v_tiempos := v_tiempos || jsonb_build_object('envios_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 10. Paradas -----------------------------------------------------------------------
  v_t := clock_timestamp();
  for v_lote in 0..19 loop
    insert into envio_paradas (id, envio_id, orden, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso,
                               lat, lon, fecha_desde, fecha_hasta, realizado_en, referencia, anotaciones, distancia_siguiente_km, creado_en)
    select p.id, p.envio_id, p.orden, p.tipo, p.sitio_id, p.nombre, p.direccion, p.cpostal, p.poblacion, p.provincia, p.pais_iso, p.lat, p.lon,
           case when p.tipo = 'carga' then (coalesce(e.real, e.dia) + time '08:00') at time zone 'Europe/Madrid'
                else (e.entrega_est + time '08:00') at time zone 'Europe/Madrid' end,
           case when p.tipo = 'carga' then (coalesce(e.real, e.hasta) + time '14:00') at time zone 'Europe/Madrid'
                else (e.entrega_est + time '18:00') at time zone 'Europe/Madrid' end,
           p.realizado,
           case when p.r3 < .3 then 'Ref. ' || upper(substr(md5(p.envio_id::text || p.orden), 1, 8)) end,
           case when p.r4 < .08 then (array['Descarga con transpaleta.','Preguntar por Paco en recepción.','Cerrado de 14 a 15.','Necesita cita: 955 000 000.'])[1 + floor(p.r1 * 4)::int] end,
           p.km, e.t_creado
      from _dp_par p join _dp_env e on e.n = p.en
     where p.en % 20 = v_lote
     order by p.en, p.orden;
    if v_lote in (0, 1, 5) then analyze envio_paradas; analyze envios; analyze envio_parada_pines; end if;
  end loop;
  analyze envio_paradas; analyze envios;
  v_tiempos := v_tiempos || jsonb_build_object('paradas_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 11. Hitos de la línea de tiempo (además de «creado» y «confirmado», que pone el alta) --
  v_t := clock_timestamp();
  insert into envio_hitos (envio_id, hito, cuando, quien_origen, datos)
  select e.id, h.hito::tipo_hito, least(h.cuando, now()), 'migracion-sheet', h.datos
    from _dp_env e cross join lateral (values
      ('publicado_bolsa', case when e.t_oferta is not null and (e.sub = 'ofertada' and e.r4 < .4 or e.transportista_id is not null and e.r8 < .05) then e.t_oferta end, '{}'::jsonb),
      ('transportista_asignado', e.t_asignado, jsonb_build_object('transportista_id', e.transportista_id, 'importe_transportista', e.imp_t)),
      ('matricula_asignada', case when e.cam_mat is not null then e.t_asignado + interval '20 minutes' end, jsonb_build_object('camion', e.cam_mat, 'remolque', e.rem_mat)),
      ('orden_carga_enviada', case when e.cam_mat is not null and e.dia >= v_hoy - 400 then e.t_asignado + interval '25 minutes' end, '{}'::jsonb),
      ('hacia_la_carga', e.t_hacia, '{"parada": 1}'::jsonb),
      ('cancelado', e.t_cancelado, jsonb_build_object('estado_anterior', case when e.t_confirmado is null then 'borrador' when e.clase = 'cancel_con' and e.r8 < .1 then 'cargando' else 'programado' end, 'tenia_transportista', e.transportista_id is not null)),
      -- Cancelado ya en marcha (salió hacia la carga y llegó a cargar).
      ('hacia_la_carga', case when e.clase = 'cancel_con' and e.r8 < .1 then e.t_cancelado - interval '2 hours' end, '{"parada": 1}'::jsonb),
      ('cargando', case when e.clase = 'cancel_con' and e.r8 < .1 then e.t_cancelado - interval '50 minutes' end, '{"parada": 1}'::jsonb),
      -- Cancelación deshecha: se canceló y se volvió a programar (y acabó entregado).
      ('cancelado', case when e.estado = 'entregado' and e.r4 > .997 and e.t_asignado is not null then e.t_asignado + interval '1 hour' end, jsonb_build_object('estado_anterior', 'programado', 'tenia_transportista', true)),
      ('cancelacion_deshecha', case when e.estado = 'entregado' and e.r4 > .997 and e.t_asignado is not null then e.t_asignado + interval '2 hours' end, '{"estado_nuevo": "programado"}'::jsonb),
      -- Etapa corregida a mano por Dynamo (las de la matriz con ancla).
      ('etapa_corregida', case when e.ancla_p is not null then now() - interval '5 minutes' end, jsonb_build_object('paso', e.ancla_p, 'hora', e.ancla_h)),
      ('incidencia', case when e.clase = 'anulado' then e.t_cancelado end, jsonb_build_object('motivo_cancelacion', 'Anulado sin pago: no se recibió el pago a tiempo', 'por', 'sistema')),
      ('fecha_carga_movida', case when e.fase = 'fut' and e.estado = 'programado' and e.op_id is null and e.transportista_id is null and e.r6 >= .08 and e.r6 < .11 then now() - make_interval(hours => (1 + floor(e.r7 * 40))::int) end,
        jsonb_build_object('antes_desde', e.dia - 2, 'antes_hasta', e.hasta - 2, 'desde', e.dia, 'hasta', e.hasta, 'motivo', 'Cambio pedido por el cliente'))
    ) h(hito, cuando, datos)
   where h.cuando is not null;
  -- Cada parada: llega (cargando / descargando) y sale (cargado / descargado; en la última, entregado).
  insert into envio_hitos (envio_id, hito, cuando, quien_origen, parada_id, datos)
  select p.envio_id, h.hito::tipo_hito, h.cuando, 'migracion-sheet', p.id, h.datos
    from _dp_par p join _dp_env e on e.n = p.en
   cross join lateral (values
      (case when p.tipo = 'carga' then 'cargando' else 'descargando' end,
       case when e.estado = 'entregado' or (e.estado = 'en_ruta' and p.orden < e.pa) or (e.estado = 'cargando' and p.orden <= e.pa) then p.llegada end,
       jsonb_build_object('parada', p.orden)),
      (case when e.estado = 'entregado' and p.orden = e.np then 'entregado' when p.tipo = 'carga' then 'cargado' else 'descargado' end,
       p.realizado,
       case when p.orden < e.np then jsonb_build_object('parada', p.orden, 'hacia_parada', p.orden + 1) else jsonb_build_object('parada', p.orden) end)
   ) h(hito, cuando, datos)
   where h.cuando is not null;
  analyze envio_hitos;
  v_tiempos := v_tiempos || jsonb_build_object('hitos_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  analyze _dp_env;
  -- ---- 12. Ofertas a transportistas y reservas desde la bolsa de cargas -------------------
  v_t := clock_timestamp();
  create temp table _dp_ofe on commit drop as
  select e.n en, e.id envio_id, e.transportista_id, e.tra_n, 'aceptada'::text estado, e.t_oferta enviada, e.imp_t precio,
         (array['panel','panel','email','whatsapp','whatsapp','telefono','bolsa_wtransnet'])[1 + floor(e.r1 * 7)::int] canal,
         random()::numeric r1, random()::numeric r2, random()::numeric r3, true principal
    from _dp_env e
   where e.transportista_id is not null and e.t_oferta is not null and e.dia >= v_hoy - 365
  union all
  select e.n, e.id, t.id, t.n,
         case when e.sub in ('ofertada', 'reservada') then 'activa' when e.estado = 'cancelado' then 'revocada'
              when random() + g * 0 < .5 then 'cerrada' else 'caducada' end,
         e.t_oferta + make_interval(mins => (g * 3)::int), coalesce(e.imp_t, round(e.imp_c * .85)),
         (array['email','whatsapp','panel'])[1 + floor(random() * 3)::int], random()::numeric, random()::numeric, random()::numeric, false
    from _dp_env e
   cross join lateral generate_series(1, case when e.sub in ('ofertada', 'reservada') then 1 + floor(e.r2 * 5)::int else floor(e.r2 * 3)::int end) g
   cross join lateral (select t.id, t.n from _dp_tra t where t.n = v_ta[1 + floor(random() * cardinality(v_ta) + g * 0 + e.n * 0)::int]) t
   where e.t_oferta is not null and e.dia >= v_hoy - 365 and coalesce(e.est_rev, '') not in ('pendiente', 'revisar', 'esperando_cliente')
     and t.id is distinct from e.transportista_id;
  alter table _dp_ofe add column id uuid default gen_random_uuid();
  create index on _dp_ofe (en); analyze _dp_ofe;
  insert into envio_ofertas (id, envio_id, transportista_id, canal, precio_ofertado, banda_pct, pronto_pago, estado, enviada_en, caduca_en, abierta_en, aperturas, creado_en)
  select o.id, o.envio_id, case when o.canal like 'bolsa_%' and o.r3 < .5 then null else o.transportista_id end, o.canal, o.precio,
         (array[10, 10, 10, 5, 0, 30])[1 + floor(o.r1 * 6)::int], o.r2 < .3, o.estado, o.enviada,
         case when o.estado = 'activa' then now() + make_interval(hours => (2 + floor(o.r3 * 100))::int) else o.enviada + interval '7 days' end,
         case when o.estado in ('aceptada', 'cerrada') or o.r3 < .4 then o.enviada + make_interval(mins => (3 + floor(o.r1 * 50))::int) end,
         case when o.estado in ('aceptada', 'cerrada') or o.r3 < .4 then 1 + floor(o.r2 * 4)::int else 0 end, o.enviada
    from _dp_ofe o
   where o.precio > 0
     and not exists (select 1 from envios x where x.id = o.envio_id and (precio_por_revisar(x.estado_revision_precio) or x.estado_pago_previo = 'pendiente'));
  analyze envio_ofertas;
  delete from _dp_ofe o where not exists (select 1 from envio_ofertas x where x.id = o.id);
  insert into envio_hitos (envio_id, hito, cuando, oferta_id, datos)
  select o.envio_id, 'ofertado', o.enviada, o.id, jsonb_build_object('canal', o.canal, 'precio', o.precio) from _dp_ofe o;
  -- Reservas: aceptadas por enlace, contraofertas del transportista (pendientes o rechazadas) y caducadas.
  insert into envio_reservas (envio_id, oferta_id, desde, hasta, estado, transportista_id, precio_aceptado, precio_propuesto, cerrada_en, motivo_cierre, pronto_pago, ip, navegador, creado_en)
  select o.envio_id, o.id, x.desde, x.desde + interval '3 minutes', x.estado, o.transportista_id,
         case when x.estado = 'aceptada' then o.precio end,
         case when x.estado in ('pendiente_revision', 'rechazada') or (x.estado = 'aceptada' and o.r1 < .1) then round(o.precio * 1.08) end,
         case when x.estado <> 'pendiente_revision' then x.desde + interval '2 minutes' end,
         case x.estado when 'caducada' then 'pasaron los minutos de la reserva' when 'rechazada' then 'Dynamo no acepta el precio propuesto' when 'liberada' then 'el transportista la soltó' end,
         x.estado = 'aceptada' and o.r2 < .3, ('192.0.2.' || (1 + floor(o.r1 * 250))::int)::inet, 'Mozilla/5.0 (prueba)', x.desde
    from _dp_ofe o join _dp_env e on e.n = o.en
   cross join lateral (select case
        when o.principal and o.canal in ('panel', 'email', 'whatsapp') and o.r3 < .6 then 'aceptada'
        when not o.principal and e.sub = 'reservada' and o.r1 < .7 then 'pendiente_revision'
        when not o.principal and o.estado in ('cerrada', 'caducada') and o.r1 < .1 then (array['caducada','liberada','rechazada'])[1 + floor(o.r2 * 3)::int] end estado,
        least(now() - interval '10 minutes', o.enviada + make_interval(mins => (5 + floor(o.r1 * 60))::int)) desde) x
   where x.estado is not null and o.transportista_id is not null;
  -- Solo una contraoferta pendiente por envío a la vez (se queda la primera).
  delete from envio_reservas r using (select id, row_number() over (partition by envio_id order by desde) rn from envio_reservas
                                       where estado = 'pendiente_revision' and envio_id in (select id from _dp_env)) d
   where d.id = r.id and d.rn > 1;
  insert into envio_hitos (envio_id, hito, cuando, oferta_id, datos)
  select r.envio_id, case when r.estado = 'aceptada' then 'reservado' else 'contraoferta_propuesta' end::tipo_hito, r.desde, r.oferta_id,
         jsonb_build_object('transportista_id', r.transportista_id, 'precio', coalesce(r.precio_aceptado, r.precio_propuesto))
    from envio_reservas r join _dp_env e on e.id = r.envio_id where r.estado in ('aceptada', 'pendiente_revision', 'rechazada');
  insert into contraoferta_intentos (envio_id, importe, cuando)
  select id, round(imp_c * 0.9), t_creado + interval '50 minutes' from _dp_env where est_sol = 'contraoferta'
  union all select id, round(imp_c * 0.8), t_creado + interval '30 minutes' from _dp_env where est_sol = 'contraoferta' and r5 < .3;
  analyze envio_reservas;
  v_tiempos := v_tiempos || jsonb_build_object('ofertas_reservas_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 13. Incidencias, penalizaciones y reservas del CMR ---------------------------------
  v_t := clock_timestamp();
  insert into incidencias (tipo_id, envio_id, transportista_id, titulo, detalle, estado, prioridad, resolucion, creado_en)
  select ti.id, e.id, case when x.tipo in ('incidencia_transporte', 'transportista_conductor', 'siniestro', 'albaran') then e.transportista_id end,
         x.titulo, x.detalle, x.estado::estado_incidencia, x.prioridad::prioridad_incidencia,
         case when x.estado = 'resuelto' then (array['Resuelto con el transportista.','Se abona la diferencia en la próxima factura.','Albarán recibido y subido.','Aclarado con el cliente por teléfono.'])[1 + floor(e.r4 * 4)::int] end,
         least(now(), coalesce(e.t_cargado, e.t_confirmado, e.t_creado) + make_interval(hours => (1 + floor(e.r5 * 48))::int))
    from _dp_env e
   cross join lateral (select t.tipo,
        case t.tipo
          when 'incidencia_transporte' then 'Retraso en la entrega'
          when 'cambio_fecha_hora_carga' then 'Cambio de la hora de carga'
          when 'albaran' then 'Falta el albarán firmado'
          when 'facturacion_consulta' then 'Consulta sobre la factura del envío'
          when 'pago_consulta' then 'Pago duplicado'
          when 'transportista_conductor' then 'El conductor no lleva EPI'
          when 'cancelacion_transporte' then 'Cancelación del envío a última hora'
          when 'siniestro' then 'Mercancía dañada en la descarga'
          else 'Otra consulta' end titulo,
        case t.tipo when 'siniestro' then 'Tres palés volcados al abrir la lona. Adjuntamos fotos.' when 'incidencia_transporte' then 'El camión llega con 5 horas de retraso.'
             else 'Detalle de la incidencia (dato de prueba).' end detalle,
        case when e.dia < v_hoy - 30 then case when e.r6 < .85 then 'resuelto' when e.r6 < .95 then 'cancelado' else 'en_curso' end
             else (array['abierto','abierto','en_curso','resuelto'])[1 + floor(e.r6 * 4)::int] end estado,
        (array['baja','media','media','media','alta','critica'])[1 + floor(e.r7 * 6)::int] prioridad
      from (select (array['incidencia_transporte','incidencia_transporte','incidencia_transporte','cambio_fecha_hora_carga','albaran','albaran','facturacion_consulta',
                          'pago_consulta','transportista_conductor','cancelacion_transporte','siniestro','otros'])[1 + floor(e.r8 * 12)::int] tipo) t) x
    join tipos_incidencia ti on ti.clave = x.tipo
   where e.estado not in ('borrador') and e.r3 < .021 and e.r2 > .5;
  -- Penalizaciones: cancelaciones tardías con camión y algunas paralizaciones y paradas de más.
  insert into penalizaciones (envio_id, tipo_id, descripcion, importe_cliente, importe_transportista, estado, generada_auto, creado_en)
  select e.id, (select id from tipos_penalizacion where clave = 'cancelacion'), 'Cancelación después de las 9:00 del día hábil anterior a la carga.',
         e.imp_c, e.imp_t,
         case when e.dia < v_hoy - 15 then case when e.r7 < .7 then 'confirmada' else 'cancelada' end else 'pendiente_confirmar' end::estado_penalizacion,
         true, e.t_cancelado
    from _dp_env e where e.clase = 'cancel_con' and e.r5 < .5 and e.op_id is null and e.imp_c is not null;
  insert into penalizaciones (envio_id, tipo_id, descripcion, importe_cliente, importe_transportista, estado, editada_a_mano, creado_en)
  select e.id, tp.id, x.descr, x.ic, x.it,
         case when e.dia < v_hoy - 15 then (array['confirmada','confirmada','cancelada'])[1 + floor(e.r7 * 3)::int] else 'pendiente_confirmar' end::estado_penalizacion,
         e.r8 < .3, coalesce(e.t_entregado, e.t_cargado, e.t_creado)
    from _dp_env e
   cross join lateral (select case when e.r6 < .5 then 'paralizacion' when e.r6 < .75 then 'parada_adicional' when e.r6 < .9 then 'compensacion' else 'otro' end clave) c
   cross join lateral (select case c.clave when 'paralizacion' then 'Paralización de ' || (3 + floor(e.r5 * 9))::int || ' horas en la descarga.'
                                           when 'parada_adicional' then 'Parada adicional no prevista en la ruta.'
                                           when 'compensacion' then 'Compensación al transportista por espera.' else 'Otros gastos (peaje extraordinario).' end descr,
                              case when c.clave <> 'compensacion' then round(80 + e.r4 * 320) end ic,
                              round(60 + e.r4 * 250) it) x
    join tipos_penalizacion tp on tp.clave = c.clave
   where e.estado = 'entregado' and e.transportista_id is not null and e.r3 > .99;
  insert into cmr_enlaces (envio_id, caduca_en, revocado, creado_en)
  select e.id, e.t_asignado + interval '60 days', e.estado = 'entregado' and e.r4 < .1, e.t_asignado
    from _dp_env e where e.transportista_id is not null and e.t_asignado is not null
     and (e.estado in ('hacia_la_carga', 'cargando', 'en_ruta') or (e.estado = 'entregado' and e.dia >= v_hoy - 20 and e.r5 < .7));
  insert into cmr_reservas (envio_id, parada_id, rol, texto, incidencia_id, creado_en)
  select e.id, (select p.id from envio_paradas p where p.envio_id = e.id and p.tipo = 'descarga' order by p.orden desc limit 1),
         (array['destinatario','destinatario','remitente','transportista'])[1 + floor(e.r1 * 4)::int],
         (array['Dos palés con el film roto.','Faltan 3 bultos respecto al albarán.','Mercancía recibida con humedad.','Se carga sin precinto.'])[1 + floor(e.r2 * 4)::int],
         (select i.id from incidencias i where i.envio_id = e.id limit 1), coalesce(e.t_entregado, e.t_cargado)
    from _dp_env e where e.estado in ('entregado', 'en_ruta') and e.transportista_id is not null and (e.r8 > .995 or exists (select 1 from incidencias i where i.envio_id = e.id and e.r1 < .3));
  v_tiempos := v_tiempos || jsonb_build_object('incidencias_penalizaciones_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 14. Almacenamientos en los almacenes de Dynamo ------------------------------------
  v_t := clock_timestamp();
  insert into almacenamientos (cliente_id, almacen_id, fecha_entrada, fecha_salida, num_trailers, descripcion, referencia_cliente, num_repartos,
                               sitio_entrega_id, distancia_entrega_km, importe_almacenaje, importe_reparto, iva_pct, requiere_pago_previo, estado, pagado_en, creado_en)
  select x.cli_id, x.alm_id, x.entrada, x.entrada + x.dias, x.trailers, v_merc[1 + floor(x.r1 * cardinality(v_merc))::int], 'ALM-' || x.g,
         case when x.sitio is null then 0 else x.repartos end, case when x.repartos > 0 then x.sitio end,
         case when x.repartos > 0 and x.sitio is not null then round(2 + x.r2 * 18, 2) end,
         x.trailers * greatest(1, ceil(greatest(x.dias, 1) / 7.0)) * x.precio_semana,
         case when x.sitio is null then 0 else x.repartos end * x.precio_reparto,
         x.iva, x.sin_credito,
         case when x.r3 < .05 then 'cancelado' when x.entrada + x.dias < v_hoy then 'finalizado' when x.entrada <= v_hoy then 'en_almacen'
              when x.r3 < .5 then 'confirmado' else 'pendiente_confirmar' end::estado_almacenamiento,
         case when x.sin_credito and x.entrada <= v_hoy then (x.entrada - 2)::timestamptz end,
         (x.entrada - 5)::timestamptz
    from (select g, c.id cli_id, c.sin_credito, cl.iva_pct iva, a.id alm_id, a.precio_almacenamiento_semana precio_semana, a.precio_reparto,
                 v_hoy - 700 + floor(random() * 740)::int entrada, 3 + floor(power(random(), 2) * 60)::int dias,
                 (array[1,1,1,1,2,2,3,4,6,10])[1 + floor(random() * 10)::int] trailers, floor(power(random(), 2) * 4)::int repartos,
                 (select s.id from sitios s where s.cliente_id = c.id and not s.borrado order by random() + g * 0 limit 1) sitio,
                 random()::numeric r1, random()::numeric r2, random()::numeric r3
            from generate_series(1, greatest(6, round(400 * k))::int) g
           cross join lateral (select c.id, c.sin_credito from _dp_cli c where c.n = v_af[1 + floor(random() * cardinality(v_af) + g * 0)::int]) c
            join clientes cl on cl.id = c.id
           cross join lateral (select a.* from sitios a where a.es_almacen_dynamo and a.anotaciones = v_marca order by random() + g * 0 limit 1) a) x;
  update sitios set disponible = false where es_almacen_dynamo and anotaciones = v_marca and nombre_empresa like '%Barcelona%';
  v_tiempos := v_tiempos || jsonb_build_object('almacenamientos_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 15. Consultas de precio del tarifador ---------------------------------------------
  v_t := clock_timestamp();
  insert into consultas_precio (cliente_id, origen, cuando)
  select c.id, 'tarifador', now() - make_interval(mins => floor(power(random(), 1.6) * 1051200 + g * 0)::int)
    from generate_series(1, greatest(30, round(25000 * k))::int) g
   cross join lateral (select c.id from _dp_cli c where c.n = v_ac[1 + floor(random() * cardinality(v_ac) + g * 0)::int]) c;
  v_tiempos := v_tiempos || jsonb_build_object('consultas_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 16. Valoraciones medias de los transportistas --------------------------------------
  update transportistas t set valoracion_dynamo = x.vd, valoracion_dynamo_votos = x.nd, valoracion_clientes = x.vc, valoracion_clientes_votos = x.nc
    from (select transportista_id, round(avg(valoracion_transportista)::numeric, 1) vd, count(valoracion_transportista) nd,
                 round(avg(valoracion_cliente)::numeric, 1) vc, count(valoracion_cliente) nc
            from envios where transportista_id in (select id from _dp_tra) group by 1) x
   where x.transportista_id = t.id and (x.nd > 0 or x.nc > 0);

  -- ---- 17. Cuentas para entrar a probar (solo con p_clave_cuentas) -------------------------
  v_t := clock_timestamp();
  if p_clave_cuentas is not null then
    -- Empresas «bien pobladas» para las cuentas: muchos envíos y de todos los estados.
    create temp table _dp_acc (o serial, email text, rol text, nombre text, cargo text, telefono text, cliente_id uuid, transportista_id uuid, real boolean default false,
                               estado text default 'activa') on commit drop;
    insert into _dp_acc (email, rol, nombre, cargo, telefono) values
      ('empleado1@prueba.invalid', 'empleado', 'Lucía Fernández Ortega', 'Gestora de tráfico', '+34600100101'),
      ('empleado2@prueba.invalid', 'empleado', 'Javier Moreno Castillo', 'Gestor de tráfico internacional', '+34600100102'),
      ('lectura1@prueba.invalid', 'empleado_lectura', 'Marina Gil Serrano', 'Atención al cliente (solo lectura)', '+34600100103'),
      ('lectura2@prueba.invalid', 'empleado_lectura', 'Óscar Núñez Ibáñez', 'Contabilidad externa (solo lectura)', '+34600100104'),
      ('direccion@prueba.invalid', 'admin_lectura', 'Carmen Ruiz Delgado', 'Dirección (lectura)', '+34600100105');
    insert into _dp_acc (email, rol, nombre, cargo, telefono, cliente_id)
    select 'cliente' || x.o || '@prueba.invalid', 'cliente', x.nombre, 'Jefe de tráfico', prueba_telefono('ES', 800000 + x.o), x.id
      from (select row_number() over (order by s.prio, s.n desc) o, s.id, s.nombre from (
              select c.id, count(*) n, 1 prio, 'Rocío Peña Castaño' nombre from envios e join _dp_cli c on c.id = e.cliente_id
               where c.estado = 'activa' and not c.sin_credito and c.pais_iso = 'ES' and c.n > 8 group by c.id order by n desc limit 1) s
            union all select 2, s.id, s.nombre from (
              select c.id, 'Iñaki Etxeberria Goikoetxea' nombre from envios e join _dp_cli c on c.id = e.cliente_id
               where c.estado = 'activa' and not c.sin_credito and c.pais_iso = 'ES' and c.n > 8 group by c.id order by count(*) desc offset 5 limit 1) s
            union all select 3, s.id, s.nombre from (
              select c.id, 'François Lefèvre' nombre from envios e join _dp_cli c on c.id = e.cliente_id
               where c.estado = 'activa' and c.sin_credito group by c.id order by count(*) desc limit 1) s) x;
    insert into _dp_acc (email, rol, nombre, cargo, telefono, transportista_id)
    select 'transportista' || x.o || '@prueba.invalid', 'transportista', x.nombre, x.cargo, prueba_telefono('ES', 810000 + x.o), x.id
      from (select 1 o, (select t.id from _dp_tra t where t.n = 1) id, 'Manuel Ruiz Peñalver' nombre, 'Jefe de tráfico' cargo
            union all select 2, (select t.id from envios e join _dp_tra t on t.id = e.transportista_id where not t.autonomo and t.n > 3 and t.estado_op = 'activo'
                                  group by t.id order by count(*) desc limit 1), 'Ştefan Popescu', 'Tráfico'
            union all select 3, (select t.id from envios e join _dp_tra t on t.id = e.transportista_id where t.autonomo and t.pais_iso = 'ES' and t.estado_op = 'activo'
                                  group by t.id order by count(*) desc limit 1), null, 'Titular') x
     where x.id is not null;
    update _dp_acc a set nombre = t.persona_nombre from _dp_tra t where t.id = a.transportista_id and a.nombre is null;
    -- Altas online sin verificar todavía (una sin empresa, otra de un transportista).
    insert into _dp_acc (email, rol, nombre, cargo, telefono, transportista_id, estado) values
      ('alta.online1@prueba.invalid', 'cliente', 'Nuria Expósito Zúñiga', null, prueba_telefono('ES', 820001), null, 'pendiente_verificacion'),
      ('alta.online2@prueba.invalid', 'transportista', 'Seán O''Connor', 'Owner', prueba_telefono('IE', 820002), (select id from _dp_tra where n = 7), 'pendiente_verificacion');
    -- Cuentas con los datos reales del usuario (nunca en el repositorio: llegan como parámetro).
    for v_x in select * from jsonb_array_elements(coalesce(p_cuentas_reales, '[]')) loop
      v_mail := lower(trim(v_x ->> 'email')); v_rol := v_x ->> 'rol';
      v_tel := nullif(regexp_replace(coalesce(v_x ->> 'telefono', ''), '[^0-9+]', '', 'g'), '');
      if v_mail is null or v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        v_reales := v_reales || jsonb_build_object('email', v_mail, 'resultado', 'email no válido: no se crea'); continue;
      end if;
      if v_rol not in ('empleado', 'cliente', 'transportista') then
        v_reales := v_reales || jsonb_build_object('email', v_mail, 'rol', v_rol, 'resultado', 'rol no admitido (empleado, cliente o transportista): no se crea'); continue;
      end if;
      if exists (select 1 from auth.users u where lower(u.email) = v_mail) or exists (select 1 from _dp_acc a where a.email = v_mail) then
        v_reales := v_reales || jsonb_build_object('email', v_mail, 'rol', v_rol, 'resultado', 'ya existe una cuenta con ese email: no se toca'); continue;
      end if;
      if v_tel is not null and v_tel !~ '^\+?[0-9]{6,15}$' then
        v_reales := v_reales || jsonb_build_object('email', v_mail, 'aviso', 'teléfono no válido: la cuenta se crea sin teléfono'); v_tel := null;
      end if;
      v_cli := null; v_tra := null;
      if v_rol = 'cliente' then
        select c.id into v_cli from envios e join _dp_cli c on c.id = e.cliente_id
         where c.estado = 'activa' and not c.sin_credito and c.n > 8 and c.id not in (select cliente_id from _dp_acc where cliente_id is not null)
         group by c.id order by count(distinct e.estado) desc, count(*) desc limit 1;
      elsif v_rol = 'transportista' then
        select t.id into v_tra from envios e join _dp_tra t on t.id = e.transportista_id
         where t.estado_op = 'activo' and t.m > 1 and t.n_con > 1 and t.id not in (select transportista_id from _dp_acc where transportista_id is not null)
         group by t.id order by count(distinct e.estado) desc, count(*) desc limit 1;
      end if;
      insert into _dp_acc (email, rol, nombre, cargo, telefono, cliente_id, transportista_id, real)
      values (v_mail, v_rol, coalesce(nullif(trim(v_x ->> 'nombre'), ''), split_part(v_mail, '@', 1)),
              case v_rol when 'empleado' then 'Gestor (cuenta real de pruebas)' else 'Cuenta real de pruebas' end, v_tel, v_cli, v_tra, true);
    end loop;

    -- pgcrypto (esquema extensions en Supabase): la contraseña se guarda cifrada, como hace Supabase Auth.
    if v_supabase then execute 'select extensions.crypt($1, extensions.gen_salt(''bf''))' into v_clave using p_clave_cuentas; end if;
    for ac in select * from _dp_acc order by o loop
      v_uid := gen_random_uuid();
      if v_supabase then
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, raw_app_meta_data, raw_user_meta_data,
                                created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                                email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', ac.email, v_clave, now(),
                case when ac.rol in ('empleado', 'empleado_lectura', 'admin_lectura') then now() end,
                '{"provider": "email", "providers": ["email"]}', jsonb_build_object('nombre', ac.nombre), now(), now(), '', '', '', '', '', '', '', '');
        if v_identities then
          insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          values (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', ac.email, 'email_verified', true, 'phone_verified', false),
                  'email', now(), now(), now());
        end if;
      else
        insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, invited_at)
        values (v_uid, ac.email, jsonb_build_object('nombre', ac.nombre), now(),
                case when ac.rol in ('empleado', 'empleado_lectura', 'admin_lectura') then now() end);
      end if;
      -- El perfil lo crea el alta (cliente, pendiente); aquí recibe su rol, su empresa y la marca.
      update usuarios set rol = ac.rol::rol_usuario, estado = ac.estado::estado_cuenta, cliente_id = ac.cliente_id, transportista_id = ac.transportista_id,
                          nombre = ac.nombre, telefono = ac.telefono, cargo = ac.cargo, exento_autosuspension = true,
                          ultima_conexion = now() - interval '1 day', anotaciones = v_marca
       where id = v_uid;
      -- Las cuentas reales reciben también los avisos de su empresa: su email y teléfono en el contacto de tráfico.
      if ac.real and (ac.cliente_id is not null or ac.transportista_id is not null) then
        update contactos set email = ac.email, telefono = coalesce(ac.telefono, telefono), nombre = ac.nombre, recibe_avisos = true, usuario_id = v_uid
         where es_principal and funcion = 'trafico' and (cliente_id = ac.cliente_id or transportista_id = ac.transportista_id);
      end if;
      insert into conexion_minutos (usuario_id, dia, minutos, ultimo)
      select v_uid, d::date, 5 + floor(random() * 200)::int, (d::date + time '17:00') at time zone 'Europe/Madrid'
        from generate_series(v_hoy - 20, v_hoy - 1, interval '1 day') d where extract(isodow from d) < 6 and random() < .7;
      insert into avisos_vistos (usuario_id, visto_en) values (v_uid, now() - interval '2 days');
      if ac.real then
        v_reales := v_reales || jsonb_build_object('email', ac.email, 'rol', ac.rol, 'resultado', 'creada',
          'empresa', coalesce((select razon_social from clientes where id = ac.cliente_id), (select razon_social from transportistas where id = ac.transportista_id)),
          'telefono_compartido', ac.telefono is not null and (select count(*) from _dp_acc a where a.telefono = ac.telefono and a.real) > 1);
      else
        v_cuentas := v_cuentas || jsonb_build_object('email', ac.email, 'rol', ac.rol, 'nombre', ac.nombre,
          'empresa', coalesce((select razon_social from clientes where id = ac.cliente_id), (select razon_social from transportistas where id = ac.transportista_id)));
      end if;
    end loop;
    -- Unas consultas del tarifador hechas desde las cuentas de cliente (pocas: no saltan los límites).
    insert into consultas_precio (usuario_id, cliente_id, origen, cuando)
    select u.id, u.cliente_id, 'tarifador', now() - make_interval(days => d, hours => 2)
      from usuarios u join _dp_acc a on a.email = u.email cross join generate_series(1, 12) d where a.rol = 'cliente';
  end if;
  v_tiempos := v_tiempos || jsonb_build_object('cuentas_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  -- ---- 18. Avisos de la campana (los últimos días) ---------------------------------------
  v_t := clock_timestamp();
  insert into avisos (para, cliente_id, transportista_id, tipo, nivel, titulo, texto, enlace, envio_id, creado_en)
  select a.para, a.cli, a.tra, a.tipo, a.nivel, a.titulo || ' · #' || en.referencia_gx, a.texto, '/panel/envios?ver=' || e.id, e.id, a.cuando
    from _dp_env e join envios en on en.id = e.id
   cross join lateral (values
      ('cliente', e.cliente_id, null::uuid, 'asignado', 'ok', 'Tu envío ya tiene transportista', null::text, e.t_asignado),
      ('transportista', null, e.transportista_id, 'asignada', 'ok', 'Envío asignado', 'Revisa los datos y la orden de carga.', e.t_asignado),
      ('cliente', e.cliente_id, null, 'en_ruta', 'info', 'Cargado y en ruta', null, e.t_cargado),
      ('cliente', e.cliente_id, null, 'entregado', 'ok', 'Entregado', null, e.t_entregado),
      ('cliente', e.cliente_id, null, 'cancelado', 'aviso', 'Envío cancelado', 'Si no lo esperabas, llámanos al ' || tel_dynamo() || '.', case when e.clase <> 'anulado' and e.t_confirmado is not null then e.t_cancelado end),
      ('cliente', e.cliente_id, null, 'pago_caducado', 'aviso', 'Envío anulado: no recibimos el pago', 'Pasó el plazo para pagar. Si aún lo necesitas, vuelve a pedirlo: el precio se recalcula.', case when e.clase = 'anulado' then e.t_cancelado end),
      ('transportista', null, e.transportista_id, 'cancelada', 'urgente', 'Envío cancelado', 'No vayas a cargar. Si tienes dudas, llámanos al ' || tel_dynamo() || '.', case when e.transportista_id is not null then e.t_cancelado end),
      ('cliente', e.cliente_id, null, 'precio', 'ok', 'Ya tienes precio', euros_texto(e.imp_c) || ' + IVA. Revísalo y acéptalo antes de que caduque.', case when e.est_sol = 'precio_propuesto' then e.t_creado + interval '20 minutes' end),
      ('dynamo', null, null, 'importe_contraoferta_cliente', 'aviso', 'Contraoferta del cliente', 'El cliente propone ' || euros_texto(round(e.imp_c * 0.9)) || ' (le dimos ' || euros_texto(e.imp_c) || ').', case when e.est_sol = 'contraoferta' then e.t_creado + interval '50 minutes' end),
      ('dynamo', null, null, 'cancelado', 'aviso', 'Cancelado por el cliente', 'Lo ha cancelado el cliente.', case when e.estado = 'cancelado' and e.clase <> 'anulado' then e.t_cancelado end),
      ('dynamo', null, null, 'pagado', 'ok', 'Pago recibido', 'Ya se puede asignar.', case when e.est_pago = 'pagado' then e.t_confirmado + interval '3 hours' end)
   ) a(para, cli, tra, tipo, nivel, titulo, texto, cuando)
   where a.cuando is not null and a.cuando >= now() - interval '21 days' and (a.para <> 'transportista' or a.tra is not null);
  -- Avisos que crearon los disparadores sin envío (incidencias): no se podrían borrar luego.
  delete from avisos where para = 'dynamo' and envio_id is null and creado_en = now();
  v_tiempos := v_tiempos || jsonb_build_object('avisos_s', round(extract(epoch from clock_timestamp() - v_t), 1));


  -- ---- 19. Casos límite repartidos por todas partes ---------------------------------------
  v_t := clock_timestamp();
  -- Texto: dirección larguísima, CIF escrito «a mano» (minúsculas, guiones y puntos: se normaliza),
  -- y la misma empresa como cliente y como transportista, una con el CIF con «ES» delante.
  update clientes set direccion = 'Polígono Industrial de la Vega Baja del Guadalquivir y Marismas de Doñana, Parcela 14-B, Nave 7, Puerta Trasera junto a la báscula municipal, frente a la gasolinera de la antigua carretera nacional N-IV, kilómetro 552,300, margen derecha según se va hacia Cádiz (preguntar en la garita)'
   where id = (select id from _dp_cli where n = 1);
  update clientes set cif = lower(substr(cif, 1, 1)) || '-' || substr(cif, 2, 2) || '.' || substr(cif, 4, 3) || '.' || substr(cif, 7) where id = (select id from _dp_cli where n = 9);
  update transportistas set cif = 'ES' || (select cif from clientes where id = (select id from _dp_cli where n = 10)) where id = (select id from _dp_tra where n = 5);
  update sitios set direccion = repeat('Camino Viejo de la Ermita de San Bartolomé, ', 6) || 's/n' where id = (select id from _dp_sit order by sn limit 1);
  -- La misma matrícula en otras empresas (dadas de baja: solo puede haber una activa).
  insert into vehiculos (transportista_id, matricula, tipo, activo, creado_en)
  select (select id from _dp_tra where n = 6 + g), v.matricula, v.tipo::tipo_vehiculo, false, now() - interval '700 days'
    from (select matricula, tipo, row_number() over (order by vn) g from _dp_veh where activo and tipo <> 'remolque' and vn % 991 = 0 limit 6) v;
  -- Sitios: horario de verano, sábados por la mañana, abiertos 24 h, sin horario, y uno en cada país.
  insert into sitio_horarios (sitio_id, dia_semana, abre, cierra, temporada)
  select s.id, d, time '07:00', time '15:00', 'verano' from _dp_sit s, generate_series(1, 5) d where s.r3 < .05;
  insert into sitio_horarios (sitio_id, dia_semana, abre, cierra) select s.id, 6, time '09:00', time '13:00' from _dp_sit s where s.r2 > .9;
  delete from sitio_horarios where sitio_id in (select id from _dp_sit where r4 between .5 and .52);
  insert into sitio_horarios (sitio_id, dia_semana, abre, cierra) select s.id, d, time '00:00', time '23:59' from _dp_sit s, generate_series(1, 7) d where s.r4 between .5 and .51;
  delete from sitio_horarios where sitio_id in (select id from _dp_sit where r4 between .53 and .56);   -- sin horario
  insert into sitios (nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon, anotaciones, cliente_id, requiere_cita, tiene_medios_carga)
  select 'Delegación ' || u.nombre, 'almacen_nave', 'Zona logística, nave ' || u.i, u.cpostal, u.nombre, u.provincia, u.pais_iso, u.lat, u.lon, v_marca,
         (select id from _dp_cli where rk = 1), u.i % 2 = 0, u.i % 3 <> 0
    from (select distinct on (pais_iso) * from _dp_ciu order by pais_iso, peso desc) u;
  -- Clientes con el crédito casi agotado (mucho envío pendiente de cobro con poco riesgo concedido).
  update clientes set riesgo_cesce_euros = 1500, riesgo_cesce_plazo_dias = 60 where id in (select id from _dp_cli where rk in (4, 7, 12));
  -- Envíos con muchas incidencias y con varias penalizaciones.
  insert into incidencias (tipo_id, envio_id, transportista_id, titulo, detalle, estado, prioridad, creado_en)
  select (select id from tipos_incidencia where clave = (array['incidencia_transporte','albaran','siniestro','facturacion_consulta','transportista_conductor','otros'])[g]),
         e.id, e.transportista_id, 'Incidencia ' || g || ' de ' || 6 || ' en el mismo envío', 'Caso límite: muchas incidencias a la vez.',
         (array['abierto','en_curso','resuelto','cancelado','abierto','en_curso'])[g]::estado_incidencia, (array['baja','media','alta','critica','media','alta'])[g]::prioridad_incidencia,
         coalesce(e.t_cargado, e.t_creado) + make_interval(hours => g)
    from (select * from _dp_env where estado = 'entregado' and transportista_id is not null and dia >= v_hoy - 60 order by n limit 3) e, generate_series(1, 6) g;
  insert into penalizaciones (envio_id, tipo_id, descripcion, importe_cliente, importe_transportista, estado, creado_en)
  select e.id, (select id from tipos_penalizacion where clave = (array['paralizacion','parada_adicional','compensacion'])[g]), 'Caso límite: varias penalizaciones en el mismo envío (' || g || ').',
         case when g <> 3 then 150.55 * g end, 99.99 * g, (array['pendiente_confirmar','confirmada','cancelada'])[g]::estado_penalizacion, coalesce(e.t_entregado, e.t_creado)
    from (select * from _dp_env where estado = 'entregado' and transportista_id is not null and dia >= v_hoy - 90 order by n desc limit 2) e, generate_series(1, 3) g;
  -- Contraofertas del cliente aceptadas y rechazadas.
  update envios e set importe_contraoferta_cliente = round(e.importe_cliente * 0.95, 2), importe_cliente_inicial = round(e.importe_cliente / 0.95, 2),
                      contraoferta_cliente_en = e.creado_en + interval '40 minutes'
   where e.id in (select id from _dp_env where est_sol = 'aceptada' and r4 < .4) and e.importe_cliente is not null;
  update envios e set importe_contraoferta_cliente = round(e.importe_cliente * 0.80, 2), importe_cliente_inicial = e.importe_cliente,
                      contraoferta_cliente_en = e.creado_en + interval '30 minutes'
   where e.id in (select id from _dp_env where est_sol = 'precio_propuesto' and r2 < .4);
  -- Ruta cambiada (precio a revisar) en algunos programados.
  insert into envio_hitos (envio_id, hito, cuando, datos)
  select id, 'ruta_cambiada', now() - interval '3 hours', '{"motivo": "Se añade una parada (caso límite)"}'::jsonb
    from _dp_env where clase in ('prog_sin', 'prog_con') and r8 < .06;
  -- CMR firmado a medias (solo el remitente) y entero; la imagen de la firma NO existe en Storage.
  insert into firmas_cmr (envio_id, parada_id, rol, nombre, documento, documento_pais, documento_validado, email, firma_storage_ruta)
  select e.id, case when x.rol = 'destinatario' then (select p.id from _dp_par p where p.en = e.n and p.orden = e.np) else (select p.id from _dp_par p where p.en = e.n and p.orden = 1) end,
         x.rol, (v_nom -> 'ES' ->> (e.n % 50)::int) || ' ' || (v_ape -> 'ES' ->> (e.n % 60)::int), prueba_id_fiscal('ES', true, 8000000 + e.n), 'ES', true,
         prueba_email('firma', e.n), 'pruebas/firma-inexistente-' || e.n || '-' || x.rol || '.png'
    from (select * from _dp_env where transportista_id is not null and estado in ('en_ruta', 'entregado') and dia >= v_hoy - 10 and r5 < .25) e
   cross join lateral (select unnest(case when e.estado = 'entregado' and e.r6 < .5 then array['remitente','transportista','destinatario'] else array['remitente'] end) rol) x;
  -- Cuentas: un cliente cerca del límite de consultas diarias (14 de 15 hoy).
  insert into consultas_precio (usuario_id, cliente_id, origen, cuando)
  select u.id, u.cliente_id, 'tarifador', now() - make_interval(mins => g * 10) from usuarios u, generate_series(1, 14) g where u.email = 'cliente2@prueba.invalid';
  v_tiempos := v_tiempos || jsonb_build_object('casos_limite_s', round(extract(epoch from clock_timestamp() - v_t), 1));

  v_tiempos := v_tiempos || jsonb_build_object('total_s', round(extract(epoch from clock_timestamp() - v_t0), 1));
  return jsonb_build_object('resultado', 'ok', 'escala', k, 'tiempos', v_tiempos,
    'filas', contar_datos_de_prueba(),
    'cuentas', v_cuentas, 'cuentas_reales', v_reales,
    'clave', case when p_clave_cuentas is null then 'sin cuentas (pasa p_clave_cuentas para crearlas)' else 'la que has pasado en p_clave_cuentas (no se guarda en claro)' end,
    'nota', 'Todo lleva la marca «dato_de_prueba» (etiqueta en clientes y transportistas, nota interna, emails @prueba.invalid) y se quita con borrar_datos_de_prueba(''SI, ES EL PROYECTO DE PRUEBAS'').');
end $fn$;
