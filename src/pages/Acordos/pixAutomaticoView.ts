/**
 * pixAutomaticoView.ts — as contas da tela do Pix Automático.
 *
 * ## Por que isto saiu do componente
 *
 * `PixAutomatico.tsx` tinha 1.014 linhas, 31 `useState` e 9 `useMemo`. Entre
 * eles, dois decidem DINHEIRO — o total de comissão por status e o card de
 * bônus por meta — e nenhum tinha teste, porque exercitá-los exigia montar a
 * tela inteira com autenticação, empresa e Supabase.
 *
 * Aqui são funções puras. O componente ficou com estado, efeitos e JSX.
 *
 * ## Uma correção que veio junto
 *
 * O cálculo do bônus abria `new Date()` e lia `getFullYear()`/`getMonth()`
 * para descobrir o mês corrente. Isso é a hora da MÁQUINA de quem abre a tela,
 * não o fuso da operação: num navegador fora do Brasil, na virada do mês, o
 * card somaria a comissão do mês errado. Agora o mês entra por parâmetro, e o
 * componente passa `mesAtual()`, que é São Paulo — a mesma fonte que o resto
 * do sistema usa desde a correção de datas de 2026-08.
 */
import type { MetasConfigMes } from '@/lib/supabase';
import {
  diasUteisDoMes, diasUteisDecorridos, quartilAtual,
} from '@/lib/diasUteis';
import { partesDoMes, type MesRef } from '@/lib/mesReferencia';
import { contaNoRecebimento } from '@/lib/index';
import {
  comissaoDe, valorAPagarDe, PIX_META_ACORDOS_DOBRA, metaDobraDoSetor,
  PIX_DIAS_UTEIS_EXPURGO,
  type PixAutoAcordo, type PixAutoStatus,
} from '@/services/pix_automatico.service';

export interface OperadorInfo {
  id: string;
  nome: string;
  equipe_id: string | null;
  setor_id: string | null;
  perfil: string;
}

// ── Mapas de operador ───────────────────────────────────────────────────────

export function mapaOperadorEquipe(ops: OperadorInfo[]): Record<string, string | null> {
  const m: Record<string, string | null> = {};
  for (const o of ops) m[o.id] = o.equipe_id;
  return m;
}

export function mapaOperadorSetor(ops: OperadorInfo[]): Record<string, string | null> {
  const m: Record<string, string | null> = {};
  for (const o of ops) m[o.id] = o.setor_id;
  return m;
}

/**
 * Só quem conta no recebimento — líder e gerência ficam fora do filtro e do
 * vínculo, porque supervisionam em vez de receber em nome próprio.
 *
 * `elite` ENTRA: é operador que também lidera, o recebimento dele conta no
 * relatório como o de qualquer um, e ele já aparecia no ranking e nos quartis.
 * A comparação estrita com `'operador'` que existia aqui era a única das quatro
 * listas do projeto que o deixava de fora — ver
 * `PERFIS_QUE_CONTAM_NO_RECEBIMENTO` em `lib/index.ts`.
 */
export function apenasOperadores(ops: OperadorInfo[]): OperadorInfo[] {
  return ops.filter(o => contaNoRecebimento(o.perfil));
}

export const MAX_SUGESTOES_VINCULO = 8;

/** Sugestões do campo de vínculo. Busca vazia não sugere nada. */
export function sugerirOperadores(ops: OperadorInfo[], busca: string): OperadorInfo[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return [];
  return ops
    .filter(o => o.nome.toLowerCase().includes(termo))
    .slice(0, MAX_SUGESTOES_VINCULO);
}

// ── Filtro da lista ─────────────────────────────────────────────────────────

/** Estado do pagamento da comissão, do ponto de vista de quem filtra. */
export type FiltroPagamento = 'todos' | 'pago' | 'a_pagar';

