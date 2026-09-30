#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera las hojas de sección (URL propia por servicio) desde UNA sola plantilla.

FUENTE ÚNICA de las 8 páginas /grupajes, /carga-completa, /transporte-internacional,
/cobertura, /vehiculos, /mercancias, /opiniones y /contacto.

Para cambiar la cabecera, el menú, el pie, los botones de contacto o el texto de
cualquier sección: se edita AQUÍ y se regeneran las 8 de una vez con

    python3 tools/generar-hojas-seccion.py

Lo demás también es compartido y no se toca aquí:
  · el aspecto de las páginas  -> css/landing.css
  · el selector de idiomas     -> css/idiomas.css + js/idiomas.js (los mismos que la home)
  · los enlaces de contacto y la cabecera de Google (Consent Mode + GTM + Ads)
    se leen de index.html al generar, así que nunca se quedan desfasados.

Este archivo NO se publica: .vercelignore lo deja fuera del despliegue.
"""
import re, os, html

REPO = "/home/user/dynamo-web"
BASE = "https://www.dynamotrans.com"
src = open(os.path.join(REPO, "index.html"), encoding="utf-8").read()

# --- CTAs: se reutilizan TAL CUAL los enlaces de la one-page (mensaje preformateado) ---
MAILTO = re.search(r'href="(mailto:info@dynamotrans\.com\?subject=Solicitud%20de%20TARIFA[^"]+)"', src).group(1)
WA     = re.search(r'href="(https://wa\.me/34628995709\?text=Buenos[^"]+)"', src).group(1)
TEL    = "tel:+34955225945"

# --- cabecera de Google (consent mode + GTM + gtag) copiada de index.html ---
GHEAD = src[src.index("<!-- Google Consent Mode v2"):src.index("<!-- SEO Basico")].rstrip()

PAISES = ["Portugal","Francia","Alemania","Italia","Países Bajos","Bélgica","Luxemburgo",
          "Austria","Polonia","República Checa","Irlanda (Norte y Sur)","Dinamarca"]

MENU = [
    ("grupajes",                 "Grupajes"),
    ("carga-completa",           "Carga completa"),
    ("transporte-internacional", "Internacional"),
    ("cobertura",                "Cobertura"),
    ("vehiculos",                "Vehículos"),
    ("mercancias",               "Mercancías"),
    ("opiniones",                "Opiniones"),
    ("contacto",                 "Contacto"),
]
RESUMEN = {
    "grupajes":"Carga parcial: pagas solo tu espacio.",
    "carga-completa":"Camión completo, sin transbordos.",
    "transporte-internacional":"Importación y exportación en Europa.",
    "cobertura":"Toda España y 12 países de Europa.",
    "vehiculos":"Trailer tauliner y rígido con plataforma.",
    "mercancias":"Qué transportamos y para qué sectores.",
    "opiniones":"Lo que dicen más de 480 empresas.",
    "contacto":"Tarifa por email, WhatsApp o teléfono.",
}

ICO_MAIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>'
ICO_WA   = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
ICO_TEL  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>'

def botones(tel_claro=False):
    return f"""<div class="lp-btns">
        <a class="lp-btn lp-btn-mail" href="{MAILTO}">{ICO_MAIL} Pedir tarifa por email</a>
        <a class="lp-btn lp-btn-wa" target="_blank" rel="noopener" href="{WA}">{ICO_WA} WhatsApp +34 628 995 709</a>
        <a class="lp-btn lp-btn-tel" href="{TEL}">{ICO_TEL} 955 225 945</a>
      </div>"""

def menu(actual):
    CUR = ' aria-current="page"'
    items = "".join(
        '<a href="/%s"%s>%s</a>' % (s, CUR if s == actual else "", t)
        for s, t in MENU)
    return f'<nav class="lp-menu" aria-label="Secciones"><div class="lp-menu-in"><a href="/">Inicio</a>{items}</div></nav>'

def relacionados(actual):
    otros = [(s, t) for s, t in MENU if s != actual][:4]
    cards = "".join(
        f'<a href="/{s}"><b>{t}</b><span>{RESUMEN[s]}</span></a>' for s, t in otros)
    return f"""<section class="lp-sec alt"><div class="lp-wrap">
      <h2>Otras <span>secciones</span></h2>
      <div class="lp-rel">{cards}</div>
      <p style="margin-top:1.2rem"><a href="/">← Volver a la web completa de Dynamo</a></p>
    </div></section>"""

TRUST = """<div class="lp-trust"><div class="lp-trust-in">
  <div><div class="lp-trust-n">+480</div><div class="lp-trust-l">Clientes confían en nosotros</div></div>
  <div><div class="lp-trust-s">★★★★★</div><div class="lp-trust-n" style="font-size:1.2rem">5,0</div><div class="lp-trust-l">en Google Reviews</div></div>
  <div><div class="lp-trust-n">250.000 €</div><div class="lp-trust-l">Seguro MAPFRE</div></div>
  <div><div class="lp-trust-n">24/7</div><div class="lp-trust-l">Atención al cliente</div></div>
