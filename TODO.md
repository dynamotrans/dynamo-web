# TODO — dynamo-web

Pendientes del proyecto. Claude lee este archivo al empezar cada sesión y lo actualiza al terminar.

## 🔥 Prioridad alta
<!-- Cosas urgentes -->
- [ ] **Logos reales de 25 clientes nuevos del carrusel** (el usuario los proporcionará la semana del 20/04). Cuando lleguen: colocarlos en `/images/logos/` como `[slug].png` y reemplazar el div `<div class="logo-icon logo-initial">X</div>` por `<div class="logo-icon"><img loading="lazy" src="images/logos/[slug].png" alt="[Nombre]"></div>` en los 2 sets del carrusel.
  - Empresas pendientes de logo: Krypton, Gramoflor, Ferreira (Frutas Hermanos), Ecorreciclajes Garrido, Astel Logistics, Transmetálicas, Dimasiber, Enfriatec, Coavantia, Agrosegria, Todoembalaje, Hydrodiseño, Químicas Oro, Subiñas, Jumasa, Brello, Pantoja, Silmisa, Piscimar, BigMat, Strugal, Parangon Solar, Cotain, Urbaluz, Rimobel.

## 📋 Normal
<!-- Cosas que hacer cuando haya tiempo -->
- [ ] **Tarifador: Google Places API key**
  - El usuario debe crearla en Google Cloud Console (mismo proyecto que usa en n8n, pero **key NUEVA**, no reutilizar la de n8n)
  - APIs a activar: Places API (New) + Maps JavaScript API
  - Restricción por HTTP referrers: `dynamotrans.com`, subdominios `*.vercel.app` del proyecto, `localhost:3000`
  - Una vez la pase, integrar autocompletado en campos origen/destino del tarifador (#tarifador)
  - Enviar al sheet: texto completo + `place_id` + `lat` / `lng` para evitar ambigüedades
- [ ] **Tarifador: Google Sheet con fórmulas de tarifas**
  - El usuario lo prepara. Contiene fórmulas que calculan precio a partir de origen/destino (km), peso, tipo mercancía, tipo palé, urgencia y plataforma
  - Montar Apps Script como Web App que recibe POST, escribe fila y devuelve precio calculado
- [ ] **Tarifador: conectar frontend con Apps Script**
  - Reemplazar el `setTimeout` placeholder en el JS (`t-submit` handler) por un `fetch()` real al Web App URL
  - Mantener el spinner + mensajes rotativos (UX ya está bien)
  - Manejar errores (timeout, sin internet, datos inválidos)
- [ ] **Lanzar tarifador a producción** (previsto en ~1 mes, cuando los 3 puntos anteriores estén listos). Merge `claude/hola-3kYzp` → `main`

## 💡 Ideas / Futuro
<!-- Mejoras a considerar -->
- [ ] **Portal de usuarios** clientes + proveedores (fase futura, NO urgente)
  - Stack recomendado: Next.js en subcarpeta `/portal` + Supabase (auth + DB gratis)
  - Definir antes qué ve cada rol: historial envíos, facturas, documentos CMR, tracking...
  - Mismo repo que la web actual (contexto unificado para Claude)
- [ ] Si el tarifador genera muchas consultas: añadir reCAPTCHA o honeypot para evitar abuso
- [ ] Tarifador con Distance Matrix en la propia web (no solo en sheet) → cálculo más preciso

## ✅ Hecho recientemente
<!-- Claude mueve aquí las tareas completadas. Se limpia cada ~2 semanas -->
- [x] 2026-04-14 — Configurar GitHub Codespaces (.devcontainer)
- [x] 2026-04-14 — Crear CLAUDE.md con reglas de push, catch-up y cierre
- [x] 2026-04-14 — Reemplazar logo nav base64 por images/2.png (ahorra 28 KB)
- [x] 2026-04-14 — Recuadro hero con gradiente sólido morado
- [x] 2026-04-14 — Reordenar secciones (Servicios → Vehículos → Mercancía → Why)
- [x] 2026-04-14 — Títulos servicios más grandes + subrayado gradiente
- [x] 2026-04-14 — Mover stats strip bajo Cotiza banner
- [x] 2026-04-14 — Actualizar +230 → +480 clientes en 8 sitios
- [x] 2026-04-14 — Vehículos: ancho 2,45m, rígido 14 Tn, apertura lateral/trasero/techo
- [x] 2026-04-14 — Añadir 25 clientes nuevos al carrusel (como pills con inicial, pendiente logo real)
- [x] 2026-04-14 — Tarifador visual prototype (en preview, no producción)
