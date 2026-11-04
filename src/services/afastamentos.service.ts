/**
 * afastamentos.service.ts — afastamentos e pontos de atenção de uso (aba Usuários).
 *
 * ## O que mora no banco (20261028100000)
 *
 * Afastamento é uma linha em `ausencias`, a mesma tabela do Comercial, lançada
 * pela porta da aba Usuários (`fn_usuarios_afastar`). Enquanto está em curso:
 *
 *   • férias                       → `perfis.situacao = 'ferias'`;
 *   • «tirar das contas» ligado     → `'afastado'` (sai de ranking/quartil/TV);
 *   • desligado                    → continua `'ativo'`, só não conta contra
 *                                    no ponto de atenção.
 *
 * Volta com data ou «tempo indeterminado» (fim = 9999-12-31 no banco, `null`
 * aqui — `fn_usuarios_afastamentos` já devolve nulo).
 *
 * Ponto de atenção é quem está ativo e há 4+ dias úteis (aprendiz 5+) sem
 * abrir o Gestão. O algoritmo inteiro está no banco (`fn_uso_pontos_de_atencao`);
 * esta camada só lê.
 *
 * ## Prévia
 *
 * `?previa=atencao`, só no localhost: dados de mentira e gravações que fingem
 * dar certo, para ver a tela antes de a migration estar no banco.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { mensagemDoErro, pareceNaoInstalado } from '@/services/vendas/erroDoBanco';
import { invalidarComposicaoEquipes } from '@/services/analitico/composicaoCache';

const MIGRATION = '20261028100000_afastamentos_e_atencao_de_uso.sql';

export interface Resultado<T = null> {
  ok: boolean;
  dado: T | null;
  erro: string | null;
}

export interface Afastamento {
  id: string;
  operador_id: string;
  tipo: string;
  rotulo: string;
  /** `yyyy-MM-dd`. */
  inicio: string;
  /** `yyyy-MM-dd`, último dia. `null` = sem data de volta. */
  fim: string | null;
  fora_das_contas: boolean;
  observacao: string | null;
  criado_por_nome: string | null;
  criado_em: string;
}

export interface PontoDeAtencao {
  /** A empresa consultada — a lista da cobrança junta mais de uma. */
  empresa_id: string;
  operador_id: string;
  nome: string;
  foto_url: string | null;
  setor_nome: string | null;
  equipe_nome: string | null;
  menor_aprendiz: boolean;
  /** `yyyy-MM-dd`. `null` = nunca abriu o sistema. */
  ultimo_uso: string | null;
  /** Dias úteis seguidos sem entrar, já sem feriado, ausência e dia sem registro. */
  dias_sem_uso: number;
  /** 4, ou 5 para menor aprendiz. */
  limite: number;
  ignorado_em: string | null;
  ignorado_comentario: string | null;
  ignorado_por_nome: string | null;
}

export interface PontosDeAtencao {
  pontos: PontoDeAtencao[];
  /** `false` enquanto a migration não for aplicada. A tela some em vez de gritar. */
  disponivel: boolean;
  erro: string | null;
}

/* ── Prévia ──────────────────────────────────────────────────────────────── */

export function emPreviaDeAtencao(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('previa') === 'atencao';
}