</div></div>"""

FOOT = """<footer class="lp-foot"><div class="lp-wrap">
  <div class="lp-foot-grid">
    <div>
      <img src="/images/1.png" alt="Dynamo" style="height:36px;margin-bottom:.5rem">
      <p>Operador de transporte autorizado. Grupajes, carga completa e internacional en España y Europa.</p>
      <p style="margin-top:.5rem">Dynamo Operador Logístico, S.L. · CIF ESB01596360 · O.T. 12548918-1</p>
    </div>
    <div>
      <h4>Secciones</h4>
      <ul>__SECCIONES__</ul>
    </div>
    <div>
      <h4>Contacto</h4>
      <ul>
        <li>Email: <a href="mailto:info@dynamotrans.com">info@dynamotrans.com</a></li>
        <li>WhatsApp: <a target="_blank" rel="noopener" href="https://wa.me/34628995709">+34 628 995 709</a></li>
        <li>Teléfono: <a href="tel:+34955225945">+34 955 225 945</a></li>
      </ul>
      <p style="margin-top:.6rem">Email y WhatsApp: Lunes a Viernes 8:00-18:00<br>Teléfono: Lunes a Jueves 9:00-14:00 y 15:00-17:00 · Viernes 9:00-14:00</p>
    </div>
  </div>
  <div class="lp-foot-bot">
    <span>© 2025 Dynamo Operador de Transportes · Todos los derechos reservados</span>
    <span><a href="/#aviso-legal">Aviso legal</a> · <a href="/#privacidad">Privacidad</a> · <a href="/#cookies">Cookies</a></span>
  </div>
</div></footer>"""
FOOT = FOOT.replace("__SECCIONES__", "".join(f'<li><a href="/{s}">{t}</a></li>' for s, t in MENU))

COOKIE = """<div class="lp-cookie" id="lpCookie" role="dialog" aria-label="Aviso de cookies">
  <div class="lp-cookie-in">
    <p>Usamos cookies propias y de terceros para medir el uso de la web y la eficacia de nuestros anuncios. Puedes aceptarlas o rechazarlas. <a href="/#cookies">Política de cookies</a></p>
    <button type="button" onclick="lpCookie('reject')">Rechazar</button>
    <button type="button" class="ok" onclick="lpCookie('accept')">Aceptar</button>
  </div>
