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
 *
 * Aba dentro de aba declara o NÍVEL (`useSubAbaUso(aba, 2)`): cada tela diz só
 * a própria aba, e o identificador junta os níveis — `analitico:analitico/dia/
 * ranking`. Antes havia um nível só, e a tela de fora e a de dentro brigavam
 * pelo mesmo lugar.
 *
 * ## O que fica por cima da tela
 *
 * As gavetas do topo (Desempenho do Dia, Desafio) e a janela do chat não são
 * rota. Enquanto estão em uso, o tempo é DELAS, e não da tela de baixo —
 * `useSobreposicaoUso` para as gavetas, que tapam a tela, e `useAreaDeUso` para
 * o chat, que fica ao lado: ele conta enquanto a pessoa clica ou digita dentro
 * da janela, e devolve o tempo à tela ao primeiro clique fora.
 *
 * ## Pessoa parada não é pessoa usando (29/09/2026)
 *
 * A aba em foco com ninguém na frente contava o dia inteiro. Agora, sem mouse,
 * teclado, toque ou rolagem por `LIMITE_OCIOSO_MS`, o relógio para — e para
 * no passado: no último gesto mais `TOLERANCIA_LEITURA_MS`, o tempo razoável de
 * ler o que estava na tela. O primeiro gesto seguinte volta a contar.
 */

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, useCallback,
  type ReactNode, type RefObject,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { registrarUso, registrarSessao } from '@/services/uso.service';
import { telaDaRota, telaComAbas } from '@/lib/telas-catalogo';
import { AcumuladorUso, type EnvioUso } from '@/lib/acumulador-uso';

/** De quanto em quanto tempo o acumulado sobe, para quem fica parado na tela. */
const INTERVALO_ENVIO_MS = 180_000;

/** Sem nenhum gesto por este tempo, a pessoa não está mais usando. */
export const LIMITE_OCIOSO_MS = 5 * 60_000;

/** O que se credita depois do último gesto: o tempo de ler a tela. */
export const TOLERANCIA_LEITURA_MS = 60_000;

/** De quanto em quanto tempo a ociosidade é conferida. */
const VERIFICAR_OCIOSO_MS = 15_000;

/**
 * Gestos que provam que há alguém usando.
 *
 * `scroll` fica de fora de propósito: a tela também rola sozinha (a conversa do
 * chat descendo para a mensagem nova), e isso contaria como pessoa. Quem rola
 * de verdade usa roda (`wheel`), teclado, toque ou arrasta a barra (`pointerdown`).
 */
const EVENTOS_DE_ATIVIDADE = [
  'pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart',
] as const;

interface RastreioUsoContexto {
  /** A tela informa em qual aba está, no nível dela. `null` limpa. */
  definirNivel: (nivel: number, aba: string | null) => void;
  /** Liga ou desliga uma camada por cima da tela (gaveta, janela). */
  definirSobreposicao: (chave: symbol, tela: string | null) => void;
}

const Ctx = createContext<RastreioUsoContexto | undefined>(undefined);

