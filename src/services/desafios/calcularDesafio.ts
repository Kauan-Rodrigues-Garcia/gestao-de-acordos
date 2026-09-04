/**
 * calcularDesafio.ts — a conta do desafio, e nada além dela.
 *
 * ## O que entra e o que sai
 *
 * Entra a configuração da campanha e o quadro que `fn_desafio_dados` devolveu:
 * as pessoas e o recebimento já agregado por operador no período. Sai o
 * ranking individual, o ranking de equipes e os totais.
 *
 * Não há aqui nenhuma busca, nenhum `useState` e nenhuma data de campanha
 * escrita à mão. É função pura, e é por isso que ela pode ser testada sem
 * banco — `calcularDesafio.test.ts`.
 *
 * ## De onde vem o dinheiro
 *
 * De `analitico_recebimentos`, pela mesma definição de linha válida que o
 * dashboard usa: mesma tabela, mesmo intervalo de `data_pagamento`, mesmo
 * carimbo de setor. O desafio não soma nada por conta própria — ele recorta
 * pelo período configurado o que o Analítico já contou.
 *
 * ## Quem disputa
 *
 * O conjunto de participantes é da CAMPANHA, não do escopo de leitura de quem
 * abriu a tela. É a diferença entre "quanto eu posso ver" e "quem está no
 * placar": uma gincana com prêmio é afixada na parede, e um ranking em que
 * cada pessoa enxerga só a própria barra não é ranking. O recorte por setor,
 * equipe ou operador vem de `regra.participantes`, escolhido por quem
 * configurou; o filtro de setor da tela entra por cima, para quem o tem.
 *
 * A pergunta "esta pessoa conta neste setor/equipe?" NÃO é respondida aqui:
 * ela chega pronta em `pessoa.setores` e `pessoa.equipes`, que o servidor monta
 * com a mesma regra de `setoresDoOperador` — cadastro mais os clones com
 * `conta_recebimento` ligado.
 */
import { calcularProjecao } from '@/lib/projecaoMetas';

import type {
  ContextoEquipe, CriterioRanking, DadosDesafio, Desafio, LinhaDesafio,
  PessoaDesafio,
} from './types';

export interface ResultadoParticipante {
  pessoa: PessoaDesafio;
  /** 1-based. */
  posicao: number;
  recebido: number;
  qtd: number;
  /** `null` quando o modelo não usa meta. */
  meta: number | null;
  /** `MAX(meta - recebido, 0)`. Zero também quando não há meta. */
  falta: number;
  /** Percentual da meta. Pode passar de 100 — não é erro. */
  progresso: number;
  bateuMeta: boolean;
  /**
   * Quanto falta para alcançar quem está imediatamente acima, em dinheiro.
   * `null` para quem lidera.
   */
  paraUltrapassar: number | null;
  nomeAcima: string | null;
}

export interface ResultadoEquipe {
  equipeId: string;
  equipeNome: string;
  posicao: number;
  recebido: number;
  qtd: number;
  meta: number | null;
  /**
   * A meta da equipe é a SOMA dos desafios de quem está nela, e não um número
   * que alguém definiu para a equipe.
   *
   * A distinção é do pedido e muda o que a tela diz: numa campanha em que só os
   * operadores têm desafio, a linha da equipe é PROJEÇÃO — serve para o líder
   * acompanhar e projetar, não é um alvo que a equipe ganha ou perde.
   */
  metaDerivada: boolean;
  falta: number;
  progresso: number;
  bateuMeta: boolean;
  /** Quantos integrantes já concluíram o próprio desafio. */
  concluiram: number;
  paraUltrapassar: number | null;
  /** Os integrantes, já ordenados pelo mesmo critério da campanha. */
  integrantes: ResultadoParticipante[];
}

export interface ResultadoDesafio {
  individual: ResultadoParticipante[];
  equipes: ResultadoEquipe[];
  totalRecebido: number;
  totalQtd: number;
  totalParticipantes: number;
  totalEquipes: number;
  metaColetiva: number | null;
  faltaColetiva: number;
  progressoColetivo: number;
}

