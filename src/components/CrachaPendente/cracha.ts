/**
 * Crachá pendente — o cartão que pede o número do crachá a quem ainda não tem
 * um cadastrado (26/10/2026; no molde da pesquisa de experiência).
 *
 * O número vai para `rh_dados_operadores`, a mesma linha que Premiações e
 * Comissões (Fechamento) e o RH Gestão leem: preencheu aqui, aparece lá.
 * A pessoa só preenche — trocar um crachá já cadastrado continua com o RH.
 * Banco: migration 20261026160000; liga/desliga e o painel de Configurações
 * → Geral, 20261026180000.
 */
// As funções são novas (20261026160000) e ainda não estão nos tipos gerados.
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

/** O crachá tem até 8 números; quem tem menos também preenche. */
export const DIGITOS_CRACHA = 8;

/** Quanto tempo de uso antes de o cartão aparecer. */
export const ESPERA_ANTES_DE_PEDIR_MS = 60_000;

/** `?previa-cracha` na URL abre o cartão na hora, sem gravar nada. */
export function pediuPreviaCrachaNaUrl(busca: string = window.location.search): boolean {
  return new URLSearchParams(busca).has('previa-cracha');
}

/** Só os números, no máximo 8 — o que a pessoa colar ou digitar. */
export function limparCracha(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, DIGITOS_CRACHA);
}

export function crachaCompleto(texto: string): boolean {
  return new RegExp(`^\\d{1,${DIGITOS_CRACHA}}$`).test(texto);
}

export interface EstadoCracha {
  /** O super_admin pode desligar o pedido em Configurações → Geral (180000). */
  ligado: boolean;
  temCracha: boolean;
}

export async function lerEstadoCracha(): Promise<EstadoCracha> {
  const { data, error } = await rpcSemTipo<{ ligado?: boolean; tem_cracha?: boolean }>('fn_meu_cracha_estado', {});
  if (error) throw new Error(error.message);
  // Sem `ligado` é a função de 160000, de antes do liga/desliga: estava ligado.
  return { ligado: data?.ligado !== false, temCracha: !!data?.tem_cracha };
}

/** Configurações → «Ver o cartão»: abre a prévia, que não grava nada. */
export const EVENTO_PREVIA_CRACHA = 'cracha-pendente:previa';

export function abrirPreviaCracha(): void {
  window.dispatchEvent(new Event(EVENTO_PREVIA_CRACHA));
}

// ── O painel do card de Configurações (migration 20261026180000) ───────────

export type SituacaoCracha = 'respondeu' | 'ja_tinha' | 'pendente';

export const ROTULO_SITUACAO: Record<SituacaoCracha, string> = {
  respondeu: 'Respondeu',
  ja_tinha: 'Já tinha pelo RH',
  pendente: 'Pendente',
};

export interface PessoaCracha {
  usuario_id: string;
  nome: string | null;
  cargo: string | null;
  empresa_nome: string | null;
  setor_nome: string | null;
  situacao: SituacaoCracha;
  respondida_em: string | null;
}

export interface PainelCracha {
  config: { ligado: boolean; mudado_em: string | null; mudado_por_nome: string | null } | null;
  pessoas: PessoaCracha[];
}

export async function lerPainelCracha(): Promise<PainelCracha> {
  const { data, error } = await rpcSemTipo<Partial<PainelCracha>>('fn_cracha_pedido_painel', {});
  if (error) throw new Error(error.message);
  return { config: data?.config ?? null, pessoas: data?.pessoas ?? [] };
}

export async function ligarPedidoCracha(ligado: boolean): Promise<void> {
  const { error } = await rpcSemTipo('fn_cracha_pedido_ligar', { p_ligado: ligado });
  if (error) throw new Error(error.message);
}

export const SEM_SETOR = 'Sem setor';

export interface ResumoCracha {
  porSituacao: Record<SituacaoCracha, number>;
  /** Setores do que tem mais pendência para o que tem menos. */
  porSetor: { setor: string; total: number; porSituacao: Record<SituacaoCracha, number> }[];
}

export function resumirCracha(pessoas: readonly PessoaCracha[]): ResumoCracha {
  const vazio = (): Record<SituacaoCracha, number> => ({ respondeu: 0, ja_tinha: 0, pendente: 0 });
  const porSituacao = vazio();
  const setores = new Map<string, { total: number; porSituacao: Record<SituacaoCracha, number> }>();
  for (const p of pessoas) {
    porSituacao[p.situacao]++;
    const nome = p.setor_nome?.trim() || SEM_SETOR;
    const s = setores.get(nome) ?? { total: 0, porSituacao: vazio() };
    s.total++;
    s.porSituacao[p.situacao]++;
    setores.set(nome, s);
  }
  const porSetor = [...setores.entries()]
    .map(([setor, s]) => ({ setor, ...s }))
    .sort((a, b) => b.porSituacao.pendente - a.porSituacao.pendente || a.setor.localeCompare(b.setor, 'pt-BR'));
  return { porSituacao, porSetor };
}

export async function salvarMeuCracha(cracha: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_meu_cracha_salvar', { p_cracha: cracha });
  if (error) throw new Error(error.message);
}

/** «Ana Paula Souza» → «Ana». */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

/** «Ana Paula Souza» → «AS». */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  const ultima = partes.length > 1 ? partes[partes.length - 1] : '';
  return (partes[0][0] + (ultima[0] ?? '')).toUpperCase();
}
