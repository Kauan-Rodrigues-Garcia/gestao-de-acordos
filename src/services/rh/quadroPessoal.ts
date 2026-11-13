/**
 * quadroPessoal.ts — o Quadro de Pessoal do RH, sem tela e sem banco.
 *
 * ## Para quem é
 *
 * Para o RH, que OLHA a estrutura e não mexe nela (pedido de 20/10/2026). A
 * aba Usuários › Setores e › Equipes continua sendo o lugar de criar, mover e
 * liderar; aqui a mesma verdade é lida de outro jeito: por cidade, por setor,
 * em organograma, com números de gente e não de dinheiro.
 *
 * Nada aqui grava. A «importação» do pedido é uma CONFERÊNCIA: o RH traz a
 * planilha dele (ou um retrato exportado desta mesma tela) e vê onde ela e o
 * sistema discordam. Quem corrige é quem administra a aba Usuários.
 *
 * ## O que entra
 *
 *   - setor ativo, inclusive o Núcleo (tem gente de verdade, o Assistente ADM),
 *     e fora o «Padrão» e os de teste — o critério de `setoresDosFiltros`, com
 *     o Núcleo devolvido;
 *   - toda pessoa da empresa que não está arquivada nem desligada, menos as
 *     contas de sistema (`administrador`, `super_admin`).
 *
 * Quem está num setor que ficou de fora (inativo, Padrão) ou sem setor cai no
 * balde «Sem setor»: some da estrutura, mas não do total — gente sem lugar é
 * exatamente o que o RH precisa ver.
 */
import { setoresDosFiltros } from '@/lib/setoresDosFiltros';
import { marcaDaCidade } from '@/lib/marca';
import { ROTULO_REGRA, ehRegraDoSetor } from '@/lib/regraDoSetor';

// ── Entradas (o que vem do banco) ────────────────────────────────────────────

export interface SetorBruto {
  id: string;
  nome: string;
  ativo?: boolean | null;
  tipo?: string | null;
  cidade_id?: string | null;
  regra?: string | null;
  descricao?: string | null;
  /**
   * Setor alternativo (Marília Digital, Treinamento…): a gente dele é, quase
   * toda, CLONE de operador de outro setor — o cadastro da pessoa continua no
   * setor de origem, e o alternativo só replica.
   */
  alternativo?: boolean | null;
  /** De que empresa é o setor — preenchido quando o quadro junta várias. */
  empresa_nome?: string | null;
}

export interface EquipeBruta {
  id: string;
  nome: string;
  setor_id: string;
  treinamento?: boolean | null;
}

export interface PessoaBruta {
  id: string;
  /** A empresa do cadastro: é nela que o crachá é gravado. */
  empresa_id?: string | null;
  nome: string;
  email?: string | null;
  perfil: string;
  setor_id: string | null;
  equipe_id: string | null;
  subgrupo_id?: string | null;
  situacao?: string | null;
  ferias_ate?: string | null;
  foto_url?: string | null;
  arquivado?: boolean | null;
  criado_em?: string | null;
}

export interface DadosBrutos {
  setores: SetorBruto[];
  cidades: { id: string; nome: string }[];
  equipes: EquipeBruta[];
  pessoas: PessoaBruta[];
  lideres: { equipe_id: string; lider_id: string }[];
  subgrupos: { id: string; equipe_id: string; nome: string }[];
  clones: { equipe_id: string; operador_id: string }[];
  /** A ordem que o admin arrastou na aba Setores (ids). Vazia = alfabética. */
  ordemSetores?: string[];
  /** Crachá por pessoa (`rh_dados_operadores`), o que a RLS do RH entrega. */
  crachas?: Record<string, string | null>;
}

// ── Saídas (o que a tela desenha) ────────────────────────────────────────────

/** Os grupos de cargo do gráfico de composição. «outros» junta o resto. */
export type GrupoCargo = 'operador' | 'lider' | 'elite' | 'gerencia' | 'diretoria' | 'outros';

export const GRUPOS_CARGO: readonly GrupoCargo[] = [
  'operador', 'lider', 'elite', 'gerencia', 'diretoria', 'outros',
];

