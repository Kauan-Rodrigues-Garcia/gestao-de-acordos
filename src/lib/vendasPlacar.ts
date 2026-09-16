/**
 * vendasPlacar.ts — a medida do Comercial: quem, onde, como e em que dia.
 *
 * ## O que este arquivo é
 *
 * A Fase 6 prometeu sete números e entregou três. Os outros quatro — ranking
 * por operador, destaque do dia, vendas por estado e formas de pagamento —
 * nunca saíram do plano, e os painéis da Fase 9 não existem sem eles. Estão
 * todos aqui, e aqui é o único lugar onde estão.
 *
 * ## Por que em memória, e não em SQL
 *
 * Porque o mês do setor cabe na mão: 140 vendas em setembro, 3.038 linhas no
 * retrato da empresa inteira. A lista já chegou — `useVendas` a carrega para a
 * aba Vendas —, já veio recortada pela RLS, e reagrupá-la custa uma passada.
 *
 * Uma RPC por recorte custaria cinco idas ao banco para responder o que uma
 * lista na memória responde de graça, e criaria cinco lugares onde a régua
 * «confirmada E assinada» poderia ser esquecida. Aqui ela é esquecida em zero:
 * toda contagem passa por `resumirVendas`, de `@/lib/vendas`.
 *
 * O dia em que o Comercial tiver o volume da cobrança, a conta muda de lugar —
 * e o teste destes agrupadores é o que dirá se a versão SQL devolve o mesmo.
 *
 * ## A régua não se reescreve, e o robô não muda régua
 *
 * `perfis.robo` **não altera o que conta**: a venda do robô é confirmada,
 * assinada, entrou no caixa do setor e soma no total. O que ele muda é o
 * PLACAR POR CABEÇA — comparar uma pessoa com uma automação que trabalha 24
 * horas não mede nada. Por isso a separação acontece na hora de ranquear, e
 * nunca na hora de somar.
 */
import {
  classificarVenda, resumirVendas,
  type ResumoVendas, type VendaSomavel, type EixoDaVenda,
} from '@/lib/vendas';

/* ── O que cada função precisa saber de uma venda ─────────────────────────── */

/** O mínimo para agrupar: a régua, o valor e a chave do agrupamento. */
export interface VendaAgrupavel extends VendaSomavel {
  operador_id: string;
  equipe_id: string | null;
  setor_id: string | null;
  uf: string | null;
  forma_pagamento: string | null;
  data_venda: string;
  data_confirmacao?: string | null;
  perfis?: { id: string; nome: string } | null;
}

/**
 * Quem é robô, e o que mais a tela precisa saber da pessoa.
 *
 * Vem de `fn_vendas_placar_pessoas`. É **cadastro**, nunca o prefixo `ia_` do
 * login — ver `pareceLoginDeIa` em `@/lib/vendas`, que oferece palpite e não
 * decide nada.
 */
export interface PessoaDoPlacar {
  id: string;
  nome: string;
  robo: boolean;
  equipe_id: string | null;
  equipe_nome: string | null;
  setor_id: string | null;
  setor_nome: string | null;
}

/** O índice por id, para as funções não varrerem a lista a cada linha. */
export type IndicePessoas = ReadonlyMap<string, PessoaDoPlacar>;

export function indexarPessoas(pessoas: readonly PessoaDoPlacar[]): IndicePessoas {
  return new Map(pessoas.map(p => [p.id, p]));
}

/* ── Ranking por operador ─────────────────────────────────────────────────── */

export interface LinhaDoPlacar {
  operadorId: string;
  nome: string;
  /** Cadastro, não palpite. `false` quando a pessoa não está no índice. */
  robo: boolean;
  equipeId: string | null;
  equipeNome: string | null;
  setorId: string | null;
  setorNome: string | null;
  /** O resumo completo: as duas réguas, as cinco gavetas e os percentuais. */
  resumo: ResumoVendas;
}

/**
 * Uma linha por operador que aparece na lista, ordenada pela régua pedida.
 *
 * Ordena por `valor` ou por `quantidade` porque a meta do setor pode ser
 * qualquer uma das duas, e um ranking que ordena pela régua errada premia
 * exatamente quem a configuração decidiu não premiar.
 *
 * O desempate é o nome, e não o id: dois operadores empatados em zero têm de
 * sair na mesma ordem em toda renderização, ou a lista pisca ao recarregar.
 *
 * **Não separa robô de gente.** Quem quiser o placar por cabeça chama
 * `separarAutomacao` — a separação é decisão de quem mostra, e deixá-la aqui
 * faria o total do setor perder as vendas da automação em silêncio.
 */
