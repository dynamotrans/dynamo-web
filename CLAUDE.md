# dynamo-web — Instrucciones para Claude

## Proyecto
Sitio estático HTML servido con `python3 -m http.server 3000`.

## Hosting / Despliegue
- **Vercel** conectado a GitHub (rama `main`).
- Cada push a `main` se publica automáticamente en producción.
- Tener en cuenta posibles errores de build en Vercel al hacer cambios.

## Flujo de trabajo con 2 Macs + GitHub Codespaces
El usuario trabaja desde 2 Macs diferentes usando GitHub Codespaces para mantener un único entorno sincronizado en la nube.

## REGLAS IMPORTANTES

### 1. Nunca hacer push automático
**SIEMPRE preguntar antes de hacer `git push`.** El usuario quiere revisar los cambios y dar el OK explícitamente antes de subir nada a GitHub.

Flujo esperado:
1. Hacer los cambios solicitados
2. Mostrar un resumen de lo modificado
3. Hacer `git add` y `git commit` localmente si procede
4. **Preguntar al usuario**: "¿Subo los cambios a GitHub? (push)"
5. Esperar confirmación explícita antes de `git push`

### 2. Antes de empezar a trabajar (catch-up automático)
Al iniciar cualquier sesión nueva, **Claude DEBE automáticamente**:

1. **Sugerir `git pull`** si el repo puede estar desactualizado (por trabajar desde otro Mac).
2. **Leer la sección "Bitácora"** de este archivo (más abajo) y resumir las últimas 2-3 entradas al usuario.
3. **Leer `TODO.md`** (si existe) y mostrar los pendientes abiertos.
4. Dar un saludo tipo:
   > "👋 Bienvenido de vuelta. Última sesión el [fecha] en [Mac]: [resumen]. Pendientes: [lista de TODO.md]. ¿Por dónde seguimos?"

### 3. Al terminar la sesión (bitácora automática)
Antes de cerrar o cuando el usuario diga "hemos acabado" / "ya está" / "gracias" / similar, **Claude DEBE**:

1. **Añadir una entrada a la sección "Bitácora"** de este archivo con:
   - Fecha (YYYY-MM-DD)
   - Mac usado (si se sabe, preguntar si no: "¿Desde qué Mac estás trabajando, casa u oficina?")
   - Resumen en 2-4 bullets de lo que se hizo
   - Pendientes detectados (que también se añaden a `TODO.md`)
2. Hacer commit con mensaje tipo `chore: update bitácora [fecha]`.
3. **Preguntar antes de push** (regla 1).

### 4. Rama de trabajo
Respetar la rama indicada en las instrucciones de sesión. No cambiar de rama sin permiso.

---

## Bitácora

Registro automático de sesiones. La entrada más reciente va arriba.

<!-- FORMATO:
### YYYY-MM-DD — [Mac casa | Mac oficina | Codespace]
- Bullet de lo que se hizo
- Otro bullet
- **Pendiente**: lo que quedó a medias
-->

### 2026-04-14 — Codespace
- Configurado GitHub Codespaces (`.devcontainer/devcontainer.json`)
- Creado `CLAUDE.md` con reglas de push-confirmation y catch-up automático
- Creado `TODO.md` para pendientes manuales
- Añadida sección de Bitácora (esta misma)
