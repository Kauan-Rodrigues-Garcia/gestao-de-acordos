/**
 * participantes.ts — quem pode entrar na Votação da Liderança, por SETOR
 * (pedido de 04/11/2026).
 *
 * Cada pessoa vem com o setor dela, e o setor diz:
 *   - o PRODUTO, pela empresa do setor (`produtoDaEmpresa`): cobrança, Vendas
 *     (comercial) ou RH. A votação é de UM produto: Vendas não se mistura com
 *     BookPlay/PaguePlay;
 *   - a MARCA, pela cidade do setor (`lib/marca.ts`): Birigui é BookPlay,
 *     Marília é PaguePlay. Setor sem uma dessas cidades fica no grupo da empresa.
 *
 * Os nomes são os do cadastro, sem tratamento: nada aqui inventa pessoa.
 * Quem não tem setor (comum na diretoria) vem com `setorId: null`: não entra
 * pela escolha de setores, só se quem organiza incluir à mão.
 */
import { supabase } from '@/lib/supabase';
import { marcaDaCidade } from '@/lib/marca';
import { produtoDaEmpresa, type Produto } from '@/lib/produto';
import type { Candidato } from './cedula';

export interface Participante extends Candidato {
  /** `null`: pessoa sem setor — só entra incluída à mão. */
  setorId: string | null;
  /** Chave do grupo do setor: `marca:bookplay`, `marca:pagueplay` ou `empresa:<id>`. */
  grupo: string;
  produto: Produto | null;
  empresa: string;
}

export interface SetorDaVotacao {
  id: string;
  nome: string;
  grupo: string;
  produto: Produto | null;
}

export interface GrupoDaVotacao {
  chave: string;
  rotulo: string;
  produto: Produto | null;
  setores: SetorDaVotacao[];
}

export const NOME_DO_PRODUTO: Record<Produto, string> = {
  cobranca: 'BookPlay e PaguePlay',
  comercial: 'Vendas',
  rh: 'RH',
};

export interface LinhaPerfil {
  id: string;
  nome: string | null;
  foto_url: string | null;
  perfil: string | null;
  ativo: boolean | null;
  arquivado: boolean | null;
  situacao: string | null;
  robo: boolean | null;
  setor_id: string | null;
  empresa_id?: string | null;
}
export interface LinhaSetor { id: string; nome: string | null; cidade_id: string | null; empresa_id: string | null; ativo: boolean | null }
export interface LinhaEmpresa { id: string; nome: string | null; slug: string | null; produto: string | null }
export interface LinhaCidade { id: string; nome: string | null }

/**
 * Palavras que não são nome de gente: conta de setor ou de função cadastrada
 * com cargo de líder («Suporte Play 2», «Lider Supervisor»), pedido de
 * 04/11/2026. Comparadas sem acento, palavra inteira.
 */
const PALAVRAS_DE_CONTA = new Set([
  'suporte', 'supervisor', 'supervisora', 'supervisao', 'lider', 'lideres', 'lideranca',
  'teste', 'testes', 'test', 'admin', 'administrador', 'administracao', 'adm',
  'gerencia', 'gerente', 'coordenacao', 'coordenador', 'diretoria', 'sistema', 'robo', 'bot',
  'treinamento', 'setor', 'equipe', 'play', 'conta', 'usuario', 'geral', 'monitoria',
  'backoffice', 'operacao', 'receptivo', 'elite', 'ouvidoria', 'rh', 'ti',
]);

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Por que este nome parece CONTA e não pessoa — ou `null` se parece pessoa.
 * A tela tira essas contas da votação e mostra quais tirou, com «colocar de
 * volta» (a regra é palpite pelo nome; quem decide é quem organiza).
 */
export function motivoDeConta(nome: string): string | null {
  const palavras = semAcento(nome).split(/[^a-z0-9]+/).filter(Boolean);
  if (palavras.some(p => /\d/.test(p))) return 'tem número no nome';
  const achou = palavras.find(p => PALAVRAS_DE_CONTA.has(p));
  return achou ? `«${achou}» no nome` : null;
}

