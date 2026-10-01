/**
 * vendasIa.ts — de quem é o crédito da venda de uma IA.
 *
 * ## A regra (01/10/2026)
 *
 * Uma IA do Comercial (`perfis.robo`) pode ser vinculada a um operador por um
 * período `[desde, ate)`. A venda da IA cuja data cai dentro do período
 * credita o OPERADOR — e, por ele, a equipe dele. Fora de período, a venda
 * fica com a IA: conta no setor e em equipe nenhuma, como sempre foi.
 *
 * A data é `data_confirmacao`, o eixo oficial do Comercial; a venda ainda
 * aberta, sem confirmação, usa `data_venda`.
 *
 * ## A venda nunca muda
 *
 * `operador_id` continua sendo a IA. Esta função só ACRESCENTA `credito_id` —
 * quem leva o crédito — e os rótulos da IA. O total soma linhas, e uma linha
 * continua sendo uma linha: não há vínculo que duplique dinheiro. Por isso o
 * formulário de edição segue usando `operador_id`, e editar uma venda de IA
 * nunca a transfere para gente.
 *
 * Espelho em SQL: `fn_vendas_ia_credito` (migration 20261001150000). As duas
 * mudam juntas — o teste `vendasIa.test.ts` confere o texto da função.
 */

/** Um período de vínculo. `ate` exclusivo; `null` = em aberto. */
export interface VinculoIa {
  iaId: string;
  operadorId: string;
  operadorNome: string | null;
  /** 'yyyy-MM-dd', inclusive. */
  desde: string;
  /** 'yyyy-MM-dd', exclusivo. */
  ate: string | null;
}

/** Uma IA do cadastro, com tipo e todos os períodos dela. */
export interface IaDoCadastro {
  id: string;
  nome: string;
  usuario: string;
  situacao: string;
  setorNome: string | null;
  tipoId: string | null;
  tipoNome: string | null;
  vinculos: VinculoIa[];
}

/** Índice por id da IA, que `creditarVendas` consome. */
export type IndiceIas = ReadonlyMap<string, IaDoCadastro>;

export function indexarIas(ias: readonly IaDoCadastro[]): IndiceIas {
  return new Map(ias.map(i => [i.id, i]));
}

/** O dia que decide o crédito. */
export function dataDoCredito(v: { data_venda: string; data_confirmacao?: string | null }): string {
  return String(v.data_confirmacao || v.data_venda || '').slice(0, 10);
}

/**
 * Quem leva o crédito desta IA nesta data. `null` = ninguém, fica com a IA.
 *
 * Comparação de texto em 'yyyy-MM-dd' — ordena igual a data, sem fuso.
 */
export function creditoDaVenda(
  ia: Pick<IaDoCadastro, 'vinculos'> | undefined,
  data: string,
): VinculoIa | null {
  if (!ia || !data) return null;
  for (const v of ia.vinculos) {
    if (v.desde <= data && (v.ate === null || data < v.ate)) return v;
  }
  return null;
}

/** O que a venda ganha depois de creditada. */
export interface CamposDeCredito {
  /** Quem leva o crédito. Igual a `operador_id` quando não é IA vinculada. */
  credito_id?: string;
  /** Nome de quem leva o crédito, quando é IA vinculada. */
  credito_nome?: string | null;
  /** A IA que vendeu. `null`/ausente = a venda não é de IA. */
  ia_id?: string | null;
  ia_nome?: string | null;
  ia_tipo_id?: string | null;
  ia_tipo_nome?: string | null;
}

/**
 * Acrescenta o crédito a cada venda. Venda que não é de IA volta igual, só
 * com `credito_id = operador_id`.
 *
 * Devolve objetos NOVOS: a lista que veio do banco não é mutada, e o React vê
 * a mudança.
 */
export function creditarVendas<V extends {
  operador_id: string; data_venda: string; data_confirmacao?: string | null;
}>(vendas: readonly V[], ias: IndiceIas): Array<V & CamposDeCredito> {
  if (ias.size === 0) return vendas.map(v => ({ ...v, credito_id: v.operador_id }));
  return vendas.map(v => {
    const ia = ias.get(v.operador_id);
    if (!ia) return { ...v, credito_id: v.operador_id };
    const vinculo = creditoDaVenda(ia, dataDoCredito(v));
    return {
      ...v,
      credito_id:   vinculo?.operadorId ?? v.operador_id,
      credito_nome: vinculo?.operadorNome ?? null,
      ia_id:        ia.id,
      ia_nome:      ia.nome,
      ia_tipo_id:   ia.tipoId,
      ia_tipo_nome: ia.tipoNome,
    };
  });
}

/** O dono do crédito de uma venda — a chave de todo agrupamento por pessoa. */
export function donoDaVenda(v: { operador_id: string; credito_id?: string }): string {
  return v.credito_id ?? v.operador_id;
}

/**
 * Como a lista de vendas mostra quem vendeu.
 *
 * Venda de IA mostra a IA — foi ela que vendeu — e diz para quem o crédito
 * foi. Sem isso o operador veria na lista dele uma venda com o nome de outro,
 * ou «Sem nome» (a RLS de perfis não deixa todo mundo ler o perfil da IA).
 */