</div>
<script>
function lpCookie(c){
  var d=new Date(); d.setFullYear(d.getFullYear()+1);
  document.cookie='cookie_consent='+c+'; expires='+d.toUTCString()+'; path=/; SameSite=Lax';
  var g=(c==='accept')?'granted':'denied';
  gtag('consent','update',{ad_user_data:g,ad_personalization:g,ad_storage:g,analytics_storage:g});
  document.getElementById('lpCookie').classList.remove('show');
}
if(document.cookie.indexOf('cookie_consent=')===-1){
  setTimeout(function(){document.getElementById('lpCookie').classList.add('show');},900);
}
</script>"""

PLANTILLA = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
{ghead}

<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{base}/{slug}">

<meta name="theme-color" content="#3300cc">
<link rel="icon" type="image/png" href="/images/DYNAMO-NEW-LOGO.png">
<link rel="apple-touch-icon" href="/images/DYNAMO-NEW-LOGO.png">

<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{base}/images/og-dynamo.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="{base}/{slug}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="Dynamo Transportes">
<meta name="twitter:card" content="summary_large_image">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/landing.css">
<link rel="stylesheet" href="/css/idiomas.css">
<script defer src="/js/idiomas.js"></script>

<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
 {{"@type":"ListItem","position":1,"name":"Inicio","item":"{base}/"}},
 {{"@type":"ListItem","position":2,"name":"{h1txt}","item":"{base}/{slug}"}}]}}
</script>
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"Service","serviceType":"{h1txt}",
 "provider":{{"@type":"MovingCompany","name":"Dynamo Operador Logistico S.L.","url":"{base}",
   "telephone":"+34955225945","email":"info@dynamotrans.com",
   "address":{{"@type":"PostalAddress","streetAddress":"Paseo de las Delicias 1","addressLocality":"Sevilla","postalCode":"41001","addressCountry":"ES"}}}},
 "areaServed":{areaserved},
 "description":"{desc}","url":"{base}/{slug}"}}
</script>
</head>
<body>

<header class="lp-top"><div class="lp-top-in">
  <a class="lp-logo" href="/"><img src="/images/2.png" alt="Dynamo — Always Moving"><span class="notranslate" translate="no">Always<br>Moving.</span></a>
  <div class="lp-top-right">
    <!-- Lo pinta js/idiomas.js: misma lista de idiomas que la home -->
    <div class="lang-selector notranslate" translate="no" data-lang-selector></div>
    <a class="lp-top-cta" href="/#contacto">Pedir tarifa</a>
  </div>
</div></header>
{menu}

<section class="lp-hero">
  {herobg}
  <div class="lp-hero-in">
    <p class="lp-breadcrumb"><a href="/">Inicio</a> › {h1txt}</p>
    <p class="lp-eyebrow">{eyebrow}</p>
    <h1>{h1}</h1>
    <p class="lp-lead">{lead}</p>
    {botones}
  </div>
</section>
{trust}
{cuerpo}
{relacionados}

<section class="lp-end"><div class="lp-wrap">
  <h2>Cuéntanos tu transporte y te damos <span>tarifa</span></h2>
  <p>Origen, destino y qué mueves. Respondemos rápido, nacional o internacional.</p>
  {botones_end}
</div></section>

{foot}
{cookie}
</body>
</html>
"""

def pagina(slug, title, desc, eyebrow, h1, lead, cuerpo, herobg="", areaserved='"ES"'):
    h1txt = re.sub(r"<[^>]+>", "", h1)
    return PLANTILLA.format(
        ghead=GHEAD, title=html.escape(title, quote=True), desc=html.escape(desc, quote=True),
        base=BASE, slug=slug, h1=h1, h1txt=html.escape(h1txt, quote=True), eyebrow=eyebrow,
        lead=lead, cuerpo=cuerpo, menu=menu(slug), trust=TRUST, herobg=herobg,
        botones=botones(), botones_end=botones(), relacionados=relacionados(slug),
        foot=FOOT, cookie=COOKIE, areaserved=areaserved)

def hero_img(ruta, alt):
    return f'<img class="lp-hero-bg" src="{ruta}" alt="{alt}" fetchpriority="high">'

NOTA_FLOTA = ('<p class="lp-sub" style="font-size:.85rem;color:var(--gray-500)">Trabajamos '
  '<strong style="color:var(--navy)">exclusivamente con trailer tauliner (lona corredera) y rígido con '
  'plataforma</strong>. No disponemos de pisos móviles, bañeras basculantes, frigoríficos ni servicio de '
  'granel o temperatura controlada.</p>')

AREA_EU = '["ES","PT","FR","DE","IT","NL","BE","LU","AT","PL","CZ","IE","GB","DK"]'

PAGINAS = []

