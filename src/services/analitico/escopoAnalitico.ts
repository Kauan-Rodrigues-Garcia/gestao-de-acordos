/**
 * escopoAnalitico.ts — "esta linha do relatório conta no que estou olhando?"
 *
 * ## Por que existe
 *
 * A mesma pergunta era respondida em três lugares, de três jeitos:
 *
 *   • aba Analítico (`AnaliticoLider.metricas`) — snapshot / carimbo de setor /
 *     soma de membros, conforme o setor seja normal ou alternativo;
 *   • Painel Líder (`DesempenhoEquipes`) — a mesma regra, escrita de novo;
 *   • dashboard (`AnalyticsPanel`) — um conjunto de operadores montado à mão,
 *     que ignorava o carimbo de setor, ignorava `conta_recebimento` dos clones
 *     e jogava fora os órfãos.
 *
 * Três contas para o mesmo dinheiro dão três números, e foi o que aconteceu: o
 * card "Total recebido" da aba e o "Recebido no mês" do dashboard discordavam
 * do relatório importado. Aqui a regra fica UMA, pura e testada; quem precisa
 * dela importa daqui em vez de reescrever.
 *
 * ## A regra (BookPlay, definida na migration 20260724a)
 *
 *   empresa            → tudo o que veio no relatório, inclusive linha sem
 *                        operador cadastrado (órfã). É o total do arquivo.
 *   operador           → as linhas dele.
 *   equipe             → linhas dos membros (+ clones que contam). Órfã não
 *                        entra: ela tem setor, não tem equipe. Linha do membro
 *                        carimbada fora do setor dele no mês não entra; a de
 *                        quem saiu por transferência, no setor de origem, entra
 *                        (`foraDoSetor`/`creditos`, iguais ao Painel Líder).
 *   setor NORMAL       → linhas CARIMBADAS com o setor na importação. Operador
 *                        emprestado para outro setor (clone) NÃO muda o total, e
 *                        as órfãs do setor entram. É "o que chegou no relatório
 *                        daquele setor", nem mais nem menos.
 *   setor ALTERNATIVO  → o setor não tem relatório próprio (ex.: Digital, que
 *                        recebe via clones do Play 4/5): total = soma dos
 *                        usuários dele (membros + clones) + as órfãs carimbadas.
 *
 * PaguePlay tem um setor só e nunca usou o carimbo: entra como `alternativo`
 * (soma dos operadores + órfãos), que é o comportamento que ela já tinha.
 */

import { origemDaLinha, origemConta, type OrigemKey } from './composicaoAcumulado';

/** O mínimo que uma linha precisa expor para ser filtrada. */
export interface LinhaEscopavel {
  operador_id: string | null;
  /**
   * A linha é Contribuição Receptivo (`procedencia = contribuicao_59`, 14/09/2026):
   * a 2ª perna do Integral que outro setor cobrou para este. Conta no setor que
   * recebeu e NÃO na empresa — o mesmo dinheiro já está no total do Receptivo.
   */
  contribuicao?: boolean;
  /** O setor de quem cobrou a contribuição. É a origem da linha. */
  contribuicao_de_setor_id?: string | null;
  /**
   * Linha do 994 (Retenção) cujo pagamento o 59 já lançou como extra para
   * outro operador em outro setor (20261028150000). Conta para a pessoa, a
   * equipe e o setor; na empresa, o mesmo dinheiro já está no outro setor.
   */
  espelho_extra?: boolean;
  /**
   * Ajuste de recebimento lançado para uma EQUIPE (26/10/2026): sem operador,
   * conta na equipe que o recebeu e no setor dela (pelo carimbo).
   */
  ajuste_equipe_id?: string | null;
  /**
   * Setor carimbado na importação.
   *
   * `undefined` = a origem não informou a coluna (RPC antiga, antes da
   * migration 20260802a). Nesse caso o carimbo não existe e o modo "por
   * relatório" não teria como funcionar — ver `escopoDeSetor`.
   */
  setor_id?: string | null;
}

