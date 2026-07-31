/**
 * leitura.ts — quem leu o quê na conversa do pedido.
 *
 * Existia um carimbo único por mensagem (`lida_em`), e por isso a bolinha
 * vermelha sumia da tela de todo mundo quando qualquer pessoa abria a conversa.
 * Agora cada um tem um cursor — "li esta conversa até tal instante" — e as
 * contas ficam aqui, fora do hook, para poderem ser testadas.
 *
 * Ver migration `20260731d_wpp_leitura_por_pessoa.sql`.
 */

/** Cursor de leitura de uma pessoa numa conversa. */
export interface Leitura {
  solicitacao_id: string;
  usuario_id:     string;
  lido_ate:       string;
}

/** O mínimo de uma mensagem que estas contas precisam. */
export interface MensagemLida {
  solicitacao_id: string;
  autor_id:       string;
  criado_em:      string;
}

/** solicitacao_id → instante até onde EU li. */
export function cursoresPorConversa(
  leituras: readonly Leitura[],
  usuarioId: string,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of leituras) {
    if (l.usuario_id !== usuarioId) continue;
    const t = new Date(l.lido_ate).getTime();
    if (!Number.isFinite(t)) continue;
    // Uma linha por pessoa/conversa, mas o max protege contra duplicata.
    mapa.set(l.solicitacao_id, Math.max(mapa.get(l.solicitacao_id) ?? 0, t));
  }
  return mapa;
}

/**
 * Quantas mensagens ainda não li, por conversa.
 *
 * Minha própria mensagem nunca conta. Conversa sem cursor conta tudo: quem
 * nunca abriu não leu nada.
 */
export function contarNaoLidas(
  mensagens: readonly MensagemLida[],
  leituras: readonly Leitura[],
  usuarioId: string,
): Record<string, number> {
  const cursores = cursoresPorConversa(leituras, usuarioId);
  const out: Record<string, number> = {};
  for (const m of mensagens) {
    if (m.autor_id === usuarioId) continue;
    const t = new Date(m.criado_em).getTime();
    if (!Number.isFinite(t)) continue;
    const lidoAte = cursores.get(m.solicitacao_id) ?? 0;
    if (t <= lidoAte) continue;
    out[m.solicitacao_id] = (out[m.solicitacao_id] ?? 0) + 1;
  }
  return out;
}

/**
 * A minha mensagem já foi lida por alguém do outro lado?
 *
 * É o ✓✓. Só contam cursores de OUTRAS pessoas — abrir a própria conversa não
 * confirma leitura para mim mesmo.
 */
export function foiLidaPorOutro(
  mensagem: MensagemLida,
  leiturasDaConversa: readonly Leitura[],
  usuarioId: string,
): boolean {
  const t = new Date(mensagem.criado_em).getTime();
  if (!Number.isFinite(t)) return false;
  return leiturasDaConversa.some((l) => {
    if (l.usuario_id === usuarioId) return false;
    if (l.solicitacao_id !== mensagem.solicitacao_id) return false;
    const lido = new Date(l.lido_ate).getTime();
    return Number.isFinite(lido) && lido >= t;
  });
}