export interface FiltrosPix {
  busca?: string;
  status?: PixAutoStatus | 'todos';
  operadorId?: string | null;
  equipeId?: string | null;
  setorId?: string | null;
  /** 'pago' = comissão já saiu; 'a_pagar' = aprovada e ainda não paga. */
  pagamento?: FiltroPagamento;
  /** Registrado A PARTIR de 'yyyy-MM-dd', inclusive. */
  de?: string | null;
  /** Registrado ATÉ 'yyyy-MM-dd', inclusive. */
  ate?: string | null;
}

/**
 * A data ('yyyy-MM-dd') de um instante do banco no fuso da operação.
 *
 * O filtro de data compara com o que a tabela MOSTRA, e a tabela mostra
 * `toLocaleDateString('pt-BR')` — São Paulo. Recortar os dez primeiros
 * caracteres do ISO compararia com a data em UTC: um acordo registrado às 22h
 * de terça já é quarta em UTC e sumiria de um filtro "terça a terça".
 */
export function dataLocalDaLinha(criadoEm: string): string {
  const d = new Date(criadoEm);
  if (isNaN(d.getTime())) return String(criadoEm).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export interface MapasOperador {
  porEquipe: Record<string, string | null>;
  porSetor: Record<string, string | null>;
}

/**
 * Linhas que sobram depois dos filtros da barra.
 *
 * O setor da linha é o CARIMBADO nela; só quando falta é que se olha o setor
 * atual do operador. Um operador que mudou de setor não leva embora o
 * histórico de comissão do setor anterior.
 */
export function filtrarItensPix(
  itens: PixAutoAcordo[],
  filtros: FiltrosPix,
  mapas: MapasOperador,
): PixAutoAcordo[] {
  const termo = (filtros.busca ?? '').trim().toLowerCase();
  const de  = (filtros.de  ?? '').trim();
  const ate = (filtros.ate ?? '').trim();
  return itens.filter(i => {
    if (filtros.status && filtros.status !== 'todos' && i.status !== filtros.status) return false;
    if (filtros.operadorId && i.operador_id !== filtros.operadorId) return false;
    if (filtros.equipeId && mapas.porEquipe[i.operador_id] !== filtros.equipeId) return false;
    if (filtros.setorId
        && (i.setor_id ?? mapas.porSetor[i.operador_id] ?? null) !== filtros.setorId) return false;
    // "A pagar" é aprovado e ainda não pago: pendente não é dívida, é fila de
    // avaliação, e desaprovado não gera comissão nenhuma.
    if (filtros.pagamento === 'pago'    && !i.pago) return false;
    if (filtros.pagamento === 'a_pagar' && !(i.status === 'aprovado' && !i.pago)) return false;
    if (de || ate) {
      const dia = dataLocalDaLinha(i.criado_em);
      if (de  && dia < de)  return false;
      if (ate && dia > ate) return false;
    }
    if (!termo) return true;
    return i.nr_cliente.toLowerCase().includes(termo)
        || (i.operador_nome ?? '').toLowerCase().includes(termo);
  });
}

// ── Totais ──────────────────────────────────────────────────────────────────

export interface TotalPix { qtd: number; valor: number; comissao: number }
export type TotaisPix = Record<PixAutoStatus, TotalPix>;

/**
 * Totais por status, SEMPRE sobre o conjunto visível — um líder que filtrou
 * por equipe tem que ver o total daquela equipe, não o da empresa.
 *
 * A comissão vem de `comissaoDe`: linha aprovada usa o percentual travado no
 * momento da aprovação; pendente usa o percentual atual do setor. Mudar o
 * percentual do setor não pode reescrever o que já foi aprovado.
 */
export function totaisPorStatus(
  visiveis: PixAutoAcordo[],
  pctPorSetor: Record<string, number>,
): TotaisPix {
  const soma = (status: PixAutoStatus): TotalPix => {
    const doStatus = visiveis.filter(i => i.status === status);
    return {
      qtd:      doStatus.length,
      valor:    doStatus.reduce((acc, i) => acc + Number(i.valor), 0),
      comissao: doStatus.reduce((acc, i) => acc + comissaoDe(i, pctPorSetor), 0),
    };
  };
  return { pendente: soma('pendente'), aprovado: soma('aprovado'), desaprovado: soma('desaprovado') };
}

/**
 * Dinheiro que JÁ SAIU e dinheiro que ainda falta sair.
 *
 * Aprovado e pago são coisas diferentes, e era essa a dúvida do operador: o
 * card "Aprovado" diz R$ 105,49 e ele recebeu R$ 50,00 — os dois números estão
 * certos, faltava a tela mostrar o segundo. `aPagar` é o resto: aprovado que
 * ainda não foi marcado como pago.
 *
 * Aqui a conta é `valorAPagarDe`, e não `comissaoDe`: estes dois cards falam
 * de CAIXA, e a correção de divergência muda o que sai. Os cards Pendente e
 * Aprovado continuam em comissão pura — eles falam de desempenho, e um acerto
 * de pagamento do mês passado não é desempenho deste.
 */
export function totalPagoPix(
  visiveis: PixAutoAcordo[],
  pctPorSetor: Record<string, number>,
): { pago: TotalPix; aPagar: TotalPix } {
  const soma = (linhas: PixAutoAcordo[]): TotalPix => ({
    qtd:      linhas.length,
    valor:    linhas.reduce((acc, i) => acc + Number(i.valor), 0),
    comissao: linhas.reduce((acc, i) => acc + valorAPagarDe(i, pctPorSetor), 0),
  });
  return {
    pago:   soma(visiveis.filter(i => i.pago)),
    aPagar: soma(visiveis.filter(i => i.status === 'aprovado' && !i.pago)),
  };
}

// ── Acordos "feitos" no mês ─────────────────────────────────────────────────

/**
 * Acordos que CONTAM como feitos: pendente e aprovado.
 *
 * Desaprovado não entrou — se contasse, registrar lixo aproximaria da meta.
 * A mesma definição vale para o contador dos 18, para o ranking e para o
 * realizado da meta do setor: três números que a operação vai comparar entre si
 * e que, com regras diferentes, não fechariam.
 */
export function ehAcordoFeito(a: Pick<PixAutoAcordo, 'status'>): boolean {
  return a.status !== 'desaprovado';
}

/** Acordos feitos por um operador dentro do mês 'yyyy-MM'. */
export function acordosFeitosNoMes(
  itens: PixAutoAcordo[],
  operadorId: string | null | undefined,
  mes: MesRef,
): PixAutoAcordo[] {
  if (!operadorId) return [];
  return itens.filter(i => i.operador_id === operadorId
                        && ehAcordoFeito(i)
                        && i.criado_em.startsWith(mes));
}

// ── Meta dos 18 acordos (comissão dobrada) ──────────────────────────────────

export interface DobraComissao {
  // ── Requisito 1: quantidade de acordos ──
  /** Acordos Pix feitos no mês (pendente + aprovado). */
  feitos: number;
  /** Quantos ainda faltam para cumprir o requisito. Zero quando já cumpriu. */
  faltam: number;
  /** Quantos acordos o requisito exige (18). */
  meta: number;
  /** Os 18 acordos estão cumpridos? */
  acordosOk: boolean;
  /** % do requisito de acordos, com teto em 100. */
  pctAcordos: number;

  // ── Requisito 2: bater a meta de recebimento do mês ──
  /** Meta de recebimento do operador no mês. `null` = não definida. */
  metaValor: number | null;
  /** Quanto ele já recebeu no mês (analítico). `null` = ainda não carregou. */
  recebidoMes: number | null;
  /** Há meta definida para o mês? Sem ela, o requisito não tem como fechar. */
  metaDefinida: boolean;
  /** A meta de recebimento foi batida? */
  metaOk: boolean;
  /** Quanto falta em R$ para bater a meta. Zero quando bateu ou não há meta. */
  faltaMeta: number;
  /** % do recebido sobre a meta, com teto em 100. */
  pctMeta: number;

  // ── Resultado ──
  /** Quantos dos dois requisitos já estão cumpridos (0, 1 ou 2). */
  requisitosOk: number;
  /** Os DOIS requisitos cumpridos — só aí a comissão dobra. */
  atingiu: boolean;
  /** Comissão aprovada do operador no mês, sem dobra. */
  comissao: number;
  /** O extra que a dobra paga: o mesmo valor de novo. Zero enquanto não dobra. */
  bonus: number;
  /** O que ele leva: `comissao` dobrada quando dobrou, senão a própria. */
  comissaoFinal: number;
}

/** A meta de recebimento do mês, para o segundo requisito da dobra. */
export interface MetaRecebimentoDobra {
  /** Meta do operador no mês. `null`/0 = sem meta definida. */
  metaValor: number | null;
  /** Recebido no mês pelo analítico. `null` = ainda não carregou. */
  recebidoMes: number | null;
}

/**
 * Os dois requisitos da comissão dobrada.
 *
 * A regra da operação tem DUAS condições, e as duas precisam fechar:
 *
 *   1. 18 acordos Pix feitos no mês;
 *   2. a meta de recebimento do mês batida.
 *
 * Cumpridas as duas, o operador recebe de novo o que já fez de comissão — fez
 * R$ 100,00, leva R$ 200,00. A versão anterior tratava os 18 acordos como se
 * fossem a condição inteira, e o card dizia "meta batida — comissão dobrada"
 * para quem tinha só metade do combinado.
 *
 * A dobra incide sobre a comissão APROVADA — é a que existe de fato. O contador
 * de acordos, em compensação, conta os FEITOS (pendente + aprovado): a
 * quantidade é do trabalho do operador, e ele não controla quando o líder vai
 * avaliar. Fossem os dois pela mesma régua, quem fechou 18 acordos veria
 * "12/18" só porque a fila de aprovação atrasou.
 *
 * Sem meta definida no mês, o requisito 2 fica em aberto (`metaDefinida: false`)
 * e a comissão NÃO dobra: afirmar que dobrou sem ter contra o que comparar
 * seria prometer dinheiro que ninguém conferiu.
 */
export function calcularDobraComissao(
  itens: PixAutoAcordo[],
  operadorId: string | null | undefined,
  pctPorSetor: Record<string, number>,
  mes: MesRef,
  metaRecebimento?: MetaRecebimentoDobra,
  /**
   * Meta de acordos por setor (`metasDobraPorSetor`). Omitido = usa o padrão
   * de 18 — é o que mantém os chamadores antigos e os ambientes sem a
   * migration 20260810c funcionando.
   */
  metaPorSetor: Record<string, number> = {},
): DobraComissao {
  const doMes = acordosFeitosNoMes(itens, operadorId, mes);
  const feitos = doMes.length;

  // A meta vem do setor em que o operador registrou no mês. Quando ele tem
  // linhas em setores diferentes (mudou de setor no meio do mês), vale a MAIOR
  // — exigir menos do que algum dos setores dele pede seria prometer a dobra
  // cedo demais.
  const meta = doMes.length
    ? Math.max(...doMes.map(i => metaDobraDoSetor(i.setor_id, metaPorSetor)))
    : metaDobraDoSetor(null, metaPorSetor);

  const acordosOk = feitos >= meta;
  const comissao = doMes
    .filter(i => i.status === 'aprovado')
    .reduce((s, i) => s + comissaoDe(i, pctPorSetor), 0);

  const metaValor    = metaRecebimento?.metaValor ?? null;
  const recebidoMes  = metaRecebimento?.recebidoMes ?? null;
  const metaDefinida = metaValor != null && metaValor > 0;
  const metaOk       = metaDefinida && (recebidoMes ?? 0) >= metaValor!;

  const atingiu = acordosOk && metaOk;

  return {
    feitos,
    faltam: Math.max(meta - feitos, 0),
    meta,
    acordosOk,
    pctAcordos: Math.min(Math.round((feitos / meta) * 100), 100),

    metaValor,
    recebidoMes,
    metaDefinida,
    metaOk,
    faltaMeta: metaDefinida ? Math.max(metaValor! - (recebidoMes ?? 0), 0) : 0,
    pctMeta: metaDefinida
      ? Math.min(Math.round(((recebidoMes ?? 0) / metaValor!) * 100), 100)
      : 0,

    requisitosOk: (acordosOk ? 1 : 0) + (metaOk ? 1 : 0),
    atingiu,
    comissao,
    bonus: atingiu ? comissao : 0,
    comissaoFinal: atingiu ? comissao * 2 : comissao,
  };
}

// ── Prazo dos desaprovados ──────────────────────────────────────────────────
//
// O prazo em si (`PIX_DIAS_UTEIS_EXPURGO`) mora no serviço, junto de
// `expurgarDesaprovadosVencidos`, que é quem o cumpre — mesmo lugar de
// `PIX_META_ACORDOS_DOBRA`. Aqui só se calcula a data a partir dele.

/**
 * O instante em que um desaprovado será excluído: `PIX_DIAS_UTEIS_EXPURGO`
 * dias úteis depois da avaliação.
 *
 * Conta só sábado e domingo como não-úteis; feriado não entra. É de propósito:
 * o mesmo prazo é aplicado pelo banco (`fn_pix_expurga_desaprovados`), e as
 * duas pontas precisam dar a MESMA data — a tabela de feriados vive na
 * configuração do mês do tenant e não estaria disponível para o job. Errar um
 * feriado aqui adia a exclusão em um dia; discordar do banco mostraria ao
 * operador um prazo que não é o que vai acontecer.
 *
 * `null` quando a linha não foi avaliada (não há de quando contar).
 */
export function prazoExpurgoDesaprovado(avaliadoEm: string | null | undefined): Date | null {
  if (!avaliadoEm) return null;
  const base = new Date(avaliadoEm);
  if (isNaN(base.getTime())) return null;

  const d = new Date(base.getTime());
  let restantes = PIX_DIAS_UTEIS_EXPURGO;
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes -= 1;
  }
  return d;
}