# ---------------------------------------------------------------- GRUPAJES
PAGINAS.append(pagina(
  "grupajes",
  "Grupajes nacionales e internacionales | Dynamo Transportes",
  "Grupaje de mercancía paletizada en España y Europa: pagas solo el espacio que ocupas. Recogida en 24 h y entrega en 24-48 h. Operador de transporte autorizado. Pide tarifa.",
  "Carga parcial",
  "<em>Grupajes</em> nacionales e internacionales",
  "Comparte espacio en el camión y paga solo por los metros que ocupas. La opción más económica cuando tu carga no llena un tráiler completo.",
  f"""<section class="lp-sec"><div class="lp-wrap">
    <h2>Cuándo te interesa el <span>grupaje</span></h2>
    <p class="lp-sub">Si tu envío ocupa entre 1 y 12 metros lineales, no tiene sentido pagar un camión entero. En grupaje tu mercancía viaja con la de otros clientes y el coste se reparte.</p>
    <ul class="lp-list">
      <li><strong>Recogida en 24 h</strong> y entrega habitual en 24-48 h en península.</li>
      <li><strong>Mercancía paletizada</strong> (seca), palot/box y cargas especiales.</li>
      <li><strong>Pagas por metros lineales</strong>, no por el camión completo.</li>
      <li><strong>Seguro MAPFRE de 250.000 €</strong> en todos los envíos.</li>
      <li><strong>Nacional e internacional</strong>: toda España y 12 países de Europa.</li>
    </ul>
    {NOTA_FLOTA}
  </div></section>
  <section class="lp-sec alt"><div class="lp-wrap">
    <h2>Grupaje o <span>carga completa</span></h2>
    <div class="lp-cards">
      <div class="lp-card">
        <h3>Grupaje</h3>
        <p>Tu mercancía comparte camión. Mejor precio para envíos pequeños y medianos. Puede haber transbordo en plataforma.</p>
      </div>
      <div class="lp-card dark">
        <h3>Carga completa</h3>
        <p>El camión va solo para ti, directo de origen a destino, sin transbordos. Más rápido y más seguro para cargas grandes o delicadas.</p>
        <p style="margin-top:.7rem"><a href="/carga-completa" style="color:#7ef0b0;font-weight:700">Ver carga completa →</a></p>
      </div>
    </div>
    <p class="lp-sub">¿No sabes cuál te conviene? Dinos qué mueves y te lo decimos nosotros: muchas veces sale mejor de lo que parece.</p>
  </div></section>""",
  hero_img("/images/FOTO%201%20-%20copia55420ac5170e2.jpeg", "Carga de palets en un tráiler tauliner"),
  AREA_EU))

# ---------------------------------------------------------- CARGA COMPLETA
PAGINAS.append(pagina(
  "carga-completa",
  "Carga completa de tráiler en España y Europa | Dynamo Transportes",
  "Camión completo sin transbordos, directo de origen a destino. Tráiler tauliner de 13,30 m, 24 Tn y 33 europalets. Nacional e internacional. Pide tarifa al instante.",
  "Tráfico directo",
  "<em>Carga completa</em>: el camión es tuyo",
  "Sin transbordos ni paradas intermedias: tu mercancía sale del origen y llega al destino en el mismo camión. Máxima rapidez y máxima seguridad.",
  f"""<section class="lp-sec"><div class="lp-wrap">
    <h2>Qué entra en un <span>tráiler completo</span></h2>
    <div class="lp-specs">
      <div class="lp-spec"><div class="lp-spec-l">Largo (interior)</div><div class="lp-spec-v">13,30 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Ancho (interior)</div><div class="lp-spec-v">2,45 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Altura</div><div class="lp-spec-v">2,70 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Carga máx.</div><div class="lp-spec-v">24 Tn</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Palé europeo</div><div class="lp-spec-v">33 uds. (120x80)</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Palé americano</div><div class="lp-spec-v">26 uds. (120x100)</div></div>
    </div>
    <ul class="lp-list">
      <li><strong>Entrega directa origen-destino</strong>, sin plataformas intermedias.</li>
      <li><strong>Apertura lateral, trasera y de techo</strong>: carga por donde te convenga.</li>
      <li><strong>Tráfico directo</strong> para cargas urgentes o delicadas.</li>
      <li><strong>Seguro MAPFRE de 250.000 €</strong> y asistencia 24 h ante incidencias.</li>
    </ul>
    {NOTA_FLOTA}
  </div></section>
  <section class="lp-sec alt"><div class="lp-wrap">
    <h2>También en <span>rígido con plataforma</span></h2>
    <p class="lp-sub">Cuando el destino no tiene muelle ni carretilla, el camión rígido de 8 m con plataforma elevadora y transpaleta resuelve la descarga. Hasta 14 Tn y 20 europalets.</p>
    <p style="margin-top:1rem"><a href="/vehiculos"><strong>Ver los dos tipos de vehículo y sus medidas →</strong></a></p>
  </div></section>""",
  hero_img("/images/HERO-DYNAMO.webp", "Tráiler de Dynamo en autopista"),
  AREA_EU))

