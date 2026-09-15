/**
 * vendasFechamento.ts — a conta do setor, e a prova de que ela fecha.
 *
 * ## Por que a conta precisa ser conferida, e não só exibida
 *
 * No 59 da cobrança a lição custou semanas: enquanto ninguém escreveu a
 * identidade «total − colchão = soma dos setores», cada tela dava um número e
 * ninguém sabia qual estava certo. O que resolveu não foi somar melhor — foi
 * escrever a igualdade em algum lugar que pudesse **falhar em voz alta**.
 *
 * É o que este módulo faz. `fn_vendas_fechamento_do_setor` devolve as parcelas;
 * aqui elas são somadas e comparadas com o total. Se a diferença não for zero,
 * a tela diz isso em vez de mostrar números que não se sustentam.
 *
 * ## As duas igualdades, e elas respondem a perguntas diferentes
 *
 *   1. `total = soma dos cinco destinos`
 *      Falha quando a função SQL ganhou um estado de franquia que o `CASE` não
 *      previu. É defeito de código, não de cadastro.
 *
 *   2. `destino «deste setor» = o que está gravado em vendas`
 *      Falha quando a projeção não rodou depois da última carga, ou rodou com
 *      outro de-para. É rotina, não defeito — e é a razão de a conferência
 *      existir separada da primeira.
 *
 * Separá-las importa porque o conserto é diferente: a primeira é chamado para
 * quem escreve SQL, a segunda é um botão de projetar.
 *
 * ## Centavos, e por que o zero é tolerante
 *
 * Os valores chegam do PostgREST como string (`numeric`) e viram `number`. Em
 * ponto flutuante, somar 2.973 parcelas e comparar com o total dá diferença na
 * 12ª casa — que não é erro, é binário. A comparação é feita em CENTAVOS
 * inteiros, e só aí o zero pode ser exigido de verdade.
 */

/** A qual soma a linha pertence. Ver o COMMENT da função SQL. */
export type EscopoFechamento = 'total' | 'destino' | 'equipe' | 'natureza' | 'conferencia';

/** Os cinco destinos, exclusivos e exaustivos. */
export type DestinoFechamento =
  | 'deste_setor'
  | 'outro_setor'
  | 'sem_operador'
  | 'sem_franquia'
  | 'ignorada';

/** Uma linha como `fn_vendas_fechamento_do_setor` a devolve. */
export interface LinhaFechamento {
  escopo: EscopoFechamento;
  chave: string | null;
  rotulo: string;
  linhas: number;
  valor: number;
  linhas_na_regua: number;
  valor_na_regua: number;
}

/**
 * A ordem em que os destinos são mostrados: pelo trabalho que dão, não pelo
 * valor. `deste_setor` primeiro porque é a resposta; depois o que precisa de
 * decisão de alguém; `ignorada` por último porque já foi decidido.
 */
export const ORDEM_DOS_DESTINOS: DestinoFechamento[] = [
  'deste_setor',
  'sem_operador',
  'sem_franquia',
  'outro_setor',
  'ignorada',
];

/** O que cada destino quer dizer, na linguagem de quem vai agir. */
export const EXPLICACAO_DO_DESTINO: Record<DestinoFechamento, string> = {
  deste_setor:
    'Franquia vinculada a este setor e login com perfil no sistema. É o dinheiro que conta aqui.',
  sem_operador:
    'A franquia é deste setor, mas o login que vendeu não tem perfil. O valor existe e está sem dono — criar o perfil o traz para cá.',
  sem_franquia:
    'A franquia dessa venda não foi vinculada a setor nenhum. Não é erro: é franquia que ninguém cadastrou ainda.',
  outro_setor: 'A franquia dessa venda pertence a outro setor.',
  ignorada: 'Franquia marcada como fora da operação. Alguém decidiu que não entra.',
};

/** Centavos inteiros. É a única unidade em que exigir zero faz sentido. */
function centavos(valor: number): number {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 100);
}

