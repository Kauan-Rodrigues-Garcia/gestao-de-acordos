/**
 * A meta individual do Desafio Cobrança vista pelo líder (19/11/2026): cada
 * operador do setor, separado por equipe, com quem bateu as 4,5 e as 5 médias.
 *
 * A conta de cada pessoa é a MESMA da gaveta do operador (`minhaMetaNoDesafio`):
 * meta do mês dela ÷ os dias úteis dela no mês, contra o recebido dela no 59
 * (o Analítico) nos dias do desafio. Não há segunda régua aqui — só a mesma
 * conta repetida para cada um.
 *
 * ## Quem vê o quê
 *
 * O alcance é o da aba Analítico no painel de permissões, porque o dado é o
 * do Analítico (a RLS de `analitico_recebimentos` pede escopo ≥ setor):
 *
 *   analitico_escopo_setor .......... o próprio setor
 *   analitico_escopo_todos_setores .. escolhe o setor
 *   só individual / aba fechada ..... a aba não aparece
 */
import { supabase } from '@/lib/supabase';
import { diasUteisDoSetor } from '@/lib/diasUteisDoSetor';
import { minhaMetaNoDesafio, type MinhaMetaNoDesafio } from '@/lib/desafioMediaOperador';
import { buscarAnaliticoPeriodo } from '@/services/desempenhoDia/desempenhoDia.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import type { PlacarCobranca } from './desafioCobranca.service';

export type RegrasDoDesafio = Pick<PlacarCobranca, 'dias' | 'regra_medias' | 'regra_medias_maior'>;

export interface PessoaNoDesafio {
  id: string;
  nome: string;
  meta: MinhaMetaNoDesafio;
}

export interface EquipeNoDesafio {
  /** `null` = quem não está em equipe nenhuma. */
  id: string | null;
  nome: string;
  pessoas: PessoaNoDesafio[];
  /** Quantos bateram o 1º nível (4,5) — inclui os do 2º. */
  bateram: number;
  /** Quantos bateram o 2º nível (5). */
  bateramMaior: number;
}

export interface SetorNoDesafio {
  equipes: EquipeNoDesafio[];
  /** Ativos do setor sem meta no mês: a regra não vale para eles. */
  semMeta: number;
  total: number;
  bateram: number;
  bateramMaior: number;
}

export interface PessoaDoSetor {
  id: string;
  nome: string;
  equipe_id: string | null;
}

/**
 * Junta tudo, puro: as pessoas COM meta, por equipe (as que mais bateram
 * primeiro; dentro dela, quem tem mais médias), «Sem equipe» no fim.
 */