# ------------------------------------------------- TRANSPORTE INTERNACIONAL
chips_eu = "".join(f'<span class="lp-chip">{p}</span>' for p in PAISES)
PAGINAS.append(pagina(
  "transporte-internacional",
  "Transporte internacional: importación y exportación en Europa | Dynamo",
  "Importación y exportación por carretera entre España y Portugal, Francia, Alemania, Italia, Países Bajos, Bélgica, Luxemburgo, Austria, Polonia, República Checa, Irlanda y Dinamarca.",
  "Import & Export",
  "Transporte <em>internacional</em> por carretera",
  "Llevamos y traemos tu mercancía entre España y toda Europa, en grupaje o en camión completo, con plazos cerrados y un único interlocutor.",
  f"""<section class="lp-sec"><div class="lp-wrap">
    <h2>Importación y <span>exportación</span></h2>
    <div class="lp-cards">
      <div class="lp-card">
        <h3>Importación</h3>
        <p>Recogemos en cualquier punto de Europa y entregamos hasta la puerta de tu empresa, con plazos garantizados.</p>
      </div>
      <div class="lp-card">
        <h3>Exportación</h3>
        <p>Salidas desde toda España hacia Europa, en grupaje cuando no llenas camión y en completa cuando sí.</p>
      </div>
    </div>
    <h2 style="margin-top:2.2rem">Países a los que <span>llegamos</span></h2>
    <div class="lp-chips"><span class="lp-chip es">España</span>{chips_eu}</div>
    <p class="lp-sub" style="font-size:.85rem;color:var(--gray-500)">Servicio por carretera en territorio continental; a las islas llegamos donde hay carretera o puente.</p>
    <p style="margin-top:1rem"><a href="/cobertura"><strong>Ver el mapa de cobertura →</strong></a></p>
  </div></section>""",
  hero_img("/images/AdobeStock_154376791.jpeg", "Transporte internacional de mercancías"),
  AREA_EU))

# --------------------------------------------------------------- COBERTURA
PAGINAS.append(pagina(
  "cobertura",
  "Cobertura: toda España y 12 países de Europa | Dynamo Transportes",
  "Cubrimos toda España con servicio nacional en 24 h y 12 países de Europa: Portugal, Francia, Alemania, Italia, Países Bajos, Bélgica, Luxemburgo, Austria, Polonia, República Checa, Irlanda y Dinamarca.",
  "Dónde llegamos",
  "Cobertura en España y <em>Europa</em>",
  "Servicio nacional en 24 h en toda la península y tráfico regular con doce países europeos, en grupaje y en carga completa.",
  f"""<section class="lp-sec"><div class="lp-wrap">
    <h2>Toda <span>España</span></h2>
    <p class="lp-sub">Recogidas y entregas en cualquier provincia peninsular, con salidas diarias. Trabajamos desde Sevilla con oficinas en Madrid, Barcelona, Valencia y Bilbao.</p>
    <h2 style="margin-top:2.2rem">Y estos países de <span>Europa</span></h2>
    <div class="lp-chips"><span class="lp-chip es">España</span>{chips_eu}</div>
    <p class="lp-sub" style="font-size:.85rem;color:var(--gray-500)">Transporte por carretera en territorio continental; a las islas llegamos donde hay carretera o puente.</p>
    <p style="margin-top:1.4rem"><a href="/#cobertura"><strong>Ver el mapa interactivo de cobertura en la web →</strong></a></p>
  </div></section>""",
  "", AREA_EU))

