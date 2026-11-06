// Aviso de errores del navegador (Sentry). APAGADO sin NEXT_PUBLIC_SENTRY_DSN en Vercel.
// El DSN de Sentry es público por diseño (solo sirve para enviar avisos), no es una clave.
import { iniciarAvisoErrores } from '@/lib/avisoError';

iniciarAvisoErrores();
