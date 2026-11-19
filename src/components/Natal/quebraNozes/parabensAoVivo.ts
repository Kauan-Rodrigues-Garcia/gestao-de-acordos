/**
 * Parabéns ao vivo: o balão de uma pessoa chega na tela dos colegas da cidade
 * (Cleber, 19/11/2026; migration 20261119120000).
 *
 * Broadcast privado `natal_parabens:<cidade>`, evento `parabens`. Quem manda é
 * o banco (`fn_natal_quebra_nozes_parabenizar`), com nome e foto do login; o
 * cliente manda só a chave do show e o índice da frase.
 *
 * Dois freios, porque cada balão vai para ~300 pessoas por cidade:
 *   - no banco, 1 envio a cada 2 s por cidade;
 *   - aqui, `deveTentar`: depois de um clique a pessoa espera um sorteio de até
 *     3 s; se nesse meio-tempo chegou balão de colega, não chama o banco. E
 *     cada pessoa tenta no máximo 1 vez a cada 10 s. O resto dos cliques fica
 *     só na tela dela.
 */
import { assinarTabela } from '@/lib/realtime';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { Cidade } from './elenco';

export interface AoVivoDoPalco {
  cidade: Cidade;
  /** A chave do show: igual em todo computador da cidade. */
  chave: string;
  pessoaId: string;
  /** Super admin acompanha as duas cidades: o banco aceita a cidade dele. */
  superAdmin: boolean;
}

export interface ParabensQueChegou {
  pessoa: string;
  nome: string;
  foto: string | null;
  frase: number;
}

/** Espera sorteada entre o clique e a tentativa no banco. */
export const ESPERA_MAXIMA_MS = 3_000;
/** Chegou balão de colega há menos que isto: não precisa chamar o banco. */
export const SILENCIO_MINIMO_MS = 2_000;
/** Uma tentativa no banco por pessoa a cada... */
export const ENTRE_TENTATIVAS_MS = 10_000;
/** A assinatura do canal se espalha neste intervalo, para a cidade não entrar no mesmo segundo. */
export const ESPALHAR_ENTRADA_MS = 4_000;

export const topicoDosParabens = (cidade: Cidade) => `natal_parabens:${cidade}`;

/** Puro: vale chamar o banco agora? */
export function deveTentar({ agora, ultimoColega, ultimaTentativa }: {
  agora: number;
  ultimoColega: number;
  ultimaTentativa: number;
}): boolean {
  if (agora - ultimaTentativa < ENTRE_TENTATIVAS_MS) return false;
  if (agora - ultimoColega < SILENCIO_MINIMO_MS) return false;
  return true;
}

/** Puro: o payload que o banco mandou, já conferido. Exportada para os testes. */
export function lerParabens(p: Record<string, unknown> | null | undefined, chave: string): ParabensQueChegou | null {
  if (!p || p.chave !== chave) return null;
  const pessoa = typeof p.pessoa === 'string' ? p.pessoa : '';
  const nome = typeof p.nome === 'string' ? p.nome.trim() : '';
  const frase = Number(p.frase);
  if (!pessoa || !nome || !Number.isInteger(frase) || frase < 0) return null;
  const foto = typeof p.foto === 'string' && p.foto.trim() ? p.foto.trim() : null;
  return { pessoa, nome, foto, frase };
}

/** Ouve os parabéns do show. Devolve o cancelamento. */
export function ouvirParabens(aoVivo: AoVivoDoPalco, aoChegar: (p: ParabensQueChegou) => void): () => void {
  return assinarTabela(
    { topico: topicoDosParabens(aoVivo.cidade), escutas: [{ sinal: 'parabens' }] },
    {
      onSinal: payload => {
        const p = lerParabens(payload, aoVivo.chave);
        if (p && p.pessoa !== aoVivo.pessoaId) aoChegar(p);
      },
    },
  );
}

/** Manda o parabéns pelo banco. Falha em silêncio: o show segue. */
export async function mandarParabens(aoVivo: AoVivoDoPalco, frase: number): Promise<boolean> {
  try {
    const { data, error } = await rpcSemTipo<boolean>('fn_natal_quebra_nozes_parabenizar', {
      p_chave: aoVivo.chave,
      p_frase: frase,
      p_cidade: aoVivo.superAdmin ? aoVivo.cidade : null,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
