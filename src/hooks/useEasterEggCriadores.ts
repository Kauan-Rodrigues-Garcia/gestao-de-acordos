/**
 * useEasterEggCriadores — cinco cliques rápidos no logo abrem o Creators Lab.
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Onde este hook PRECISA ser chamado
 *
 * No corpo de `Layout`, e não dentro de `SidebarContent`. Aquele componente é
 * definido dentro do corpo do `Layout` e usado como `<SidebarContent />`: a
 * identidade da função muda a cada render, então o React desmonta e remonta o
 * componente inteiro, zerando qualquer estado de hook que estivesse ali. O
 * contador de cliques simplesmente nunca passaria de 1.
 *
 * ## A janela
 *
 * Cinco cliques em até 3 segundos, contados a partir do PRIMEIRO. Passou disso,
 * o contador zera e a contagem recomeça do clique atual — quem clicou devagar
 * não fica preso num estado meio-aberto.
 *
 * O clique continua funcionando normalmente para o resto da interface: este
 * hook só observa, não impede nada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { jaDescobriuOLab } from '@/services/creatorsLab.service';

/** Tempo máximo entre o primeiro e o quinto clique. */
export const JANELA_MS = 3000;
export const CLIQUES_NECESSARIOS = 5;

/**
 * Quanto tempo a tela leva para apagar antes de o Lab abrir.
 *
 * O quinto clique não joga a pessoa direto na abertura: a tela do Gestão
 * escurece primeiro, com uma interferência curta no fim. Corte seco de uma
 * planilha de acordos para uma tela de terminal parece bug; apagar a luz antes
 * transforma o mesmo salto em passagem.
 *
 * Quem quiser mexer, mexa aqui: o `Layout` usa este número tanto na animação
 * quanto no atraso da navegação, então os dois nunca saem de sincronia.
 */
export const DURACAO_ESCURECIMENTO_MS = 1150;

export const CHAVE_DESCOBERTO = 'creatorsLab:descoberto';

/**
 * Decide o que fazer com um clique novo.
 *
 * Pura, para poder ser testada sem relógio nem React: recebe o estado e o
 * instante, devolve o estado seguinte.
 */
export function proximoEstado(
  cliquesAtuais: number,
  primeiroEm: number | null,
  agora: number,
): { cliques: number; primeiroEm: number; abrir: boolean } {
  // Primeiro clique, ou janela vencida: recomeça a contagem a partir de agora.
  const expirou = primeiroEm === null || agora - primeiroEm > JANELA_MS;
  if (expirou) return { cliques: 1, primeiroEm: agora, abrir: false };

  const cliques = cliquesAtuais + 1;
  return { cliques, primeiroEm, abrir: cliques >= CLIQUES_NECESSARIOS };
}

/**
 * Já encontrou o Lab alguma vez NESTE NAVEGADOR?
 *
 * É só um cache local, para o distintivo aparecer no primeiro quadro sem
 * esperar rede. A resposta que vale é a do banco — ver
 * `useDescobriuCreatorsLab` logo abaixo.
 */
export function jaDescobriu(): boolean {
  try { return localStorage.getItem(CHAVE_DESCOBERTO) === 'true'; } catch { return false; }
}

export function marcarDescoberto(): void {
  try { localStorage.setItem(CHAVE_DESCOBERTO, 'true'); } catch { /* modo privado */ }
}

/*
 * Uma consulta por carregamento de página, no máximo.
 *
 * O `Layout` monta em toda tela do Gestão. Sem esta memória de módulo, trocar
 * de aba seis vezes faria seis idas ao banco para responder a mesma pergunta
 * de enfeite. A promessa é guardada, não o resultado, para duas montagens
 * simultâneas dividirem a mesma requisição.
 */
let promessaDescoberta: Promise<boolean> | null = null;

