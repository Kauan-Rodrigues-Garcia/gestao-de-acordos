/**
 * useVersionCheck — avisa do deploy novo e troca de versão na próxima troca de
 * tela. A regra inteira (por que 60 s, por que na troca de tela, as travas
 * contra recarga em laço) está em `src/lib/versaoNova.ts`.
 *
 * Fica DENTRO do Router: a troca de tela é lida com `useLocation`.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  INTERVALO_MS, MINIMO_ENTRE_PERGUNTAS_MS, perguntarVersao, recarregarParaVersaoNova,
  trocarDeVersaoSePuder, versaoAtual, versaoNovaDetectada,
} from '@/lib/versaoNova';

/** Quem abriu a aba no meio de um deploy fica sabendo logo. */
const PRIMEIRA_PERGUNTA_MS = 15_000;

function avisar() {
  toast.info('Nova versão disponível', {
    id: 'versao-nova',
    description: 'Ela entra sozinha quando você trocar de tela — ou atualize agora.',
    action: { label: 'Atualizar agora', onClick: recarregarParaVersaoNova },
    duration: Infinity,
  });
}

export function useVersionCheck() {
  const { pathname } = useLocation();
  const rotaAnterior = useRef(pathname);

  useEffect(() => {
    if (versaoAtual() === 'dev') return;
    let ultima = 0;
    let avisou = false;

    async function perguntar() {
      if (document.visibilityState === 'hidden') return;
      const agora = Date.now();
      if (agora - ultima < MINIMO_ENTRE_PERGUNTAS_MS) return;
      ultima = agora;
      const nova = await perguntarVersao();
      if (nova && !avisou) { avisou = true; avisar(); }
    }
    const perguntarJa = () => { void perguntar(); };

    const primeira = setTimeout(perguntarJa, PRIMEIRA_PERGUNTA_MS);
    const id = setInterval(perguntarJa, INTERVALO_MS);
    document.addEventListener('visibilitychange', perguntarJa);
    window.addEventListener('focus', perguntarJa);
    window.addEventListener('online', perguntarJa);
    return () => {
      clearTimeout(primeira);
      clearInterval(id);
      document.removeEventListener('visibilitychange', perguntarJa);
      window.removeEventListener('focus', perguntarJa);
      window.removeEventListener('online', perguntarJa);
    };
  }, []);

  // Trocou de tela com versão nova esperando: a tela nova já abre na versão nova.
  // Só o caminho conta — filtro na URL (`?mes=`) não é troca de tela.
  useEffect(() => {
    if (rotaAnterior.current === pathname) return;
    rotaAnterior.current = pathname;
    if (versaoNovaDetectada()) trocarDeVersaoSePuder();
  }, [pathname]);
}