/**
 * Quanto falta para o desaprovado sumir, em texto curto para a tabela.
 *
 * `null` quando não há prazo a mostrar (linha sem avaliação).
 */
export function textoPrazoExpurgo(
  avaliadoEm: string | null | undefined,
  agora: Date = new Date(),
): string | null {
  const prazo = prazoExpurgoDesaprovado(avaliadoEm);
  if (!prazo) return null;
  const horas = Math.ceil((prazo.getTime() - agora.getTime()) / 3_600_000);
  if (horas <= 0)  return 'exclusão a qualquer momento';
  if (horas <= 24) return `exclusão em ${horas}h`;
  return `exclusão em ${Math.ceil(horas / 24)} dias`;
}

// ── Ranking do setor ────────────────────────────────────────────────────────

export interface LinhaRankingPix {
  operadorId: string;
  nome: string;
  /** Acordos feitos no mês (pendente + aprovado). */
  acordos: number;
  /** Valor somado desses acordos. */
  valor: number;
  /** Comissão aprovada no mês. */
  comissao: number;
  /**
   * Cumpriu o requisito dos 18 acordos.
   *
   * NÃO quer dizer que a comissão dobrou: a dobra exige também a meta de
   * recebimento do mês (ver `calcularDobraComissao`), e a meta de cada
   * operador não está nesta tela. Aqui é só o requisito que o ranking consegue
   * afirmar sozinho.
   */
  requisitoAcordosOk: boolean;
}

