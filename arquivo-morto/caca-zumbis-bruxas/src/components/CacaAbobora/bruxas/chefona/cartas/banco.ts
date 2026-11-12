/**
 * banco.ts — o que as cartas da Bruxa do Pântano leem (`carta.ts` desenha).
 *
 * Só leitura, e só no clique do super_admin: as rodadas em que a Bruxa do
 * Pântano caiu, os golpes da rodada escolhida e o perfil de hoje de quem
 * tirou vida dela (a foto e o setor de agora; sem perfil, fica o que a luta
 * gravou). Desde 19/10/2026 todo mundo tem carta, não só o top 10.
 * A ordem é a do ranking da luta (`ordenarRanking`): dano, depois críticos,
 * depois o nome.
 */
import { supabase } from '@/lib/supabase';
import { lerTodasAsPaginas } from '@/lib/lerTodasAsPaginas';
import type { DadosDaCarta } from './carta';

// As tabelas das gincanas não estão em `database.types.ts` (como em
// `Insignias/banco.ts`): a consulta vai sem tipo, e a forma da linha é a
// declarada aqui.
interface Consulta extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(colunas: string): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  gt(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: readonly unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
  range(de: number, ate: number): Consulta;
}
function tabela(nome: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(nome);
}

export interface RodadaDerrotada {
  id: number;
  derrotado_em: string | null;
  vida_max: number;
  golpe_final_por: string | null;
}

interface Golpe {
  usuario: string;
  nome: string;
  foto: string | null;
  dano: number;
  acertos: number;
  criticos: number;
}

export interface CartaParaDesenhar {
  dados: DadosDaCarta;
  usuario: string;
  foto: string | null;
}

/** As rodadas em que ela caiu, da mais nova para a mais velha. */
export async function lerRodadasDerrotadas(): Promise<RodadaDerrotada[]> {
  const { data, error } = await tabela('chefona_rodadas')
    .select('id, derrotado_em, vida_max, golpe_final_por')
    .eq('situacao', 'derrotado')
    .gt('id', 0)
    .order('derrotado_em', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as RodadaDerrotada[];
}

/** Do maior dano para o menor; empate, mais críticos; depois o nome (o `ordenarRanking` da luta). */
export function ordenarGolpes(gs: readonly Golpe[]): Golpe[] {
  return [...gs].sort((a, b) => b.dano - a.dano || b.criticos - a.criticos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Todo mundo que tirou vida na rodada, na ordem do ranking, pronto para virar carta. */
export async function lerCartasDaRodada(r: RodadaDerrotada): Promise<CartaParaDesenhar[]> {
  const golpes = await lerTodasAsPaginas<Golpe>((de, ate) => tabela('chefona_golpes')
    .select('usuario, nome, foto, dano, acertos, criticos')
    .eq('rodada_id', r.id)
    .gt('dano', 0)
    .order('usuario')
    .range(de, ate));
  const top = ordenarGolpes(golpes);

  const perfis = new Map<string, { nome: string; foto: string | null; setor: string | null }>();
  // Em lotes: 100 uuids por pedido cabem com folga no endereço.
  for (let i = 0; i < top.length; i += 100) {
    const { data, error } = await tabela('perfis')
      .select('id, nome, foto_url, setores!perfis_setor_id_fkey(nome)')
      .in('id', top.slice(i, i + 100).map(g => g.usuario));
    // Sem o perfil, fica o nome e a foto que a luta gravou.
    if (error) continue;
    for (const p of (data ?? []) as { id: string; nome: string | null; foto_url: string | null; setores: { nome: string | null } | null }[]) {
      perfis.set(p.id, { nome: p.nome?.trim() ?? '', foto: p.foto_url, setor: p.setores?.nome ?? null });
    }
  }

  const quando = r.derrotado_em ? new Date(r.derrotado_em) : null;
  return top.map((g, i) => {
    const p = perfis.get(g.usuario);
    return {
      usuario: g.usuario,
      foto: p?.foto ?? g.foto,
      dados: {
        posicao: i + 1,
        nome: p?.nome || g.nome,
        setor: p?.setor ?? null,
        dano: g.dano,
        acertos: g.acertos,
        criticos: g.criticos,
        vidaMax: r.vida_max,
        participantes: golpes.length,
        golpeFinal: g.usuario === r.golpe_final_por,
        quando,
      },
    };
  });
}
