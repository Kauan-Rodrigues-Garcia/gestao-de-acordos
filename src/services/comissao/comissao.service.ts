/**
 * comissao.service.ts — leitura e escrita da configuração de comissão.
 *
 * ## Tabelas e RPCs fora dos tipos gerados
 *
 * `comissao_config`, `comissao_faixas` e as quatro `fn_comissao_*` nasceram na
 * migration 20260911190000, depois do último `database.types.ts`; a exceção por
 * usuário e o bônus (`comissao_config_usuarios`, `comissao_bonus*`), na
 * 20260916120000. O acesso é
 * pelo cliente sem tipos, como em `numeros.service.ts`; as linhas continuam
 * tipadas pelas interfaces abaixo. Quando os tipos forem regenerados, `db` e
 * `rpc` saem e `supabase` volta direto.
 *
 * ## Tolerante à migration pendente
 *
 * O site sobe pela Vercel no push, antes de a migration ser aplicada. Relação
 * ausente vira `dbAtiva: false` — a tela diz «comissão indisponível» em vez de
 * quebrar — no mesmo molde de `exclusoesSetor.service.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { BonusComissao, TipoBonus } from './bonus';
import type {
  ConfigComissao, FaixaConfig, ModoIndireta, RegraSetor,
} from './comissao';

const db = supabase as unknown as SupabaseClient;

interface ErroRpc { message?: string; code?: string }
type ChamadaRpc = (nome: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: ErroRpc | null }>;

/**
 * `supabase.rpc` sem os tipos gerados, que ainda não conhecem estas funções.
 *
 * Resolvido na hora da chamada, e não no carregamento do módulo: a tela de Metas
 * importa este arquivo pela aba Comissão, e amarrar `rpc` no topo faria a tela
 * inteira depender de o cliente já ter o método no instante do import.
 */
const rpc: ChamadaRpc = (nome, args) =>
  (supabase.rpc as unknown as ChamadaRpc).call(supabase, nome, args);

export interface Resultado<T = void> {
  ok: boolean;
  dados?: T;
  erro?: string;
}

/** Erro de "tabela/função não existe" — migration pendente, não falha real. */
function ehMigrationAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache|could not find the function/i.test(mensagem);
}

export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

// ── A linha ──────────────────────────────────────────────────────────────────

interface LinhaFaixa {
  ordem: number | string;
  pct: number | string;
  pct_especial: number | string | null;
}

/** O que o PostgREST devolve de `comissao_config` com as faixas embutidas. */
export interface LinhaConfig {
  id: string;
  empresa_id: string;
  setor_id: string;
  equipe_id: string | null;
  /** Ausente antes da 20260916120000. */
  grupo_usuarios?: boolean | null;
  comissao_config_usuarios?: { usuario_id: string }[] | null;
  ano: number | string;
  mes: number | string;
  modo_indireta: string;
  pct_indireta: number | string | null;
  pct_indireta_especial: number | string | null;
  regra_setor: string;
  multiplicador: number | string | null;
  setor_meta_confirmada_em: string | null;
  setor_meta_confirmada_por: string | null;
  setor_meta_confirmada_por_nome: string | null;
  comissao_faixas?: LinhaFaixa[] | null;
}

/** `numeric` chega como número ou como texto, conforme o tamanho. */
function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

const REGRAS: readonly RegraSetor[] = ['nenhuma', 'percentual_especial', 'multiplicador'];

export function configDaLinha(linha: LinhaConfig): ConfigComissao {
  const modoIndireta: ModoIndireta = linha.modo_indireta === 'separado' ? 'separado' : 'junto';
  const regraSetor: RegraSetor = (REGRAS as readonly string[]).includes(linha.regra_setor)
    ? linha.regra_setor as RegraSetor
    : 'nenhuma';

  const faixas: FaixaConfig[] = (linha.comissao_faixas ?? [])
    .map(f => ({
      ordem: Number(f.ordem),
      pct: numeroOuNulo(f.pct) ?? 0,
      pctEspecial: numeroOuNulo(f.pct_especial),
    }))
    .sort((a, b) => a.ordem - b.ordem);

  return {
    id: linha.id,
    empresaId: linha.empresa_id,
    setorId: linha.setor_id,
    equipeId: linha.equipe_id ?? null,
    grupoUsuarios: linha.grupo_usuarios === true,
    usuarioIds: (linha.comissao_config_usuarios ?? []).map(u => u.usuario_id),
    ano: Number(linha.ano),
    mes: Number(linha.mes),
    modoIndireta,
    pctIndireta: numeroOuNulo(linha.pct_indireta),
    pctIndiretaEspecial: numeroOuNulo(linha.pct_indireta_especial),
    regraSetor,
    multiplicador: numeroOuNulo(linha.multiplicador),
    setorMetaConfirmadaEm: linha.setor_meta_confirmada_em ?? null,
    setorMetaConfirmadaPor: linha.setor_meta_confirmada_por ?? null,
    setorMetaConfirmadaPorNome: linha.setor_meta_confirmada_por_nome ?? null,
    faixas,
  };
}

