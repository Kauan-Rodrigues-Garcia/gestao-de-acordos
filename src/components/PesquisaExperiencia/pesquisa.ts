/**
 * Pesquisa de experiência — «Como tá sendo usar o Gestão de Acordos?»
 * (Cleber, 08/10/2026; modelo «Cafezinho»).
 *
 * Card temporário em Configurações → Geral: nasce desligada e o super_admin
 * liga. Ligada, aparece para todo mundo, uma vez por pessoa, no canto de baixo
 * à esquerda. Não tem «agora não»: a gerência e a diretoria querem a resposta
 * de todos.
 *
 *   Ruim                  abre o campo na hora (dá para enviar sem escrever)
 *   Tá ok / Tô curtindo   agradece; «Adicionar comentário» fica 5 s na tela.
 *                         Tocou nele, o relógio para e só fecha no Enviar.
 *
 * A nota vale no toque e a pessoa pode trocar de carinha até a janela fechar:
 * cada troca reescreve a mesma linha. Banco: migration 20261008150000.
 */
// As tabelas e funções são novas (20261008150000) e ainda não estão nos tipos
// gerados: a ponte de leitura e RPC sem tipo dá conta, como no resto do projeto.
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';

export type NotaPesquisa = 'ruim' | 'media' | 'boa';

/** Na ordem da tela: da pior para a melhor. */
export const NOTAS: readonly NotaPesquisa[] = ['ruim', 'media', 'boa'];

export const ROTULO_NOTA: Record<NotaPesquisa, string> = {
  ruim: 'Ruim',
  media: 'Tá ok',
  boa: 'Tô curtindo',
};

/** Quanto tempo de uso antes de a pergunta aparecer. */
export const ESPERA_ANTES_DE_PERGUNTAR_MS = 3 * 60_000;

/** O agradecimento de «Tá ok» e «Tô curtindo» fica na tela por isto. */
export const SEGUNDOS_PARA_COMENTAR = 5;

/** Configurações → «Ver a pergunta»: abre a prévia, que não grava nada. */
export const EVENTO_PREVIA_PESQUISA = 'pesquisa-experiencia:previa';

export function abrirPreviaPesquisa(): void {
  window.dispatchEvent(new Event(EVENTO_PREVIA_PESQUISA));
}

export const LIMITE_COMENTARIO = 1000;

export interface EstadoPesquisa {
  ligada: boolean;
  respondeu: boolean;
}

export async function lerEstadoPesquisa(): Promise<EstadoPesquisa> {
  const { data, error } = await rpcSemTipo<Partial<EstadoPesquisa>>('fn_pesquisa_experiencia_estado', {});
  if (error) throw new Error(error.message);
  const d = data ?? {};
  return { ligada: !!d.ligada, respondeu: !!d.respondeu };
}

export async function votarPesquisa(nota: NotaPesquisa): Promise<void> {
  const { error } = await rpcSemTipo('fn_pesquisa_experiencia_votar', { p_nota: nota });
  if (error) throw new Error(error.message);
}

export async function comentarPesquisa(texto: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_pesquisa_experiencia_comentar', { p_texto: texto });
  if (error) throw new Error(error.message);
}

export async function ligarPesquisa(ligada: boolean): Promise<void> {
  const { error } = await rpcSemTipo('fn_pesquisa_experiencia_ligar', { p_ligada: ligada });
  if (error) throw new Error(error.message);
}

// ── O painel do card de Configurações ──────────────────────────────────────

export interface ConfigPesquisa {
  ligada: boolean;
  ligada_em: string | null;
  ligada_por_nome: string | null;
  desligada_em: string | null;
  desligada_por_nome: string | null;
}

export interface RespostaPesquisa {
  usuario_id: string;
  nome: string | null;
  cargo: string | null;
  empresa_nome: string | null;
  setor_id: string | null;
  setor_nome: string | null;
  nota: NotaPesquisa;
  comentario: string | null;
  respondida_em: string;
  comentada_em: string | null;
}

export interface PainelPesquisa {
  config: ConfigPesquisa | null;
  /** Quantas pessoas podem responder (ativas, sem o super_admin). */
  publico: number | null;
  respostas: RespostaPesquisa[];
}

export async function lerPainelPesquisa(): Promise<PainelPesquisa> {
  const [cfg, resp, pub] = await Promise.all([
    tabelaSemTipo<ConfigPesquisa>('pesquisa_experiencia_config')
      .select('ligada, ligada_em, ligada_por_nome, desligada_em, desligada_por_nome').eq('id', '1'),
    tabelaSemTipo<RespostaPesquisa>('pesquisa_experiencia_respostas')
      .select('usuario_id, nome, cargo, empresa_nome, setor_id, setor_nome, nota, comentario, respondida_em, comentada_em')
      .order('respondida_em', { ascending: false })
      .limit(2000),
    rpcSemTipo<number>('fn_pesquisa_experiencia_publico', {}),
  ]);
  if (cfg.error) throw new Error(cfg.error.message);
  if (resp.error) throw new Error(resp.error.message);
  return {
    config: cfg.data?.[0] ?? null,
    publico: pub.error ? null : pub.data,
    respostas: resp.data ?? [],
  };
}

export interface ResumoPesquisa {
  total: number;
  porNota: Record<NotaPesquisa, number>;
  comComentario: number;
  /** Setores com resposta, do que mais respondeu para o que menos. */
  porSetor: { setor: string; total: number; porNota: Record<NotaPesquisa, number> }[];
}

const SEM_SETOR = 'Sem setor';

export function resumirPesquisa(respostas: readonly RespostaPesquisa[]): ResumoPesquisa {
  const vazio = (): Record<NotaPesquisa, number> => ({ ruim: 0, media: 0, boa: 0 });
  const porNota = vazio();
  const setores = new Map<string, { total: number; porNota: Record<NotaPesquisa, number> }>();
  let comComentario = 0;
  for (const r of respostas) {
    porNota[r.nota]++;
    if (r.comentario?.trim()) comComentario++;
    const nome = r.setor_nome?.trim() || SEM_SETOR;
    const s = setores.get(nome) ?? { total: 0, porNota: vazio() };
    s.total++;
    s.porNota[r.nota]++;
    setores.set(nome, s);
  }
  const porSetor = [...setores.entries()]
    .map(([setor, s]) => ({ setor, ...s }))
    .sort((a, b) => b.total - a.total || a.setor.localeCompare(b.setor, 'pt-BR'));
  return { total: respostas.length, porNota, comComentario, porSetor };
}

/** «Ana Paula Souza» → «Ana». Sem nome, sem saudação pessoal. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}