# --------------------------------------------------------------- VEHÍCULOS
PAGINAS.append(pagina(
  "vehiculos",
  "Tipos de vehículo: tráiler tauliner y rígido con plataforma | Dynamo",
  "Nuestra flota: tráiler tauliner de 13,30 m (24 Tn, 33 europalets) y rígido de 8 m con plataforma y transpaleta (14 Tn, 20 europalets). Medidas y capacidades exactas.",
  "Nuestra flota",
  "Tipos de <em>vehículo</em> y medidas",
  "Disponemos del vehículo adecuado para cada tipo de carga: tráiler tauliner para el grueso del transporte y rígido con plataforma cuando en destino no hay medios de descarga.",
  f"""<section class="lp-sec"><div class="lp-wrap">
    <h2>Tráiler tauliner — <span>cortina / lona corredera</span></h2>
    <p class="lp-sub">Similar a un furgón tipo caja, con cortinas correderas en lados y techo que dan fácil acceso a la carga. El vehículo más utilizado para envíos terrestres. Ideal para mercancía paletizada, palot/box y mercancías especiales.</p>
    <div class="lp-specs">
      <div class="lp-spec"><div class="lp-spec-l">Largo (interior)</div><div class="lp-spec-v">13,30 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Ancho (interior)</div><div class="lp-spec-v">2,45 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Altura</div><div class="lp-spec-v">2,70 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Carga máx.</div><div class="lp-spec-v">24 Tn</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Apertura</div><div class="lp-spec-v">Lateral, trasero y techo</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Palé europeo</div><div class="lp-spec-v">33 uds. (120x80)</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Palé americano</div><div class="lp-spec-v">26 uds. (120x100)</div></div>
    </div>
  </div></section>
  <section class="lp-sec alt"><div class="lp-wrap">
    <h2>Rígido con plataforma y <span>transpaleta</span></h2>
    <p class="lp-sub">Tipo tauliner con cortinas correderas. Ideal para cargas donde no existen medios de carga y/o descarga en destino: entregas urbanas y puntos sin muelle.</p>
    <div class="lp-specs">
      <div class="lp-spec"><div class="lp-spec-l">Largo</div><div class="lp-spec-v">8 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Ancho (interior)</div><div class="lp-spec-v">2,45 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Altura</div><div class="lp-spec-v">2,40 m</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Carga máx.</div><div class="lp-spec-v">14 Tn</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Apertura</div><div class="lp-spec-v">Lateral, trasero y techo</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Palé europeo</div><div class="lp-spec-v">20 uds. (120x80)</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Palé americano</div><div class="lp-spec-v">16 uds. (120x100)</div></div>
      <div class="lp-spec"><div class="lp-spec-l">Equipamiento</div><div class="lp-spec-v">Plataforma + transpaleta</div></div>
    </div>
    {NOTA_FLOTA}
  </div></section>""",
  "", AREA_EU))

# -------------------------------------------------------------- MERCANCÍAS
PAGINAS.append(pagina(
  "mercancias",
  "Qué mercancías transportamos: sectores y tipos de carga | Dynamo",
  "Distribución general, industria y construcción, maquinaria y eventos. Mercancía paletizada seca, palot/box y cargas especiales en España y Europa.",
  "Qué transportamos",
  "Tipos de <em>mercancía</em> y sectores",
  "Experiencia en sectores muy distintos. Si no ves tu caso, pregúntanos: lo habitual es que podamos moverlo.",
  """<section class="lp-sec"><div class="lp-wrap">
    <div class="lp-cards">
      <div class="lp-card"><h3>Distribución general</h3><p>Bienes de consumo, alimentación, bebidas, higiene y limpieza, electrodomésticos, logística de palets.</p></div>
      <div class="lp-card"><h3>Industria y construcción</h3><p>Textil, manufacturera, muebles, automoción, farmacéutica, estructuras, áridos, fertilizantes y abonos. Materias primas: plástico, madera, aluminio, acero…</p></div>
      <div class="lp-card"><h3>Maquinaria</h3><p>Maquinaria de construcción, equipos de laboratorio y equipos industriales.</p></div>
      <div class="lp-card"><h3>Eventos</h3><p>Deportivos, culturales, conciertos, teatros, festivales, empresariales, exposiciones y políticos.</p></div>
    </div>
    <h2 style="margin-top:2.2rem">Cómo tiene que ir la <span>carga</span></h2>
    <ul class="lp-list">
      <li>Mercancía <strong>paletizada (seca)</strong>, palot/box y cargas especiales.</li>
      <li>Se necesitan <strong>medios de carga y descarga</strong> en origen y destino (carretilla o transpaleta). Si no los hay, valoramos camión con plataforma elevadora.</li>
      <li>Los puntos de carga y entrega suelen ser <strong>naves o almacenes accesibles para un tráiler</strong>. Si es una obra, avísanos al pedir la tarifa.</li>
    </ul>
    """ + NOTA_FLOTA + """
  </div></section>""",
  "", AREA_EU))

