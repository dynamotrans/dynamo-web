'use client';

// Campos OBLIGATORIOS sin rellenar al enviar un formulario (criterio del usuario,
// 2026-11-09): siempre salta el aviso, la ventana se desplaza hasta el primero y los
// campos quedan con el borde en rojo hasta que se tocan. Cada formulario llama a
// `avisaFaltas` con los ids de sus campos vacíos, además de poner su mensaje de error.
export function avisaFaltas(ids: string[]) {
  const els = ids.map((i) => document.getElementById(i)).filter(Boolean) as HTMLElement[];
  for (const el of els) {
    el.classList.add('campo-falta');
    const quitar = () => el.classList.remove('campo-falta');
    el.addEventListener('input', quitar, { once: true });
    el.addEventListener('change', quitar, { once: true });
  }
  els[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