export function RastreioUsoProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const { pathname } = useLocation();
  /** Aba de cada nível: 1 é a aba da tela, 2 a aba dentro dela, e assim por diante. */
  const [niveis, setNiveis] = useState<Record<number, string>>({});
  /** Camadas por cima da tela, na ordem em que abriram. A última manda. */
  const [camadas, setCamadas] = useState<{ chave: symbol; tela: string }[]>([]);

  const telaBase = telaDaRota(pathname);
  const abas = Object.keys(niveis).map(Number).sort((a, b) => a - b).map(n => niveis[n]);
  const camada = camadas.length ? camadas[camadas.length - 1].tela : null;
  // Sem sessão não há a quem atribuir, e `fn_uso_registrar` devolveria em
  // silêncio de qualquer forma — não vale gastar a requisição.
  const telaAtual = !perfil ? null
    : camada ?? (telaBase ? telaComAbas(telaBase, abas) : null);

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

  // ── Ociosidade ─────────────────────────────────────────────────────────────
  // Em ref: um gesto por pixel de mouse não pode virar render.
  const ultimoGestoRef = useRef(Date.now());
  const ociosoRef = useRef(false);
  // A janela visível mas sem foco (outra janela por cima, na mesma tela) não
  // conta. Guardado aqui, e não só pausado no `blur`: a batida periódica e a
  // troca de aba chamam `retomar`, e sem isto religavam o relógio.
  const focadaRef = useRef(typeof document === 'undefined' || document.hasFocus());

  const retomar = useCallback(() => {
    // A visibilidade é decisão de quem chama: o acumulador não conhece `document`.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (ociosoRef.current || !focadaRef.current) return;
    acRef.current!.retomar();
  }, []);

  /** Fecha a janela, sobe o acumulado e volta a contar. */
  const descarregar = useCallback(() => {
    acRef.current!.pausar();
    subir(acRef.current!.descarregar());
  }, [subir]);

  // ── Entrada no sistema ────────────────────────────────────────────────────
  //
  // Uma vez por abertura do sistema, assim que houver perfil. Vale tanto para
  // quem acabou de digitar a senha quanto para quem teve a sessão restaurada —
  // e é justamente o segundo caso que faltava: `logs_sistema.acao = 'login'` só
  // é gravado em `signIn()`, e a sessão do Supabase sobrevive dias, então quem
  // usa todo dia aparecia com um login só.
  //
  // Em ref e não em estado: isto não pode provocar render, e não pode repetir
  // quando o perfil é recarregado (troca de empresa, `refreshPerfil`). O banco
  // deduplica o DIA de qualquer forma; a guarda aqui é só para não gastar
  // requisição.
  const sessaoRegistrada = useRef<string | null>(null);
  useEffect(() => {
    if (!perfil?.id || sessaoRegistrada.current === perfil.id) return;
    sessaoRegistrada.current = perfil.id;
    void registrarSessao();
  }, [perfil?.id]);

  // ── Troca de tela ─────────────────────────────────────────────────────────
  useEffect(() => {
    // `trocarTela` já pausa, devolve o pendente da anterior e recomeça na nova —
    // inclusive o no-op quando a tela não mudou de fato.
    subir(acRef.current!.trocarTela(telaAtual));
    // Ela recomeça sem perguntar se há alguém olhando. Uma aba que muda sozinha
    // (carga que escolhe a aba padrão, gaveta que fecha) com a pessoa longe ou
    // a janela escondida não pode voltar a contar.
    const escondida = typeof document !== 'undefined' && document.visibilityState !== 'visible';
    if (ociosoRef.current || escondida) acRef.current!.pausar();
    else retomar();
  }, [telaAtual, subir, retomar]);

  // ── Gestos e ociosidade ────────────────────────────────────────────────────
  useEffect(() => {
    function aoGesto() {
      ultimoGestoRef.current = Date.now();
      if (!ociosoRef.current) return;
      ociosoRef.current = false;
      retomar();
    }
    for (const ev of EVENTOS_DE_ATIVIDADE) {
      document.addEventListener(ev, aoGesto, { capture: true, passive: true });
    }
    const id = setInterval(() => {
      if (ociosoRef.current) return;
      const parado = Date.now() - ultimoGestoRef.current;
      if (parado < LIMITE_OCIOSO_MS) return;
      ociosoRef.current = true;
      // Corta no passado: o que passou do tempo de leitura não foi uso.
      acRef.current!.pausar(ultimoGestoRef.current + TOLERANCIA_LEITURA_MS);
      subir(acRef.current!.descarregar());
    }, VERIFICAR_OCIOSO_MS);
    return () => {
      for (const ev of EVENTOS_DE_ATIVIDADE) {
        document.removeEventListener(ev, aoGesto, { capture: true });
      }
      clearInterval(id);
    };
  }, [retomar, subir]);

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

    // Voltar para a janela é gesto: quem clica nela de volta está usando.
    function aoFocar() {
      focadaRef.current = true;
      ultimoGestoRef.current = Date.now();
      ociosoRef.current = false;
      retomar();
    }
    function aoDesfocar() {
      focadaRef.current = false;
      pausar();
    }

    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    window.addEventListener('blur', aoDesfocar);
    window.addEventListener('focus', aoFocar);
    // `pagehide` cobre o fechamento da aba em navegadores que não disparam
    // `visibilitychange` a tempo. `unload` não é usado: é ignorado no iOS e
    // desencoraja o cache de retorno do navegador.
    window.addEventListener('pagehide', aoEsconder);

    return () => {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
      window.removeEventListener('blur', aoDesfocar);
      window.removeEventListener('focus', aoFocar);
      window.removeEventListener('pagehide', aoEsconder);
    };
  }, [pausar, descarregar, retomar]);

  // ── Batida periódica ──────────────────────────────────────────────────────
  // Para quem fica parado numa tela: sem ela, uma sessão de duas horas na mesma
  // tela só subiria ao trocar de tela ou fechar a aba — e um navegador encerrado
  // à força perderia tudo.
  useEffect(() => {
    const id = setInterval(() => {
      // Em silêncio além da tolerância, a janela fica aberta: se a pessoa não
      // voltar, a ociosidade corta no último gesto — e não pode cortar antes de
      // um envio que já tivesse creditado o silêncio como uso.
      if (Date.now() - ultimoGestoRef.current > TOLERANCIA_LEITURA_MS) return;
      descarregar();
      retomar();
    }, INTERVALO_ENVIO_MS);
    return () => clearInterval(id);
  }, [descarregar, retomar]);

  // ── Desmontagem ───────────────────────────────────────────────────────────
  useEffect(() => () => { descarregar(); }, [descarregar]);

  const definirNivel = useCallback((nivel: number, aba: string | null) => {
    setNiveis(prev => {
      if ((prev[nivel] ?? null) === aba) return prev;
      const prox = { ...prev };
      if (aba) prox[nivel] = aba; else delete prox[nivel];
      return prox;
    });
  }, []);

  const definirSobreposicao = useCallback((chave: symbol, tela: string | null) => {
    setCamadas(prev => {
      const sem = prev.filter(c => c.chave !== chave);
      if (!tela) return sem.length === prev.length ? prev : sem;
      const atual = prev.find(c => c.chave === chave);
      if (atual?.tela === tela) return prev;
      // Reativar leva a camada para o topo: é nela que a pessoa está agora.
      return [...sem, { chave, tela }];
    });
  }, []);

  const valor = useRef<RastreioUsoContexto>({ definirNivel, definirSobreposicao }).current;

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Declara em qual sub-aba a tela está.
 *
 * Chamada de dentro da tela que tem abas. Limpa sozinha ao desmontar, para a
 * aba não vazar para a tela seguinte.
 */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useSubAbaUso(aba: string | null | undefined, nivel = 1): void {
  const ctx = useContext(Ctx);
  const { base, ativo } = useContext(NivelBaseCtx);
  const definir = ativo ? ctx?.definirNivel : undefined;
  const nivelReal = base + nivel;
  useEffect(() => {
    if (!definir) return;
    definir(nivelReal, aba ?? null);
    return () => definir(nivelReal, null);
  }, [definir, aba, nivelReal]);
}

