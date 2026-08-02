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
 *                        entra: ela tem setor, não tem equipe.
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

/** O mínimo que uma linha precisa expor para ser filtrada. */
export interface LinhaEscopavel {
  operador_id: string | null;
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
  | { tipo: 'equipe'; operadores: ReadonlySet<string> }
  | {
      tipo: 'setor';
      setorId: string;
      /** true = setor normal (soma pelo carimbo). false = alternativo/PaguePlay. */
      porRelatorio: boolean;
      /** Membros + clones que contam. Usado quando `porRelatorio` é false. */
      operadores: ReadonlySet<string>;
    };

export const ESCOPO_EMPRESA: EscopoAnalitico = { tipo: 'empresa' };

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
}): EscopoAnalitico {
  const { setorId, alternativo, operadores, temCarimbo } = params;
  return {
    tipo: 'setor',
    setorId,
    porRelatorio: !alternativo && temCarimbo,
    operadores,
  };
}

/** A linha entra na conta deste escopo? */
export function linhaNoEscopo(linha: LinhaEscopavel, escopo: EscopoAnalitico): boolean {
  switch (escopo.tipo) {
    case 'empresa':
      return true;

    case 'operador':
      return linha.operador_id === escopo.operadorId;

    case 'equipe':
      // Órfã não tem equipe — ficaria sempre de fora de qualquer equipe, então
      // somá-la aqui seria atribuir a alguém o recebimento de ninguém.
      return linha.operador_id !== null && escopo.operadores.has(linha.operador_id);

    case 'setor':
      if (escopo.porRelatorio) {
        // O carimbo manda, inclusive para a órfã (é dela que ele veio).
        return (linha.setor_id ?? null) === escopo.setorId;
      }
      // Alternativo: soma dos usuários + as órfãs carimbadas neste setor.
      return linha.operador_id !== null
        ? escopo.operadores.has(linha.operador_id)
        : (linha.setor_id ?? null) === escopo.setorId;
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

/**
 * Quem enxerga a empresa inteira no analítico.
 *
 * Existia em duas versões que discordavam: a aba Analítico decidia pelo CARGO
 * (`administrador`/`super_admin`/`diretoria`) e o dashboard decidia por
 * PERMISSÃO (`ver_analiticos_global`/`ver_todos_setores`). A diretoria, por
 * exemplo, via a empresa toda na aba e só o próprio setor no dashboard — dois
 * totais diferentes para a mesma pessoa, na mesma hora.
 *
 * Agora é uma função só: o cargo abre por si, e a permissão configurável em
 * Admin → Cargos pode abrir para os demais.
 */
export function veTodosOsSetores(
  cargo: string | null | undefined,
  temPermissao: (chave: string) => boolean,
): boolean {
  const c = String(cargo ?? '');
  if (c === 'administrador' || c === 'super_admin' || c === 'diretoria') return true;
  return temPermissao('ver_analiticos_global') || temPermissao('ver_todos_setores');
}