export interface ParametrosCalculo {
  desafio: Desafio;
  dados: DadosDesafio;
  /**
   * Férias e desligamento somem do ranking — a mesma regra do ranking do
   * Analítico (`idsOcultosRankingQuartil`). Some da EXIBIÇÃO: o recebimento
   * dessas pessoas continua inteiro no Analítico.
   */
  ocultos?: ReadonlySet<string>;
  /**
   * Setor escolhido no filtro da tela, para quem tem o nível `todos_setores`.
   * `null` = a campanha inteira, como configurada.
   */
  filtroSetorId?: string | null;
  /**
   * Setor de quem está olhando, para a campanha com `escopoDisputa = 'setor'`.
   *
   * Só é lido nesse modo. Sem ele — e sem filtro escolhido — a campanha de
   * setor não teria contra quem recortar, e cai no placar inteiro: mostrar
   * demais é preferível a mostrar uma tela vazia sem explicação.
   */
  setorDoUsuario?: string | null;
  /**
   * Metas de equipe e dias úteis, para `regra.fonteMeta` de equipe.
   *
   * Ausente numa campanha que pede meta de equipe, os participantes ficam sem
   * meta — e não com meta zero. É a leitura honesta enquanto a consulta não
   * voltou: a tela mostra "—" em vez de anunciar que todo mundo bateu.
   */
  contextoEquipe?: ContextoEquipe | null;
}

// ── Peças ────────────────────────────────────────────────────────────────────

/** A soma de uma pessoa no período, na métrica da campanha. */
export interface SomaOperador { total: number; qtd: number }

const ZERO: SomaOperador = { total: 0, qtd: 0 };

/** Recebimento por operador. Uma passada; nada de somar por pessoa. */
export function somarPorOperador(linhas: readonly LinhaDesafio[]): Map<string, SomaOperador> {
  const mapa = new Map<string, SomaOperador>();
  for (const l of linhas) {
    if (!l.operador_id) continue;
    const atual = mapa.get(l.operador_id);
    const total = Number(l.total) || 0;
    const qtd   = Number(l.qtd)   || 0;
    if (atual) { atual.total += total; atual.qtd += qtd; }
    else       { mapa.set(l.operador_id, { total, qtd }); }
  }
  return mapa;
}

/**
 * A pessoa disputa esta campanha?
 *
 * Lista vazia em `regra.participantes` não é "ninguém": é "sem recorte nessa
 * dimensão", que é o caso comum — a campanha vale para a operação inteira.
 * As três dimensões são um E: marcar um setor E uma equipe pede quem está nos
 * dois.
 */
export function participaDaCampanha(pessoa: PessoaDesafio, desafio: Desafio): boolean {
  const { participantes, metasPorOperador } = desafio.regra;
  /*
   * As listas ausentes viram vazias AQUI, e não só no normalizador.
   *
   * `normalizarParticipantes` cobre o que vem do banco, mas esta função também
   * recebe campanha montada em memória — pré-visualização na tela de
   * configuração, e os casos de teste. Uma lista nova no tipo não pode
   * derrubar o ranking de quem ainda não a tem.
   */
  const setores    = participantes.setores    ?? [];
  const equipes    = participantes.equipes    ?? [];
  const operadores = participantes.operadores ?? [];
  const cargos     = participantes.cargos     ?? [];
  const excluidos  = participantes.excluidos  ?? [];
  const convidados = participantes.convidados ?? [];

  /*
   * A exclusão vem PRIMEIRO, antes do convidado e antes do mapa de metas.
   *
   * Ela é a única lista escrita para tirar alguém, e quem a preenche está
   * dizendo «esta pessoa não, mesmo que tudo o mais a inclua». Avaliá-la
   * depois faria uma meta nominal na planilha reviver quem a gerência acabou
   * de remover pela tela.
   */
  if (excluidos.length && excluidos.includes(pessoa.id)) return false;

  /*
   * MODO TESTE: um convidado sequer fecha a campanha.
   *
   * Com a lista preenchida, disputam os convidados e mais ninguém — a operação
   * inteira fica de fora. Teste é uma coisa fechada: quem se convida para
   * conferir a campanha antes de publicar não quer conferi-la com duzentas e
   * trinta e seis pessoas no placar; quer ver a tela funcionando com ele
   * dentro.
   *
   * O recorte de setor, equipe e cargo não é apagado — ele fica guardado na
   * campanha e volta a valer no instante em que a lista esvaziar. Publicar é
   * esvaziar a lista.
   *
   * O convidado também não passa pelo mapa de metas: ele nunca vai ter uma, e
   * a peneira seguinte o derrubaria no passo em que acabou de ser convidado.
   */
  if (convidados.length) return convidados.includes(pessoa.id);

  /*
   * Mapa de metas preenchido É a convocação: quem não tem meta não disputa.
   * Sem isto, a operação inteira entraria zerada num ranking de 27 pessoas.
   *
   * Só vale quando a meta VEM do mapa. Com a meta saindo da equipe, o mapa não
   * tem por que decidir quem entra — e decidiria mal: nenhum líder tem meta
   * individual, então um mapa esquecido de uma versão anterior da campanha
   * esvaziaria justamente o ranking de líderes que o modo existe para montar.
   */
  if (!usaMetaDaEquipe(desafio.regra)
      && Object.keys(metasPorOperador).length > 0
      && metaNoMapa(pessoa, metasPorOperador) === null) {
    return false;
  }
  if (operadores.length && !operadores.includes(pessoa.id)) return false;
  if (setores.length   && !pessoa.setores.some(s => setores.includes(s))) return false;
  if (equipes.length   && !pessoa.equipes.some(e => equipes.includes(e))) return false;
  // Recorte por cargo: é o que faz «a disputa dos líderes destes cinco
  // setores» caber em cinco cliques em vez de quarenta nomes.
  if (cargos.length    && !cargos.includes(pessoa.perfil)) return false;
  return true;
}

