'use client';

// Volver a pedir los datos de la página después de guardar algo, SIN el salto raro de
// «el botón vuelve a como estaba y al rato cambia».
//
// router.refresh() no avisa de cuándo llegan los datos nuevos: el botón dejaba de girar en
// cuanto el servidor contestaba «guardado», pero la pantalla seguía mostrando lo de antes
// hasta que llegaba la página nueva. Aquí el refresco va dentro de una transición de React,
// y mientras dura se ve el mismo cargador de Dynamo: cuando desaparece, el cambio ya está
// en pantalla. Los refrescos automáticos de fondo (cada X segundos) NO deben usar esto.
import { createContext, useCallback, useContext, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Cargando from '@/components/Cargando';

const Ctx = createContext<(() => void) | null>(null);

export function RefrescoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const refrescar = useCallback(() => start(() => router.refresh()), [router]);
  return (
    <Ctx.Provider value={refrescar}>
      {children}
      {pendiente && <Cargando texto="Actualizando" />}
    </Ctx.Provider>
  );
}

export function useRefrescar() {
  const enMarco = useContext(Ctx);
  const router = useRouter();
  const [, start] = useTransition();
  return enMarco ?? (() => start(() => router.refresh()));
}