/** Números chegam do PostgREST como string quando a coluna é `numeric`. */
function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza o que veio do banco. */
export function normalizarLinhas(cruas: unknown[]): LinhaFechamento[] {
  return (Array.isArray(cruas) ? cruas : []).map(c => {
    const l = c as Record<string, unknown>;
    return {
      escopo: String(l.escopo ?? '') as EscopoFechamento,
      chave: l.chave == null ? null : String(l.chave),
      rotulo: String(l.rotulo ?? ''),
      linhas: num(l.linhas),
      valor: num(l.valor),
      linhas_na_regua: num(l.linhas_na_regua),
      valor_na_regua: num(l.valor_na_regua),
    };
  });
}

function doEscopo(linhas: LinhaFechamento[], escopo: EscopoFechamento): LinhaFechamento[] {
  return linhas.filter(l => l.escopo === escopo);
}

function somar(linhas: LinhaFechamento[]): { linhas: number; valor: number; valorNaRegua: number } {
  return linhas.reduce(
    (a, l) => ({
      linhas: a.linhas + l.linhas,
      valor: a.valor + l.valor,
      valorNaRegua: a.valorNaRegua + l.valor_na_regua,
    }),
    { linhas: 0, valor: 0, valorNaRegua: 0 },
  );
}

/** O resultado de uma igualdade: bateu, e se não, por quanto. */
export interface Igualdade {
  /** As duas pontas existem? Sem lote do mês, não há o que conferir. */
  aplicavel: boolean;
  fecha: boolean;
  diferencaLinhas: number;
  diferencaValor: number;
}

const IGUALDADE_VAZIA: Igualdade = {
  aplicavel: false, fecha: true, diferencaLinhas: 0, diferencaValor: 0,
};

function compararEm(esperado: { linhas: number; valor: number },
                    obtido:   { linhas: number; valor: number }): Igualdade {
  const diferencaLinhas = esperado.linhas - obtido.linhas;
  const diferencaCentavos = centavos(esperado.valor) - centavos(obtido.valor);
  return {
    aplicavel: true,
    fecha: diferencaLinhas === 0 && diferencaCentavos === 0,
    diferencaLinhas,
    // Volta a reais só na saída: a conta foi feita em centavos.
    diferencaValor: diferencaCentavos / 100,
  };
}

/**
 * Igualdade 1: os cinco destinos somam o retrato inteiro.
 *
 * Falhar aqui é defeito de código — a função SQL ganhou um estado que o `CASE`
 * dela não previu, e uma linha caiu fora de todas as gavetas.
 */
export function osDestinosSomamOTotal(linhas: LinhaFechamento[]): Igualdade {
  const total = doEscopo(linhas, 'total')[0];
  if (!total) return IGUALDADE_VAZIA;
  return compararEm(total, somar(doEscopo(linhas, 'destino')));
}

/**
 * Igualdade 2: o que o retrato diz ser deste setor é o que está gravado.
 *
 * Falhar aqui é rotina, não defeito: a carga entrou e a projeção ainda não
 * rodou. O conserto é um botão, e a tela deve dizer isso — não «erro».
 */
export function oGravadoBateComORetrato(linhas: LinhaFechamento[]): Igualdade {
  const doSetor = doEscopo(linhas, 'destino').find(l => l.chave === 'deste_setor');
  const gravado = doEscopo(linhas, 'conferencia')[0];
  if (!doSetor || !gravado) return IGUALDADE_VAZIA;
  return compararEm(doSetor, gravado);
}

/**
 * Igualdade 3: os recortes de dentro do setor somam a parcela do setor.
 *
 * Vale para equipe e para natureza, e as duas são feitas porque cada uma pode
 * quebrar sozinha: equipe depende de `fn_vendas_equipe_que_credita`, natureza
 * depende de `perfis.robo`.
 */
