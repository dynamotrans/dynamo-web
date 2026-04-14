# dynamo-web — Instrucciones para Claude

## Proyecto
Sitio estático HTML servido con `python3 -m http.server 3000`.

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

### 2. Antes de empezar a trabajar
Si se detecta que el repositorio puede estar desactualizado (por ejemplo, porque se acaba de abrir el Codespace desde otro Mac), sugerir `git pull` antes de hacer cambios.

### 3. Rama de trabajo
Respetar la rama indicada en las instrucciones de sesión. No cambiar de rama sin permiso.