/**
 * Ranking de Pix automático do conjunto recebido, por acordos feitos no mês.
 *
 * Recebe os itens JÁ no escopo de quem está olhando (o líder carrega só o
 * próprio setor) — assim o ranking do Receptivo é o do Receptivo, e não uma
 * mistura de setores que ninguém compara.
 *
 * Empate em acordos desempata por comissão e depois por nome, para a ordem não
 * dançar entre dois carregamentos com os mesmos números.
 */
export function rankingPixSetor(
  itens: PixAutoAcordo[],
  pctPorSetor: Record<string, number>,
  mes: MesRef,
  nomePorOperador: Record<string, string> = {},
  /** Meta por setor. Omitido = 18 para todos (ver `calcularDobraComissao`). */
  metaPorSetor: Record<string, number> = {},
): LinhaRankingPix[] {
  const porOperador = new Map<string, LinhaRankingPix>();
  // A meta é resolvida por linha porque o admin vê setores diferentes na mesma
  // lista — um número só marcaria "cumpriu" para quem está em setor mais
  // exigente. Mesma razão de `comissaoDe` receber o mapa em vez de um número.
  const metaDoOperador = new Map<string, number>();

  for (const i of itens) {
    if (!ehAcordoFeito(i) || !i.criado_em.startsWith(mes)) continue;
    const linha = porOperador.get(i.operador_id) ?? {
      operadorId: i.operador_id,
      nome: nomePorOperador[i.operador_id] ?? i.operador_nome ?? '—',
      acordos: 0, valor: 0, comissao: 0, requisitoAcordosOk: false,
    };
    linha.acordos += 1;
    linha.valor   += Number(i.valor);
    if (i.status === 'aprovado') linha.comissao += comissaoDe(i, pctPorSetor);
    porOperador.set(i.operador_id, linha);

    const metaLinha = metaDobraDoSetor(i.setor_id, metaPorSetor);
    metaDoOperador.set(
      i.operador_id,
      Math.max(metaDoOperador.get(i.operador_id) ?? 0, metaLinha),
    );
  }

  return [...porOperador.values()]
    .map(l => ({
      ...l,
      requisitoAcordosOk:
        l.acordos >= (metaDoOperador.get(l.operadorId) ?? PIX_META_ACORDOS_DOBRA),
    }))
    .sort((a, b) =>
      b.acordos - a.acordos
      || b.comissao - a.comissao
      || a.nome.localeCompare(b.nome));
}

