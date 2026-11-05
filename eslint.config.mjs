// Revisión automática del código (ESLint): las reglas de Next.js (React, hooks, accesibilidad
// básica, TypeScript). Se pasa en el CI con «npm run lint»; la compilación no la repite.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  // La web pública estática, el mockup congelado y lo que se genera no se revisan aquí.
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'js/**', 'scripts/**', 'tools/**', 'emails/**', '*.html', 'sw.js', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Imágenes con <img> a propósito: logos y fotos pequeñas de public/ (sin el optimizador
      // de Next, que pide otra regla en la política de seguridad y no aporta aquí).
      '@next/next/no-img-element': 'off',
      // «any» = sin comprobar el tipo. Se van quitando con los tipos generados de la base de
      // datos (lib/supabase/tipos.ts); mientras, aviso.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default config;