export function montarSetorNoDesafio(entrada: {
  regras: RegrasDoDesafio;
  pessoas: readonly PessoaDoSetor[];
  equipes: readonly { id: string; nome: string }[];
  metaDoMes: ReadonlyMap<string, number>;
  /** pessoa → dia (ISO) → recebido. */
  recebido: ReadonlyMap<string, Readonly<Record<string, number>>>;
  /** pessoa → feriados da régua dela. */
  feriados: (pessoaId: string) => string[];
  hoje: number;
}): SetorNoDesafio {
  const { regras, hoje } = entrada;
  const nomeDaEquipe = new Map(entrada.equipes.map(e => [e.id, e.nome]));
  const grupos = new Map<string | null, PessoaNoDesafio[]>();
  let semMeta = 0;

  for (const p of entrada.pessoas) {
    const metaMensal = entrada.metaDoMes.get(p.id) ?? 0;
    if (metaMensal <= 0) { semMeta++; continue; }
    const meta = minhaMetaNoDesafio(regras, metaMensal, entrada.recebido.get(p.id) ?? {}, entrada.feriados(p.id), hoje);
    if (meta.meta === null) { semMeta++; continue; }
    // Equipe que não é do setor (ou apagada) não vira grupo com nome de id.
    const chave = p.equipe_id && nomeDaEquipe.has(p.equipe_id) ? p.equipe_id : null;
    const lista = grupos.get(chave) ?? [];
    lista.push({ id: p.id, nome: p.nome, meta });
    grupos.set(chave, lista);
  }

  const equipes: EquipeNoDesafio[] = [...grupos.entries()].map(([id, pessoas]) => {
    pessoas.sort((a, b) => b.meta.feito / b.meta.mediaDiaria - a.meta.feito / a.meta.mediaDiaria
      || a.nome.localeCompare(b.nome, 'pt-BR'));
    return {
      id,
      nome: id ? nomeDaEquipe.get(id)! : 'Sem equipe',
      pessoas,
      bateram: pessoas.filter(p => p.meta.bateu).length,
      bateramMaior: pessoas.filter(p => p.meta.maior.bateu).length,
    };
  });
  equipes.sort((a, b) => {
    if (!a.id !== !b.id) return a.id ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return {
    equipes,
    semMeta,
    total: equipes.reduce((s, e) => s + e.pessoas.length, 0),
    bateram: equipes.reduce((s, e) => s + e.bateram, 0),
    bateramMaior: equipes.reduce((s, e) => s + e.bateramMaior, 0),
  };
}

/** Os setores da empresa que se pode escolher (quem vê todos os setores). */
export async function listarSetoresParaEscolher(empresaId: string): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from('setores').select('id, nome, ativo, excluido_em')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw new Error(error.message);
  // `excluido_em` existe no banco e ainda não em `database.types.ts`.
  return ((data as unknown as { id: string; nome: string; ativo: boolean | null; excluido_em: string | null }[] | null) ?? [])
    .filter(s => s.ativo !== false && !s.excluido_em)
    .map(({ id, nome }) => ({ id, nome }));
}

/** O setor inteiro no desafio. */
export async function buscarSetorNoDesafio(params: {
  empresaId: string;
  setorId: string;
  regras: RegrasDoDesafio;
  hoje: number;
  /**
   * Mês (YYYY-MM) do retrato a usar para saber QUEM era do setor
   * (`composicao_mes`). Desafio do Vale, 23/11/2026: passado o fim, quem mudou
   * de setor na virada continua contando no setor em que estava. Sem retrato
   * do mês, cai no cadastro de hoje.
   */
  retrato?: string;
}): Promise<SetorNoDesafio> {
  const { empresaId, setorId, regras, hoje, retrato } = params;
  const inicio = regras.dias[0];
  const fim = regras.dias[regras.dias.length - 1];
  const [ano, mes] = inicio.split('-').map(Number);

  const [pessoasR, equipesR, config] = await Promise.all([
    supabase.from('perfis')
      .select('id, nome, equipe_id, ativo, arquivado')
      .eq('empresa_id', empresaId).eq('setor_id', setorId),
    supabase.from('equipes').select('id, nome').eq('empresa_id', empresaId).eq('setor_id', setorId),
    getMetasConfig(empresaId, mes, ano),
  ]);
  if (pessoasR.error) throw new Error(pessoasR.error.message);
  if (equipesR.error) throw new Error(equipesR.error.message);

  type Crua = PessoaDoSetor & { ativo: boolean | null; arquivado: boolean | null };
  let pessoas = ((pessoasR.data as Crua[] | null) ?? [])
    .filter(p => p.ativo !== false && !p.arquivado)
    .map(({ id, nome, equipe_id }) => ({ id, nome, equipe_id }));
  if (retrato) {
    const fotoR = await supabase.from('composicao_mes')
      .select('operador_id, nome, equipe_id, ativo')
      .eq('empresa_id', empresaId).eq('mes', retrato).eq('setor_id', setorId);
    type Foto = { operador_id: string; nome: string | null; equipe_id: string | null; ativo: boolean | null };
    const foto = ((fotoR.data as Foto[] | null) ?? []).filter(f => f.ativo !== false);
    if (!fotoR.error && foto.length) {
      pessoas = foto.map(f => ({ id: f.operador_id, nome: f.nome ?? 'Sem nome', equipe_id: f.equipe_id }));
    }
  }
  const ids = pessoas.map(p => p.id);

  const [metasR, analitico] = await Promise.all([
    ids.length
      ? supabase.from('metas').select('referencia_id, meta_valor')
        .eq('empresa_id', empresaId).eq('tipo', 'operador').eq('mes', mes).eq('ano', ano)
        .in('referencia_id', ids)
      : Promise.resolve({ data: [], error: null }),
    buscarAnaliticoPeriodo({ empresaId, de: inicio, ate: fim, escopo: { tipo: 'equipe', operadores: new Set(ids) } }),
  ]);
  if (metasR.error) throw new Error(metasR.error.message);
  if (analitico.erro) throw new Error(analitico.erro);

  const metaDoMes = new Map<string, number>();
  for (const m of (metasR.data as { referencia_id: string; meta_valor: number | string | null }[] | null) ?? []) {
    metaDoMes.set(m.referencia_id, Number(m.meta_valor) || 0);
  }

  // Como na gaveta do operador: toda linha com o operador_id dele, dia a dia.
  const recebido = new Map<string, Record<string, number>>();
  for (const l of analitico.linhas) {
    if (!l.operador_id) continue;
    const dias = recebido.get(l.operador_id) ?? {};
    dias[l.data_pagamento] = (dias[l.data_pagamento] ?? 0) + (Number(l.valor_recebido) || 0);
    recebido.set(l.operador_id, dias);
  }

  return montarSetorNoDesafio({
    regras,
    pessoas,
    equipes: (equipesR.data as { id: string; nome: string }[] | null) ?? [],
    metaDoMes,
    recebido,
    feriados: (id) => diasUteisDoSetor(config, setorId, id).feriados,
    hoje,
  });
}