// ── Meta de Pix do setor ────────────────────────────────────────────────────

export interface EntradaMetaPix {
  itens: PixAutoAcordo[];
  /** Meta de valor do setor no mês. 0/null = sem meta de valor. */
  metaValor: number | null;
  /** Meta de quantidade de acordos no mês. 0/null = sem meta de quantidade. */
  metaAcordos: number | null;
  configMes: MetasConfigMes | null;
  mes: MesRef;
  hojeISO: string;
}

export interface ResumoMetaPix {
  /** Valor somado dos acordos feitos no mês. */
  realizado: number;
  /** Quantidade de acordos feitos no mês. */
  acordos: number;
  metaValor: number;
  metaAcordos: number;
  /** Quanto falta em valor. Zero quando bateu. */
  faltaValor: number;
  /** Quantos acordos faltam. Zero quando bateu. */
  faltaAcordos: number;
  /** % do realizado sobre a meta (teto 999). */
  pctValor: number;
  /**
   * Projeção: realizado sobre o ESPERADO até hoje, em dias úteis. 100% = no
   * ritmo de bater. Zero quando não há como calcular dias úteis do mês.
   */
  projecao: number;
  metaBatida: boolean;
}

/**
 * O painel de meta do Pix automático.
 *
 * Deliberadamente NÃO toca no recebimento: o valor do Pix já entra no
 * recebimento pelo analítico, e somar aqui de novo contaria duas vezes o mesmo
 * dinheiro. Esta meta responde outra pergunta — quanto de Pix o setor fez e
 * quanto falta —, e o realizado sai dos próprios acordos Pix.
 *
 * A projeção usa a mesma mecânica de dias úteis do bônus por meta e do
 * dashboard (`diasUteisDoMes` / `diasUteisDecorridos` com os feriados do mês),
 * para os dois painéis não darem números diferentes sobre o mesmo mês.
 *
 * Devolve `null` quando não há meta nenhuma definida: sem meta, "faltam
 * R$ 0,00" seria uma afirmação falsa sobre uma pergunta que ninguém fez.
 */