export function osRecortesSomamOSetor(
  linhas: LinhaFechamento[], escopo: 'equipe' | 'natureza',
): Igualdade {
  const doSetor = doEscopo(linhas, 'destino').find(l => l.chave === 'deste_setor');
  const recorte = doEscopo(linhas, escopo);
  if (!doSetor || recorte.length === 0) return IGUALDADE_VAZIA;
  return compararEm(doSetor, somar(recorte));
}

/** Tudo que a tela precisa, já conferido. */
export interface Fechamento {
  /** Há lote geral vigente para o mês? Sem ele nada disso significa algo. */
  temRetrato: boolean;
  total: LinhaFechamento | null;
  /** Os cinco, na ordem de trabalho, com zero para os que não apareceram. */
  destinos: (LinhaFechamento & { destino: DestinoFechamento })[];
  equipes: LinhaFechamento[];
  /** Sempre duas linhas: pessoas e automação, mesmo que uma seja zero. */
  pessoas: LinhaFechamento;
  automacao: LinhaFechamento;
  gravado: LinhaFechamento | null;
  destinosSomam: Igualdade;
  gravadoBate: Igualdade;
  equipesSomam: Igualdade;
  naturezasSomam: Igualdade;
  /** As quatro igualdades de uma vez. É o farol da tela. */
  tudoFecha: boolean;
}

function vazia(escopo: EscopoFechamento, chave: string, rotulo: string): LinhaFechamento {
  return { escopo, chave, rotulo, linhas: 0, valor: 0, linhas_na_regua: 0, valor_na_regua: 0 };
}

/**
 * Organiza as linhas e confere as quatro igualdades.
 *
 * Destinos e naturezas que não apareceram viram linha de zero **de propósito**:
 * «franquia que ninguém vinculou: 0» é informação, e some quando a gaveta é
 * omitida. Quem olha precisa saber que a gaveta foi conferida e estava vazia.
 */
export function organizarFechamento(linhas: LinhaFechamento[]): Fechamento {
  const total = doEscopo(linhas, 'total')[0] ?? null;
  const temRetrato = total !== null && total.linhas > 0;

  const porDestino = new Map(doEscopo(linhas, 'destino').map(l => [l.chave, l]));
  const destinos = ORDEM_DOS_DESTINOS.map(d => ({
    ...(porDestino.get(d) ?? vazia('destino', d, EXPLICACAO_DO_DESTINO[d])),
    destino: d,
  }));

  const naturezas = doEscopo(linhas, 'natureza');
  const pessoas = naturezas.find(l => l.chave === 'humano')
    ?? vazia('natureza', 'humano', 'Pessoas');
  const automacao = naturezas.find(l => l.chave === 'robo')
    ?? vazia('natureza', 'robo', 'Automação');

  const destinosSomam  = osDestinosSomamOTotal(linhas);
  const gravadoBate    = oGravadoBateComORetrato(linhas);
  const equipesSomam   = osRecortesSomamOSetor(linhas, 'equipe');
  const naturezasSomam = osRecortesSomamOSetor(linhas, 'natureza');

  return {
    temRetrato,
    total,
    destinos,
    // Maior primeiro: dentro da equipe a pergunta é «quem produziu mais».
    equipes: [...doEscopo(linhas, 'equipe')].sort((a, b) => b.valor_na_regua - a.valor_na_regua),
    pessoas,
    automacao,
    gravado: doEscopo(linhas, 'conferencia')[0] ?? null,
    destinosSomam,
    gravadoBate,
    equipesSomam,
    naturezasSomam,
    tudoFecha: [destinosSomam, gravadoBate, equipesSomam, naturezasSomam].every(i => i.fecha),
  };
}

/**
 * Quanto do setor é automação, em porcentagem da régua.
 *
 * Na régua e não no bruto: a pergunta é «quanto da META o robô entregou», e
 * meta só enxerga confirmada e assinada.
 */
export function fatiaDaAutomacao(f: Fechamento): number {
  const doSetor = f.destinos.find(d => d.destino === 'deste_setor');
  const base = doSetor?.valor_na_regua ?? 0;
  if (base <= 0) return 0;
  return (f.automacao.valor_na_regua / base) * 100;
}
