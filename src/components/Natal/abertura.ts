/**
 * abertura.ts — o presente de cada pessoa: qual vídeo ela vê e o que já fez.
 *
 * ## O vídeo (Cleber, 09/11/2026)
 *
 * As corridas de outubro e o mural da Coisa foram só para Birigui. O vídeo de
 * Marília é o mesmo, com outras falas das corridas em diante (`videos/`,
 * composição `AberturaNatalMarilia`). Quem diz é a cidade do setor:
 *
 *   Marília                        → o de Marília
 *   Birigui, outra cidade, nenhuma → o de Birigui (o padrão)
 *
 * ## O que fica gravado (migration 20261109150000)
 *
 * `natal_abertura`, uma linha por pessoa: assistiu até o fim, pulou, deixou
 * para depois (quantas vezes) e quando entrou no Natal. É o que o card de
 * acompanhamento de Configurações mostra, e o que faz o Natal seguir a pessoa
 * de um computador para outro. O `localStorage` (`previa.ts`) continua sendo o
 * atalho que responde na hora e a reserva enquanto a migration não está
 * aplicada: a função ausente só devolve erro, e a tela segue pelo navegador.
 *
 * Quem entra como outra pessoa (impersonação) não grava nada no nome dela.
 */
import { useEffect, useState } from 'react';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { lerCidadeDoSetor } from '@/lib/cidadeDoSetor';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';

export type VideoDaCidade = 'birigui' | 'marilia';
export type EventoDaAbertura = 'assistiu' | 'pulou' | 'adiou' | 'liberou';

/** Os dois vídeos (`public/video/natal/`). */
export const VIDEOS: Record<VideoDaCidade, string> = {
  birigui: '/video/natal/abertura.mp4',
  marilia: '/video/natal/abertura-marilia.mp4',
};

function chave(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** A cidade (como vier: «Marília», «marilia»…) decide o vídeo. Sem cidade, Birigui. */
export function videoDaCidade(cidade: string | null | undefined): VideoDaCidade {
  return cidade && chave(cidade) === 'marilia' ? 'marilia' : 'birigui';
}

// ── A troca da prévia: ver o vídeo da outra cidade ────────────────────────────

const CHAVE_VIDEO_PREVIA = 'natal:previa-video';
export const EVENTO_VIDEO_PREVIA = 'natal-previa-video';

/** A prévia (super_admin e `npm run dev`) força um dos vídeos; `null` = o da cidade. */
export function lerVideoDaPrevia(): VideoDaCidade | null {
  try {
    const v = localStorage.getItem(CHAVE_VIDEO_PREVIA);
    return v === 'birigui' || v === 'marilia' ? v : null;
  } catch { return null; }
}
export function escolherVideoDaPrevia(v: VideoDaCidade | null) {
  try {
    if (v) localStorage.setItem(CHAVE_VIDEO_PREVIA, v);
    else localStorage.removeItem(CHAVE_VIDEO_PREVIA);
  } catch { /* modo privado */ }
  window.dispatchEvent(new Event(EVENTO_VIDEO_PREVIA));
}

// ── O que o banco sabe da pessoa ──────────────────────────────────────────────

export interface MinhaAbertura {
  /** `true` depois da primeira resposta (do banco ou da reserva). */
  pronto: boolean;
  video: VideoDaCidade;
  /** Já entrou no Natal em algum computador. */
  liberou: boolean;
}

interface RespostaMinha {
  cidade?: string | null;
  liberou_em?: string | null;
}

const PENDENTE: MinhaAbertura = { pronto: false, video: 'birigui', liberou: false };
/** Uma leitura por pessoa por sessão. */
const lidas = new Map<string, Promise<MinhaAbertura>>();

async function lerMinha(setorId: string | null): Promise<MinhaAbertura> {
  const { data, error } = await rpcSemTipo<RespostaMinha>('fn_natal_minha_abertura', {});
  if (!error && data) {
    return { pronto: true, video: videoDaCidade(data.cidade), liberou: !!data.liberou_em };
  }
  // Função ainda não aplicada: a cidade pelo setor do perfil, e o resto fica no navegador.
  const cidade = setorId ? await lerCidadeDoSetor(setorId).catch((): null => null) : null;
  return { pronto: true, video: videoDaCidade(cidade), liberou: false };
}

/**
 * A cidade e se a pessoa já entrou no Natal. Só pergunta quando precisa
 * (`ativo`): o presente ainda fechado neste navegador e o tema disponível.
 */
export function useMinhaAbertura(pessoa: string | null, setorId: string | null, ativo: boolean): MinhaAbertura {
  const [estado, setEstado] = useState<MinhaAbertura>(PENDENTE);
  useEffect(() => {
    if (!ativo || !pessoa) return;
    let vivo = true;
    let leitura = lidas.get(pessoa);
    if (!leitura) {
      leitura = lerMinha(setorId).catch((): MinhaAbertura => ({ pronto: true, video: 'birigui', liberou: false }));
      lidas.set(pessoa, leitura);
    }
    void leitura.then(m => { if (vivo) setEstado(m); });
    return () => { vivo = false; };
  }, [ativo, pessoa, setorId]);
  return estado;
}

/** Grava um passo do presente. Erro (função ausente, rede) é engolido: o navegador já guardou. */
export function marcarAbertura(evento: EventoDaAbertura, video: VideoDaCidade): void {
  if (getImpersonacaoAtiva()) return;
  void rpcSemTipo('fn_natal_abertura_marcar', { p_evento: evento, p_video: video });
}
