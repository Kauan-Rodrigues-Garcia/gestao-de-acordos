/**
 * jornada.service.ts — o banco das abas Acesso e Retenção do Jornada
 * (migrations 20261104180000 e 20261104200000).
 *
 *   fn_jornada_minhas_abas — os grupos (subgrupo ou equipe) Suporte/Retenção que a pessoa alcança.
 *   fn_jornada_painel      — meta, placar da equipe, total por dia e lançamentos do dia.
 *   fn_jornada_lancar      — grava NR + data.
 *   fn_jornada_excluir     — apaga um lançamento.
 *   fn_jornada_meta_salvar — grava (ou tira, com 0) a meta do grupo.
 *   fn_jornada_meta_pessoas_salvar — metas individuais (migration 20261104210000).
 *   fn_jornada_lancar_lote / excluir_lote / exportar — importar, apagar vários, baixar (idem).
 *   fn_jornada_lixeira / restaurar — apagar vai para a lixeira e volta de lá (idem).
 *   fn_jornada_faixas / faixas_salvar — a 2ª, 3ª e 4ª metas (migration 20261105140000).
 *
 * As tabelas não têm acesso direto: tudo passa pelas funções. As funções ainda
 * não estão nos tipos gerados: daí `rpcSemTipo`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export type TipoJornada = 'acesso' | 'retencao';

/**
 * Um grupo do Jornada: um SUBGRUPO ou uma EQUIPE cujo nome tem «Suporte» (aba
 * Acesso) ou «Retenção» (aba Retenção). Migration 20261104200000.
 */
export interface GrupoJornada {
  grupo_id: string;
  grupo: 'subgrupo' | 'equipe';
  tipo: TipoJornada;
  grupo_nome: string;
  equipe_nome: string;
  setor_nome: string | null;
  sou_membro: boolean;
  pode_gerir: boolean;
}

export interface PessoaPlacar {
  id: string;
  nome: string;
  foto_url: string | null;
  /** Ainda está no grupo (false = saiu, mas lançou nele no mês). */
  no_grupo: boolean;
  no_dia: number;
  no_mes: number;
  /** A meta do mês desta pessoa: a individual, ou a do grupo. */
  meta: number | null;
  /** A liderança deu a ela uma meta só dela. */
  meta_propria: boolean;
  /**
   * Todas as metas do mês dela, em ordem (05/11/2026): a 1ª (`meta`) e as
   * faixas acima, até a 4ª. Vazia sem meta. As dela, ou as do grupo.
   */
  metas: number[];
}

export interface RegistroJornada {
  id: string;
  nr: string;
  data: string;
  perfil_id: string;
  nome: string | null;
  criado_em: string;
}

export interface PainelJornada {
  tipo: TipoJornada;
  grupo: 'subgrupo' | 'equipe';
  pode_gerir: boolean;
  sou_membro: boolean;
  /** Meta de cada operador NO MÊS (04/11/2026: a meta é sempre mensal). */
  meta: number | null;
  /** As metas do grupo, em ordem: a 1ª (`meta`) e as faixas, até a 4ª. */
  metas: number[];
  pessoas: PessoaPlacar[];
  dias: { dia: string; total: number }[];
  registros: RegistroJornada[];
}

/**
 * Os grupos da pessoa. `null` quando a leitura falha — em geral a função
 * ainda não existe no banco (migration 20261104180000 não aplicada): o menu
 * não mostra as abas, e a tela avisa o super_admin.
 */
export async function listarMinhasAbas(empresaId: string): Promise<GrupoJornada[] | null> {
  const { data, error } = await rpcSemTipo<GrupoJornada[]>('fn_jornada_minhas_abas', {
    p_empresa_id: empresaId,
  });
  if (error) return null;
  return (data ?? []).filter(s => s.tipo === 'acesso' || s.tipo === 'retencao');
}

interface FaixasDoBanco {
  grupo: number[];
  pessoas: { perfil_id: string; extras: number[] }[];
}

/** A 2ª, 3ª e 4ª metas. Sem a migration 20261105140000, nenhuma (só a 1ª vale). */
async function buscarFaixas(grupoId: string): Promise<FaixasDoBanco> {
  const { data, error } = await rpcSemTipo<FaixasDoBanco>('fn_jornada_faixas', { p_grupo_id: grupoId });
  if (error || !data) return { grupo: [], pessoas: [] };
  return { grupo: data.grupo ?? [], pessoas: data.pessoas ?? [] };
}

