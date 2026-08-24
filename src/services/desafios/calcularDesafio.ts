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
import type {
  CriterioRanking, DadosDesafio, Desafio, LinhaDesafio, PessoaDesafio,
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
}

// ── Peças ────────────────────────────────────────────────────────────────────

/** A soma de uma pessoa no período, na métrica da campanha. */
interface SomaOperador { total: number; qtd: number }

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
  // Mapa de metas preenchido É a convocação: quem não tem meta não disputa.
  // Sem isto, a operação inteira entraria zerada num ranking de 27 pessoas.
  if (Object.keys(metasPorOperador).length > 0 && metaNoMapa(pessoa, metasPorOperador) === null) {
    return false;
  }
  const { setores, equipes, operadores } = participantes;
  if (operadores.length && !operadores.includes(pessoa.id)) return false;
  if (setores.length   && !pessoa.setores.some(s => setores.includes(s))) return false;
  if (equipes.length   && !pessoa.equipes.some(e => equipes.includes(e))) return false;
  return true;
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
 * A pessoal manda; a da campanha é o padrão de quem não tem uma. É o que
 * permite uma gincana em que cada operador tem um número diferente sem que a
 * tela precise saber disso.
 */
export function metaDoParticipante(
  pessoa: PessoaDesafio, regra: Desafio['regra'],
): number | null {
  return metaNoMapa(pessoa, regra.metasPorOperador) ?? regra.metaIndividual;
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
  const { desafio, dados, ocultos, filtroSetorId, setorDoUsuario } = params;
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
  const setorDaDisputa = regra.escopoDisputa === 'setor'
    ? (filtroSetorId ?? setorDoUsuario ?? null)
    : filtroSetorId ?? null;

  // ── Quem entra ────────────────────────────────────────────────────────────
  const elegiveis = dados.participantes.filter(p => {
    if (ocultos?.has(p.id)) return false;
    if (setorDaDisputa && !p.setores.includes(setorDaDisputa)) return false;
    return participaDaCampanha(p, desafio);
  });

  const individual: ResultadoParticipante[] = elegiveis.map(pessoa => {
    const soma = somas.get(pessoa.id) ?? ZERO;
    const recebido = porQuantidade ? soma.qtd : soma.total;
    // A meta é DA PESSOA quando a campanha define uma para ela; senão, a da
    // campanha. Nada de um número fixo aqui.
    const meta = metaDoParticipante(pessoa, regra);
    const falta = faltaParaMeta(recebido, meta);
    return {
      pessoa,
      posicao: 0,
      recebido,
      qtd: soma.qtd,
      meta,
      falta,
      progresso: progressoDaMeta(recebido, meta),
      bateuMeta: !!meta && meta > 0 && recebido >= meta,
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
