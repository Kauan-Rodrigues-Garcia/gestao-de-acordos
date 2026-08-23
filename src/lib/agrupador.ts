/**
 * agrupador.ts — muitos avisos, uma releitura.
 *
 * ## O caso que motivou
 *
 * Uma importação do Analítico insere 2.400 linhas. O Postgres manda 2.400
 * eventos de `INSERT`, e o padrão do projeto — `onEvento: () => recarregar()` —
 * transforma isso em 2.400 releituras da empresa inteira. A rede engasga, o
 * servidor responde fora de ordem e a tela pisca 2.400 vezes para terminar
 * exatamente no mesmo lugar onde uma única releitura no fim teria chegado.
 *
 * O agrupador transforma a rajada em UMA chamada.
 *
 * ## Por que não é só um `debounce`
 *
 * Um debounce puro nunca dispara enquanto os eventos não param. Numa importação
 * de três minutos, a tela ficaria três minutos sem atualizar nada e depois
 * saltaria tudo de uma vez — o oposto de "tempo real".
 *
 * Daí o teto: a espera reinicia a cada aviso, mas nunca ultrapassa `tetoMs`
 * desde o PRIMEIRO aviso da rajada. Na prática a tela se atualiza a cada
 * segundo durante a importação e uma última vez quando ela termina.
 *
 * Não conhece React, não conhece Supabase, e por isso tem teste próprio.
 */

export interface OpcoesAgrupador {
  /** Silêncio necessário para disparar. Padrão: 250 ms. */
  esperaMs?: number;
  /** Teto desde o primeiro aviso da rajada. Padrão: 1.200 ms. */
  tetoMs?: number;
}

export interface Agrupador {
  /** Chegou um aviso. Pode ser chamado mil vezes. */
  avisar: () => void;
  /** Dispara agora, se havia algo pendente. */
  agora: () => void;
  /** Descarta o que estava pendente. Chame no cleanup do efeito. */
  cancelar: () => void;
  /** Há um disparo agendado? Diagnóstico e teste. */
  pendente: () => boolean;
}

/**
 * Junta avisos numa chamada só.
 *
 * @param acao O que fazer quando a rajada assenta. Chamada no máximo uma vez
 *             por janela, e nunca com argumentos: agrupar avisos que carregam
 *             dado diferente exigiria decidir qual deles vence, e a resposta
 *             certa para este projeto é sempre "releia, o servidor é a verdade".
 */
export function criarAgrupador(
  acao: () => void,
  { esperaMs = 250, tetoMs = 1_200 }: OpcoesAgrupador = {},
): Agrupador {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let primeiroAviso = 0;

  function limpar(): void {
    if (timer) { clearTimeout(timer); timer = null; }
    primeiroAviso = 0;
  }

  function disparar(): void {
    limpar();
    acao();
  }

  return {
    avisar() {
      const agora = Date.now();
      if (!timer) primeiroAviso = agora;

      // Quanto ainda resta do teto desta rajada.
      const restaDoTeto = Math.max(0, tetoMs - (agora - primeiroAviso));
      const espera = Math.min(esperaMs, restaDoTeto);

      if (timer) clearTimeout(timer);
      timer = setTimeout(disparar, espera);
    },

    agora() {
      if (timer) disparar();
    },

    cancelar: limpar,

    pendente() {
      return timer !== null;
    },
  };
}
