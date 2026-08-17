/**
 * RastreioUsoProvider — mede quais telas cada pessoa abre, e por quanto tempo.
 *
 * ## O que conta como uso
 *
 * Segundos com a aba **em foco**. Aba aberta em segundo plano não conta: sem
 * isso, quem deixa a planilha aberta o dia inteiro lidera qualquer ranking sem
 * ter usado nada, e o painel mediria hábito de navegador em vez de trabalho.
 *
 * O relógio para quando a aba é escondida (`visibilitychange`) ou perde o foco
 * (`blur`), e volta quando reaparece. Os dois eventos são necessários: trocar de
 * aba dispara `visibilitychange`, mas clicar em outra janela na mesma tela
 * dispara só `blur`.
 *
 * ## Por que não é um evento por navegação
 *
 * O acumulado é enviado a cada 3 minutos, na troca de tela e quando a aba some.
 * Um envio por navegação daria milhares de requisições/dia para responder as
 * mesmas perguntas — e `fn_uso_registrar` já soma no banco, então enviar menos
 * vezes com números maiores dá o mesmo resultado.
 *
 * Passagem rápida não conta: abaixo de 2 segundos nada é enviado, nem os
 * segundos nem a abertura. Redirecionamento e clique errado não são uso.
 *
 * ## Sub-abas
 *
 * "Desempenho Equipes" é aba dentro do Painel Líder — a URL não muda. As telas
 * que têm abas chamam `useSubAbaUso(...)` para dizer em qual estão, e o
 * identificador vira `lider:desempenho`. Sem isso, a pergunta que originou o
 * painel ficaria sem resposta.
 */

import {
  createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { registrarUso } from '@/services/uso.service';
import { telaDaRota, telaComAba } from '@/lib/telas-catalogo';
import { AcumuladorUso, type EnvioUso } from '@/lib/acumulador-uso';

/** De quanto em quanto tempo o acumulado sobe, para quem fica parado na tela. */
const INTERVALO_ENVIO_MS = 180_000;

interface RastreioUsoContexto {
  /** A tela informa em qual sub-aba está. `null` limpa. */
  definirSubAba: (aba: string | null) => void;
}

const Ctx = createContext<RastreioUsoContexto | undefined>(undefined);

export function RastreioUsoProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const { pathname } = useLocation();
  const [subAba, setSubAba] = useState<string | null>(null);

  const telaBase = telaDaRota(pathname);
  // Sem sessão não há a quem atribuir, e `fn_uso_registrar` devolveria em
  // silêncio de qualquer forma — não vale gastar a requisição.
  const telaAtual = perfil && telaBase ? telaComAba(telaBase, subAba) : null;

  // ── Acumulador ────────────────────────────────────────────────────────────
  // Em ref, e não em estado: nada aqui deve provocar render. O provider embrulha
  // a aplicação inteira, e um `setState` por batida repintaria tudo.
  //
  // A contabilidade em si mora em `AcumuladorUso`, testada à parte. Aqui só há
  // fiação de eventos de janela.
  const acRef = useRef<AcumuladorUso | null>(null);
  acRef.current ??= new AcumuladorUso();

  /** Sobe o que houver. `void` de propósito — ver `enviar`. */
  const subir = useCallback((envio: EnvioUso | null) => {
    if (!envio) return;
    // Sem `await`: quem chama pode ser um handler de `pagehide`, e esperar a
    // resposta ali atrasaria a saída da página sem nenhum ganho.
    void registrarUso(envio.tela, envio.segundos, envio.abertura);
  }, []);

  const pausar = useCallback(() => { acRef.current!.pausar(); }, []);

  const retomar = useCallback(() => {
    // A visibilidade é decisão de quem chama: o acumulador não conhece `document`.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    acRef.current!.retomar();
  }, []);

  /** Fecha a janela, sobe o acumulado e volta a contar. */
  const descarregar = useCallback(() => {
    acRef.current!.pausar();
    subir(acRef.current!.descarregar());
  }, [subir]);

  // ── Troca de tela ─────────────────────────────────────────────────────────
  useEffect(() => {
    // `trocarTela` já pausa, devolve o pendente da anterior e recomeça na nova —
    // inclusive o no-op quando a tela não mudou de fato.
    subir(acRef.current!.trocarTela(telaAtual));
    retomar();
  }, [telaAtual, subir, retomar]);

  // ── Foco e visibilidade ───────────────────────────────────────────────────
  useEffect(() => {
    function aoEsconder() {
      // Envia ao sair: fechar a aba não dispara nada confiável depois disto.
      descarregar();
    }
    function aoMostrar() {
      if (document.visibilityState === 'visible') retomar();
    }

    // Nomeado, e não uma seta inline: o `removeEventListener` precisa da mesma
    // referência. Com a seta anônima, cada re-execução do efeito somava mais um
    // ouvinte de `visibilitychange` e nenhum saía.
    function aoTrocarVisibilidade() {
      if (document.visibilityState === 'hidden') aoEsconder(); else aoMostrar();
    }

    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    window.addEventListener('blur', pausar);
    window.addEventListener('focus', retomar);
    // `pagehide` cobre o fechamento da aba em navegadores que não disparam
    // `visibilitychange` a tempo. `unload` não é usado: é ignorado no iOS e
    // desencoraja o cache de retorno do navegador.
    window.addEventListener('pagehide', aoEsconder);

    return () => {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
      window.removeEventListener('blur', pausar);
      window.removeEventListener('focus', retomar);
      window.removeEventListener('pagehide', aoEsconder);
    };
  }, [pausar, descarregar, retomar]);

  // ── Batida periódica ──────────────────────────────────────────────────────
  // Para quem fica parado numa tela: sem ela, uma sessão de duas horas na mesma
  // tela só subiria ao trocar de tela ou fechar a aba — e um navegador encerrado
  // à força perderia tudo.
  useEffect(() => {
    const id = setInterval(() => {
      descarregar();
      retomar();
    }, INTERVALO_ENVIO_MS);
    return () => clearInterval(id);
  }, [descarregar, retomar]);

  // ── Desmontagem ───────────────────────────────────────────────────────────
  useEffect(() => () => { descarregar(); }, [descarregar]);

  const definirSubAba = useCallback((aba: string | null) => {
    setSubAba(prev => (prev === aba ? prev : aba));
  }, []);

  return <Ctx.Provider value={{ definirSubAba }}>{children}</Ctx.Provider>;
}

/**
 * Declara em qual sub-aba a tela está.
 *
 * Chamada de dentro da tela que tem abas. Limpa sozinha ao desmontar, para a
 * aba não vazar para a tela seguinte.
 */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useSubAbaUso(aba: string | null | undefined): void {
  const ctx = useContext(Ctx);
  const definir = ctx?.definirSubAba;
  useEffect(() => {
    if (!definir) return;
    definir(aba ?? null);
    return () => definir(null);
  }, [definir, aba]);
}
