/**
 * src/lib/notificacoes-rota.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Para onde uma notificação leva quando clicada.
 *
 * Toda notificação deve levar a algum lugar — antes só as de acordo levavam, e
 * o resto abria um detalhe sem saída.
 *
 * A ordem de decisão importa:
 *
 *   1. `acordo_id` — comportamento que já existia, e é o mais específico
 *      (leva ao acordo em si, não à aba);
 *   2. `rota` — gravada pelo produtor da notificação (migration 20260731a);
 *   3. palpite pelo título — só para as linhas antigas, gravadas antes de
 *      existir a coluna `rota`. Os títulos são texto fixo do próprio código.
 */
import { ROUTE_PATHS } from '@/lib/index';
import type { Notificacao } from '@/lib/supabase';

/** Destino das notificações de importação do analítico. */
export const ROTA_ANALITICO = ROUTE_PATHS.ANALITICO;
/** A aba "Recebimento diário" vive dentro do Analítico, atrás deste parâmetro. */
export const ROTA_DIARIO = `${ROUTE_PATHS.ANALITICO}?aba=diario`;
/** Chat de solicitação de atendimento. */
export const ROTA_SOLICITACOES = ROUTE_PATHS.SOLICITACOES_WHATSAPP;

/** Só o que o cálculo lê. */
type Alvo = Pick<Notificacao, 'titulo' | 'rota' | 'acordo_id'>;

/** Último código de caractere que o navegador descarta ao resolver uma URL. */
const LIMITE_CONTROLE = 0x20;
const DELETE_ASCII = 0x7f;

/**
 * `rota` vem do banco, e o clique na notificação chama `navigate(destino)`.
 * Sem filtro isso é um redirecionamento aberto: uma linha com
 * `rota = '//site-falso'` tira o operador do sistema — e ele sai de dentro da
 * tela onde estava logado, que é justamente o cenário de phishing que dá certo.
 * É a mesma classe do CVE-2025-68470 do react-router (a barra invertida como
 * desvio), então o filtro fica aqui, não na versão da biblioteca.
 *
 * Só passa caminho interno: começa com uma barra, e o que vem depois não é
 * outra barra nem barra invertida. Caractere de controle em qualquer posição
 * também reprova — o navegador descarta esses bytes antes de resolver a URL,
 * então o que a checagem vê e o que o navegador vê seriam coisas diferentes.
 */
export function caminhoInternoSeguro(rota: unknown): string | null {
  if (typeof rota !== 'string') return null;
  const limpo = rota.trim();
  if (!limpo.startsWith('/')) return null;
  if (limpo.length > 1 && (limpo[1] === '/' || limpo[1] === '\\')) return null;
  for (let i = 0; i < limpo.length; i++) {
    const codigo = limpo.charCodeAt(i);
    if (codigo < LIMITE_CONTROLE || codigo === DELETE_ASCII) return null;
  }
  return limpo;
}

/**
 * Palpite para linhas gravadas antes da coluna `rota`.
 *
 * O diário é testado ANTES do analítico: o título "Recebimento diário
 * atualizado" não contém "analítico", mas a mensagem dele fala em "Analítico ›
 * Recebimento diário" — testar na ordem errada mandaria o diário para a aba
 * errada se um dia a busca passar a olhar a mensagem.
 */
function palpitePeloTitulo(titulo: string): string | null {
  const t = titulo.toLowerCase();
  if (t.includes('diário') || t.includes('diario'))        return ROTA_DIARIO;
  if (t.includes('analítico') || t.includes('analitico'))  return ROTA_ANALITICO;
  if (t.includes('mensagem') || t.includes('solicitaç') || t.includes('solicitac')) {
    return ROTA_SOLICITACOES;
  }
  return null;
}

/**
 * Caminho interno para onde a notificação leva, ou `null` se não houver destino.
 *
 * @param isPaguePlay muda só o destino de acordo: na PaguePlay a lista de
 *   acordos é o próprio dashboard, no BookPlay é `/acordos`.
 */
export function rotaDaNotificacao(n: Alvo, isPaguePlay: boolean): string | null {
  if (n.acordo_id) {
    const id = encodeURIComponent(n.acordo_id);
    return isPaguePlay
      ? `${ROUTE_PATHS.DASHBOARD}?highlight=${id}`
      : `${ROUTE_PATHS.ACORDOS}?highlight=${id}`;
  }
  // A rota do banco só vale se for interna; sendo externa, ainda resta o
  // palpite pelo título, que sai de constantes do próprio código.
  const interna = caminhoInternoSeguro(n.rota);
  if (interna) return interna;
  return palpitePeloTitulo(n.titulo ?? '');
}