# --------------------------------------------------------------- OPINIONES
PAGINAS.append(pagina(
  "opiniones",
  "Opiniones de clientes: +480 empresas y 5,0★ en Google | Dynamo",
  "Más de 480 empresas confían en Dynamo para su transporte, con una valoración de 5,0 sobre 5 en Google. Atención personalizada con el mismo gestor de transporte.",
  "Lo que dicen nuestros clientes",
  "<em>Opiniones</em> y clientes",
  "Más de 480 empresas de sectores muy distintos mueven su mercancía con nosotros, con una valoración media de 5,0 sobre 5 en Google.",
  """<section class="lp-sec"><div class="lp-wrap">
    <h2>Por qué repiten con <span>Dynamo</span></h2>
    <div class="lp-cards">
      <div class="lp-card"><h3>Confianza, calidad y compromiso</h3><p>Garantizamos que la mercancía llega en tiempo y en perfectas condiciones. Seguro de 250.000 € con MAPFRE.</p></div>
      <div class="lp-card"><h3>Rapidez e inmediatez</h3><p>En logística la inmediatez es esencial. Respondemos a las necesidades de nuestros clientes al instante.</p></div>
      <div class="lp-card"><h3>Atención personalizada</h3><p>Siempre el mismo gestor de transporte. Equipo cualificado que atiende de forma directa e individualizada.</p></div>
      <div class="lp-card"><h3>Operador autorizado</h3><p>Tarjeta O.T. 12548918-1 · CIF B01596360 · Asistencia 24 h para incidencias y urgencias.</p></div>
    </div>
    <p class="lp-sub" style="margin-top:1.6rem"><a href="/#testimonios"><strong>Leer las reseñas completas en la web →</strong></a></p>
  </div></section>""",
  "", AREA_EU))

# ---------------------------------------------------------------- CONTACTO
PAGINAS.append(pagina(
  "contacto",
  "Contacto y tarifa al instante | Dynamo Transportes",
  "Pide tarifa de transporte por email, WhatsApp o teléfono. Operador de transporte autorizado en Sevilla, con servicio en toda España y Europa. Respondemos rápido.",
  "¿Listo para empezar?",
  "Contacta y recibe tu <em>tarifa</em>",
  "Dinos qué mercancía mueves, si es grupaje o camión completo y los códigos postales de origen y destino. Con eso te damos precio.",
  """<section class="lp-sec"><div class="lp-wrap">
    <h2>Qué necesitamos para <span>darte precio</span></h2>
    <ul class="lp-list">
      <li><strong>Qué mercancía es</strong>: paletizada, maquinaria, etc.</li>
      <li><strong>Carga completa o grupaje</strong> (si es parcial, metros lineales y peso aproximado).</li>
      <li><strong>Códigos postales o localidades</strong> de origen y destino.</li>
    </ul>
    <h2 style="margin-top:2.2rem">Horarios de <span>atención</span></h2>
    <div class="lp-cards">
      <div class="lp-card"><h3>Email y WhatsApp</h3><p>Lunes a Viernes, 8:00–18:00</p></div>
      <div class="lp-card"><h3>Teléfono</h3><p>Lunes a Jueves 9:00–14:00 y 15:00–17:00 · Viernes 9:00–14:00</p></div>
      <div class="lp-card"><h3>Urgencias</h3><p>Asistencia 24 h para incidencias de envíos en curso.</p></div>
    </div>
    <p class="lp-sub" style="margin-top:1.6rem">Dynamo Operador Logístico, S.L. · CIF ESB01596360 · Tarjeta O.T. 12548918-1<br>Paseo de las Delicias 1, planta 5ª · 41001 Sevilla</p>
    <p><a href="/#contacto"><strong>Ver todos los horarios del año en la web →</strong></a></p>
  </div></section>""",
  "", AREA_EU))

for (slug, _), doc in zip(MENU, PAGINAS):
    open(os.path.join(REPO, slug + ".html"), "w", encoding="utf-8").write(doc)
    print("escrito", slug + ".html", len(doc), "bytes")