/** Zera a memória. Existe para os testes, e é o único uso legítimo. */
export function esquecerDescobertaRemota(): void {
  promessaDescoberta = null;
}

/**
 * O distintivo pertence à PESSOA, não ao navegador.
 *
 * Antes de 16/08/2026 isto era só `localStorage`: quem descobria o Lab em casa
 * chegava no trabalho sem a marca, e limpar cache apagava a descoberta. Agora
 * a resposta vem da tabela `creators_lab_progresso`, com o localStorage
 * servindo de resposta imediata enquanto a rede não volta.
 *
 * Falha de rede ou tabela ausente não removem a marca de quem já a tinha
 * localmente: `false` do servidor significa "não sei", e a dúvida não pode
 * tirar da pessoa algo que ela já conquistou.
 */
export function useDescobriuCreatorsLab(): boolean {
  const [descoberto, setDescoberto] = useState(jaDescobriu);

  useEffect(() => {
    let vivo = true;
    promessaDescoberta ??= jaDescobriuOLab();

    promessaDescoberta.then(remoto => {
      if (!vivo || !remoto) return;
      marcarDescoberto();
      setDescoberto(true);
    }).catch(() => { /* offline: fica com o que o navegador sabia */ });

    return () => { vivo = false; };
  }, []);

  return descoberto;
}

export interface EasterEggCriadores {
  /** Ligue no onClick do logo. */
  aoClicar: () => void;
  /**
   * 0 a 4 — quanto o logo já reagiu.
   *   0 nada · 1 nada perceptível · 2 leve reação
   *   3 micro falha · 4 interferência
   */
  estagio: number;
  /** O quinto clique aconteceu: rode a abertura. */
  ativado: boolean;
  /** Já descobriu antes — o logo ganha uma marca discreta. */
  descoberto: boolean;
}

export function useEasterEggCriadores(
  aoAtivar: () => void,
): EasterEggCriadores {
  const [estagio, setEstagio] = useState(0);
  const [ativado, setAtivado] = useState(false);
  const [descobertoLocal, setDescobertoLocal] = useState(jaDescobriu);
  const descobertoRemoto = useDescobriuCreatorsLab();

  const cliquesRef    = useRef(0);
  const primeiroRef   = useRef<number | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aoAtivarRef   = useRef(aoAtivar);
  aoAtivarRef.current = aoAtivar;

  // Um timer só, sempre limpo. Sem isto, clicar sete vezes deixaria sete
  // timers pendentes prontos para zerar o contador em momentos aleatórios.
  const limparTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => limparTimer, [limparTimer]);

  const aoClicar = useCallback(() => {
    const agora = Date.now();
    const r = proximoEstado(cliquesRef.current, primeiroRef.current, agora);

    cliquesRef.current  = r.cliques;
    primeiroRef.current = r.primeiroEm;
    setEstagio(Math.min(r.cliques, CLIQUES_NECESSARIOS - 1));

    limparTimer();

    if (r.abrir) {
      cliquesRef.current  = 0;
      primeiroRef.current = null;
      setEstagio(0);
      setAtivado(true);
      marcarDescoberto();
      setDescobertoLocal(true);
      aoAtivarRef.current();
      return;
    }

    // Rearma a expiração para o que sobra da janela: quem clicou 4 vezes em
    // 2,9 s tem 0,1 s para o quinto, não mais 3 s.
    const restante = Math.max(JANELA_MS - (agora - r.primeiroEm), 0);
    timerRef.current = setTimeout(() => {
      cliquesRef.current  = 0;
      primeiroRef.current = null;
      setEstagio(0);
    }, restante + 40);
  }, [limparTimer]);

  // Um "sim" de qualquer uma das duas memórias basta. O banco é a verdade, o
  // navegador é a resposta rápida — e nenhum dos dois pode desfazer a
  // descoberta do outro.
  return { aoClicar, estagio, ativado, descoberto: descobertoLocal || descobertoRemoto };
}