/**
 * O recebimento que conta para esta pessoa.
 *
 * `proprio` soma o card dela. `equipe_liderada` soma o de TODA GENTE da equipe
 * dela — que é o número que existe quando quem disputa é o líder: ele não
 * tabula, e o card próprio dele viria zerado num ranking em que ele deveria
 * estar na frente.
 *
 * A equipe usada é `pessoa.equipeId`, a mesma que agrupa os cards de equipe. O
 * líder chega aqui já com ela preenchida: `fn_desafio_pessoas_multi` resolve
 * `equipe_lideres` para quem lidera uma equipe só.
 */
export function somaDoParticipante(
  pessoa: PessoaDesafio,
  desafio: Desafio,
  somas: ReadonlyMap<string, SomaOperador>,
  elenco: readonly PessoaDesafio[],
): SomaOperador {
  if (desafio.regra.fonteResultado !== 'equipe_liderada') {
    return somas.get(pessoa.id) ?? ZERO;
  }
  const equipes = equipesDoLider(pessoa, desafio.regra);
  if (equipes.length === 0) return ZERO;

  let total = 0;
  let qtd = 0;
  for (const equipeId of equipes) {
    const s = somaDaEquipe(equipeId, somas, elenco);
    total += s.total;
    qtd   += s.qtd;
  }
  return { total, qtd };
}

/**
 * As equipes que contam para este líder.
 *
 * `equipe_unica` fica na equipe resolvida pela RPC — o comportamento de sempre,
 * e o de quem lidera uma só.
 *
 * `media_das_equipes` usa `equipesLideradas`: as equipes que ele lidera DENTRO
 * do setor dele. É o que desempata o setor montado por clones, onde a mesma
 * equipe existe duas vezes — a original, no setor de origem, e o espelho no
 * setor do líder. Somar as duas contaria o mesmo dinheiro em dobro.
 *
 * A reserva para `equipeId` existe porque a campanha gravada antes deste campo
 * e a pré-visualização montada em memória chegam sem `equipesLideradas`.
 */
export function equipesDoLider(
  pessoa: PessoaDesafio,
  regra: Desafio['regra'],
): string[] {
  if (regra.agregacaoLider === 'media_das_equipes') {
    const lista = pessoa.equipesLideradas ?? [];
    if (lista.length > 0) return lista;
  }
  return pessoa.equipeId ? [pessoa.equipeId] : [];
}

/** O recebimento de uma equipe: a soma de quem está nela. */
function somaDaEquipe(
  equipeId: string,
  somas: ReadonlyMap<string, SomaOperador>,
  elenco: readonly PessoaDesafio[],
): SomaOperador {
  let total = 0;
  let qtd = 0;
  for (const membro of elenco) {
    // `equipes` traz a do cadastro E as clonadas que contam — é assim que o
    // espelho no setor do líder encontra as pessoas, que estão cadastradas no
    // setor de origem e aparecem aqui como clones.
    const pertence = membro.equipeId === equipeId
      || (membro.equipes ?? []).includes(equipeId);
    if (!pertence) continue;
    const s = somas.get(membro.id);
    if (!s) continue;
    total += s.total;
    qtd   += s.qtd;
  }
  return { total, qtd };
}

