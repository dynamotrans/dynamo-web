# Emails de acceso (Supabase Auth) con el diseño de la plataforma

Estos emails NO los manda la plataforma: los manda Supabase con sus propias plantillas. Para que
lleguen con el mismo diseño que el resto (cabecera morada, botones, firma y pie), hay que pegar
cada archivo en el panel de Supabase, una vez por proyecto (pruebas y, al publicar, producción).

**Dónde:** Supabase → el proyecto → Authentication → Emails → Templates (y la pestaña de avisos
de seguridad para los dos últimos). En cada plantilla: copiar el **Asunto** de abajo y pegar el
contenido entero del archivo en el cuadro del mensaje (vista «Source» / HTML). Guardar.

| Archivo | Plantilla de Supabase | Asunto |
|---|---|---|
| `1-confirmar-alta.html` | Confirm signup | Tu código para entrar en Dynamo: {{ .Token }} |
| `2-codigo-para-entrar.html` | Magic Link | Tu código para entrar en Dynamo: {{ .Token }} |
| `3-invitacion.html` | Invite user | Te han invitado a la plataforma de Dynamo |
| `4-contrasena-nueva.html` | Reset Password | Crea una contraseña nueva · Dynamotrans.com |
| `5-cambio-de-email.html` | Change Email Address | Confirma tu nuevo email · Dynamo |
| `6-aviso-contrasena-cambiada.html` | Password changed (aviso de seguridad) | Tu contraseña ha cambiado · Dynamo |
| `7-aviso-email-cambiado.html` | Email address changed (aviso de seguridad) | El email de tu cuenta ha cambiado · Dynamo |

**Ojo con el enlace del botón.** Las plantillas usan `{{ .ConfirmationURL }}`, el enlace estándar
de Supabase (la pantalla /panel/confirmar lo acepta). Si la plantilla que hay ahora en Supabase usa
otro enlace (por ejemplo uno con `token_hash`), deja ESE enlace en el `href` del botón.

**Cómo se generan.** Con la función `email_con_diseno()` de la base de datos (el mismo envoltorio
que el resto de emails), así que los datos del pie salen de Parámetros. Si cambian el diseño o los
datos de la empresa, se vuelven a generar y se pegan otra vez.
