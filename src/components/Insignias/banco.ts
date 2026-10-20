/**
 * banco.ts — a leitura do álbum de insígnias (`insignias.ts` explica a regra).
 *
 * Só leitura, e só do que as gincanas já gravaram. Duas formas:
 *
 *   - `lerMeuAlbum(eu)`: o da barra do topo. Três consultas pequenas, filtradas
 *     por quem está logado, guardadas 10 min (`lerComCache`): a barra não relê
 *     a cada troca de tela nem na volta à aba — leituras sincronizadas de todas
 *     as abas já derrubaram o banco (15/10/2026, a gargalhada da bruxa).
 *   - `lerAlbunsDoPessoal()`: o álbum de todo mundo, só no clique do
 *     super_admin. As gincanas são uma só para todas as empresas.
 */
import { supabase } from '@/lib/supabase';
import { invalidarCache, lerComCache } from '@/lib/cacheCurto';
import { lerTodasAsPaginas } from '@/lib/lerTodasAsPaginas';
import { montarAlbuns, type Album, type LinhaCaca, type LinhaGolpe } from './insignias';

const VALIDADE_MS = 10 * 60_000;
const PREFIXO = 'insignias:';

// As tabelas das gincanas não estão em `database.types.ts` (como em
// `CacaAbobora/caca.ts`): a consulta vai sem tipo, e a forma da linha é a
// declarada aqui.
interface Consulta extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(colunas: string): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  gt(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: readonly unknown[]): Consulta;
  or(filtro: string): Consulta;
  order(coluna: string): Consulta;
  range(de: number, ate: number): Consulta;
}
function tabela(nome: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(nome);
}

const COLUNAS_CACA = 'id, achada_por, achada_por_nome, achada_por_foto, achada_por_setor, achada_em, tema, zumbi, bruxa, headshot, tiro, ms';

type Chefe = 'chefao' | 'chefona';

interface GolpeBruto {
  usuario: string;
  nome: string | null;
  foto: string | null;
  dano: number;
  rodada_id: number;
  rodada: { derrotado_em: string | null; golpe_final_por: string | null } | null;
}

function lerCaca(eu?: string): Promise<LinhaCaca[]> {
  return lerTodasAsPaginas<LinhaCaca>((de, ate) => {
    let q = tabela('abobora_rodadas')
      .select(COLUNAS_CACA)
      .eq('situacao', 'achada')
      .or('tema.eq.bruxas,zumbi.not.is.null');
    if (eu) q = q.eq('achada_por', eu);
    return q.order('id').range(de, ate);
  });
}

async function lerGolpes(chefe: Chefe, eu?: string): Promise<LinhaGolpe[]> {
  const brutos = await lerTodasAsPaginas<GolpeBruto>((de, ate) => {
    let q = tabela(`${chefe}_golpes`)
      .select(`usuario, nome, foto, dano, rodada_id, rodada:${chefe}_rodadas!inner(derrotado_em, golpe_final_por)`)
      .eq('rodada.situacao', 'derrotado')
      .gt('dano', 0);
    if (eu) q = q.eq('usuario', eu);
    return q.order('rodada_id').order('usuario').range(de, ate);
  });
  return brutos.map(g => ({
    usuario: g.usuario,
    nome: g.nome,
    foto: g.foto,
    dano: g.dano,
    rodada_id: g.rodada_id,
    derrotado_em: g.rodada?.derrotado_em ?? null,
    golpe_final_por: g.rodada?.golpe_final_por ?? null,
  }));
}

async function lerAlbuns(eu?: string): Promise<Map<string, Album>> {
  const [caca, rei, pantano] = await Promise.all([lerCaca(eu), lerGolpes('chefao', eu), lerGolpes('chefona', eu)]);
  return montarAlbuns(caca, rei, pantano);
}

/** O álbum de quem está logado (sem nada = ainda nenhuma insígnia). */
export function lerMeuAlbum(eu: string): Promise<Album | null> {
  return lerComCache(`${PREFIXO}eu:${eu}`, VALIDADE_MS, async () => (await lerAlbuns(eu)).get(eu) ?? null);
}

export interface Pessoal {
  albuns: Album[];
  /** O nome da empresa de cada um (o álbum é de todas). */
  empresas: Map<string, string>;
}

/** O álbum de todo mundo que tem pelo menos uma, com nome, foto e setor de hoje. */
export function lerAlbunsDoPessoal(): Promise<Pessoal> {
  return lerComCache(`${PREFIXO}pessoal`, 60_000, async () => {
    const albuns = [...(await lerAlbuns()).values()];
    const empresas = new Map<string, string>();
    const perfis = new Map<string, { nome: string; foto: string | null; setor: string | null }>();
    const ids = albuns.map(a => a.usuario);
    // Em lotes: 100 uuids por pedido cabem com folga no endereço.
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await tabela('perfis')
        .select('id, nome, foto_url, setores!perfis_setor_id_fkey(nome), empresas!perfis_empresa_id_fkey(nome)')
        .in('id', ids.slice(i, i + 100));
      if (error) break; // sem o perfil, fica o nome que a gincana gravou
      for (const p of (data ?? []) as {
        id: string; nome: string | null; foto_url: string | null;
        setores: { nome: string | null } | null; empresas: { nome: string | null } | null;
      }[]) {
        perfis.set(p.id, { nome: p.nome?.trim() ?? '', foto: p.foto_url, setor: p.setores?.nome ?? null });
        if (p.empresas?.nome) empresas.set(p.id, p.empresas.nome);
      }
    }
    return {
      albuns: albuns.map(a => {
        const p = perfis.get(a.usuario);
        return p ? { ...a, nome: p.nome || a.nome, foto: p.foto ?? a.foto, setor: p.setor ?? a.setor } : a;
      }),
      empresas,
    };
  });
}

/** O «atualizar» do álbum: a próxima leitura vai ao banco. */
export function esquecerAlbuns(): void {
  invalidarCache(PREFIXO);
}