export async function buscarPainel(grupoId: string, dia: string): Promise<PainelJornada> {
  const [{ data, error }, faixas] = await Promise.all([
    rpcSemTipo<PainelJornada>('fn_jornada_painel', { p_grupo_id: grupoId, p_dia: dia }),
    buscarFaixas(grupoId),
  ]);
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O banco não devolveu o painel.');
  const metaGrupo = data.meta ?? null;
  const metasGrupo = metaGrupo ? [metaGrupo, ...faixas.grupo] : [];
  const extrasDe = new Map(faixas.pessoas.map(p => [p.perfil_id, p.extras ?? []]));
  return {
    ...data,
    meta: metaGrupo,
    metas: metasGrupo,
    // Sem a 20261104210000 o banco não manda a meta por pessoa: vale a do grupo.
    pessoas: (data.pessoas ?? []).map(p => {
      const meta = p.meta === undefined ? metaGrupo : p.meta;
      const propria = p.meta_propria ?? false;
      return {
        ...p,
        meta,
        meta_propria: propria,
        metas: !meta ? [] : propria ? [meta, ...(extrasDe.get(p.id) ?? [])] : metasGrupo,
      };
    }),
    dias: data.dias ?? [],
    registros: data.registros ?? [],
  };
}

/** Mensagem do banco sem o prefixo técnico, com os acentos que o SQL não tem. */
export function mensagemDoBanco(msg: string): string {
  return msg
    .replace(/^.*?ERROR:\s*/i, '')
    .replace('ja foi lancado por voce neste mes', 'já foi lançado por você neste mês')
    .replace('ja foi lancado por outra pessoa neste mes', 'já foi lançado por outra pessoa neste mês')
    .replace('ja foi lancado por voce', 'já foi lançado por você')
    .replace('So quem esta neste grupo lanca aqui', 'Só quem está neste grupo lança aqui')
    .replace('A data nao pode ser depois de hoje', 'A data não pode ser depois de hoje')
    .replace('Informe o NR (so numeros)', 'Informe o NR (só números)')
    .replace('So a lideranca configura a meta', 'Só a liderança configura a meta')
    .replace('Sem permissao para apagar este lancamento', 'Sem permissão para apagar este lançamento')
    .replace('Sem permissao para ver este grupo', 'Sem permissão para ver este grupo')
    .replace('Esta pessoa nao esta neste grupo', 'Esta pessoa não está neste grupo');
}

export async function lancar(grupoId: string, nr: string, data: string): Promise<string> {
  const { data: id, error } = await rpcSemTipo<string>('fn_jornada_lancar', {
    p_grupo_id: grupoId,
    p_nr: nr,
    p_data: data,
  });
  if (error) throw new Error(mensagemDoBanco(error.message));
  return id as string;
}

export async function excluir(id: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_jornada_excluir', { p_id: id });
  if (error) throw new Error(mensagemDoBanco(error.message));
}

/** A meta é sempre do mês: grava `periodo = 'mes'`. `null` tira a meta. */
export async function salvarMeta(grupoId: string, meta: number | null): Promise<void> {
  const { error } = await rpcSemTipo('fn_jornada_meta_salvar', {
    p_grupo_id: grupoId,
    p_meta: meta ?? 0,
    p_periodo: 'mes',
  });
  if (error) throw new Error(mensagemDoBanco(error.message));
}

/** Metas individuais do mês; `meta: null` devolve a pessoa à meta do grupo. Só a liderança. */
export async function salvarMetasPessoas(
  grupoId: string,
  metas: { perfil_id: string; meta: number | null }[],
): Promise<void> {
  if (metas.length === 0) return;
  const { error } = await rpcSemTipo('fn_jornada_meta_pessoas_salvar', {
    p_grupo_id: grupoId,
    p_metas: metas,
  });
  if (error) {
    if (/fn_jornada_meta_pessoas_salvar|schema cache/i.test(error.message)) {
      throw new Error('Falta aplicar a migration 20261104210000_jornada_meta_individual.sql para a meta individual.');
    }
    throw new Error(mensagemDoBanco(error.message));
  }
}

/**
 * A 2ª, 3ª e 4ª metas (migration 20261105140000). `grupo: null` não mexe no
 * grupo; cada pessoa da lista recebe as faixas dela (vazia = só a 1ª). Grave a
 * 1ª antes — o banco recusa faixa sem a 1ª. Só a liderança.
 */
