/**
 * comissao.service.ts — leitura e escrita da configuração de comissão.
 *
 * ## Tabelas e RPCs fora dos tipos gerados
 *
 * `comissao_config`, `comissao_faixas` e as quatro `fn_comissao_*` nasceram na
 * migration 20260911190000, depois do último `database.types.ts`. O acesso é
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

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Todas as configurações do mês na empresa — padrões e exceções de todos os setores.
 *
 * A empresa inteira e não o setor: o clone é calculado pela configuração do
 * setor de ORIGEM, que pode não ser o setor em tela. São poucas linhas.
 */
export async function buscarConfigsDoMes(
  empresaId: string,
  ano: number,
  mes: number,
): Promise<{ configs: ConfigComissao[]; dbAtiva: boolean }> {
  if (!empresaId) return { configs: [], dbAtiva: true };
  try {
    const { data, error } = await db
      .from('comissao_config')
      .select('*, comissao_faixas(ordem, pct, pct_especial)')
      .eq('empresa_id', empresaId)
      .eq('ano', ano)
      .eq('mes', mes);

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[comissao] erro na leitura:', error.message);
      return { configs: [], dbAtiva: !pendente };
    }
    return { configs: ((data ?? []) as LinhaConfig[]).map(configDaLinha), dbAtiva: true };
  } catch (err) {
    console.warn('[comissao] erro na leitura:', err);
    return { configs: [], dbAtiva: true };
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface PayloadConfig {
  empresaId: string;
  setorId: string;
  equipeId: string | null;
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
      empresa_id: p.empresaId,
      setor_id: p.setorId,
      equipe_id: p.equipeId,
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

/** Apaga a exceção de uma equipe; ela volta ao padrão do setor. */
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