export function rotuloDoVendedor(v: CamposDeCredito & {
  operador_id: string; perfis?: { nome: string } | null;
}): { nome: string; nota: string | null } {
  if (!v.ia_id) return { nome: v.perfis?.nome ?? 'Sem nome', nota: null };
  const creditada = Boolean(v.credito_id && v.credito_id !== v.operador_id);
  return {
    nome: v.ia_nome ?? v.perfis?.nome ?? 'IA',
    nota: creditada ? `IA · crédito de ${v.credito_nome ?? 'operador vinculado'}` : 'IA',
  };
}

/** A IA está vinculada a alguém hoje (ou na data dada)? */
export function vinculoVigente(ia: IaDoCadastro, hoje: string): VinculoIa | null {
  return creditoDaVenda(ia, hoje);
}

/* ── Agrupar o cadastro que vem do banco ──────────────────────────────────── */

/** Uma linha de `fn_vendas_ia_cadastro`: a IA repetida por período. */
export interface LinhaCadastroIa {
  ia_id: string;
  ia_nome: string | null;
  ia_usuario: string | null;
  ia_situacao: string | null;
  setor_nome: string | null;
  tipo_id: string | null;
  tipo_nome: string | null;
  vinculo_id: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  desde: string | null;
  ate: string | null;
}

export function agruparCadastroIa(linhas: readonly LinhaCadastroIa[]): IaDoCadastro[] {
  const mapa = new Map<string, IaDoCadastro>();
  for (const l of linhas) {
    let ia = mapa.get(l.ia_id);
    if (!ia) {
      ia = {
        id: l.ia_id,
        nome: l.ia_nome ?? l.ia_usuario ?? 'IA',
        usuario: l.ia_usuario ?? '',
        situacao: l.ia_situacao ?? 'ativo',
        setorNome: l.setor_nome,
        tipoId: l.tipo_id,
        tipoNome: l.tipo_nome,
        vinculos: [],
      };
      mapa.set(l.ia_id, ia);
    }
    if (l.vinculo_id && l.operador_id && l.desde) {
      ia.vinculos.push({
        iaId: l.ia_id,
        operadorId: l.operador_id,
        operadorNome: l.operador_nome,
        desde: l.desde.slice(0, 10),
        ate: l.ate ? l.ate.slice(0, 10) : null,
      });
    }
  }
  for (const ia of mapa.values()) ia.vinculos.sort((a, b) => (a.desde < b.desde ? -1 : 1));
  return [...mapa.values()];
}

/* ── O card «Vendas via IA» ───────────────────────────────────────────────── */

export interface FatiaDeIa {
  /** `null` = IA sem tipo definido. */
  tipoId: string | null;
  rotulo: string;
  quantidade: number;
  valor: number;
}

export interface ResumoDeIa {
  /** Na régua, vindo de IA — vinculada ou não. */
  quantidade: number;
  valor: number;
  /** Desse valor, quanto foi creditado a uma pessoa por vínculo. */
  valorVinculado: number;
  porTipo: FatiaDeIa[];
}

/**
 * Quanto do recorte veio de IA, por tipo.
 *
 * Só a régua (`conta_na_meta`), como todo número de dinheiro do Comercial. O
 * recorte é o que a tela já filtrou — a pessoa, a equipe, o setor —, então o
 * mesmo cálculo responde «quanto do MEU total veio das minhas IAs» e «quanto
 * do setor veio de IA».
 */
export function resumoDeIa(
  vendas: ReadonlyArray<CamposDeCredito & {
    operador_id: string; conta_na_meta: boolean; valor_total: number | string;
  }>,
): ResumoDeIa {
  const porTipo = new Map<string, FatiaDeIa>();
  let quantidade = 0;
  let valor = 0;
  let valorVinculado = 0;

  for (const v of vendas) {
    if (!v.ia_id || !v.conta_na_meta) continue;
    const valorDaVenda = Number(v.valor_total) || 0;
    quantidade += 1;
    valor += valorDaVenda;
    if (v.credito_id && v.credito_id !== v.operador_id) valorVinculado += valorDaVenda;

    const chave = v.ia_tipo_id ?? '__sem_tipo__';
    const fatia = porTipo.get(chave);
    if (fatia) { fatia.quantidade += 1; fatia.valor += valorDaVenda; }
    else porTipo.set(chave, {
      tipoId: v.ia_tipo_id ?? null,
      rotulo: v.ia_tipo_nome ?? 'Sem tipo',
      quantidade: 1,
      valor: valorDaVenda,
    });
  }

  return {
    quantidade,
    valor,
    valorVinculado,
    porTipo: [...porTipo.values()].sort((a, b) => {
      // «Sem tipo» por último: é pendência de cadastro, não uma categoria.
      if ((a.tipoId === null) !== (b.tipoId === null)) return a.tipoId === null ? 1 : -1;
      return b.valor - a.valor;
    }),
  };
}

/**
 * O primeiro dia do mês de uma data — o `desde` da opção «mês inteiro».
 */
export function inicioDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}