export function calcularMetaPix(e: EntradaMetaPix): ResumoMetaPix | null {
  const metaValor   = Number(e.metaValor ?? 0)   || 0;
  const metaAcordos = Number(e.metaAcordos ?? 0) || 0;
  if (metaValor <= 0 && metaAcordos <= 0) return null;

  const doMes = e.itens.filter(i => ehAcordoFeito(i) && i.criado_em.startsWith(e.mes));
  const realizado = doMes.reduce((s, i) => s + Number(i.valor), 0);
  const acordos   = doMes.length;

  let projecao = 0;
  if (metaValor > 0 && e.configMes) {
    const { ano, mes } = partesDoMes(e.mes);
    const totalUteis = diasUteisDoMes(ano, mes, e.configMes.feriados);
    if (totalUteis > 0) {
      const decorridos = diasUteisDecorridos(
        ano, mes, e.configMes.feriados, e.hojeISO, undefined,
        e.configMes.contar_dia_atual === true,
      );
      // `Math.max(decorridos, 1)`: no primeiro dia do mês, zero dia decorrido
      // daria divisão por zero e projeção infinita. Um dia é o piso — mesma
      // regra de `calcularBonusMeta`.
      const esperado = (metaValor / totalUteis) * Math.max(decorridos, 1);
      projecao = esperado > 0 ? Math.min(Math.round((realizado / esperado) * 100), 999) : 0;
    }
  }

  return {
    realizado,
    acordos,
    metaValor,
    metaAcordos,
    faltaValor:   metaValor   > 0 ? Math.max(metaValor - realizado, 0) : 0,
    faltaAcordos: metaAcordos > 0 ? Math.max(metaAcordos - acordos, 0) : 0,
    pctValor:     metaValor   > 0 ? Math.min(Math.round((realizado / metaValor) * 100), 999) : 0,
    projecao,
    metaBatida:
      (metaValor   <= 0 || realizado >= metaValor)
      && (metaAcordos <= 0 || acordos >= metaAcordos),
  };
}