/** Recebido, alvo e nota de um líder que responde por várias equipes. */
export interface NotaDoLider {
  /** Soma do recebido das equipes que têm meta. */
  recebido: number;
  qtd: number;
  /** Soma do alvo (meta cheia ou projeção) das mesmas equipes. */
  meta: number | null;
  /** MÉDIA das porcentagens, uma por equipe. É a nota do ranking. */
  progresso: number;
  /** Quantas equipes entraram na média. */
  equipes: number;
}

/**
 * A nota de um líder de várias equipes.
 *
 * Cada equipe rende uma porcentagem — recebido dela sobre o alvo dela — e a
 * nota é a MÉDIA dessas porcentagens.
 *
 * ## Média, e não soma sobre soma
 *
 * Somar recebido e somar meta faria a equipe maior decidir sozinha. No setor
 * Marília Digital as metas de setembro são R$ 210.000, R$ 50.000 e R$ 40.000:
 * a primeira pesaria 70% da nota, e as outras duas viravam ruído. A média
 * trata as três como três responsabilidades — que é o que elas são para quem
 * lidera as três.
 *
 * ## Equipe sem meta fica fora
 *
 * Ela não rende porcentagem, e somar o dinheiro dela ao `recebido` enquanto
 * ela não entra na média produziria um card em que nenhum número explica o
 * outro. Sem nenhuma equipe com meta, devolve `meta: null` — «sem meta», que
 * a tela já sabe mostrar, e não «meta zerada».
 */
export function notaDoLider(
  pessoa: PessoaDesafio,
  desafio: Desafio,
  somas: ReadonlyMap<string, SomaOperador>,
  elenco: readonly PessoaDesafio[],
  contexto: ContextoEquipe | null | undefined,
  porQuantidade: boolean,
): NotaDoLider {
  const equipes = equipesDoLider(pessoa, desafio.regra);
  let recebido = 0;
  let qtd = 0;
  let alvo = 0;
  let somaPct = 0;
  let contadas = 0;

  for (const equipeId of equipes) {
    const meta = alvoDaEquipe(equipeId, desafio.regra, contexto);
    if (meta === null || meta <= 0) continue;
    const s = somaDaEquipe(equipeId, somas, elenco);
    const valor = porQuantidade ? s.qtd : s.total;
    recebido += valor;
    qtd      += s.qtd;
    alvo     += meta;
    somaPct  += (valor / meta) * 100;
    contadas += 1;
  }

  if (contadas === 0) return { recebido: 0, qtd: 0, meta: null, progresso: 0, equipes: 0 };
  return { recebido, qtd, meta: alvo, progresso: somaPct / contadas, equipes: contadas };
}

/**
 * Login como chave de meta: minúsculas, sem o que não é letra, número ou `_`.
 *
 * As metas chegam de planilha, e lá o login vem como a pessoa digitou —
 * `NAYARA_CRUZ`, `debora_portela  |`. Normalizar aqui evita que um espaço
 * sobrando deixe alguém de fora da campanha.
 */
