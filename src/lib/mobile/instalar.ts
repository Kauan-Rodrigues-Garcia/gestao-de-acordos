/**
 * «Instalar app» — o convite de instalação do navegador (Android/Chrome) e o
 * passo a passo do iPhone, que não tem convite.
 *
 * O Chrome dispara `beforeinstallprompt` UMA vez, logo ao carregar a página —
 * antes de a rota lazy `/m` existir. Por isso a captura começa no `main.tsx`
 * (`iniciarCapturaInstalacao`) e a tela só consulta o que ficou guardado.
 */
import { useEffect, useState } from 'react';

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let convite: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => { for (const f of ouvintes) f(); };

export function iniciarCapturaInstalacao(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    convite = e as EventoInstalacao;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    convite = null;
    avisar();
  });
}

/** Aberto como app instalado (tela cheia, sem barra do navegador). */
export function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // Safari do iPhone expõe o modo app só por esta propriedade.
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function ehIPhone(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

export type ModoInstalacao = 'instalado' | 'convite' | 'iphone' | 'indisponivel';

export function useInstalacao(): { modo: ModoInstalacao; instalar: () => Promise<void> } {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar(n => n + 1);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);

  const modo: ModoInstalacao = estaInstalado() ? 'instalado'
    : convite ? 'convite'
    : ehIPhone() ? 'iphone'
    : 'indisponivel';

  const instalar = async () => {
    if (!convite) return;
    const atual = convite;
    await atual.prompt();
    await atual.userChoice;
    // O convite é de uso único: aceito ou recusado, some.
    convite = null;
    avisar();
  };

  return { modo, instalar };
}