// ── Bônus por meta ──────────────────────────────────────────────────────────

export interface EntradaBonusMeta {
  operadorId: string | null | undefined;
  itens: PixAutoAcordo[];
  pctPorSetor: Record<string, number>;
  /** Meta de recebimento do operador no mês. Sem meta, não há bônus. */
  metaValor: number | null;
  /** Quanto ele já recebeu no mês (relatório analítico). */
  recebidoMes: number | null;
  configMes: MetasConfigMes | null;
  /** Mês de referência 'yyyy-MM' — São Paulo, não o relógio da máquina. */
  mes: MesRef;
  hojeISO: string;
}

export interface BonusMeta {
  /** Comissão APROVADA no mês — é este valor que é pago de novo se bater a meta. */
  acumulado: number;
  metaBatida: boolean;
  quartil: number | null;
  projecao: number;
}

/**
 * O card de bônus por meta.
 *
 * A comissão que o operador já teve aprovada no mês é paga DE NOVO se ele
 * bater a meta. O card mostra quanto está em jogo e em que pé está:
 * meta batida (garantido), 1º quartil (projetando a meta) ou informativo.
 *
 * Devolve `null` quando não há nada a mostrar — sem operador, sem meta, sem
 * configuração do mês, ou sem nenhuma comissão aprovada ainda. É diferente de
 * mostrar zero: zero afirmaria que ele não tem bônus a receber, e a verdade é
 * que a pergunta ainda não faz sentido.
 */