export async function salvarFaixas(
  grupoId: string,
  grupo: number[] | null,
  pessoas: { perfil_id: string; extras: number[] }[],
): Promise<void> {
  if (grupo === null && pessoas.length === 0) return;
  const { error } = await rpcSemTipo('fn_jornada_faixas_salvar', {
    p_grupo_id: grupoId,
    p_grupo: grupo,
    p_pessoas: pessoas,
  });
  if (error) {
    if (/fn_jornada_faixas_salvar|schema cache/i.test(error.message)) {
      throw new Error('Falta aplicar a migration 20261105140000_jornada_quatro_metas.sql para a 2ª, 3ª e 4ª metas.');
    }
    throw new Error(mensagemDoBanco(error.message)
      .replace('Defina a 1a meta do grupo antes das outras', 'Defina a 1ª meta do grupo antes das outras')
      .replace('Defina a 1a meta individual antes das outras', 'Defina a 1ª meta individual antes das outras')
      .replace('Metas invalidas: ate 4 metas, de 1 a 100000', 'Metas inválidas: até 4 metas, de 1 a 100000')
      .replace('Cada meta tem de ser maior que a anterior', 'Cada meta tem de ser maior que a anterior'));
  }
}

// ─── Em lote (migration 20261104210000) ─────────────────────────────────────

const FALTA_210000 = 'Falta aplicar a migration 20261104210000_jornada_meta_individual.sql no SQL Editor.';

function erroDoLote(nomeDaFuncao: string, msg: string): Error {
  if (msg.includes(nomeDaFuncao) || /schema cache/i.test(msg)) return new Error(FALTA_210000);
  return new Error(mensagemDoBanco(msg));
}

export interface ItemImportado {
  nr: string;
  /** ISO, AAAA-MM-DD. */
  data: string;
}

export interface ResultadoLote {
  inseridos: number;
  /** Já lançados neste mês na aba (por qualquer pessoa). */
  repetidos: number;
  invalidos: number;
}

/** Importa muitos NRs de uma vez. Mesmas regras do lançamento de um. */
export async function lancarLote(grupoId: string, itens: ItemImportado[]): Promise<ResultadoLote> {
  const { data, error } = await rpcSemTipo<ResultadoLote>('fn_jornada_lancar_lote', {
    p_grupo_id: grupoId,
    p_itens: itens,
  });
  if (error) throw erroDoLote('fn_jornada_lancar_lote', error.message);
  return {
    inseridos: Number(data?.inseridos ?? 0),
    repetidos: Number(data?.repetidos ?? 0),
    invalidos: Number(data?.invalidos ?? 0),
  };
}

/** Apaga vários; devolve quantos saíram (os sem permissão ficam). */
export async function excluirLote(ids: string[]): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_jornada_excluir_lote', { p_ids: ids });
  if (error) throw erroDoLote('fn_jornada_excluir_lote', error.message);
  return Number(data ?? 0);
}

/** NR + data de um período, para baixar. O operador recebe só os dele. */
export async function exportar(grupoId: string, ini: string, fim: string): Promise<ItemImportado[]> {
  const { data, error } = await rpcSemTipo<ItemImportado[]>('fn_jornada_exportar', {
    p_grupo_id: grupoId,
    p_ini: ini,
    p_fim: fim,
  });
  if (error) throw erroDoLote('fn_jornada_exportar', error.message);
  return data ?? [];
}

// ─── Lixeira (migration 20261104210000) ─────────────────────────────────────

export interface ItemLixeira {
  id: string;
  nr: string;
  data: string;
  apagado_em: string;
}

/** O que foi apagado nos últimos 30 dias. O operador vê só os dele. */
export async function listarLixeira(grupoId: string): Promise<ItemLixeira[]> {
  const { data, error } = await rpcSemTipo<ItemLixeira[]>('fn_jornada_lixeira', { p_grupo_id: grupoId });
  if (error) throw erroDoLote('fn_jornada_lixeira', error.message);
  return data ?? [];
}

/** Tira da lixeira. O NR que já foi lançado de novo no mês fica lá (`repetidos`). */
export async function restaurar(ids: string[]): Promise<{ restaurados: number; repetidos: number }> {
  const { data, error } = await rpcSemTipo<{ restaurados: number; repetidos: number }>('fn_jornada_restaurar', { p_ids: ids });
  if (error) throw erroDoLote('fn_jornada_restaurar', error.message);
  return { restaurados: Number(data?.restaurados ?? 0), repetidos: Number(data?.repetidos ?? 0) };
}