export function placarPorOperador(
  vendas: readonly VendaAgrupavel[],
  pessoas: IndicePessoas,
  ordenarPor: 'valor' | 'quantidade' = 'valor',
): LinhaDoPlacar[] {
  const porPessoa = new Map<string, VendaAgrupavel[]>();
  for (const v of vendas) {
    const lista = porPessoa.get(v.operador_id);
    if (lista) lista.push(v); else porPessoa.set(v.operador_id, [v]);
  }

  const linhas = [...porPessoa].map(([operadorId, lista]): LinhaDoPlacar => {
    const cadastro = pessoas.get(operadorId);
    const primeira = lista[0];
    return {
      operadorId,
      // A ordem das fontes importa: o cadastro vence o join da venda, porque o
      // join congela o nome de quando a venda foi gravada e o cadastro é hoje.
      nome: cadastro?.nome ?? primeira.perfis?.nome ?? 'Sem nome',
      robo: cadastro?.robo ?? false,
      equipeId:   cadastro?.equipe_id   ?? primeira.equipe_id ?? null,
      equipeNome: cadastro?.equipe_nome ?? null,
      setorId:    cadastro?.setor_id    ?? primeira.setor_id ?? null,
      setorNome:  cadastro?.setor_nome  ?? null,
      resumo: resumirVendas(lista),
    };
  });

  return ordenarPlacar(linhas, ordenarPor);
}