export type EscopoAnalitico =
  | { tipo: 'empresa' }
  | { tipo: 'operador'; operadorId: string }
  | {
      tipo: 'equipe';
      operadores: ReadonlySet<string>;
      /**
       * A equipe do recorte. Só serve ao ajuste de recebimento lançado para a
       * EQUIPE (`ajuste_equipe_id`), que não tem operador para casar.
       */
      equipeId?: string;
      /**
       * Pares `pessoa|setor` cujo recebimento NÃO conta para a pessoa onde ela
       * está — a linha caiu num setor que não é o dela no mês (Nosso produto,
       * 29/09/2026; ver `chavePessoaSetor`). Omitido = toda linha do membro conta.
       *
       * Sem isto o Dashboard somava na equipe as linhas que o membro tinha em
       * outro setor, e o Painel Líder não: R$ 18.897,63 de diferença na ARI/THAIS
       * em 13/10/2026, de duas pessoas cadastradas no Play 1 com o recebimento
       * todo carimbado em Manutenção.
       */
      foraDoSetor?: ReadonlySet<string>;
      /**
       * Pares `pessoa|setor` que esta equipe recebe de quem saiu dela por
       * transferência de setor (`creditosDeOrigem`) — a pessoa já não é membro,
       * mas o que recebeu no setor de origem fica aqui.
       */
      creditos?: ReadonlySet<string>;
    }
  | {
      /**
       * Vários recortes somados — o recorte de N setores do Painel Líder.
       *
       * A linha entra se couber em QUALQUER uma das partes, e entra uma vez
       * só: quem chama pergunta `linhaNoEscopo` por linha e segue adiante, de
       * modo que a linha carimbada em dois setores marcados não dobra.
       */
      tipo: 'uniao';
      partes: readonly EscopoAnalitico[];
    }
  | {
      tipo: 'setor';
      setorId: string;
      /** true = setor normal (soma pelo carimbo). false = alternativo/PaguePlay. */
      porRelatorio: boolean;
      /** Membros + clones que contam. Usado quando `porRelatorio` é false. */
      operadores: ReadonlySet<string>;
      /**
       * Origens que o setor tirou do acumulado no mês (migration 20260812e).
       *
       * O ERP às vezes manda, no relatório de um setor, linhas de gente de
       * outro. A tela lista as origens e permite desmarcar; aqui a escolha é
       * aplicada para que o dashboard e o Painel Diretoria mostrem o MESMO
       * número que o card da aba Analítico. Vazio = tudo conta.
       */
      origensExcluidas: ReadonlySet<OrigemKey>;
      /** Setor de uma pessoa, para casar a linha com a origem excluída. */
      setorDoOperador: (id: string) => string | null | undefined;
    };

export const ESCOPO_EMPRESA: EscopoAnalitico = { tipo: 'empresa' };

/** A chave `pessoa|setor` de `foraDoSetor` e `creditos` — a mesma de `buscarParesForaDoSetor`. */
export function chavePessoaSetor(operadorId: string, setorId: string): string {
  return `${operadorId}|${setorId}`;
}

/**
 * O total deste setor sai da soma dos usuários, em vez do carimbo do relatório?
 *
 * Dois casos dizem que sim:
 *
 *   • **setor alternativo** — não tem relatório próprio (o Digital recebe via
 *     clones do Play 4/5), então só existe o que os usuários dele trouxeram;
 *   • **PaguePlay** — o carimbo de setor simplesmente não existe lá: a
 *     importação passa `setorImportacaoId = null` de propósito. Somar "por
 *     carimbo" jogaria TODAS as linhas no setor de quem importou, qualquer que
 *     fosse o setor de cada operador.
 *
 * Esta linha estava escrita três vezes — no dashboard, na aba Analítico e no
 * Painel Líder — e as três não concordavam: a aba usava o carimbo também na
 * PaguePlay, enquanto o Painel Líder já somava por usuários.
 */
export function setorSomaPorUsuarios(params: {
  isPaguePlay: boolean;
  alternativo: boolean;
}): boolean {
  return params.isPaguePlay || params.alternativo;
}

/**
 * Monta o escopo de um setor decidindo sozinho entre carimbo e soma.
 *
 * `temCarimbo` é a salvaguarda: enquanto a migration 20260802a não for
 * aplicada, a RPC não devolve `setor_id` e somar "pelo carimbo" daria ZERO na
 * tela. Sem o carimbo, cai na soma dos usuários — número aproximado, mas nunca
 * um zero que parece dado real.
 */
export function escopoDeSetor(params: {
  setorId: string;
  /** Setor marcado como alternativo em `setores.alternativo`. */
  alternativo: boolean;
  operadores: ReadonlySet<string>;
  temCarimbo: boolean;
  /** Origens fora do acumulado. Omitir = tudo conta (o padrão). */
  origensExcluidas?: ReadonlySet<OrigemKey>;
  /** Setor de uma pessoa. Omitir só faz sentido quando não há exclusão. */
  setorDoOperador?: (id: string) => string | null | undefined;
}): EscopoAnalitico {
  const { setorId, alternativo, operadores, temCarimbo } = params;
  return {
    tipo: 'setor',
    setorId,
    porRelatorio: !alternativo && temCarimbo,
    operadores,
    origensExcluidas: params.origensExcluidas ?? SEM_EXCLUSAO,
    setorDoOperador:  params.setorDoOperador ?? (() => null),
  };
}

