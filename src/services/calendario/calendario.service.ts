/**
 * calendario.service.ts — o banco do Calendário do setor (migration
 * 20261006170000).
 *
 *   fn_calendario_setores        — os setores que a pessoa enxerga, e se edita.
 *   fn_calendario_mes            — a capa e os eventos do setor no mês.
 *   fn_calendario_pessoas        — quem é do setor (para marcar aniversariante).
 *   fn_calendario_evento_salvar  — cria em vários dias, ou corrige um.
 *   fn_calendario_evento_excluir — apaga um evento.
 *   fn_calendario_mes_salvar     — grava a capa (tema, título, frase, expediente).
 *   fn_calendario_publicar       — lança o mês para a operação, ou o recolhe.
 *
 * As tabelas não têm acesso direto: tudo passa pelas funções, que conferem a
 * chave e o setor. As funções ainda não estão nos tipos gerados: daí
 * `rpcSemTipo`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { ehTipoEvento, type EventoCalendario, type TipoEvento } from '@/lib/calendarioSetor';

export interface SetorDoCalendario {
  id: string;
  nome: string;
  pode_editar: boolean;
}

export interface CapaDoMes {
  tema: string;
  titulo: string | null;
  frase: string | null;
  expediente_semana: string | null;
  expediente_sabado: string | null;
}

export interface MesDoCalendario {
  capa: CapaDoMes | null;
  eventos: EventoCalendario[];
  /**
   * O mês já foi lançado para a operação (migration 20261006190000)? Antes de
   * publicado, só quem monta o calendário recebe a capa e os eventos.
   */
  publicado: boolean;
  publicadoEm: string | null;
  /**
   * O banco já tem rascunho e publicação. `false` = banco anterior a
   * 20261006190000: tudo é visível, e a tela não oferece publicar.
   */
  temPublicacao: boolean;
}

export interface PessoaDoSetor {
  id: string;
  nome: string;
  foto_url: string | null;
}

export interface EventoParaSalvar {
  /** `null` cria um evento em cada dia de `dias`; preenchido, corrige aquele. */
  id: string | null;
  dias: string[];
  tipo: TipoEvento;
  titulo: string;
  detalhe: string | null;
  pessoa_id: string | null;
  destaque: boolean;
}

/** «yyyy-MM» → o primeiro dia, como o banco guarda. */
const primeiroDia = (mes: string) => `${mes.slice(0, 7)}-01`;

export async function listarSetoresDoCalendario(empresaId: string): Promise<SetorDoCalendario[]> {
  const { data, error } = await rpcSemTipo<SetorDoCalendario[]>('fn_calendario_setores', { p_empresa_id: empresaId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(s => ({ id: s.id, nome: s.nome, pode_editar: s.pode_editar === true }));
}

export async function buscarMes(empresaId: string, setorId: string, mes: string): Promise<MesDoCalendario> {
  const { data, error } = await rpcSemTipo<{
    capa: CapaDoMes | null;
    eventos: (Omit<EventoCalendario, 'tipo'> & { tipo: string })[];
    publicado?: boolean;
    publicado_em?: string | null;
  }>(
    'fn_calendario_mes', { p_empresa_id: empresaId, p_setor_id: setorId, p_mes: primeiroDia(mes) },
  );
  if (error) throw new Error(error.message);
  const temPublicacao = typeof data?.publicado === 'boolean';
  return {
    publicado: temPublicacao ? data!.publicado === true : true,
    publicadoEm: data?.publicado_em ?? null,
    temPublicacao,
    capa: data?.capa ?? null,
    // Tipo que a tela não conhece (banco à frente do app) fica de fora, em vez
    // de quebrar a grade inteira.
    eventos: (data?.eventos ?? [])
      .filter((e): e is EventoCalendario => ehTipoEvento(e.tipo))
      .map(e => ({ ...e, dia: e.dia.slice(0, 10), destaque: e.destaque === true })),
  };
}

export async function listarPessoasDoSetor(empresaId: string, setorId: string): Promise<PessoaDoSetor[]> {
  const { data, error } = await rpcSemTipo<PessoaDoSetor[]>('fn_calendario_pessoas', {
    p_empresa_id: empresaId, p_setor_id: setorId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Devolve quantos eventos gravou (um por dia, na criação). */
export async function salvarEvento(empresaId: string, setorId: string, ev: EventoParaSalvar): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_calendario_evento_salvar', {
    p_empresa_id: empresaId,
    p_setor_id: setorId,
    p_id: ev.id,
    p_dias: ev.dias,
    p_tipo: ev.tipo,
    p_titulo: ev.titulo,
    p_detalhe: ev.detalhe,
    p_pessoa_id: ev.pessoa_id,
    p_destaque: ev.destaque,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function excluirEvento(empresaId: string, id: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_calendario_evento_excluir', { p_empresa_id: empresaId, p_id: id });
  if (error) throw new Error(error.message);
}

export async function salvarCapa(empresaId: string, setorId: string, mes: string, capa: CapaDoMes): Promise<void> {
  const { error } = await rpcSemTipo('fn_calendario_mes_salvar', {
    p_empresa_id: empresaId,
    p_setor_id: setorId,
    p_mes: primeiroDia(mes),
    p_tema: capa.tema,
    p_titulo: capa.titulo,
    p_frase: capa.frase,
    p_expediente_semana: capa.expediente_semana,
    p_expediente_sabado: capa.expediente_sabado,
  });
  if (error) throw new Error(error.message);
}

/**
 * Lança o mês para a operação (`publicar = true`) ou o recolhe para rascunho.
 * Devolve quando foi publicado (`null` ao recolher).
 */
export async function publicarMes(
  empresaId: string, setorId: string, mes: string, publicar: boolean,
): Promise<string | null> {
  const { data, error } = await rpcSemTipo<string | null>('fn_calendario_publicar', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_mes: primeiroDia(mes), p_publicar: publicar,
  });
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Disparado quando o calendário muda nesta aba: o botão do topo relê o dia. */
export const EVENTO_CALENDARIO_SETOR = 'calendario-setor-mudou';