export interface Pessoa {
  id: string;
  empresaId: string | null;
  nome: string;
  email: string;
  cargo: string;
  grupo: GrupoCargo;
  setorId: string | null;
  equipeId: string | null;
  subgrupoId: string | null;
  emFerias: boolean;
  feriasAte: string | null;
  /** Situação `afastado` (INSS, licença…): fora das contas, como as férias. */
  afastado: boolean;
  /** O crachá oficial, ou null quando ainda não foi informado. */
  cracha: string | null;
  fotoUrl: string | null;
  criadoEm: string | null;
  /** Cadastrada nos últimos 30 dias. */
  novata: boolean;
}

export interface Subgrupo {
  id: string;
  nome: string;
  membros: Pessoa[];
}

export interface Equipe {
  id: string;
  nome: string;
  setorId: string;
  treinamento: boolean;
  lideres: Pessoa[];
  /** Quem tem `equipe_id` nesta equipe, menos os líderes (já estão acima). */
  membros: Pessoa[];
  subgrupos: Subgrupo[];
  /** Membros fora de qualquer subgrupo. */
  semSubgrupo: Pessoa[];
  /** Gente de outra equipe que também conta aqui (o clone da BookPlay). */
  apoio: Pessoa[];
}

export interface Numeros {
  pessoas: number;
  porGrupo: Record<GrupoCargo, number>;
  equipes: number;
  lideres: number;
  semEquipe: number;
  emFerias: number;
  afastados: number;
  novatos: number;
  /** Quem ainda não tem crachá. */
  semCracha: number;
  /** Clones de outro setor (só em setor alternativo). */
  clones: number;
}

/** Um clone num setor alternativo: a pessoa e de onde ela é de verdade. */
export interface CloneQuadro {
  pessoa: Pessoa;
  /** O setor do cadastro (origem), pelo nome; null se a pessoa está sem setor. */
  origem: string | null;
  /** As equipes do alternativo em que ela aparece. */
  equipes: string[];
}

export interface Cidade {
  /** Chave estável: nome normalizado, ou `''` para «Sem cidade». */
  chave: string;
  nome: string;
  marca: 'BookPlay' | 'PaguePlay' | null;
}

export interface SetorQuadro {
  id: string;
  nome: string;
  descricao: string | null;
  cidade: Cidade;
  regra: string | null;
  nucleo: boolean;
  /** Setor alternativo: replica gente de outros setores (ver `clones`). */
  alternativo: boolean;
  /** Nome da empresa do setor (BookPlay, PaguePlay, Comercial…). */
  empresa: string | null;
  equipes: Equipe[];
  /** Quem é do setor e não tem equipe. */
  semEquipe: Pessoa[];
  /** Quem tem o cadastro neste setor. */
  pessoas: Pessoa[];
  /** Clones de operadores de outros setores (só no alternativo). */
  clones: CloneQuadro[];
  numeros: Numeros;
}