/** Conjunto vazio compartilhado: identidade estável para os `useMemo` da tela. */
const SEM_EXCLUSAO: ReadonlySet<OrigemKey> = new Set<OrigemKey>();

/**
 * Junta recortes num só — o caso de marcar vários setores no Painel Líder.
 *
 * Com uma parte devolve a própria parte: um "união de um" existiria só para
 * dar mais um nível ao `switch`, e o escopo de um setor marcado tem de ser
 * idêntico ao que era quando o filtro escolhia um de cada vez.
 */
export function escopoUniao(partes: readonly EscopoAnalitico[]): EscopoAnalitico {
  return partes.length === 1 ? partes[0] : { tipo: 'uniao', partes };
}

/** A linha entra na conta deste escopo? */
export function linhaNoEscopo(linha: LinhaEscopavel, escopo: EscopoAnalitico): boolean {
  switch (escopo.tipo) {
    case 'empresa':
      // Tudo o que veio no relatório, menos as 2ªs pernas: a contribuição (o
      // pagamento já está no Receptivo) e o espelho do extra da Retenção (já
      // está no setor que o 59 creditou). Somá-las aqui dobraria.
      return !linha.contribuicao && !linha.espelho_extra;

    case 'operador':
      return linha.operador_id === escopo.operadorId;

    case 'equipe': {
      // Órfã não tem equipe — ficaria sempre de fora de qualquer equipe, então
      // somá-la aqui seria atribuir a alguém o recebimento de ninguém. A
      // exceção é o ajuste lançado PARA a equipe: ele diz de quem é.
      if (linha.operador_id === null) {
        return !!linha.ajuste_equipe_id && linha.ajuste_equipe_id === escopo.equipeId;
      }
      // Linha sem carimbo não tem setor a comparar: conta, como no
      // `fn_analitico_resumo_por_operador` (`li.setor IS NULL`).
      const par = linha.setor_id ? chavePessoaSetor(linha.operador_id, linha.setor_id) : null;
      if (par && escopo.creditos?.has(par)) return true;
      if (!escopo.operadores.has(linha.operador_id)) return false;
      return !(par && escopo.foraDoSetor?.has(par));
    }

    case 'uniao':
      return escopo.partes.some(p => linhaNoEscopo(linha, p));

    case 'setor': {
      const daquiPeloCarimbo = (linha.setor_id ?? null) === escopo.setorId;
      const dentro = escopo.porRelatorio
        // O carimbo manda, inclusive para a órfã (é dela que ele veio).
        ? daquiPeloCarimbo
        // Alternativo: soma dos usuários + as órfãs carimbadas neste setor.
        : (linha.operador_id !== null
            ? escopo.operadores.has(linha.operador_id)
            : daquiPeloCarimbo);
      if (!dentro) return false;
      // A linha é do setor; falta saber se a ORIGEM dela continua marcada.
      if (escopo.origensExcluidas.size === 0) return true;
      return origemConta(
        origemDaLinha(linha.operador_id, escopo.setorDoOperador, linha.contribuicao_de_setor_id),
        escopo.origensExcluidas,
      );
    }
  }
}

/**
 * Alguma linha traz o carimbo de setor?
 *
 * `null` (setor não preenchido na importação) é carimbo conhecido e ausente;
 * `undefined` é a coluna não ter vindo. A distinção importa: no primeiro caso a
 * regra do carimbo é aplicável e o setor simplesmente não tem aquela linha; no
 * segundo, aplicá-la zeraria a tela inteira.
 */
export function temCarimboDeSetor(linhas: readonly LinhaEscopavel[]): boolean {
  return linhas.some(l => l.setor_id !== undefined);
}

/*
 * `veTodosOsSetores` foi APOSENTADA na fase 4 da reestruturação por aba.
 *
 * Ela respondia "quem enxerga a empresa inteira" para o Analítico, o
 * Dashboard, a Lixeira, o Painel Líder e o fechamento — cinco telas, uma
 * resposta. Era exatamente o que o pedido de reestruturação proíbe: mexer no
 * alcance de uma aba mudava o das outras.
 *
 * Cada aba agora tem os próprios níveis, e a pergunta vira
 * `escopoEfetivo('<aba>', temPermissao) === 'todos_setores'`. Ver
 * `src/lib/permissoes-escopo.ts`.
 */