function diaRelativo(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const PREVIA_PONTOS: Omit<PontoDeAtencao, 'empresa_id'>[] = [
  { operador_id: 'previa-1', nome: 'Alessandra Beatriz', foto_url: null, setor_nome: 'Play Mix Marília',
    equipe_nome: 'Equipe Karina', menor_aprendiz: false, ultimo_uso: null, dias_sem_uso: 17, limite: 4,
    ignorado_em: null, ignorado_comentario: null, ignorado_por_nome: null },
  { operador_id: 'previa-2', nome: 'Andriele Silva', foto_url: null, setor_nome: 'Play 1',
    equipe_nome: 'Equipe Rhaissa', menor_aprendiz: false, ultimo_uso: diaRelativo(-39), dias_sem_uso: 26, limite: 4,
    ignorado_em: null, ignorado_comentario: null, ignorado_por_nome: null },
  { operador_id: 'previa-3', nome: 'Isabelly Teles', foto_url: null, setor_nome: 'Play 1',
    equipe_nome: 'Equipe Rhaissa', menor_aprendiz: true, ultimo_uso: diaRelativo(-12), dias_sem_uso: 8, limite: 5,
    ignorado_em: null, ignorado_comentario: null, ignorado_por_nome: null },
  { operador_id: 'previa-4', nome: 'Laiza Santos', foto_url: null, setor_nome: 'Play 2',
    equipe_nome: 'Equipe Cleiton', menor_aprendiz: false, ultimo_uso: diaRelativo(-8), dias_sem_uso: 5, limite: 4,
    ignorado_em: diaRelativo(-15) + 'T14:20:00Z', ignorado_comentario: 'Conversei, estava com problema no PC.',
    ignorado_por_nome: 'Cleiton' },
];

const PREVIA_AFASTAMENTOS: Afastamento[] = [
  { id: 'previa-a1', operador_id: 'previa-ficha', tipo: 'atestado', rotulo: 'Atestado', inicio: diaRelativo(-2),
    fim: diaRelativo(3), fora_das_contas: false, observacao: null, criado_por_nome: 'Rhaissa',
    criado_em: diaRelativo(-2) + 'T12:00:00Z' },
  { id: 'previa-a2', operador_id: 'previa-ficha', tipo: 'ferias', rotulo: 'Férias', inicio: '2026-07-01',
    fim: '2026-07-30', fora_das_contas: true, observacao: null, criado_por_nome: 'Cleber',
    criado_em: '2026-06-20T12:00:00Z' },
];

/* ── Leitura ─────────────────────────────────────────────────────────────── */

function traduzir(mensagem: string, assunto: string): string {
  return mensagemDoErro(mensagem, assunto, MIGRATION);
}

function texto(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function paraAfastamento(r: Record<string, unknown>): Afastamento {
  return {
    id: String(r.id),
    operador_id: String(r.operador_id),
    tipo: String(r.tipo),
    rotulo: String(r.rotulo ?? r.tipo),
    inicio: String(r.inicio).slice(0, 10),
    fim: r.fim ? String(r.fim).slice(0, 10) : null,
    fora_das_contas: r.fora_das_contas === true,
    observacao: texto(r.observacao),
    criado_por_nome: texto(r.criado_por_nome),
    criado_em: String(r.criado_em ?? ''),
  };
}

export async function buscarPontosDeAtencao(empresaId: string): Promise<PontosDeAtencao> {
  if (emPreviaDeAtencao()) {
    return { pontos: PREVIA_PONTOS.map(p => ({ ...p, empresa_id: empresaId })), disponivel: true, erro: null };
  }

  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_uso_pontos_de_atencao', { p_empresa_id: empresaId },
  );
  if (error) {
    return {
      pontos: [],
      disponivel: !pareceNaoInstalado(error.message),
      erro: traduzir(error.message, 'Os pontos de atenção'),
    };
  }
  const pontos = (data ?? []).map((r): PontoDeAtencao => ({
    empresa_id: empresaId,
    operador_id: String(r.operador_id),
    nome: String(r.nome ?? ''),
    foto_url: texto(r.foto_url),
    setor_nome: texto(r.setor_nome),
    equipe_nome: texto(r.equipe_nome),
    menor_aprendiz: r.menor_aprendiz === true,
    ultimo_uso: r.ultimo_uso ? String(r.ultimo_uso).slice(0, 10) : null,
    dias_sem_uso: Number(r.dias_sem_uso) || 0,
    limite: Number(r.limite) || 4,
    ignorado_em: texto(r.ignorado_em),
    ignorado_comentario: texto(r.ignorado_comentario),
    ignorado_por_nome: texto(r.ignorado_por_nome),
  }));
  return { pontos, disponivel: true, erro: null };
}

/**
 * Afastamentos em curso ou que vêm pela frente, da empresa — as etiquetas da
 * lista. Com `operadorId`, o histórico inteiro daquela pessoa (ficha).
 */
export async function buscarAfastamentos(empresaId: string, operadorId?: string | null): Promise<Resultado<Afastamento[]>> {
  if (emPreviaDeAtencao()) {
    return { ok: true, dado: operadorId ? PREVIA_AFASTAMENTOS.map(a => ({ ...a, operador_id: operadorId })) : [], erro: null };
  }
  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_usuarios_afastamentos', { p_empresa_id: empresaId, p_operador_id: operadorId ?? null },
  );
  if (error) {
    // Sem a migration a lista segue sem etiqueta — não é erro para a tela.
    if (pareceNaoInstalado(error.message)) return { ok: true, dado: [], erro: null };
    return { ok: false, dado: null, erro: traduzir(error.message, 'Os afastamentos') };
  }
  return { ok: true, dado: (data ?? []).map(paraAfastamento), erro: null };
}

/* ── Escrita ─────────────────────────────────────────────────────────────── */

export interface NovoAfastamento {
  empresaId: string;
  operadorId: string;
  tipo: string;
  /** `yyyy-MM-dd`. */
  inicio: string;
  /** `yyyy-MM-dd`, último dia. `null` = tempo indeterminado. */
  fim: string | null;
  foraDasContas: boolean;
  observacao: string;
}

export async function afastar(a: NovoAfastamento): Promise<Resultado<string>> {
  if (emPreviaDeAtencao()) return { ok: true, dado: 'previa', erro: null };
  const { data, error } = await rpcSemTipo<string>('fn_usuarios_afastar', {
    p_empresa_id:      a.empresaId,
    p_operador_id:     a.operadorId,
    p_tipo:            a.tipo,
    p_inicio:          a.inicio,
    p_fim:             a.fim,
    p_fora_das_contas: a.foraDasContas,
    p_observacao:      a.observacao,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message, 'O afastamento') };
  // Situação mudou: ranking e quartil leem a composição em cache.
  invalidarComposicaoEquipes();
  return { ok: true, dado: data ?? null, erro: null };
}

/** «A pessoa voltou»: o último dia vira ontem; o que ainda não começou sai. */
export async function encerrarAfastamento(id: string): Promise<Resultado<string>> {
  if (emPreviaDeAtencao()) return { ok: true, dado: id, erro: null };
  const { data, error } = await rpcSemTipo<string>('fn_usuarios_encerrar_afastamento', { p_id: id });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message, 'O afastamento') };
  invalidarComposicaoEquipes();
  return { ok: true, dado: data ?? null, erro: null };
}

/** Zera a contagem de dias sem uso; volta a avisar depois de mais 4 dias úteis. */
export async function ignorarPontoDeAtencao(empresaId: string, operadorId: string, comentario: string): Promise<Resultado<string>> {
  if (emPreviaDeAtencao()) return { ok: true, dado: 'previa', erro: null };
  const { data, error } = await rpcSemTipo<string>('fn_uso_atencao_ignorar', {
    p_empresa_id: empresaId, p_operador_id: operadorId, p_comentario: comentario,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message, 'O ignorar') };
  return { ok: true, dado: data ?? null, erro: null };
}
