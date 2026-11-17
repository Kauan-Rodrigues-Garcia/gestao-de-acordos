/**
 * banco.ts — o que as cartas da Guerra leem (`carta.ts` desenha).
 *
 * Só leitura, e só no clique do super_admin. As tabelas da guerra não têm
 * leitura direta (RLS sem policy): vem tudo de `fn_corrida_guerra_insignias`
 * (20261023200000), que para o super_admin devolve quem deu dano em cada
 * guerra em que o Cavalo da Guerra CAIU, com o nome e a foto da corrida. O
 * perfil de hoje entra por cima (a foto e o setor de agora). Nenhuma
 * migration nova.
 *
 * A ordem é a do ranking da luta (`fn_corrida_guerra_json`): dano, depois o
 * usuário.
 */
import { supabase } from '@/lib/supabase';
import type { DadosDaCartaGuerra } from './carta';

export interface LinhaDaGuerra {
  usuario: string;
  nome: string | null;
  foto: string | null;
  dano: number;
  corrida_id: number;
  caiu_em: string | null;
}

export interface GuerraQueCaiu {
  corrida: number;
  caiuEm: string | null;
  linhas: LinhaDaGuerra[];
}

export interface CartaParaDesenhar {
  dados: DadosDaCartaGuerra;
  usuario: string;
  foto: string | null;
}

/** Do maior dano para o menor; empate, pelo usuário (como o ranking do banco). */
export function ordenarLinhas(ls: readonly LinhaDaGuerra[]): LinhaDaGuerra[] {
  return [...ls].sort((a, b) => b.dano - a.dano || (a.usuario < b.usuario ? -1 : a.usuario > b.usuario ? 1 : 0));
}

/** As linhas soltas viram uma guerra por corrida, da que caiu por último para a primeira. */
export function agruparGuerras(ls: readonly LinhaDaGuerra[]): GuerraQueCaiu[] {
  const por = new Map<number, GuerraQueCaiu>();
  for (const l of ls) {
    if (!(l.dano > 0)) continue;
    const g = por.get(l.corrida_id) ?? { corrida: l.corrida_id, caiuEm: l.caiu_em, linhas: [] };
    g.linhas.push(l);
    por.set(l.corrida_id, g);
  }
  return [...por.values()]
    .map(g => ({ ...g, linhas: ordenarLinhas(g.linhas) }))
    .sort((a, b) => (b.caiuEm ?? '').localeCompare(a.caiuEm ?? '') || b.corrida - a.corrida);
}

/** As guerras em que ele caiu, cada uma com todo mundo que acertou. */
export async function lerGuerrasQueCairam(): Promise<GuerraQueCaiu[]> {
  const chamar = supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await chamar.call(supabase, 'fn_corrida_guerra_insignias', {});
  if (error) throw new Error(error.message);
  const linhas = ((data ?? []) as LinhaDaGuerra[]).map(l => ({ ...l, dano: Number(l.dano) }));
  return agruparGuerras(linhas);
}

/** Todo mundo da guerra, na ordem do ranking, pronto para virar carta. */
export async function lerCartasDaGuerra(g: GuerraQueCaiu): Promise<CartaParaDesenhar[]> {
  const perfis = new Map<string, { nome: string; foto: string | null; setor: string | null }>();
  // Em lotes: 100 uuids por pedido cabem com folga no endereço.
  for (let i = 0; i < g.linhas.length; i += 100) {
    const consulta = supabase.from('perfis') as unknown as {
      select(c: string): { in(col: string, v: string[]): PromiseLike<{ data: unknown; error: { message: string } | null }> };
    };
    const { data, error } = await consulta
      .select('id, nome, foto_url, setores!perfis_setor_id_fkey(nome)')
      .in('id', g.linhas.slice(i, i + 100).map(l => l.usuario));
    // Sem o perfil, fica o nome e a foto que a corrida gravou.
    if (error) continue;
    for (const p of (data ?? []) as { id: string; nome: string | null; foto_url: string | null; setores: { nome: string | null } | null }[]) {
      perfis.set(p.id, { nome: p.nome?.trim() ?? '', foto: p.foto_url, setor: p.setores?.nome ?? null });
    }
  }

  const total = g.linhas.reduce((s, l) => s + l.dano, 0);
  const quando = g.caiuEm ? new Date(g.caiuEm) : null;
  return g.linhas.map((l, i) => {
    const p = perfis.get(l.usuario);
    return {
      usuario: l.usuario,
      foto: p?.foto ?? l.foto,
      dados: {
        posicao: i + 1,
        nome: p?.nome || l.nome || 'Alguém',
        setor: p?.setor ?? null,
        dano: l.dano,
        danoTotal: total,
        participantes: g.linhas.length,
        quando,
      },
    };
  });
}
