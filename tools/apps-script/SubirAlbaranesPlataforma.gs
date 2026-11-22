/**
 * SUBIR ALBARANES A LA PLATAFORMA (Dynamo, 2026-11-22)
 * ---------------------------------------------------------------------------------------------
 * Proyecto de Apps Script NUEVO y SEPARADO: no toca el clasificador ni la tarea de Claude que
 * ya funcionan. Cada 15 minutos mira la carpeta de Drive donde la tarea deja los albaranes
 * (02-ALBARANES) y sube a la plataforma los archivos nuevos. Allí esperan en «Verificación
 * albaranes», sin que el cliente los vea, hasta que alguien de Dynamo los acepta.
 *
 * Si un archivo ya se subió, la plataforma responde «ya_existe» y no se vuelve a mandar.
 * Por eso no guarda ninguna lista: se puede ejecutar las veces que haga falta.
 *
 * Configuración (Configuración del proyecto ⚙ → Propiedades del script):
 *   URL_PLATAFORMA  → https://<la dirección de la plataforma>   (sin barra al final)
 *   TOKEN           → la MISMA clave larga que ENTRADA_DOCUMENTOS_TOKEN en Vercel (no se escribe en ningún otro sitio)
 *   CARPETA_ID      → id de la carpeta 02-ALBARANES (lo que va tras /folders/ en su dirección)
 *   DESDE           → (opcional) fecha AAAA-MM-DD: solo archivos creados desde ese día. Si no se pone,
 *                     los de los últimos 7 días.
 *   BYPASS_VERCEL   → (opcional, solo para la dirección de PRUEBAS de Vercel, que pide inicio de sesión)
 *                     el «Protection Bypass for Automation» de Vercel → Settings → Deployment Protection.
 * Luego: ejecutar una vez «instalar» (pide permisos de Drive y de conexión externa) y listo.
 */

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'subirAlbaranes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('subirAlbaranes').timeBased().everyMinutes(15).create();
  subirAlbaranes();
}

function subirAlbaranes() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('URL_PLATAFORMA') || '').replace(/\/+$/, '');
  var token = p.getProperty('TOKEN') || '';
  var carpetaId = p.getProperty('CARPETA_ID') || '';
  if (!url || !token || !carpetaId) throw new Error('Faltan URL_PLATAFORMA, TOKEN o CARPETA_ID en las propiedades del script.');
  var desdeTxt = p.getProperty('DESDE');
  var desde = desdeTxt ? new Date(desdeTxt + 'T00:00:00') : new Date(Date.now() - 7 * 24 * 3600 * 1000);
  var cache = CacheService.getScriptCache();
  var limite = Date.now() + 5 * 60 * 1000;   // máximo 5 minutos por pasada
  var subidos = 0, repetidos = 0, fallos = 0;

  var archivos = DriveApp.getFolderById(carpetaId).searchFiles(
    "createdDate >= '" + Utilities.formatDate(desde, 'UTC', "yyyy-MM-dd'T'HH:mm:ss") + "' and trashed = false");
  while (archivos.hasNext() && Date.now() < limite) {
    var f = archivos.next();
    var tipo = f.getMimeType();
    if (tipo !== 'application/pdf' && tipo.indexOf('image/') !== 0) continue;
    if (cache.get('ok_' + f.getId())) { repetidos++; continue; }
    try {
      var r = llamar(url, token, { accion: 'iniciar', nombre: f.getName(), origen: 'drive', origen_id: f.getId(),
        datos: { carpeta: 'Drive', creado_en_drive: f.getDateCreated().toISOString() } });
      if (r.resultado === 'ya_existe') { cache.put('ok_' + f.getId(), '1', 21600); repetidos++; continue; }
      if (r.resultado !== 'ok') { fallos++; console.warn('No entra ' + f.getName() + ': ' + r.resultado); continue; }
      var put = UrlFetchApp.fetch(r.subir_a, { method: 'put', contentType: tipo, payload: f.getBlob().getBytes(), muteHttpExceptions: true });
      if (put.getResponseCode() >= 300) { fallos++; console.warn('Subida fallida ' + f.getName() + ': ' + put.getResponseCode()); continue; }
      var c = llamar(url, token, { accion: 'confirmar', id: r.id });
      if (c.resultado === 'ok' || c.resultado === 'duplicado' || c.resultado === 'ya_existe') { cache.put('ok_' + f.getId(), '1', 21600); subidos++; }
      else { fallos++; console.warn('No confirmado ' + f.getName() + ': ' + c.resultado); }
    } catch (e) { fallos++; console.warn('Error con ' + f.getName() + ': ' + e); }
  }
  console.log('Subidos ' + subidos + ' · ya estaban ' + repetidos + ' · fallos ' + fallos);
}

function llamar(url, token, cuerpo) {
  var res = UrlFetchApp.fetch(url + '/api/documentos-entrada', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo),
    headers: cabeceras(token), muteHttpExceptions: true,
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { resultado: 'http_' + res.getResponseCode() }; }
}

function cabeceras(token) {
  var h = { Authorization: 'Bearer ' + token };
  var bypass = PropertiesService.getScriptProperties().getProperty('BYPASS_VERCEL');
  if (bypass) h['x-vercel-protection-bypass'] = bypass;
  return h;
}