/** Monta pessoas e grupos de setores a partir das linhas do banco (sem banco: testável). */
export function montarParticipantes(
  perfis: readonly LinhaPerfil[], setores: readonly LinhaSetor[],
  empresas: readonly LinhaEmpresa[], cidades: readonly LinhaCidade[],
): { pessoas: Participante[]; grupos: GrupoDaVotacao[] } {
  const empresaPorId = new Map(empresas.map(e => [e.id, e]));
  const cidadePorId = new Map(cidades.map(c => [c.id, c.nome ?? '']));

  const setorPorId = new Map<string, SetorDaVotacao & { empresa: string }>();
  const rotulos = new Map<string, string>();
  for (const s of setores) {
    if (s.ativo === false || !(s.nome ?? '').trim()) continue;
    const empresa = s.empresa_id ? empresaPorId.get(s.empresa_id) : undefined;
    const produto = empresa ? produtoDaEmpresa({ slug: empresa.slug ?? '', produto: empresa.produto }) : null;
    const marca = marcaDaCidade(s.cidade_id ? cidadePorId.get(s.cidade_id) : null);
    const grupo = marca && produto === 'cobranca' ? `marca:${marca.tom}` : `empresa:${s.empresa_id ?? ''}`;
    if (!rotulos.has(grupo)) {
      rotulos.set(grupo, marca && produto === 'cobranca'
        ? `${marca.nome} · ${marca.nome === 'BookPlay' ? 'Birigui' : 'Marília'}`
        : (empresa?.nome?.trim() || 'Sem empresa'));
    }
    setorPorId.set(s.id, { id: s.id, nome: (s.nome ?? '').trim(), grupo, produto, empresa: empresa?.nome?.trim() ?? '' });
  }

  const pessoas: Participante[] = [];
  for (const l of perfis) {
    const nome = (l.nome ?? '').trim();
    if (!l.ativo || l.arquivado || l.situacao === 'desligado' || l.robo || !nome) continue;
    const setor = l.setor_id ? setorPorId.get(l.setor_id) : undefined;
    const base = { id: l.id, nome, foto: l.foto_url || null, perfil: l.perfil ?? 'operador' };
    if (setor) {
      pessoas.push({ ...base, setor: setor.nome, setorId: setor.id, grupo: setor.grupo, produto: setor.produto, empresa: setor.empresa });
    } else {
      const empresa = l.empresa_id ? empresaPorId.get(l.empresa_id) : undefined;
      pessoas.push({
        ...base, setor: 'Sem setor', setorId: null, grupo: '', empresa: empresa?.nome?.trim() ?? '',
        produto: empresa ? produtoDaEmpresa({ slug: empresa.slug ?? '', produto: empresa.produto }) : null,
      });
    }
  }

  const porGrupo = new Map<string, GrupoDaVotacao>();
  for (const s of setorPorId.values()) {
    const g = porGrupo.get(s.grupo) ?? { chave: s.grupo, rotulo: rotulos.get(s.grupo) ?? '', produto: s.produto, setores: [] };
    g.setores.push({ id: s.id, nome: s.nome, grupo: s.grupo, produto: s.produto });
    porGrupo.set(s.grupo, g);
  }
  const ordemGrupo = (g: GrupoDaVotacao) => (g.chave === 'marca:bookplay' ? 0 : g.chave === 'marca:pagueplay' ? 1 : 2);
  const grupos = [...porGrupo.values()]
    .map(g => ({ ...g, setores: g.setores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })) }))
    .sort((a, b) => ordemGrupo(a) - ordemGrupo(b) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  return { pessoas, grupos };
}

/** Lê o cadastro (o super_admin enxerga as empresas todas). Só leitura. */
export async function lerParticipantes(): Promise<{ pessoas: Participante[]; grupos: GrupoDaVotacao[] }> {
  const [perfis, setores, empresas, cidades] = await Promise.all([
    supabase.from('perfis').select('id, nome, foto_url, perfil, ativo, arquivado, situacao, robo, setor_id, empresa_id').eq('ativo', true).order('nome'),
    supabase.from('setores').select('id, nome, cidade_id, empresa_id, ativo'),
    supabase.from('empresas').select('id, nome, slug, produto'),
    supabase.from('rh_celulas').select('id, nome'),
  ]);
  for (const r of [perfis, setores, empresas]) if (r.error) throw new Error(r.error.message);
  return montarParticipantes(
    (perfis.data ?? []) as unknown as LinhaPerfil[],
    (setores.data ?? []) as unknown as LinhaSetor[],
    (empresas.data ?? []) as unknown as LinhaEmpresa[],
    // Sem as cidades, os setores ficam no grupo da empresa: a tela abre mesmo assim.
    (cidades.error ? [] : cidades.data ?? []) as unknown as LinhaCidade[],
  );
}