export function calcularBonusMeta(e: EntradaBonusMeta): BonusMeta | null {
  if (!e.operadorId || e.metaValor == null || e.metaValor <= 0) return null;
  if (!e.configMes || e.recebidoMes == null) return null;

  const acumulado = e.itens
    .filter(i => i.operador_id === e.operadorId
              && i.status === 'aprovado'
              && i.criado_em.startsWith(e.mes))
    .reduce((s, i) => s + comissaoDe(i, e.pctPorSetor), 0);
  if (acumulado <= 0) return null;

  const { ano, mes } = partesDoMes(e.mes);
  const totalUteis = diasUteisDoMes(ano, mes, e.configMes.feriados);
  const decorridos = totalUteis === 0 ? 0 : diasUteisDecorridos(
    ano, mes, e.configMes.feriados, e.hojeISO, undefined,
    e.configMes.contar_dia_atual === true,
  );
  // `Math.max(decorridos, 1)`: no primeiro dia do mês, dividir por zero dias
  // decorridos daria projeção infinita. Um dia é o piso.
  const esperado = totalUteis === 0 ? 0 : (e.metaValor / totalUteis) * Math.max(decorridos, 1);
  const projecao = esperado > 0 ? Math.min(Math.round((e.recebidoMes / esperado) * 100), 999) : 0;
  const quartil  = quartilAtual(projecao, e.configMes.quartis);

  return {
    acumulado,
    metaBatida: e.recebidoMes >= e.metaValor,
    quartil: quartil?.quartil ?? null,
    projecao,
  };
}

// ── Meta de Pix por EQUIPE ──────────────────────────────────────────────────

export interface MetaEquipeEntrada {
  equipeId: string;
  equipeNome: string;
  metaValor: number;
  metaAcordos: number;
}

export interface LinhaMetaEquipe {
  equipeId: string;
  equipeNome: string;
  /** null = equipe sem meta definida no mês. */
  resumo: ResumoMetaPix | null;
}

export interface ConsolidadoMetaPix {
  /** Uma linha por equipe COM meta, da maior meta para a menor. */
  equipes: LinhaMetaEquipe[];
  /** Soma das equipes — é esta a meta do setor, que não é digitada. */
  setor: ResumoMetaPix | null;
}

/**
 * Acompanhamento da meta de Pix equipe a equipe, e o total do setor.
 *
 * A meta do setor é a SOMA das metas das equipes (Bryan + Luciana + Matheus),
 * nunca um valor digitado à parte: com dois lugares para a mesma verdade, um
 * deles fica velho na primeira alteração.
 *
 * O realizado de cada equipe sai dos acordos dos operadores DELA — por isso o
 * mapa `equipePorOperador`. Acordo de operador sem equipe conhecida entra no
 * total do setor mas em nenhuma equipe: some-lo em alguma seria creditar a um
 * time o que não é dele, e escondê-lo faria as equipes não fecharem com o setor.
 */
export function calcularMetaPixPorEquipe(p: {
  itens: PixAutoAcordo[];
  metas: MetaEquipeEntrada[];
  /** operador_id → equipe_id */
  equipePorOperador: Record<string, string>;
  configMes: MetasConfigMes | null;
  mes: MesRef;
  hojeISO: string;
}): ConsolidadoMetaPix {
  const base = { configMes: p.configMes, mes: p.mes, hojeISO: p.hojeISO };

  const equipes: LinhaMetaEquipe[] = p.metas
    .map(m => ({
      equipeId: m.equipeId,
      equipeNome: m.equipeNome,
      resumo: calcularMetaPix({
        ...base,
        itens: p.itens.filter(i => p.equipePorOperador[i.operador_id] === m.equipeId),
        metaValor: m.metaValor,
        metaAcordos: m.metaAcordos,
      }),
    }))
    .filter(l => l.resumo !== null)
    .sort((a, b) => (b.resumo!.metaValor - a.resumo!.metaValor));

  // Setor: metas somadas, realizado do setor inteiro (inclui quem está fora de
  // equipe). Passa pela MESMA função, então projeção e % seguem uma regra só.
  const metaValorSetor   = p.metas.reduce((s, m) => s + (Number(m.metaValor)   || 0), 0);
  const metaAcordosSetor = p.metas.reduce((s, m) => s + (Number(m.metaAcordos) || 0), 0);
  const setor = calcularMetaPix({
    ...base,
    itens: p.itens,
    metaValor: metaValorSetor,
    metaAcordos: metaAcordosSetor,
  });

  return { equipes, setor };
}