/** O que o PostgREST devolve de `comissao_bonus` com as pessoas embutidas. */
export interface LinhaBonus {
  id: string;
  empresa_id: string;
  setor_id: string;
  ano: number | string;
  mes: number | string;
  tipo: string;
  meta_ordem: number | string | null;
  valor_alvo: number | string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  valor_bonus: number | string;
  descricao: string | null;
  comissao_bonus_usuarios?: { usuario_id: string }[] | null;
}

const TIPOS_BONUS: readonly TipoBonus[] = ['meta', 'valor', 'especial'];

export function bonusDaLinha(linha: LinhaBonus): BonusComissao {
  return {
    id: linha.id,
    empresaId: linha.empresa_id,
    setorId: linha.setor_id,
    ano: Number(linha.ano),
    mes: Number(linha.mes),
    tipo: (TIPOS_BONUS as readonly string[]).includes(linha.tipo) ? linha.tipo as TipoBonus : 'valor',
    metaOrdem: numeroOuNulo(linha.meta_ordem),
    valorAlvo: numeroOuNulo(linha.valor_alvo),
    periodoInicio: linha.periodo_inicio ? linha.periodo_inicio.slice(0, 10) : null,
    periodoFim: linha.periodo_fim ? linha.periodo_fim.slice(0, 10) : null,
    valorBonus: numeroOuNulo(linha.valor_bonus) ?? 0,
    descricao: linha.descricao ?? null,
    usuarioIds: (linha.comissao_bonus_usuarios ?? []).map(u => u.usuario_id),
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Todas as configurações e bônus do mês na empresa — de todos os setores.
 *
 * A empresa inteira e não o setor: o clone é calculado pela configuração do
 * setor de ORIGEM, que pode não ser o setor em tela. São poucas linhas.
 *
 * Sem a 20260916120000 (tabelas das pessoas e do bônus ausentes), a leitura
 * volta ao formato anterior: a comissão continua funcionando, sem exceção por
 * usuário e sem bônus.
 */
export async function buscarConfigsDoMes(
  empresaId: string,
  ano: number,
  mes: number,
): Promise<{ configs: ConfigComissao[]; bonus: BonusComissao[]; dbAtiva: boolean }> {
  if (!empresaId) return { configs: [], bonus: [], dbAtiva: true };
  try {
    const doMes = (colunas: string) => db
      .from('comissao_config')
      .select(colunas)
      .eq('empresa_id', empresaId)
      .eq('ano', ano)
      .eq('mes', mes);

    let { data, error } = await doMes('*, comissao_faixas(ordem, pct, pct_especial), comissao_config_usuarios(usuario_id)');
    if (error && ehMigrationAusente(error.message)) {
      ({ data, error } = await doMes('*, comissao_faixas(ordem, pct, pct_especial)'));
    }

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[comissao] erro na leitura:', error.message);
      return { configs: [], bonus: [], dbAtiva: !pendente };
    }

    const bonusRes = await db
      .from('comissao_bonus')
      .select('*, comissao_bonus_usuarios(usuario_id)')
      .eq('empresa_id', empresaId)
      .eq('ano', ano)
      .eq('mes', mes);
    if (bonusRes.error && !ehMigrationAusente(bonusRes.error.message)) {
      console.warn('[comissao] erro na leitura dos bônus:', bonusRes.error.message);
    }

    return {
      configs: ((data ?? []) as unknown as LinhaConfig[]).map(configDaLinha),
      bonus: bonusRes.error ? [] : ((bonusRes.data ?? []) as LinhaBonus[]).map(bonusDaLinha),
      dbAtiva: true,
    };
  } catch (err) {
    console.warn('[comissao] erro na leitura:', err);
    return { configs: [], bonus: [], dbAtiva: true };
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface PayloadConfig {
  /** Na exceção por usuário, qual grupo. Ausente = grupo novo. */
  id?: string | null;
  empresaId: string;
  setorId: string;
  equipeId: string | null;
  /** Exceção por usuário. */
  grupoUsuarios?: boolean;
  /** Na exceção por usuário, SUBSTITUI as pessoas. Ausente = não mexe nelas. */
  usuarios?: string[];
  ano: number;
  mes: number;
  modoIndireta: ModoIndireta;
  pctIndireta: number | null;
  pctIndiretaEspecial: number | null;
  regraSetor: RegraSetor;
  multiplicador: number | null;
  faixas: FaixaConfig[];
}

function mensagemDeErro(erro: ErroRpc | null, padrao: string): string {
  const texto = erro?.message ?? '';
  if (ehMigrationAusente(texto)) return 'A comissão ainda não está disponível neste banco.';
  return texto || padrao;
}

async function chamar<T>(nome: string, args: Record<string, unknown>, padrao: string): Promise<Resultado<T>> {
  try {
    const { data, error } = await rpc(nome, args);
    if (error) return { ok: false, erro: mensagemDeErro(error, padrao) };
    return { ok: true, dados: data as T };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : padrao };
  }
}

/** Grava uma configuração inteira e substitui as faixas dela. Devolve o id. */
export function salvarConfig(p: PayloadConfig): Promise<Resultado<string>> {
  return chamar<string>('fn_comissao_salvar', {
    p_config: {
      ...(p.id ? { id: p.id } : {}),
      empresa_id: p.empresaId,
      setor_id: p.setorId,
      equipe_id: p.equipeId,
      grupo_usuarios: p.grupoUsuarios === true,
      ...(p.usuarios ? { usuarios: p.usuarios } : {}),
      ano: p.ano,
      mes: p.mes,
      modo_indireta: p.modoIndireta,
      pct_indireta: p.pctIndireta,
      pct_indireta_especial: p.pctIndiretaEspecial,
      regra_setor: p.regraSetor,
      multiplicador: p.multiplicador,
      faixas: p.faixas.map(f => ({ ordem: f.ordem, pct: f.pct, pct_especial: f.pctEspecial })),
    },
  }, 'Não foi possível salvar a comissão.');
}

/** Copia o mês anterior como linhas novas. Devolve quantas configurações vieram. */
export function importarMesAnterior(p: {
  empresaId: string; setorId: string; ano: number; mes: number; substituir: boolean;
}): Promise<Resultado<number>> {
  return chamar<number>('fn_comissao_importar_mes_anterior', {
    p_empresa_id: p.empresaId,
    p_setor_id: p.setorId,
    p_ano: p.ano,
    p_mes: p.mes,
    p_substituir: p.substituir,
  }, 'Não foi possível importar o mês anterior.');
}

/** Apaga a exceção de uma equipe ou por usuário; quem estava nela volta ao padrão. */
export function excluirExcecao(configId: string): Promise<Resultado> {
  return chamar<void>('fn_comissao_excluir_excecao', { p_config_id: configId },
    'Não foi possível remover a exceção.');
}

/** Liga ou desliga o benefício do setor no mês. */
export function confirmarMetaSetor(p: {
  empresaId: string; setorId: string; ano: number; mes: number; confirmado: boolean;
}): Promise<Resultado> {
  return chamar<void>('fn_comissao_confirmar_meta_setor', {
    p_empresa_id: p.empresaId,
    p_setor_id: p.setorId,
    p_ano: p.ano,
    p_mes: p.mes,
    p_confirmado: p.confirmado,
  }, 'Não foi possível registrar a confirmação.');
}

// ── Bônus ────────────────────────────────────────────────────────────────────

export interface PayloadBonus {
  /** Ausente = bônus novo. */
  id?: string | null;
  empresaId: string;
  setorId: string;
  ano: number;
  mes: number;
  tipo: TipoBonus;
  metaOrdem: number | null;
  /** Em BRUTO. */
  valorAlvo: number | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  valorBonus: number;
  descricao: string | null;
  /** SUBSTITUI as pessoas do bônus. */
  usuarios: string[];
}

/** Cria ou substitui um bônus inteiro, com as pessoas. Devolve o id. */
export function salvarBonus(p: PayloadBonus): Promise<Resultado<string>> {
  return chamar<string>('fn_comissao_bonus_salvar', {
    p_bonus: {
      ...(p.id ? { id: p.id } : {}),
      empresa_id: p.empresaId,
      setor_id: p.setorId,
      ano: p.ano,
      mes: p.mes,
      tipo: p.tipo,
      meta_ordem: p.metaOrdem,
      valor_alvo: p.valorAlvo,
      periodo_inicio: p.periodoInicio,
      periodo_fim: p.periodoFim,
      valor_bonus: p.valorBonus,
      descricao: p.descricao,
      usuarios: p.usuarios,
    },
  }, 'Não foi possível salvar o bônus.');
}

export function excluirBonus(bonusId: string): Promise<Resultado> {
  return chamar<void>('fn_comissao_bonus_excluir', { p_bonus_id: bonusId },
    'Não foi possível remover o bônus.');
}