/**
 * Quantos níveis de aba já existem ACIMA desta tela.
 *
 * Desde o Mapa de Abas (29/09/2026) uma tela pode morar dentro de outra: o
 * Controle de Números é aba do Núcleo, o Fechamento é aba do Fechamento do mês.
 * A tela de dentro continua chamando `useSubAbaUso(aba)` no nível 1 dela, sem
 * saber onde foi posta, e quem a embute diz quantos níveis somar. Sem isto as
 * duas brigariam pelo nível 1, que é o defeito que os níveis vieram resolver.
 */
const NivelBaseCtx = createContext<{ base: number; ativo: boolean }>({ base: 0, ativo: true });

/**
 * `ativo: false` é a aba montada e escondida: ela continua viva para a volta
 * ser instantânea, mas não é onde a pessoa está, e não pode escrever nível.
 */
export function NivelBaseUso({ acima, ativo = true, children }: {
  acima: number; ativo?: boolean; children: ReactNode;
}) {
  const pai = useContext(NivelBaseCtx);
  const valor = useMemo(
    () => ({ base: pai.base + acima, ativo: pai.ativo && ativo }),
    [pai.base, pai.ativo, acima, ativo],
  );
  return <NivelBaseCtx.Provider value={valor}>{children}</NivelBaseCtx.Provider>;
}

/**
 * Uma camada que TAPA a tela enquanto está aberta — as gavetas do topo.
 *
 * Aberta, o tempo é dela (`tela`); fechada, volta para a tela de baixo.
 */
// eslint-disable-next-line react-refresh/only-export-components -- idem.
export function useSobreposicaoUso(tela: string, aberta: boolean): void {
  const ctx = useContext(Ctx);
  const definir = ctx?.definirSobreposicao;
  const chave = useRef(Symbol(tela)).current;
  useEffect(() => {
    if (!definir) return;
    definir(chave, aberta ? tela : null);
    return () => definir(chave, null);
  }, [definir, chave, tela, aberta]);
}

/**
 * Uma janela que fica AO LADO da tela — o chat.
 *
 * Aberta não basta: a pessoa pode deixá-la num canto e seguir nos Acordos. Ela
 * conta a partir do clique ou do foco dentro de `ref`, e devolve o tempo à tela
 * no primeiro clique ou foco fora dela.
 */
// eslint-disable-next-line react-refresh/only-export-components -- idem.
export function useAreaDeUso(
  ref: RefObject<HTMLElement | null>, tela: string, aberta: boolean,
): void {
  const [dentro, setDentro] = useState(false);
  useSobreposicaoUso(tela, aberta && dentro);

  useEffect(() => {
    if (!aberta) { setDentro(false); return; }
    function aoInteragir(ev: Event) {
      const alvo = ev.target as Node | null;
      setDentro(!!alvo && !!ref.current?.contains(alvo));
    }
    document.addEventListener('pointerdown', aoInteragir, true);
    document.addEventListener('focusin', aoInteragir, true);
    return () => {
      document.removeEventListener('pointerdown', aoInteragir, true);
      document.removeEventListener('focusin', aoInteragir, true);
    };
  }, [aberta, ref]);
}
