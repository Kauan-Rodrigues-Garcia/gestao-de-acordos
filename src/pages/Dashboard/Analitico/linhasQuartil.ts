/**
 * linhasQuartil.ts — as linhas da aba Quartis: quem entra, a projeção e a faixa.
 *
 * Saiu de dentro do `useMemo` de `QuartisOperadores` (30/09/2026) para a aba
 * Quartis do celular usar a MESMA conta — ver
 * docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §2.2. Nada aqui
 * é regra nova: é o mesmo corpo, com nome. Os comentários de cada decisão
 * vieram junto.
 */
import { diasUteisDecorridos, diasUteisDoMes } from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { metaNaUnidade } from '@/lib/unidadeValor';
import type { QuartilConfig } from '@/lib/supabase';
import {
  setoresDoOperador,
  type OperadorEquipeInfo, type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { combinarMetaDupla, type MetaDupla } from '@/services/metas/metaIndireta';
import type { MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';

export interface PerfilOp {
  id: string; nome: string; foto_url: string | null;
  setor_id: string | null; equipe_id: string | null;
  situacao?: string | null;
  arquivado?: boolean | null;
  desligado_em?: string | null;
  ferias_ate?: string | null;
}

export interface LinhaQuartil {
  op: PerfilOp;
  equipeNome: string;
  meta: number | null;
  recebido: number;
  diaria: number | null;
  hoje: number | null;
  diferenca: number | null;
  projecao: number | null;
  quartil: QuartilConfig | null;
  /** Pagamentos do analítico — alimentam o ticket médio da linha expandida. */
  pagamentos: number;
  /**
   * Quanto do recebimento veio de AJUSTE MANUAL. `0` = nada.
   *
   * Já está dentro de `recebido` — e, por consequência, dentro da projeção e do
   * quartil da linha. O marcador existe para quem confere saber disso: um
   * percentual que subiu por lançamento à mão não se parece com um que subiu
   * por recebimento, e a diferença importa na hora de comparar pessoas.
   */
  ajusteManual: number;
  /**
   * As duas frentes de meta `[PP]`. `dupla.ativa = false` para todo o resto —
   * e nesse caso `metaTotal`/`recebidoTotal` são a meta e o recebimento de
   * sempre, então a tabela inteira roda pelo mesmo caminho.
   */
  dupla: MetaDupla;
  /** Quantos acordos extra pagos compõem o recebimento indireto. */
  qtdIndireta: number;
  /**
   * Dias úteis DESTE operador, já reduzidos por equipe em treinamento.
   *
   * Guardados na linha, e não recalculados ao abrir: a área expandida tem de
   * usar exatamente a mesma contagem que produziu a % da linha fechada, senão a
   * mesma pessoa mostra duas leituras com a linha aberta e fechada.
   */
  dias: { totalUteis: number; decorridos: number };
}

export interface EntradaLinhasQuartil {
  anoNum: number;
  mesNum: number;
  /** 'yyyy-MM' */
  mes: string;
  hojeISO: string;
  feriados: string[];
  contarHoje: boolean;
  quartis: QuartilConfig[];
  resumos: ReadonlyArray<ResumoOperadorAnalitico>;
  operadores: ReadonlyArray<PerfilOp>;
  /** Meta DIRETA bruta por operador (só as > 0). */
  metasOp: Record<string, number>;
  /** Meta INDIRETA bruta por operador `[PP]`. */
  metasIndiretas: Record<string, number>;
  indiretoMap: MapaRecebimentoIndireto;
  /** Tudo em H.O. (PaguePlay com o alternador em H.O.). */
  emHO: boolean;
  /** Percentual de H.O. da aba Metas — converte a frente indireta. */
  ho: number;
  /** Setores em foco. VAZIA = todos. */
  setorIds: ReadonlyArray<string>;
  /** Equipes em foco. VAZIA = todas. */
  equipeIds: ReadonlyArray<string>;
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  setorDaEquipe: Map<string, string>;
  nomeDaEquipe: Map<string, string>;
  /** equipe_id → início do treinamento (só as de treinamento). */
  treinoMap: Record<string, string | null>;
}

export interface LinhasQuartil {
  /** setor em exibição → linhas, melhor projeção primeiro. */
  porSetor: Map<string, LinhaQuartil[]>;
  /** Quem está no recorte e não tem meta — fora dos quartis. */
  semMeta: PerfilOp[];
}

export function montarLinhasQuartil(entrada: EntradaLinhasQuartil): LinhasQuartil {
  const {
    anoNum, mesNum, mes, hojeISO, feriados, contarHoje, quartis, resumos, operadores,
    metasOp, metasIndiretas, indiretoMap, emHO, ho, setorIds, equipeIds,
    operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe, nomeDaEquipe, treinoMap,
  } = entrada;
  const setoresFoco = new Set(setorIds);
  const equipesFoco = new Set(equipeIds);

  const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
  const decorridos = Math.max(
    diasUteisDecorridos(anoNum, mesNum, feriados, hojeISO, undefined, contarHoje), 1,
  );
  const recebidoMap: Record<string, number> = {};
  // Pagamentos e H.O. vêm do mesmo resumo do analítico que já traz o recebido
  // — a linha expandida mostra ticket médio e H.O. sem uma segunda consulta.
  const pagamentosMap: Record<string, number> = {};
  const hoMap: Record<string, number> = {};
  const ajusteMap: Record<string, number> = {};
  for (const r of resumos) {
    recebidoMap[r.operador_id]   = r.total_recebido;
    pagamentosMap[r.operador_id] = Number(r.total_pagamentos) || 0;
    hoMap[r.operador_id]         = Number(r.total_ho) || 0;
    ajusteMap[r.operador_id]     = Number(r.ajuste_manual) || 0;
  }

  /**
   * Dias úteis de UM operador, reduzidos quando a equipe dele é de treinamento.
   *
   * Esta tabela usava o mês cheio para todo mundo, enquanto Desempenho Equipes
   * já reduzia os dias da equipe em treinamento. O mesmo operador aparecia em
   * duas faixas diferentes em duas abas do mesmo painel — e a de treinamento
   * saía sempre pior, porque era cobrada por dias em que a equipe nem existia.
   */
  const diasDoOperador = (op: PerfilOp): { totalUteis: number; decorridos: number } => {
    const inicio = op.equipe_id ? treinoMap[op.equipe_id] : null;
    if (!inicio) return { totalUteis, decorridos };
    return {
      totalUteis: diasUteisDoMes(anoNum, mesNum, feriados, inicio),
      decorridos: Math.max(
        diasUteisDecorridos(anoNum, mesNum, feriados, hojeISO, inicio, contarHoje), 1,
      ),
    };
  };

  // Clone: o operador conta no setor da equipe clonada, não só no dele.
  // Mesma fonte usada pelo Total recebido e por Desempenho Equipes.
  const visiveis = operadores
    /*
     * FÉRIAS e DESLIGADO saem do quartil; o recebimento das duas segue nos
     * totais do setor e da equipe, que somam pelo relatório.
     *
     * O desligado ficava aqui, com etiqueta, desde 31/08/2026 — a ideia era
     * não encolher o número da equipe no meio do mês. Só que este quadro não
     * soma nada: ele CLASSIFICA gente por ritmo contra a meta do mês inteiro.
     * Quem trabalhou até o dia 20 é medido contra 22 dias úteis e desce de
     * faixa por ter saído, não por ter produzido menos. Some da distribuição
     * e some da tabela — o dinheiro, esse, continua contado onde é somado.
     */
    .filter(o => {
      const s = o.situacao ?? 'ativo';
      return s !== 'ferias' && s !== 'desligado';
    })
    /*
     * Arquivado sai — mas so dos meses POSTERIORES a saida. Filtrar sempre
     * reescrevia o passado: no dia 1 de setembro, abrir AGOSTO mostrava um
     * total menor do que agosto teve. Mes fechado e fato consumado.
     */
    .filter(o => o.arquivado !== true
      || (!!o.desligado_em && mes <= o.desligado_em.slice(0, 7)))
    .filter(o => setoresFoco.size === 0 || [...setoresDoOperador(
      o.id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
    )].some(s => setoresFoco.has(s)))
    .filter(o => equipesFoco.size === 0
      || (o.equipe_id ? equipesFoco.has(o.equipe_id) : false)
      || (equipesExtrasPorOperador[o.id] ?? []).some(e => equipesFoco.has(e)));

  const porSetor = new Map<string, LinhaQuartil[]>();
  const semMeta: PerfilOp[] = [];

  for (const op of visiveis) {
    /*
     * Sem meta não há quartil, e sem quartil não há linha nesta tabela.
     *
     * A pessoa aparecia com «—» em todas as colunas e «sem meta» em itálico,
     * ocupando espaço numa tela cujo assunto é a faixa de cada um. Pior: como
     * ela não entra na base do gráfico, a tabela e a distribuição mostravam
     * populações diferentes sem dizer isso.
     *
     * Ela não some do painel — vai para a barra do topo, que é onde dá para
     * resolver a causa em vez de conviver com o sintoma.
     *
     * O corte usa a meta DIRETA bruta. A indireta [PP] é um complemento de
     * quem já tem meta; ninguém tem só ela.
     */
    if (!(metasOp[op.id] > 0)) { semMeta.push(op); continue; }

    /*
     * Agrupa pelo setor EM EXIBIÇÃO, e não pelo de origem.
     *
     * Com um setor marcado é ele, como sempre foi: o clone emprestado de
     * outro setor aparece na tabela do setor que o está olhando. Com vários
     * marcados, é o primeiro dos marcados em que a pessoa conta — senão o
     * clone cairia no setor de origem, que pode nem estar no recorte, e a
     * linha ficaria num grupo que a pessoa não pediu para ver.
     */
    const sid = setoresFoco.size
      ? (setorIds.find(id => setoresDoOperador(
          op.id, operadorEquipeMap, equipesExtrasPorOperador, setorDaEquipe,
        ).has(id)) ?? op.setor_id ?? 'sem_setor')
      : (op.setor_id ?? 'sem_setor');
    const dias = diasDoOperador(op);

    /*
     * Cada lado é convertido uma vez só, e nunca duas.
     *
     * A META passa por `metaNaUnidade`: ela só existe gravada em bruto.
     * O RECEBIDO não passa — `analitico_recebimentos.total_ho` já É o H.O.,
     * como veio da coluna do relatório. Multiplicar de novo aqui daria o
     * H.O. do H.O.
     *
     * A meta em H.O. é a MESMA da aba Metas (bruto × percentual configurado,
     * ao centavo) — ver `metaNaUnidade`. Não converte pela proporção do
     * recebido de cada pessoa: isso fazia R$ 5.000,00 virar R$ 4.999,98.
     *
     * A frente INDIRETA vem de acordos, sem coluna de H.O.: converte pelo
     * percentual configurado, o mesmo da meta.
     */
    const metaBruta = metasOp[op.id] ?? null;
    const meta = emHO ? metaNaUnidade(metaBruta, 'ho') : metaBruta;
    const recebido = emHO ? (hoMap[op.id] ?? 0) : (recebidoMap[op.id] ?? 0);

    const metaIndBruta = metasIndiretas[op.id] ?? null;
    const indiretoBruto = indiretoMap[op.id]?.bruto ?? 0;

    /**
     * As duas frentes viram UM par (meta, recebido) antes da projeção.
     *
     * Quem não tem meta indireta sai daqui com exatamente o que entrou — é o
     * que permite a tabela inteira usar um caminho só, em vez de um ramo
     * "com indireta" que divergiria do outro no primeiro ajuste.
     *
     * O quartil de quem tem as duas é do TOTAL, por decisão de produto:
     * cobrá-lo só pela metade direta puniria quem foi bem no extra.
     */
    const dupla = combinarMetaDupla({
      metaDireta: meta,
      metaIndireta: emHO ? metaNaUnidade(metaIndBruta, 'ho') : metaIndBruta,
      recebidoDireto: recebido,
      recebidoIndireto: emHO ? indiretoBruto * ho : indiretoBruto,
    });

    // Sem `limitePct`: esta tabela nunca saturou a %, ao contrário do header
    // pessoal. Ver `EntradaProjecao` em lib/projecaoMetas.
    const proj = calcularProjecao({
      meta: dupla.metaTotal, recebido: dupla.recebidoTotal,
      totalUteis: dias.totalUteis, decorridos: dias.decorridos, quartis,
    });
    const diaria: number | null    = proj?.metaDiaria ?? null;
    const hoje: number | null      = proj?.esperado ?? null;
    const diferenca: number | null = proj?.diferenca ?? null;
    const projecao: number | null  = proj?.projecaoPct ?? null;
    const q: QuartilConfig | null  = proj?.quartil ?? null;

    const equipeNome = (op.equipe_id ? nomeDaEquipe.get(op.equipe_id) : null)
      ?? operadorEquipeMap[op.id]?.equipe_nome
      ?? 'Sem equipe';

    if (!porSetor.has(sid)) porSetor.set(sid, []);
    porSetor.get(sid)!.push({
      op, equipeNome,
      // As colunas META e RECEBIMENTO passam a mostrar o TOTAL quando a
      // pessoa tem as duas frentes. É o que a % e o quartil ao lado usam —
      // exibir só a metade direta ao lado de uma % do total seria a tela
      // discordando de si mesma. A quebra fica na linha expandida.
      meta: dupla.metaTotal, recebido: dupla.recebidoTotal,
      diaria, hoje, diferenca, projecao, quartil: q,
      pagamentos: pagamentosMap[op.id] ?? 0,
      // Em H.O. o ajuste também está convertido no `hoMap`; o marcador
      // mostra o BRUTO de propósito — é o número que o líder digitou.
      ajusteManual: ajusteMap[op.id] ?? 0,
      dupla,
      qtdIndireta: dupla.ativa ? (indiretoMap[op.id]?.qtd ?? 0) : 0,
      dias,
    });
  }

  // Melhor projeção primeiro. Todo mundo aqui tem meta — quem não tem saiu
  // antes do laço —, então o `?? -1` é só uma guarda contra projeção nula.
  for (const lista of porSetor.values()) {
    lista.sort((a, b) => (b.projecao ?? -1) - (a.projecao ?? -1));
  }
  semMeta.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { porSetor, semMeta };
}

/** Distribuição por quartil — só quem tem meta entra na base do 100%. */
export function distribuicaoQuartis(
  linhas: Iterable<LinhaQuartil>, quartis: QuartilConfig[],
): { total: number; fatias: { quartil: number; qtd: number }[] } {
  const cont = new Map<number, number>();
  let total = 0;
  for (const l of linhas) {
    if (!l.quartil) continue;
    cont.set(l.quartil.quartil, (cont.get(l.quartil.quartil) ?? 0) + 1);
    total++;
  }
  const ordem = [...quartis].sort((a, b) => a.quartil - b.quartil);
  return {
    total,
    fatias: ordem.map(q => ({ quartil: q.quartil, qtd: cont.get(q.quartil) ?? 0 })),
  };
}