export function chaveDeLogin(usuario: string | null | undefined): string {
  return (usuario ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** A meta desta pessoa no mapa, por id ou por login. `null` = não está lá. */
function metaNoMapa(
  pessoa: PessoaDesafio, mapa: Record<string, number>,
): number | null {
  const porId = mapa[pessoa.id];
  if (typeof porId === 'number' && Number.isFinite(porId)) return porId;
  const porLogin = mapa[chaveDeLogin(pessoa.usuario)];
  if (typeof porLogin === 'number' && Number.isFinite(porLogin)) return porLogin;
  return null;
}

/**
 * A meta de um participante.
 *
 * Com `fonteMeta = 'individual'` — o padrão — a pessoal manda e a da campanha é
 * o padrão de quem não tem uma. É o que permite uma gincana em que cada
 * operador tem um número diferente sem que a tela precise saber disso.
 *
 * Os outros dois modos existem para a disputa entre líderes, e leem a meta da
 * EQUIPE. Ver `metaVindaDaEquipe`.
 */
export function metaDoParticipante(
  pessoa: PessoaDesafio,
  regra: Desafio['regra'],
  contexto?: ContextoEquipe | null,
): number | null {
  if (usaMetaDaEquipe(regra)) return metaVindaDaEquipe(pessoa, regra, contexto);
  return metaNoMapa(pessoa, regra.metasPorOperador) ?? regra.metaIndividual;
}

/**
 * A campanha tira a meta da equipe?
 *
 * Pergunta pelo que o modo É, e não pelo que ele não é. A diferença importa:
 * campanha montada em memória — a pré-visualização da tela de configuração e
 * os casos de teste — chega aqui sem `fonteMeta`, e `!== 'individual'` daria
 * verdadeiro para `undefined`, mandando para o caminho da equipe toda campanha
 * que ainda não conhece o campo. É a mesma precaução que `participaDaCampanha`
 * toma com as listas de participantes, e pelo mesmo motivo.
 */
export function usaMetaDaEquipe(regra: Desafio['regra']): boolean {
  return regra.fonteMeta === 'meta_equipe' || regra.fonteMeta === 'projecao_equipe';
}

/**
 * A campanha é uma corrida de PROJEÇÃO?
 *
 * `projecao_equipe` mede contra «quanto já deveria ter entrado até hoje» — um
 * alvo que se move todo dia útil. Isso muda o que a campanha É:
 *
 *   • **Não existe concluir.** Passar de 100% hoje não garante nada: amanhã o
 *     esperado sobe e a mesma equipe pode estar em 90%. Quem ganha é quem
 *     estiver na frente no ÚLTIMO dia, e antes disso não há vencedor.
 *
 *   • **O número que importa é o percentual, não o dinheiro.** As equipes têm
 *     metas de R$ 20.000 e de R$ 210.000; comparar o caixa delas não ordena
 *     nada, e destacá-lo na tela sugere uma disputa que não é a que está
 *     acontecendo.
 *
 * A tela lê isto para trocar o destaque e apagar tudo o que fala em conclusão.
 * `bateuMeta` fica falso pelo mesmo motivo — é ele que acende o selo, o
 * contador e a comemoração.
 */
export function ehCorridaDeProjecao(regra: Desafio['regra']): boolean {
  return regra.fonteMeta === 'projecao_equipe';
}

/**
 * A meta que vem da equipe liderada — cheia ou proporcional ao mês corrido.
 *
 * `meta_equipe` devolve a meta mensal da equipe como está na aba Metas.
 *
 * `projecao_equipe` devolve o `esperado` de `calcularProjecao`: quanto dessa
 * meta já deveria ter entrado até hoje. É a MESMA função que Desempenho
 * Equipes usa para dizer se a equipe está no ritmo, chamada com os mesmos dias
 * úteis — de propósito. Reescrever `meta ÷ dias × decorridos` aqui criaria a
 * terceira cópia de uma conta que `lib/projecaoMetas` existe para ter uma só,
 * e as duas telas passariam a discordar no primeiro ajuste.
 *
 * `null` em três casos, todos legítimos: a pessoa não lidera equipe nenhuma, a
 * equipe não tem meta no mês, ou o contexto não foi carregado. `null` é «sem
 * meta», e a tela já sabe mostrar isso — um zero aqui viraria «meta batida».
 *
 * Os quartis não são passados porque nada do que se usa aqui depende deles:
 * `esperado` sai de meta e dias. Faixa de quartil é leitura do painel, não do
 * ranking da campanha.
 */
function metaVindaDaEquipe(
  pessoa: PessoaDesafio,
  regra: Desafio['regra'],
  contexto?: ContextoEquipe | null,
): number | null {
  const equipes = equipesDoLider(pessoa, regra);
  if (equipes.length === 0) return null;

  // Com várias equipes o alvo é a SOMA dos alvos — é contra ele que a falta e
  // a barra fazem sentido. A NOTA do ranking não sai daqui: ela é a média das
  // porcentagens, e vive em `notaDoLider`.
  let total = 0;
  let achou = false;
  for (const equipeId of equipes) {
    const alvo = alvoDaEquipe(equipeId, regra, contexto);
    if (alvo === null) continue;
    total += alvo;
    achou = true;
  }
  return achou ? total : null;
}

/**
 * O alvo de UMA equipe: a meta cheia do mês, ou quanto dela já deveria ter
 * entrado até hoje.
 *
 * `projecao_equipe` chama `calcularProjecao` de `lib/projecaoMetas` — a mesma
 * função que Desempenho Equipes usa, com os mesmos dias úteis. Reescrever
 * `meta ÷ dias úteis × decorridos` aqui criaria a terceira cópia de uma conta
 * que existe para ter uma só, e as telas passariam a divergir no primeiro
 * ajuste.
 */
export function alvoDaEquipe(
  equipeId: string,
  regra: Desafio['regra'],
  contexto?: ContextoEquipe | null,
): number | null {
  if (!contexto) return null;
  const metaMensal = contexto.metaPorEquipe[equipeId];
  if (!metaMensal || metaMensal <= 0) return null;

  if (regra.fonteMeta === 'meta_equipe') return metaMensal;

  const proj = calcularProjecao({
    meta: metaMensal,
    recebido: 0,            // só `esperado` interessa, e ele não depende disto
    totalUteis: contexto.totalUteis,
    decorridos: contexto.decorridos,
    quartis: [],
  });
  return proj ? proj.esperado : null;
}

/** `MAX(meta - recebido, 0)`. Sem meta não falta nada. */
export function faltaParaMeta(recebido: number, meta: number | null): number {
  if (!meta || meta <= 0) return 0;
  return Math.max(meta - recebido, 0);
}

/** Percentual da meta. Passar de 100 é resultado, não erro. */
export function progressoDaMeta(recebido: number, meta: number | null): number {
  if (!meta || meta <= 0) return 0;
  return (recebido / meta) * 100;
}

/**
 * A ordem do ranking.
 *
 * O critério é da campanha, não do código: trocar «mais perto da meta» por
 * «maior valor recebido» é editar o desafio. O desempate final é o nome, para
 * que duas atualizações com os mesmos números devolvam a MESMA ordem — sem
 * isso, a animação de ultrapassagem dispararia sozinha.
 */
function comparar(
  a: { recebido: number; falta: number; progresso: number; nome: string },
  b: { recebido: number; falta: number; progresso: number; nome: string },
  criterio: CriterioRanking,
): number {
  if (criterio === 'menor_falta') {
    if (a.falta !== b.falta) return a.falta - b.falta;
    if (b.recebido !== a.recebido) return b.recebido - a.recebido;
  } else if (criterio === 'maior_percentual') {
    if (b.progresso !== a.progresso) return b.progresso - a.progresso;
    if (b.recebido !== a.recebido) return b.recebido - a.recebido;
  } else {
    if (b.recebido !== a.recebido) return b.recebido - a.recebido;
  }
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

/**
 * Carimba posição e a distância para quem está acima.
 *
 * A distância é sempre em DINHEIRO — "faltam R$ 480 para alcançar o 3º" é a
 * frase que o operador entende. O que muda com o critério é QUANTO dinheiro:
 *
 *   • por valor recebido → a diferença bruta entre os dois;
 *   • por percentual da meta → quanto ESTE participante precisa receber para
 *     chegar ao percentual de quem está acima. Com metas diferentes entre as
 *     pessoas, a diferença bruta mentiria: alguém com meta de R$ 15.714 pode
 *     estar à frente de alguém com R$ 40.857 recebendo bem menos, e "faltam R$
 *     25.000 para alcançar" seria o oposto da verdade.
 *   • por menor falta → a diferença entre as faltas, que é o que aproxima a
 *     posição quando o ranking ordena por ela.
 */
function posicionar<T extends {
  recebido: number; falta: number; progresso: number; meta: number | null;
  posicao: number; paraUltrapassar: number | null;
}>(lista: T[], criterio: CriterioRanking): void {
  lista.forEach((item, i) => {
    item.posicao = i + 1;
    const acima = i > 0 ? lista[i - 1] : null;
    if (!acima) { item.paraUltrapassar = null; return; }

    let bruto: number;
    if (criterio === 'maior_percentual' && item.meta && item.meta > 0) {
      bruto = (acima.progresso / 100) * item.meta - item.recebido;
    } else if (criterio === 'menor_falta') {
      bruto = item.falta - acima.falta;
    } else {
      bruto = acima.recebido - item.recebido;
    }
    item.paraUltrapassar = Math.max(bruto, 0);
  });
}

// ── A conta ──────────────────────────────────────────────────────────────────

export function calcularDesafio(params: ParametrosCalculo): ResultadoDesafio {
  const { desafio, dados, ocultos, filtroSetorId, setorDoUsuario, contextoEquipe } = params;
  const { regra } = desafio;
  const criterio = regra.criterioRanking;
  const porQuantidade = regra.metrica === 'quantidade';

  const somas = somarPorOperador(dados.linhas);

  /*
   * O setor que recorta o placar.
   *
   * `escopoDisputa = 'setor'` significa que cada pessoa disputa dentro do
   * próprio setor. Quem escolheu um setor no filtro da tela (só quem tem
   * `todos_setores` tem esse filtro) manda; os demais disputam no setor deles.
   *
   * Com `escopoDisputa = 'empresa'` o único recorte é o filtro da tela — que
   * continua sendo exploração, não regra da campanha.
   */
  const setorDaDisputa =
    // Campanha COM DONO recorta sozinha: quem a criou disse de que setor ela é,
    // e nenhum filtro de tela pode alargar isso. Vem primeiro por ser a
    // afirmação mais forte — as outras duas são preferência de quem olha.
    desafio.setorId
    ?? (regra.escopoDisputa === 'setor'
          ? (filtroSetorId ?? setorDoUsuario ?? null)
          : filtroSetorId ?? null);

  // ── Quem entra ────────────────────────────────────────────────────────────
  const elegiveis = dados.participantes.filter(p => {
    if (ocultos?.has(p.id)) return false;
    if (setorDaDisputa && !p.setores.includes(setorDaDisputa)) return false;
    return participaDaCampanha(p, desafio);
  });

  const individual: ResultadoParticipante[] = elegiveis.map(pessoa => {
    // O elenco da soma é o quadro INTEIRO, e não os elegíveis: numa disputa de
    // líderes só os líderes são elegíveis, e o número deles é a soma de uma
    // equipe cujos integrantes não estão no ranking.
    /*
     * O líder que responde por VÁRIAS equipes tem nota própria.
     *
     * Cada equipe rende uma porcentagem, e a nota é a média delas — somar
     * recebido e somar meta faria a equipe maior decidir sozinha. Ver
     * `notaDoLider`.
     *
     * Consequência que a tela mostra: com mais de uma equipe, `progresso`
     * deixa de ser `recebido ÷ meta`. Os dois números continuam certos e medem
     * coisas diferentes — o primeiro é a média das responsabilidades, o
     * segundo o caixa somado.
     */
    const media = regra.fonteResultado === 'equipe_liderada'
      && regra.agregacaoLider === 'media_das_equipes'
      ? notaDoLider(pessoa, desafio, somas, dados.participantes, contextoEquipe, porQuantidade)
      : null;

    if (media && media.equipes > 0) {
      return {
        pessoa,
        posicao: 0,
        recebido: media.recebido,
        qtd: media.qtd,
        meta: media.meta,
        falta: faltaParaMeta(media.recebido, media.meta),
        progresso: media.progresso,
        // Corrida de projeção não tem conclusão: o alvo se move todo dia útil.
        bateuMeta: !ehCorridaDeProjecao(regra) && media.progresso >= 100,
        paraUltrapassar: null as number | null,
        nomeAcima: null as string | null,
      };
    }

    // O elenco da soma é o quadro INTEIRO, e não os elegíveis: numa disputa de
    // líderes só os líderes são elegíveis, e o número deles é a soma de uma
    // equipe cujos integrantes não estão no ranking.
    const soma = somaDoParticipante(pessoa, desafio, somas, dados.participantes);
    const recebido = porQuantidade ? soma.qtd : soma.total;
    // A meta é DA PESSOA quando a campanha define uma para ela; senão, a da
    // campanha. Nada de um número fixo aqui. Na disputa entre líderes ela sai
    // da equipe — cheia ou proporcional ao mês corrido.
    const meta = metaDoParticipante(pessoa, regra, contextoEquipe);
    const falta = faltaParaMeta(recebido, meta);
    return {
      pessoa,
      posicao: 0,
      recebido,
      qtd: soma.qtd,
      meta,
      falta,
      progresso: progressoDaMeta(recebido, meta),
      bateuMeta: !ehCorridaDeProjecao(regra) && !!meta && meta > 0 && recebido >= meta,
      paraUltrapassar: null as number | null,
      nomeAcima: null as string | null,
    };
  });

  individual.sort((a, b) => comparar(
    { ...a, nome: a.pessoa.nome }, { ...b, nome: b.pessoa.nome }, criterio,
  ));
  posicionar(individual, criterio);
  individual.forEach((item, i) => {
    item.nomeAcima = i > 0 ? individual[i - 1].pessoa.nome : null;
  });

  // ── Equipes ───────────────────────────────────────────────────────────────
  //
  // A equipe de uma pessoa é a do cadastro (`equipeId`), a mesma que o Painel
  // Líder mostra. `pessoa.equipes` — que inclui os clones — serve para o
  // RECORTE da campanha; usá-la para agrupar colocaria a mesma pessoa em dois
  // cards e somaria o recebimento dela duas vezes.
  const porEquipe = new Map<string, ResultadoParticipante[]>();
  const nomeEquipe = new Map<string, string>();
  for (const item of individual) {
    const id = item.pessoa.equipeId ?? '__sem_equipe__';
    nomeEquipe.set(id, item.pessoa.equipeId ? item.pessoa.equipeNome : 'Sem equipe');
    const atual = porEquipe.get(id);
    if (atual) atual.push(item);
    else porEquipe.set(id, [item]);
  }

  const equipes: ResultadoEquipe[] = [...porEquipe.entries()].map(([id, integrantes]) => {
    const recebido = integrantes.reduce((s, i) => s + i.recebido, 0);
    const qtd      = integrantes.reduce((s, i) => s + i.qtd, 0);
    /*
     * A meta da equipe.
     *
     * Fixada na campanha, é ela. Não fixada, é a SOMA das metas de quem está
     * na equipe — a única que faz a barra da equipe contar a mesma história
     * que a soma das barras dos integrantes. Ninguém tendo meta, a equipe
     * também não tem, e o card mostra só o valor recebido.
     */
    const somaDasMetas = integrantes.reduce((s, i) => s + (i.meta ?? 0), 0);
    const meta = regra.metaEquipe ?? (somaDasMetas > 0 ? somaDasMetas : null);
    const falta = faltaParaMeta(recebido, meta);
    return {
      equipeId: id,
      equipeNome: nomeEquipe.get(id) ?? 'Sem equipe',
      posicao: 0,
      recebido,
      qtd,
      meta,
      // Derivada = ninguém definiu meta PARA a equipe; o número saiu da soma
      // dos desafios individuais, e a tela precisa dizer isso.
      metaDerivada: regra.metaEquipe === null && meta !== null,
      falta,
      progresso: progressoDaMeta(recebido, meta),
      bateuMeta: !!meta && meta > 0 && recebido >= meta,
      concluiram: integrantes.filter(i => i.bateuMeta).length,
      paraUltrapassar: null as number | null,
      // Já vieram na ordem do ranking geral; a ordem interna é a mesma regra.
      integrantes,
    };
  });

  equipes.sort((a, b) => comparar(
    { ...a, nome: a.equipeNome }, { ...b, nome: b.equipeNome }, criterio,
  ));
  posicionar(equipes, criterio);

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalRecebido = individual.reduce((s, i) => s + i.recebido, 0);
  const totalQtd      = individual.reduce((s, i) => s + i.qtd, 0);
  const metaColetiva  = regra.metaColetiva;

  return {
    individual,
    equipes,
    totalRecebido,
    totalQtd,
    totalParticipantes: individual.length,
    totalEquipes: equipes.length,
    metaColetiva,
    faltaColetiva: faltaParaMeta(totalRecebido, metaColetiva),
    progressoColetivo: progressoDaMeta(totalRecebido, metaColetiva),
  };
}

// ── Período ──────────────────────────────────────────────────────────────────

/**
 * Onde a campanha está na linha do tempo.
 *
 * Compara texto ISO (`yyyy-MM-dd`), que ordena igual à data e não passa por
 * fuso — `new Date('2026-08-21')` é meia-noite UTC, e no Brasil isso é dia 20.
 */
export function situacaoDoPeriodo(
  desafio: Pick<Desafio, 'dataInicio' | 'dataFim'>, hojeISO: string,
): 'antes' | 'durante' | 'depois' {
  if (hojeISO < desafio.dataInicio) return 'antes';
  if (hojeISO > desafio.dataFim)    return 'depois';
  return 'durante';
}

/** Dias que faltam para a campanha terminar. Zero no último dia. */
export function diasRestantes(dataFimISO: string, hojeISO: string): number {
  const fim  = Date.parse(`${dataFimISO}T00:00:00Z`);
  const hoje = Date.parse(`${hojeISO}T00:00:00Z`);
  if (Number.isNaN(fim) || Number.isNaN(hoje)) return 0;
  return Math.max(0, Math.round((fim - hoje) / 86_400_000));
}