/** Ordena um placar já montado, sem refazer as contas. */
export function ordenarPlacar(
  linhas: readonly LinhaDoPlacar[],
  ordenarPor: 'valor' | 'quantidade',
): LinhaDoPlacar[] {
  return [...linhas].sort((a, b) => {
    const da = ordenarPor === 'valor' ? a.resumo.valor : a.resumo.quantidade;
    const db = ordenarPor === 'valor' ? b.resumo.valor : b.resumo.quantidade;
    if (db !== da) return db - da;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * Gente de um lado, automação do outro.
 *
 * As duas listas somadas continuam sendo o setor inteiro — nenhuma venda se
 * perde na separação, e é isso que a torna segura de usar em cima de um total.
 */
export function separarAutomacao(
  linhas: readonly LinhaDoPlacar[],
): { pessoas: LinhaDoPlacar[]; automacao: LinhaDoPlacar[] } {
  const pessoas: LinhaDoPlacar[] = [];
  const automacao: LinhaDoPlacar[] = [];
  for (const l of linhas) (l.robo ? automacao : pessoas).push(l);
  return { pessoas, automacao };
}

/* ── Ranking por equipe ───────────────────────────────────────────────────── */

export interface LinhaDaEquipe {
  /** `null` = as vendas de quem não tem equipe. Aparece, não some. */
  equipeId: string | null;
  nome: string;
  /** Quantas pessoas da equipe venderam no recorte — sem contar a automação. */
  pessoas: number;
  resumo: ResumoVendas;
}

const SEM_EQUIPE = '__sem_equipe__';

/**
 * A equipe que conta uma venda: a do cadastro de hoje, com a gravada na venda
 * como reserva. `null` = ninguém conta — quem está sem equipe, e a automação.
 *
 * É a regra de `placarPorEquipe`, com nome, desde que os painéis do Comercial
 * passaram a recortar a lista de vendas por equipe (16/09/2026): um recorte
 * que decidisse a equipe de outro jeito mostraria no card um número diferente
 * do da linha da mesma equipe no placar.
 */
export function equipeDaVenda(
  venda: Pick<VendaAgrupavel, 'operador_id' | 'equipe_id'>,
  pessoas: IndicePessoas,
): string | null {
  return pessoas.get(venda.operador_id)?.equipe_id ?? venda.equipe_id ?? null;
}

/**
 * Uma linha por equipe, com a gaveta «Sem equipe» sempre por último.
 *
 * Sem equipe **não some**: eram 9 das 138 vendas do setor na medição de 15/09,
 * e uma tela que as esconde mostra um total por equipe que não bate com o
 * total do setor — o defeito que o Fechamento existe para tornar impossível.
 */
export function placarPorEquipe(
  vendas: readonly VendaAgrupavel[],
  pessoas: IndicePessoas,
): LinhaDaEquipe[] {
  const grupos = new Map<string, { nome: string; vendas: VendaAgrupavel[]; gente: Set<string> }>();

  for (const v of vendas) {
    const cadastro = pessoas.get(v.operador_id);
    const id = equipeDaVenda(v, pessoas) ?? SEM_EQUIPE;
    const nome = cadastro?.equipe_nome ?? (id === SEM_EQUIPE ? 'Sem equipe' : 'Equipe');
    let g = grupos.get(id);
    if (!g) { g = { nome, vendas: [], gente: new Set() }; grupos.set(id, g); }
    // O nome bom é o do cadastro; a primeira linha pode ter chegado por uma
    // venda cujo operador não está no índice.
    if (cadastro?.equipe_nome) g.nome = cadastro.equipe_nome;
    g.vendas.push(v);
    if (!cadastro?.robo) g.gente.add(v.operador_id);
  }

  return [...grupos]
    .map(([id, g]): LinhaDaEquipe => ({
      equipeId: id === SEM_EQUIPE ? null : id,
      nome: g.nome,
      pessoas: g.gente.size,
      resumo: resumirVendas(g.vendas),
    }))
    .sort((a, b) => {
      // «Sem equipe» é sempre o rodapé da tabela: é resíduo a resolver, não um
      // concorrente no ranking.
      if ((a.equipeId === null) !== (b.equipeId === null)) return a.equipeId === null ? 1 : -1;
      if (b.resumo.valor !== a.resumo.valor) return b.resumo.valor - a.resumo.valor;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

/* ── Recortes simples: estado e forma de pagamento ────────────────────────── */

export interface FatiaSimples {
  chave: string;
  rotulo: string;
  quantidade: number;
  valor: number;
  /** `valor ÷ total`, para a barra. `0` quando o total é zero. */
  fracao: number;
}

function fatiar(
  vendas: readonly VendaAgrupavel[],
  chavear: (v: VendaAgrupavel) => { chave: string; rotulo: string },
): FatiaSimples[] {
  const mapa = new Map<string, { rotulo: string; quantidade: number; valor: number }>();
  let total = 0;

  for (const v of vendas) {
    if (classificarVenda(v) !== 'na_meta') continue;
    const { chave, rotulo } = chavear(v);
    const valor = Number(v.valor_total) || 0;
    const atual = mapa.get(chave);
    if (atual) { atual.quantidade += 1; atual.valor += valor; }
    else mapa.set(chave, { rotulo, quantidade: 1, valor });
    total += valor;
  }

  return [...mapa]
    .map(([chave, f]) => ({
      chave, rotulo: f.rotulo, quantidade: f.quantidade, valor: f.valor,
      fracao: total > 0 ? f.valor / total : 0,
    }))
    .sort((a, b) => (b.valor !== a.valor ? b.valor - a.valor : b.quantidade - a.quantidade));
}

/**
 * Vendas por estado (UF), só o que está na régua.
 *
 * Fora da régua não entra: um mapa que pinta São Paulo com vendas canceladas
 * responde a pergunta errada. A perda por estado é outra tela, e ainda não foi
 * pedida.
 *
 * UF vazia vira «Sem UF» em vez de sumir — o relatório traz linha sem estado, e
 * a soma das fatias tem de bater com o total.
 */
export function vendasPorUF(vendas: readonly VendaAgrupavel[]): FatiaSimples[] {
  return fatiar(vendas, v => {
    const uf = (v.uf ?? '').trim().toUpperCase();
    return uf ? { chave: uf, rotulo: uf } : { chave: '__sem_uf__', rotulo: 'Sem UF' };
  });
}

/**
 * Vendas por forma de pagamento.
 *
 * `TipoRecebimento` é CLASSIFICAÇÃO, nunca valor — a regra R4 do plano, medida:
 * as três colunas de decomposição do relatório somam R$ 27.437,73 a mais que o
 * total recebido, e 66 linhas marcadas «SEM RECEBIMENTO» trazem valor na
 * decomposição. Por isso esta função conta e soma `valor_total`, e não tenta
 * reconstruir quanto entrou por cada meio.
 */
export function vendasPorFormaDePagamento(vendas: readonly VendaAgrupavel[]): FatiaSimples[] {
  return fatiar(vendas, v => {
    const forma = (v.forma_pagamento ?? '').trim();
    return forma
      ? { chave: forma.toLowerCase(), rotulo: forma }
      : { chave: '__sem_forma__', rotulo: 'Sem forma registrada' };
  });
}

/* ── O dia ────────────────────────────────────────────────────────────────── */

export interface PontoDoDia {
  dia: string;
  quantidade: number;
  valor: number;
}

function diaDoEixo(
  v: { data_venda: string; data_confirmacao?: string | null },
  eixo: EixoDaVenda,
): string {
  const bruto = eixo === 'venda' ? v.data_venda : (v.data_confirmacao || v.data_venda);
  return String(bruto ?? '').slice(0, 10);
}

/**
 * A série do mês, dia a dia, pelo eixo escolhido.
 *
 * Em ordem crescente — ao contrário da pilha da aba Vendas, que abre no dia de
 * hoje. Gráfico se lê da esquerda para a direita, e lista de trabalho se lê de
 * cima para baixo; são duas perguntas, e cada uma tem a sua ordem.
 *
 * Dias sem venda **não são preenchidos com zero**: quem desenha decide se o
 * fim de semana vira buraco ou vira base. Inventar o zero aqui tiraria essa
 * escolha de quem a tem.
 */
export function serieDiaria(
  vendas: readonly VendaAgrupavel[],
  eixo: EixoDaVenda,
): PontoDoDia[] {
  const mapa = new Map<string, { quantidade: number; valor: number }>();

  for (const v of vendas) {
    if (classificarVenda(v) !== 'na_meta') continue;
    const dia = diaDoEixo(v, eixo);
    const valor = Number(v.valor_total) || 0;
    const atual = mapa.get(dia);
    if (atual) { atual.quantidade += 1; atual.valor += valor; }
    else mapa.set(dia, { quantidade: 1, valor });
  }

  return [...mapa]
    .map(([dia, p]) => ({ dia, ...p }))
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

export interface Destaque {
  dia: string;
  linha: LinhaDoPlacar;
}

/**
 * O destaque do dia: quem mais vendeu no último dia que teve venda.
 *
 * «Último dia com venda» e não «hoje»: às 8h de uma segunda-feira ninguém
 * vendeu ainda, e um card vazio ensina a ignorar o card. O dia mostrado vai
 * junto, sempre, para que ninguém leia sexta-feira como hoje.
 *
 * **A automação não disputa.** Um robô que roda a noite inteira seria o
 * destaque de todo dia, e o card deixaria de dizer alguma coisa sobre alguém.
 *
 * `null` quando não houve venda nenhuma na régua — e nesse caso a tela escreve
 * isso, em vez de mostrar um pódio com um traço em cima.
 */
export function destaqueDoDia(
  vendas: readonly VendaAgrupavel[],
  pessoas: IndicePessoas,
  eixo: EixoDaVenda,
  ordenarPor: 'valor' | 'quantidade' = 'valor',
): Destaque | null {
  let ultimo = '';
  for (const v of vendas) {
    if (classificarVenda(v) !== 'na_meta') continue;
    const dia = diaDoEixo(v, eixo);
    if (dia > ultimo) ultimo = dia;
  }
  if (!ultimo) return null;

  const doDia = vendas.filter(
    v => classificarVenda(v) === 'na_meta' && diaDoEixo(v, eixo) === ultimo,
  );
  const { pessoas: gente } = separarAutomacao(
    placarPorOperador(doDia, pessoas, ordenarPor),
  );
  if (gente.length === 0) return null;

  return { dia: ultimo, linha: gente[0] };
}

/* ── O total, com a fatia da automação ────────────────────────────────────── */

export interface TotalDoRecorte {
  resumo: ResumoVendas;
  /** Quanto do faturamento da régua veio de robô. `0` quando não há automação. */
  valorAutomacao: number;
  quantidadeAutomacao: number;
  /** `valorAutomacao ÷ resumo.valor`. `null` quando não há faturamento. */
  fracaoAutomacao: number | null;
  /** Quantas pessoas de verdade venderam no recorte. */
  pessoasQueVenderam: number;
}

/**
 * O total do recorte e o quanto dele é automação.
 *
 * O total **inclui** o robô, sempre — ele vendeu, o dinheiro entrou, e tirá-lo
 * do total faria a tela discordar do Fechamento. O que a fração responde é
 * outra pergunta: «quanto deste resultado não veio de gente?»
 */
export function totalDoRecorte(
  vendas: readonly VendaAgrupavel[],
  pessoas: IndicePessoas,
): TotalDoRecorte {
  const resumo = resumirVendas(vendas);
  let valorAutomacao = 0;
  let quantidadeAutomacao = 0;
  const gente = new Set<string>();

  for (const v of vendas) {
    if (classificarVenda(v) !== 'na_meta') continue;
    if (pessoas.get(v.operador_id)?.robo) {
      valorAutomacao += Number(v.valor_total) || 0;
      quantidadeAutomacao += 1;
    } else {
      gente.add(v.operador_id);
    }
  }

  return {
    resumo,
    valorAutomacao,
    quantidadeAutomacao,
    fracaoAutomacao: resumo.valor > 0 ? valorAutomacao / resumo.valor : null,
    pessoasQueVenderam: gente.size,
  };
}