export interface Quadro {
  setores: SetorQuadro[];
  /** Pessoas sem setor, ou num setor que não entrou (inativo, Padrão). */
  semSetor: Pessoa[];
  cidades: Cidade[];
  todas: Pessoa[];
  /** As empresas que o quadro junta. Mais de uma = a tela mostra de qual é cada setor. */
  empresas: string[];
  numeros: Numeros;
  /** `id` → onde a pessoa está, para a busca «onde está fulano?». */
  local: Map<string, { setorId: string | null; equipeId: string | null }>;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Sem acento, sem caixa, espaço único: «Marília » acha «marilia». */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

const CONTAS_DE_SISTEMA = new Set(['administrador', 'super_admin']);

function grupoDoCargo(cargo: string): GrupoCargo {
  return (GRUPOS_CARGO as readonly string[]).includes(cargo) ? cargo as GrupoCargo : 'outros';
}

const DIA_MS = 86_400_000;

function numerosVazios(): Numeros {
  return {
    pessoas: 0,
    porGrupo: { operador: 0, lider: 0, elite: 0, gerencia: 0, diretoria: 0, outros: 0 },
    equipes: 0, lideres: 0, semEquipe: 0, emFerias: 0, afastados: 0, novatos: 0, semCracha: 0, clones: 0,
  };
}

function contar(pessoas: readonly Pessoa[], equipes: readonly Equipe[], semEquipe: number): Numeros {
  const n = numerosVazios();
  n.pessoas = pessoas.length;
  for (const p of pessoas) {
    n.porGrupo[p.grupo] += 1;
    if (p.emFerias) n.emFerias += 1;
    if (p.afastado) n.afastados += 1;
    if (p.novata) n.novatos += 1;
    if (!p.cracha) n.semCracha += 1;
  }
  n.equipes = equipes.length;
  n.lideres = new Set(equipes.flatMap(e => e.lideres.map(l => l.id))).size;
  n.semEquipe = semEquipe;
  return n;
}

function porNome<T extends { nome: string }>(a: T, b: T): number {
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

// ── Montagem ─────────────────────────────────────────────────────────────────

/** Que setores entram: o critério dos filtros, com o Núcleo devolvido. */
export function setoresDoQuadro<T extends SetorBruto>(setores: readonly T[]): T[] {
  const dosFiltros = new Set(setoresDosFiltros(setores).map(s => s.id));
  return setores.filter(s =>
    dosFiltros.has(s.id) || (s.tipo === 'nucleo' && s.ativo !== false));
}

export function montarQuadro(dados: DadosBrutos, hoje: Date = new Date()): Quadro {
  const limiteNovata = hoje.getTime() - 30 * DIA_MS;

  // Pessoas
  const pessoasTodas: Pessoa[] = dados.pessoas
    .filter(p => !p.arquivado && p.situacao !== 'desligado' && !CONTAS_DE_SISTEMA.has(p.perfil))
    .map(p => {
      const criado = p.criado_em ? Date.parse(p.criado_em) : NaN;
      return {
        id: p.id,
        empresaId: p.empresa_id ?? null,
        nome: (p.nome ?? '').trim() || 'Sem nome',
        email: p.email ?? '',
        cargo: p.perfil,
        grupo: grupoDoCargo(p.perfil),
        setorId: p.setor_id,
        equipeId: p.equipe_id,
        subgrupoId: p.subgrupo_id ?? null,
        // `situacao` é a verdade; a data só diz até quando. Férias vencidas
        // sem o gatilho ter rodado ainda contam como férias — é o que a aba
        // Usuários mostra também.
        emFerias: p.situacao === 'ferias',
        feriasAte: p.ferias_ate ?? null,
        afastado: p.situacao === 'afastado',
        cracha: dados.crachas?.[p.id]?.trim() || null,
        fotoUrl: p.foto_url ?? null,
        criadoEm: p.criado_em ?? null,
        novata: Number.isFinite(criado) && criado >= limiteNovata,
      };
    })
    .sort(porNome);

  const pessoaPorId = new Map(pessoasTodas.map(p => [p.id, p]));

  // Cidades
  const nomeDaCidade = new Map(dados.cidades.map(c => [c.id, c.nome]));
  const cidadeDe = (cidadeId: string | null | undefined): Cidade => {
    const nome = cidadeId ? nomeDaCidade.get(cidadeId) : undefined;
    if (!nome) return { chave: '', nome: 'Sem cidade', marca: null };
    return { chave: normalizar(nome), nome: nome.trim(), marca: marcaDaCidade(nome)?.nome ?? null };
  };

  // Setores, na ordem do admin quando houver
  const ordem = new Map((dados.ordemSetores ?? []).map((id, i) => [id, i]));
  const setoresBrutos = setoresDoQuadro(dados.setores).sort((a, b) => {
    const oa = ordem.get(a.id), ob = ordem.get(b.id);
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  const setorIds = new Set(setoresBrutos.map(s => s.id));

  const lideresDaEquipe = new Map<string, Pessoa[]>();
  for (const l of dados.lideres) {
    const p = pessoaPorId.get(l.lider_id);
    if (!p) continue;
    const lista = lideresDaEquipe.get(l.equipe_id) ?? [];
    if (!lista.some(x => x.id === p.id)) lista.push(p);
    lideresDaEquipe.set(l.equipe_id, lista);
  }

  const apoioDaEquipe = new Map<string, Pessoa[]>();
  for (const c of dados.clones) {
    const p = pessoaPorId.get(c.operador_id);
    if (!p || p.equipeId === c.equipe_id) continue;
    const lista = apoioDaEquipe.get(c.equipe_id) ?? [];
    if (!lista.some(x => x.id === p.id)) lista.push(p);
    apoioDaEquipe.set(c.equipe_id, lista);
  }

  const subgruposDaEquipe = new Map<string, { id: string; nome: string }[]>();
  for (const s of dados.subgrupos) {
    const lista = subgruposDaEquipe.get(s.equipe_id) ?? [];
    lista.push({ id: s.id, nome: s.nome });
    subgruposDaEquipe.set(s.equipe_id, lista);
  }

  const setorDaEquipe = new Map(dados.equipes.map(e => [e.id, e.setor_id]));
  /** Todos os setores lidos, inclusive os que não entram no quadro: a origem de um clone. */
  const nomeDoSetor = new Map(dados.setores.map(s => [s.id, s.nome]));

  const setores: SetorQuadro[] = setoresBrutos.map(s => {
    const pessoas = pessoasTodas.filter(p => p.setorId === s.id);

    const equipes: Equipe[] = dados.equipes
      .filter(e => e.setor_id === s.id)
      .sort(porNome)
      .map(e => {
        const lideres = [...(lideresDaEquipe.get(e.id) ?? [])].sort(porNome);
        const idsLideres = new Set(lideres.map(l => l.id));
        const membros = pessoasTodas.filter(p => p.equipeId === e.id && !idsLideres.has(p.id));
        const subs = (subgruposDaEquipe.get(e.id) ?? []).sort(porNome).map(sg => ({
          id: sg.id, nome: sg.nome, membros: membros.filter(m => m.subgrupoId === sg.id),
        }));
        const idsSubs = new Set(subs.map(sg => sg.id));
        return {
          id: e.id,
          nome: e.nome,
          setorId: e.setor_id,
          treinamento: !!e.treinamento,
          lideres,
          membros,
          subgrupos: subs,
          semSubgrupo: membros.filter(m => !m.subgrupoId || !idsSubs.has(m.subgrupoId)),
          apoio: (apoioDaEquipe.get(e.id) ?? []).sort(porNome),
        };
      });

    // Sem equipe: do setor, sem equipe válida NESTE setor, e que não lidera
    // nenhuma equipe dele (o líder não tem `equipe_id`, e não está «solto»).
    const equipesDoSetor = new Set(equipes.map(e => e.id));
    const lideresDoSetor = new Set(equipes.flatMap(e => e.lideres.map(l => l.id)));
    const semEquipe = pessoas.filter(p =>
      !(p.equipeId && equipesDoSetor.has(p.equipeId)) && !lideresDoSetor.has(p.id));

    /*
     * Setor alternativo: quem está nas equipes dele sem ter o cadastro aqui é
     * CLONE de operador de outro setor (o dinheiro é da origem; o alternativo
     * só replica — regra de 06/10/2026). Antes o quadro mostrava o alternativo
     * quase vazio, porque contava só o cadastro.
     */
    const alternativo = !!s.alternativo;
    const clones: CloneQuadro[] = [];
    if (alternativo) {
      const porPessoa = new Map<string, CloneQuadro>();
      for (const e of equipes) {
        for (const p of e.apoio) {
          if (p.setorId === s.id) continue;
          const c = porPessoa.get(p.id)
            ?? { pessoa: p, origem: p.setorId ? nomeDoSetor.get(p.setorId) ?? 'Outro setor' : null, equipes: [] };
          c.equipes.push(e.nome);
          porPessoa.set(p.id, c);
        }
      }
      clones.push(...[...porPessoa.values()].sort((a, b) => porNome(a.pessoa, b.pessoa)));
    }
    // Os números são do CADASTRO: o clone já é contado no setor de origem, e
    // somar de novo inflaria o total da cidade. O clone vai à parte.
    const numeros = contar(pessoas, equipes, semEquipe.length);
    numeros.clones = clones.length;

    return {
      id: s.id,
      nome: s.nome,
      descricao: s.descricao ?? null,
      cidade: cidadeDe(s.cidade_id),
      regra: ehRegraDoSetor(s.regra) ? ROTULO_REGRA[s.regra] : null,
      nucleo: s.tipo === 'nucleo',
      alternativo,
      empresa: s.empresa_nome ?? null,
      equipes,
      semEquipe,
      pessoas,
      clones,
      numeros,
    };
  });

  const semSetor = pessoasTodas.filter(p => !p.setorId || !setorIds.has(p.setorId));

  // Cidades na ordem em que aparecem; «Sem cidade» sempre no fim.
  const cidades: Cidade[] = [];
  for (const s of setores) {
    if (!cidades.some(c => c.chave === s.cidade.chave)) cidades.push(s.cidade);
  }
  cidades.sort((a, b) => (a.chave === '' ? 1 : b.chave === '' ? -1 : 0));

  const local = new Map<string, { setorId: string | null; equipeId: string | null }>();
  for (const p of pessoasTodas) {
    const setorId = p.setorId && setorIds.has(p.setorId) ? p.setorId : null;
    const equipeId = p.equipeId && setorDaEquipe.get(p.equipeId) === setorId ? p.equipeId : null;
    local.set(p.id, { setorId, equipeId });
  }
  // O líder sem `equipe_id` mora na (primeira) equipe que lidera.
  for (const s of setores) {
    for (const e of s.equipes) {
      for (const l of e.lideres) {
        const atual = local.get(l.id);
        if (atual && !atual.equipeId) local.set(l.id, { setorId: atual.setorId ?? s.id, equipeId: e.id });
      }
    }
  }

  const todasEquipes = setores.flatMap(s => s.equipes);
  const totais = contar(
    pessoasTodas, todasEquipes,
    setores.reduce((acc, s) => acc + s.semEquipe.length, 0) + semSetor.length,
  );

  const empresas = [...new Set(setores.map(s => s.empresa).filter((e): e is string => !!e))];

  return { setores, semSetor, cidades, todas: pessoasTodas, empresas, numeros: totais, local };
}

/**
 * O quadro de UMA cidade (13/11/2026). O Cleber tirou o seletor de empresa:
 * BookPlay, PaguePlay e Comercial são cadastro, não divisão que o RH usa — a
 * divisão é Birigui × Marília, e ela vale para todas as abas ao mesmo tempo.
 *
 * `todas` e `local` ficam inteiros: a busca «onde está fulano?» acha qualquer
 * pessoa, e quem abre uma pessoa de outra cidade troca o recorte.
 * `chave` null = todas as cidades (o quadro como veio).
 */
export function recortarPorCidade(q: Quadro, chave: string | null): Quadro {
  if (chave === null) return q;
  const setores = q.setores.filter(s => s.cidade.chave === chave);
  const ids = new Set(setores.map(s => s.id));
  const pessoas = q.todas.filter(p => p.setorId !== null && ids.has(p.setorId));
  const numeros = contar(
    pessoas, setores.flatMap(s => s.equipes),
    setores.reduce((acc, s) => acc + s.semEquipe.length, 0),
  );
  numeros.clones = setores.reduce((acc, s) => acc + s.numeros.clones, 0);
  return {
    ...q,
    setores,
    semSetor: [],
    cidades: q.cidades.filter(c => c.chave === chave),
    empresas: [...new Set(setores.map(s => s.empresa).filter((e): e is string => !!e))],
    numeros,
  };
}

/** Quantas pessoas cada cidade tem (o número ao lado do filtro). */
export function pessoasPorCidade(q: Quadro): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of q.setores) m.set(s.cidade.chave, (m.get(s.cidade.chave) ?? 0) + s.numeros.pessoas);
  return m;
}

// ── Exportação ───────────────────────────────────────────────────────────────

export type LinhaPlanilha = Record<string, string | number>;

export interface PlanilhaQuadro {
  Resumo: LinhaPlanilha[];
  Equipes: LinhaPlanilha[];
  Pessoas: LinhaPlanilha[];
}

function dataBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

function nomes(pessoas: readonly Pessoa[]): string {
  return pessoas.map(p => p.nome).join(', ');
}

/**
 * As três abas da planilha. `setorIds` recorta (exportar um setor só); sem
 * ele sai o quadro inteiro, com «Sem setor» no fim da aba Pessoas.
 *
 * As colunas da aba Pessoas são as mesmas que a conferência procura — o
 * arquivo exportado hoje é a planilha que se confere no mês que vem.
 */
export function linhasDaPlanilha(
  quadro: Quadro,
  rotuloCargo: (cargo: string) => string,
  setorIds?: ReadonlySet<string>,
): PlanilhaQuadro {
  const setores = setorIds ? quadro.setores.filter(s => setorIds.has(s.id)) : quadro.setores;

  const varias = quadro.empresas.length > 1;
  const daEmpresa = (s: SetorQuadro | null): LinhaPlanilha => (varias ? { Empresa: s?.empresa ?? '' } : {});

  const Resumo: LinhaPlanilha[] = setores.map(s => ({
    ...daEmpresa(s),
    Cidade: s.cidade.nome,
    Marca: s.cidade.marca ?? '',
    Setor: s.nome,
    Regra: s.regra ?? '',
    Equipes: s.numeros.equipes,
    Pessoas: s.numeros.pessoas,
    Operadores: s.numeros.porGrupo.operador,
    'Líderes': s.numeros.porGrupo.lider,
    Elite: s.numeros.porGrupo.elite,
    'Gerência': s.numeros.porGrupo.gerencia,
    Diretoria: s.numeros.porGrupo.diretoria,
    Outros: s.numeros.porGrupo.outros,
    'Sem equipe': s.numeros.semEquipe,
    'Em férias': s.numeros.emFerias,
  }));

  const Equipes: LinhaPlanilha[] = setores.flatMap(s => s.equipes.map(e => ({
    ...daEmpresa(s),
    Cidade: s.cidade.nome,
    Setor: s.nome,
    Equipe: e.nome,
    'Treinamento': e.treinamento ? 'Sim' : 'Não',
    'Líderes': nomes(e.lideres),
    Subgrupos: e.subgrupos.map(sg => sg.nome).join(', '),
    Pessoas: e.membros.length,
    'Em férias': e.membros.filter(m => m.emFerias).length,
  })));

  const linhaPessoa = (p: Pessoa, setor: SetorQuadro | null, equipe: Equipe | null): LinhaPlanilha => ({
    Nome: p.nome,
    Cargo: rotuloCargo(p.cargo),
    'E-mail': p.email,
    ...daEmpresa(setor),
    Cidade: setor?.cidade.nome ?? '',
    Setor: setor?.nome ?? 'Sem setor',
    Equipe: equipe?.nome ?? '',
    Subgrupo: equipe?.subgrupos.find(sg => sg.id === p.subgrupoId)?.nome ?? '',
    'Líder da equipe': equipe ? nomes(equipe.lideres.filter(l => l.id !== p.id)) : '',
    'Situação': p.emFerias ? 'Férias' : 'Ativo',
    'Férias até': p.emFerias ? dataBr(p.feriasAte) : '',
    'Cadastro em': dataBr(p.criadoEm),
  });

  const Pessoas: LinhaPlanilha[] = [];
  for (const s of setores) {
    const vistos = new Set<string>();
    for (const e of s.equipes) {
      for (const p of [...e.lideres, ...e.membros]) {
        if (vistos.has(p.id)) continue;
        vistos.add(p.id);
        Pessoas.push(linhaPessoa(p, s, e));
      }
    }
    for (const p of s.semEquipe) {
      if (vistos.has(p.id)) continue;
      vistos.add(p.id);
      Pessoas.push(linhaPessoa(p, s, null));
    }
  }
  if (!setorIds) for (const p of quadro.semSetor) Pessoas.push(linhaPessoa(p, null, null));

  return { Resumo, Equipes, Pessoas };
}

// ── Conferência de planilha ──────────────────────────────────────────────────

export type CampoConferido = 'nome' | 'email' | 'setor' | 'equipe' | 'cargo';

/** Os cabeçalhos aceitos para cada campo, já normalizados. */
const SINONIMOS: Record<CampoConferido, readonly string[]> = {
  nome:   ['nome', 'nome completo', 'colaborador', 'funcionario', 'operador', 'pessoa', 'empregado'],
  email:  ['e-mail', 'email', 'e mail', 'login'],
  setor:  ['setor', 'departamento', 'area', 'setor atual'],
  equipe: ['equipe', 'time', 'equipe atual'],
  cargo:  ['cargo', 'funcao', 'perfil'],
};

/** Que coluna da planilha é cada campo. Ausente = a planilha não tem. */
export type MapaDeColunas = Partial<Record<CampoConferido, string>>;

export function detectarColunas(cabecalhos: readonly string[]): MapaDeColunas {
  const mapa: MapaDeColunas = {};
  for (const campo of Object.keys(SINONIMOS) as CampoConferido[]) {
    const achado = cabecalhos.find(h => SINONIMOS[campo].includes(normalizar(h)));
    if (achado !== undefined) mapa[campo] = achado;
  }
  return mapa;
}

export type TipoDivergencia = 'igual' | 'diferente' | 'so_planilha' | 'so_sistema';

export interface Diferenca {
  campo: 'setor' | 'equipe' | 'cargo';
  planilha: string;
  sistema: string;
}

export interface ItemConferencia {
  chave: string;
  tipo: TipoDivergencia;
  nome: string;
  pessoa: Pessoa | null;
  /** O que a planilha diz (vazio em `so_sistema`). */
  planilha: { setor: string; equipe: string; cargo: string; email: string };
  /** Onde o sistema diz que ela está (vazio em `so_planilha`). */
  sistema: { setor: string; equipe: string; cargo: string };
  diferencas: Diferenca[];
  /** Achou pelo nome e há mais de uma pessoa com ele no sistema. */
  ambigua?: boolean;
}

export interface Conferencia {
  colunas: MapaDeColunas;
  linhasLidas: number;
  itens: ItemConferencia[];
  contagem: Record<TipoDivergencia, number>;
}

/** Onde a pessoa está no sistema, em texto — o lado «sistema» da conferência. */
export function lugarDaPessoa(
  quadro: Quadro, pessoa: Pessoa,
): { setor: SetorQuadro | null; equipe: Equipe | null } {
  const onde = quadro.local.get(pessoa.id);
  const setor = onde?.setorId ? quadro.setores.find(s => s.id === onde.setorId) ?? null : null;
  const equipe = setor && onde?.equipeId ? setor.equipes.find(e => e.id === onde.equipeId) ?? null : null;
  return { setor, equipe };
}

/**
 * Compara a planilha do RH com o quadro de hoje.
 *
 * Casa por e-mail quando a planilha tem a coluna; senão (ou se o e-mail não
 * achar ninguém), pelo nome sem acento e sem caixa. Nome repetido no sistema
 * casa com o primeiro e fica marcado `ambigua` — melhor avisar do que fingir.
 *
 * «Só no sistema» só olha os setores que a planilha menciona: uma planilha do
 * Receptivo não acusa o resto da empresa de estar faltando. Sem coluna de
 * setor, a planilha vale pela empresa inteira.
 */
export function conferirPlanilha(
  quadro: Quadro,
  linhas: readonly Record<string, unknown>[],
  rotuloCargo: (cargo: string) => string,
): Conferencia {
  const cabecalhos = [...new Set(linhas.flatMap(l => Object.keys(l)))];
  const colunas = detectarColunas(cabecalhos);
  const ler = (l: Record<string, unknown>, campo: CampoConferido) =>
    colunas[campo] ? String(l[colunas[campo]!] ?? '').trim() : '';

  const porEmail = new Map<string, Pessoa>();
  const porNome = new Map<string, Pessoa[]>();
  for (const p of quadro.todas) {
    if (p.email) porEmail.set(normalizar(p.email), p);
    const k = normalizar(p.nome);
    porNome.set(k, [...(porNome.get(k) ?? []), p]);
  }

  const casadas = new Set<string>();
  const setoresDaPlanilha = new Set<string>();
  const itens: ItemConferencia[] = [];
  let linhasLidas = 0;

  linhas.forEach((l, i) => {
    const nome = ler(l, 'nome');
    const email = ler(l, 'email');
    if (!nome && !email) return;
    linhasLidas += 1;

    const planilha = { setor: ler(l, 'setor'), equipe: ler(l, 'equipe'), cargo: ler(l, 'cargo'), email };
    if (planilha.setor) setoresDaPlanilha.add(normalizar(planilha.setor));

    let pessoa: Pessoa | null = email ? porEmail.get(normalizar(email)) ?? null : null;
    let ambigua = false;
    if (!pessoa && nome) {
      const candidatas = (porNome.get(normalizar(nome)) ?? []).filter(c => !casadas.has(c.id));
      pessoa = candidatas[0] ?? null;
      ambigua = (porNome.get(normalizar(nome))?.length ?? 0) > 1;
    }

    if (!pessoa) {
      itens.push({
        chave: `p${i}`, tipo: 'so_planilha', nome: nome || email, pessoa: null, planilha,
        sistema: { setor: '', equipe: '', cargo: '' }, diferencas: [],
      });
      return;
    }
    casadas.add(pessoa.id);

    const { setor, equipe } = lugarDaPessoa(quadro, pessoa);
    const sistema = {
      setor: setor?.nome ?? 'Sem setor',
      equipe: equipe?.nome ?? 'Sem equipe',
      cargo: rotuloCargo(pessoa.cargo),
    };

    const diferencas: Diferenca[] = [];
    const semSetor = (t: string) => (normalizar(t) === 'sem setor' ? '' : normalizar(t));
    if (colunas.setor && semSetor(planilha.setor) !== semSetor(setor?.nome ?? '')) {
      diferencas.push({ campo: 'setor', planilha: planilha.setor || '(vazio)', sistema: sistema.setor });
    }
    if (colunas.equipe) {
      // «Sem equipe» escrito e célula vazia dizem a mesma coisa.
      const semEquipe = (t: string) => (normalizar(t) === 'sem equipe' ? '' : normalizar(t));
      if (semEquipe(planilha.equipe) !== semEquipe(equipe?.nome ?? '')) {
        diferencas.push({ campo: 'equipe', planilha: planilha.equipe || '(vazio)', sistema: sistema.equipe });
      }
    }
    if (colunas.cargo && planilha.cargo) {
      const c = normalizar(planilha.cargo);
      if (c !== normalizar(sistema.cargo) && c !== normalizar(pessoa.cargo)) {
        diferencas.push({ campo: 'cargo', planilha: planilha.cargo, sistema: sistema.cargo });
      }
    }

    itens.push({
      chave: `p${i}`,
      tipo: diferencas.length ? 'diferente' : 'igual',
      nome: pessoa.nome, pessoa, planilha, sistema, diferencas,
      ...(ambigua ? { ambigua } : {}),
    });
  });

  // Quem o sistema tem e a planilha não.
  const alcance = (s: SetorQuadro | null) =>
    !colunas.setor || setoresDaPlanilha.size === 0
      || setoresDaPlanilha.has(normalizar(s?.nome ?? 'sem setor'));
  for (const p of quadro.todas) {
    if (casadas.has(p.id)) continue;
    const { setor, equipe } = lugarDaPessoa(quadro, p);
    if (!alcance(setor)) continue;
    itens.push({
      chave: `s${p.id}`, tipo: 'so_sistema', nome: p.nome, pessoa: p,
      planilha: { setor: '', equipe: '', cargo: '', email: '' },
      sistema: { setor: setor?.nome ?? 'Sem setor', equipe: equipe?.nome ?? 'Sem equipe', cargo: rotuloCargo(p.cargo) },
      diferencas: [],
    });
  }

  const contagem: Record<TipoDivergencia, number> = { igual: 0, diferente: 0, so_planilha: 0, so_sistema: 0 };
  for (const it of itens) contagem[it.tipo] += 1;

  return { colunas, linhasLidas, itens, contagem };
}

/** A conferência como planilha, para quem vai corrigir o cadastro. */
export function linhasDaConferencia(c: Conferencia): LinhaPlanilha[] {
  const ROTULO: Record<TipoDivergencia, string> = {
    igual: 'Confere', diferente: 'Divergente', so_planilha: 'Só na planilha', so_sistema: 'Só no sistema',
  };
  const ordem: TipoDivergencia[] = ['diferente', 'so_planilha', 'so_sistema', 'igual'];
  return [...c.itens]
    .sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(it => ({
      Resultado: ROTULO[it.tipo],
      Nome: it.nome,
      'Setor na planilha': it.planilha.setor,
      'Setor no sistema': it.sistema.setor,
      'Equipe na planilha': it.planilha.equipe,
      'Equipe no sistema': it.sistema.equipe,
      'Cargo na planilha': it.planilha.cargo,
      'Cargo no sistema': it.sistema.cargo,
      'O que difere': it.diferencas.map(d => d.campo).join(', '),
      Obs: it.ambigua ? 'Nome repetido no sistema: conferir' : '',
    }));
}
