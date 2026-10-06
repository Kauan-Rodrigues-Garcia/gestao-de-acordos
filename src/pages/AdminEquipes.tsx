/**
 * AdminEquipes.tsx — v4: o quadro de equipes.
 *
 * O setor escolhido vira um quadro: à esquerda quem está sem equipe, à
 * direita os cartões das equipes. Mexer em alguém é sempre «levar para um
 * destino» (uma equipe, um subgrupo dela, ou sem equipe), e há três jeitos:
 *
 *   arrastar     o de sempre, no computador;
 *   Mover para…  o ícone na linha da pessoa, com busca — funciona no toque;
 *   selecionar   clicar no círculo de várias pessoas e usar «Mover para cá»
 *                no cartão de destino, ou a barra que aparece embaixo.
 *
 * Todos passam por `moverPessoas`, que grava UM update por destino e oferece
 * «Desfazer» no aviso. O plano do movimento é puro e testado em
 * `components/admin/equipes/modelo.ts`.
 *
 * Gravação: continua nas tabelas antigas (`perfis.equipe_id`,
 * `equipe_lideres`, `equipe_operadores_clones`); os gatilhos da fase 5
 * espelham em `equipe_membros` (docs/REORGANIZACAO-HIERARQUIA-ESTADO.md).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, Building2, Copy, LogOut, Plus, Search, Trash2, Users, X } from 'lucide-react';
// O fantasma da transferência aparece no quadro: quem saiu no mês mas cujo
// recebimento ainda conta nesta equipe (20260813b).
import { buscarFantasmasDoMes } from '@/services/analitico/analitico.service';
import type { FantasmaTransferencia } from '@/services/analitico/fantasmaTransferencia';
import { removerFantasma } from '@/services/admin/transferenciaUsuario.service';
import { ConfirmarTirarFantasma } from '@/components/admin/ConfirmarTirarFantasma';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useTenant } from '@/lib/tenant-config';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { COLUNAS_SETOR_DO_FILTRO, setoresDosFiltros, type SetorCandidatoAoFiltro } from '@/lib/setoresDosFiltros';
import { marcaDaCidade } from '@/lib/marca';
import { cn } from '@/lib/utils';
import { invalidarComposicaoEquipes } from '@/services/analitico/composicaoCache';
import {
  listarClonesEquipes, criarCloneEquipe, removerCloneEquipe, setCloneContaRecebimento,
  removerTodosClonesEmpresa, type CloneEquipe,
} from '@/services/equipes/equipesClones.service';
import {
  listarLideresEquipes, adicionarLiderEquipe, removerLiderEquipe, type LiderEquipe,
} from '@/services/equipes/equipesLideres.service';
import {
  listarSubgrupos, criarSubgrupo, renomearSubgrupo, excluirSubgrupo, type SubgrupoEquipe,
} from '@/services/equipes/equipesSubgrupos.service';
import {
  agruparPorDestino, aplicarMudancas, casaBusca, desfazer, destinosDoSetor, fraseDoMovimento,
  planejarMovimento, plural, resumoDoSetor, subgruposDaEquipe,
  type Destino, type EquipeEq, type Mudanca, type PessoaEq, type SetorEq,
} from '@/components/admin/equipes/modelo';
import { MoverPara, PessoaLinha } from '@/components/admin/equipes/partes';
import { arraste, useZonaDeSoltar } from '@/components/admin/equipes/arraste';
import { CartaoEquipe, type Candidato, type CloneNoCartao, type LiderNoCartao } from '@/components/admin/equipes/CartaoEquipe';
import '@/components/admin/equipes/equipes.css';

type Equipe = EquipeEq;
type Operador = PessoaEq;

/** Catálogo enxuto da empresa inteira, só para o clone entre setores.
 *  As listas principais ficam trancadas no setor do líder; o clone precisa
 *  enxergar além, então carrega à parte e com poucos campos. */
interface CloneCatalogo {
  setores:    SetorEq[];
  equipes:    { id: string; nome: string; setor_id: string }[];
  operadores: { id: string; nome: string; setor_id: string | null; equipe_id: string | null; perfil: string }[];
}
const CLONE_CATALOGO_VAZIO: CloneCatalogo = { setores: [], equipes: [], operadores: [] };

/** Operador de um clone: vem da lista do setor ou do catálogo da empresa. */
interface CloneOperadorInfo { id: string; nome: string; equipe_id: string | null; setor_id: string | null }

function mensagem(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Erro desconhecido';
}

export default function AdminEquipes() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();

  /*
   * «Não fico preso ao meu setor.» É o nível `todos_setores` da aba Usuários:
   * a mesma pergunta não pode ter duas respostas na mesma tela.
   */
  const isAdmin = niveisLiberados('usuarios', temPermissao).includes('todos_setores');
  // Uma chave por ação: criar, excluir e mexer na composição eram três listas
  // de cargo diferentes dentro do RLS.
  const podeEditarEquipes = temPermissao('equipes_criar_editar');
  const podeExcluirEquipes = temPermissao('equipes_excluir');
  const podeGerenciarComposicao = temPermissao('equipes_gerenciar_composicao');

  const [setores, setSetores] = useState<SetorEq[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  /** Marca (cidade) de cada setor: só o pontinho azul/verde do chip. */
  const [marcaDoSetor, setMarcaDoSetor] = useState<Map<string, 'bp' | 'pp'>>(new Map());

  const [setorSelecionado, setSetorSelecionado] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [novaEquipeNome, setNovaEquipeNome] = useState('');
  const [novaEquipeAberta, setNovaEquipeAberta] = useState(false);
  const [criandoEquipe, setCriandoEquipe] = useState(false);

  // ── Clones (BookPlay): operador contando em mais de uma equipe ─────────────
  // null = tabela ausente (migration 20260712a pendente) → recurso oculto
  const [clones, setClones] = useState<CloneEquipe[] | null>(null);
  const clonesHabilitados = tenant.slug === 'bookplay' && clones !== null;
  const [cloneCat, setCloneCat] = useState<CloneCatalogo>(CLONE_CATALOGO_VAZIO);

  // ── Líderes por equipe (migration 20260725b). null = tabela ausente. ───────
  const [lideresEq, setLideresEq] = useState<LiderEquipe[] | null>(null);
  const lideresHabilitados = lideresEq !== null;

  // ── Subgrupos (migration 20260903420000). null = tabela ausente. ──────────
  // O subgrupo divide a LEITURA (Destaques do Dia, ranking) sem mexer em quem
  // soma onde: o recebimento continua carimbado pela equipe.
  const [subgrupos, setSubgrupos] = useState<SubgrupoEquipe[] | null>(null);
  const subgruposHabilitados = subgrupos !== null;

  const empresaId = empresa?.id;

  // ─── Fantasmas da transferência ────────────────────────────────────────────
  // Quem foi transferido NESTE mês e cujo recebimento continua contando na
  // equipe de origem. Não estão em `operadores` (o `equipe_id` foi zerado), então
  // são carregados à parte e injetados no cartão da equipe.
  const [fantasmas, setFantasmas] = useState<FantasmaTransferencia[]>([]);
  const [fantasmasTirados, setFantasmasTirados] = useState<Set<string>>(new Set());
  const [confirmandoFantasma, setConfirmandoFantasma] =
    useState<{ perfilId: string; nome: string; equipeNome: string; setorId?: string | null } | null>(null);
  const [tirandoFantasma, setTirandoFantasma] = useState(false);

  /** Mês corrente: é o único em que o fantasma vale (os fechados têm retrato). */
  const mesCorrente = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const carregarFantasmas = useCallback(async () => {
    if (!empresaId) { setFantasmas([]); return; }
    setFantasmas(await buscarFantasmasDoMes(empresaId, mesCorrente));
  }, [empresaId, mesCorrente]);

  useEffect(() => { void carregarFantasmas(); }, [carregarFantasmas]);

  /** Tira o fantasma — o MESMO registro que a aba Analítico desliga. */
  async function tirarFantasma() {
    const alvo = confirmandoFantasma;
    if (!alvo) return;
    const f = fantasmas.find(x => x.perfilId === alvo.perfilId);
    if (!f) return;
    setTirandoFantasma(true);
    const { error } = await removerFantasma(f.id, perfil?.id ?? null);
    setTirandoFantasma(false);
    if (error) { toast.error(`Não foi possível tirar: ${error}`); return; }
    setFantasmasTirados(prev => new Set(prev).add(alvo.perfilId));
    setConfirmandoFantasma(null);
    toast.success(
      `Recebimento de ${alvo.nome} saiu de ${alvo.equipeNome}. Ele continua no total `
      + 'do setor e da empresa, e some também da aba Analítico.',
      { duration: 8000 },
    );
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      // Os setores da tela são os mesmos dos filtros: setor inativo (o Play 4
      // encerrado), o Núcleo de Inteligência e Gestão, o «Padrão» e os de teste
      // ficam fora — não têm equipe para montar. Ver `lib/setoresDosFiltros`.
      let setoresQuery = supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO).eq('empresa_id', empresaId).order('nome');
      if (!isAdmin && perfil?.setor_id) setoresQuery = setoresQuery.eq('id', perfil.setor_id) as typeof setoresQuery;

      let equipesQuery = supabase
        .from('equipes')
        .select('id, nome, setor_id, empresa_id, treinamento, treinamento_inicio')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (!isAdmin && perfil?.setor_id) equipesQuery = equipesQuery.eq('setor_id', perfil.setor_id) as typeof equipesQuery;

      let operadoresQuery = supabase
        .from('perfis')
        .select('id, nome, email, perfil, setor_id, equipe_id, empresa_id, situacao, ferias_ate, foto_url')
        .eq('empresa_id', empresaId)
        .in('perfil', ['operador', 'lider', 'elite'])
        .order('nome');
      if (!isAdmin && perfil?.setor_id) operadoresQuery = operadoresQuery.eq('setor_id', perfil.setor_id) as typeof operadoresQuery;

      const [setoresRes, equipesRes, operadoresRes] = await Promise.all([setoresQuery, equipesQuery, operadoresQuery]);
      if (setoresRes.error) throw setoresRes.error;
      if (equipesRes.error) throw equipesRes.error;
      if (operadoresRes.error) throw operadoresRes.error;

      // A ordem dos setores é a que o admin arrastou na aba Setores.
      const setoresList = aplicarOrdemSetores(
        setoresDosFiltros((setoresRes.data ?? []) as unknown as (SetorEq & SetorCandidatoAoFiltro)[])
          .map(({ id, nome }) => ({ id, nome })),
        empresaId,
      );
      setSetores(setoresList);
      setEquipes((equipesRes.data ?? []) as Equipe[]);
      setOperadores((operadoresRes.data ?? []) as unknown as Operador[]);
      const [clonesData, lideresData, subgruposData] = await Promise.all([
        listarClonesEquipes(empresaId),
        listarLideresEquipes(empresaId),
        listarSubgrupos(empresaId),
      ]);
      setClones(clonesData);
      setLideresEq(lideresData);
      setSubgrupos(subgruposData);

      /*
       * O vínculo pessoa→subgrupo vem À PARTE: nomear uma coluna inexistente
       * derruba a consulta INTEIRA no PostgREST, e um banco sem a migration
       * mostraria a aba vazia em vez de mostrá-la sem subgrupos.
       */
      if (subgruposData !== null) {
        const { data: vinculos } = await supabase.from('perfis').select('id, subgrupo_id').eq('empresa_id', empresaId);
        const mapa = new Map(((vinculos as { id: string; subgrupo_id: string | null }[]) ?? []).map(v => [v.id, v.subgrupo_id] as const));
        setOperadores(prev => prev.map(o => ({ ...o, subgrupo_id: mapa.get(o.id) ?? null })));
      }

      setSetorSelecionado(prev => {
        if (prev) return prev;
        if (!isAdmin && perfil?.setor_id) return perfil.setor_id;
        return setoresList[0]?.id ?? '';
      });
    } catch (err: unknown) {
      toast.error('Erro ao carregar as equipes: ' + mensagem(err));
    } finally {
      setLoading(false);
    }
  }, [empresaId, isAdmin, perfil?.setor_id]);

  useEffect(() => { void loadData(); }, [loadData]);

  // A cidade de cada setor, para o pontinho da marca. À parte e sem travar a
  // tela: se falhar, os chips só ficam sem cor.
  useEffect(() => {
    if (!empresaId) return;
    let cancel = false;
    void Promise.all([
      supabase.from('setores').select('id, cidade_id').eq('empresa_id', empresaId),
      supabase.from('rh_celulas').select('id, nome').eq('empresa_id', empresaId),
    ]).then(([s, c]) => {
      if (cancel || s.error || c.error) return;
      const cidade = new Map(((c.data ?? []) as { id: string; nome: string }[]).map(x => [x.id, x.nome]));
      const m = new Map<string, 'bp' | 'pp'>();
      for (const x of (s.data ?? []) as unknown as { id: string; cidade_id: string | null }[]) {
        const marca = marcaDaCidade(x.cidade_id ? cidade.get(x.cidade_id) : null);
        if (marca) m.set(x.id, marca.nome === 'PaguePlay' ? 'pp' : 'bp');
      }
      setMarcaDoSetor(m);
    });
    return () => { cancel = true; };
  }, [empresaId]);

  // ─── Catálogo da empresa p/ clone entre setores ────────────────────────────
  //
  // Os OPERADORES vêm por RPC: a policy de `perfis` é um TETO (20260903310000),
  // e para líder e gerência esse teto é o próprio setor. Quem autoriza aqui é
  // `equipes_gerenciar_composicao`, a mesma condição da policy de escrita em
  // `equipe_operadores_clones` (20260903400000).
  useEffect(() => {
    if (!empresaId || tenant.slug !== 'bookplay' || !podeGerenciarComposicao) {
      setCloneCat(CLONE_CATALOGO_VAZIO);
      return;
    }
    let cancel = false;
    void (async () => {
      const [s, e, o] = await Promise.all([
        supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO).eq('empresa_id', empresaId).order('nome'),
        supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId).order('nome'),
        rpcSemTipo<CloneCatalogo['operadores']>('fn_equipes_operadores_para_clone', { p_empresa: empresaId }),
      ]);
      if (cancel) return;
      // Lista vazia por erro e lista vazia por não haver ninguém são coisas
      // diferentes, e quem está com a tela aberta precisa distinguir as duas.
      if (o.error) {
        console.warn('[AdminEquipes] catálogo de clone:', o.error.message);
        toast.error('Não foi possível carregar os operadores para clonar: ' + o.error.message);
      }
      setCloneCat({
        // O seletor «de qual setor clonar» segue a mesma régua dos filtros.
        setores:    aplicarOrdemSetores(
          setoresDosFiltros((s.data ?? []) as unknown as (SetorEq & SetorCandidatoAoFiltro)[]).map(({ id, nome }) => ({ id, nome })),
          empresaId,
        ),
        equipes:    (e.data as CloneCatalogo['equipes']) ?? [],
        operadores: (o.data as unknown as CloneCatalogo['operadores']) ?? [],
      });
    })();
    return () => { cancel = true; };
  }, [empresaId, tenant.slug, podeGerenciarComposicao]);

  // ─── Derivados do setor selecionado ────────────────────────────────────────

  const setorAtual = setores.find(s => s.id === setorSelecionado);

  /** Os setores por cidade: Birigui (BookPlay), Marília (PaguePlay), sem cidade. */
  const gruposDeSetores = useMemo(() => {
    const defs: { chave: string; marca: 'bp' | 'pp' | null; rotulo: string }[] = [
      { chave: 'bp', marca: 'bp', rotulo: 'Birigui' },
      { chave: 'pp', marca: 'pp', rotulo: 'Marília' },
      { chave: 'sem', marca: null, rotulo: 'Sem cidade' },
    ];
    return defs
      .map(d => ({ ...d, setores: setores.filter(s => (marcaDoSetor.get(s.id) ?? null) === d.marca) }))
      .filter(d => d.setores.length > 0);
  }, [setores, marcaDoSetor]);
  const equipesDoSetor = useMemo(() => equipes.filter(e => e.setor_id === setorSelecionado), [equipes, setorSelecionado]);

  // Com líder por equipe, quem tem cargo de líder não entra no quadro como
  // membro: a liderança mora na linha dourada de cada equipe.
  const ehLiderExcluido = useCallback((o: Operador) => lideresHabilitados && o.perfil === 'lider', [lideresHabilitados]);

  const pessoasDoSetor = useCallback((setorId: string) =>
    operadores.filter(o => o.setor_id === setorId && !ehLiderExcluido(o)), [operadores, ehLiderExcluido]);

  const membrosDoSetor = useMemo(() => pessoasDoSetor(setorSelecionado), [pessoasDoSetor, setorSelecionado]);
  const resumo = useMemo(() => resumoDoSetor(membrosDoSetor, equipesDoSetor), [membrosDoSetor, equipesDoSetor]);
  const semEquipe = useMemo(() => membrosDoSetor.filter(o => !o.equipe_id), [membrosDoSetor]);
  const semEquipeVisiveis = useMemo(() => semEquipe.filter(o => casaBusca(o.nome, busca)), [semEquipe, busca]);
  const opcoesDestino = useMemo(
    () => destinosDoSetor(equipesDoSetor, subgrupos ?? [], membrosDoSetor),
    [equipesDoSetor, subgrupos, membrosDoSetor],
  );

  /** Membros da equipe, mais os FANTASMAS pendurados nela (no fim). */
  const operadoresDaEquipe = (equipeId: string): Operador[] => {
    const reais = operadores.filter(o => o.equipe_id === equipeId && !ehLiderExcluido(o));
    const fantasmasAqui = fantasmas
      .filter(f => f.origemEquipeId === equipeId && !fantasmasTirados.has(f.perfilId))
      .map<Operador>(f => ({
        id: f.perfilId, nome: f.nome ?? 'Usuário transferido', email: '', perfil: 'operador',
        setor_id: f.origemSetorId, equipe_id: equipeId, empresa_id: empresaId ?? '',
      }));
    return [...reais, ...fantasmasAqui];
  };

  // Fantasma de SETOR: só as linhas do setor de origem saem ao tirá-lo
  // (20260929211916). Os de empresa levam o mês inteiro, como sempre.
  const setorDoFantasmaDeSetor = (id: string) =>
    fantasmas.find(f => f.perfilId === id && f.tipo === 'setor')?.origemSetorId ?? null;
  const ehFantasma = useCallback((id: string) => fantasmas.some(f => f.perfilId === id), [fantasmas]);

  const nomeEquipeQualquer = useCallback((id: string | null | undefined): string | null =>
    (id ? equipes.find(e => e.id === id)?.nome ?? cloneCat.equipes.find(e => e.id === id)?.nome : null) ?? null,
  [equipes, cloneCat.equipes]);

  const nomeSetorQualquer = useCallback((id: string | null | undefined): string | null =>
    (id ? setores.find(s => s.id === id)?.nome ?? cloneCat.setores.find(s => s.id === id)?.nome : null) ?? null,
  [setores, cloneCat.setores]);

  const resolverOperadorClone = useCallback((id: string): CloneOperadorInfo | null => {
    const l = operadores.find(o => o.id === id);
    if (l) return { id: l.id, nome: l.nome, equipe_id: l.equipe_id, setor_id: l.setor_id };
    const c = cloneCat.operadores.find(o => o.id === id);
    return c ? { id: c.id, nome: c.nome, equipe_id: c.equipe_id, setor_id: c.setor_id } : null;
  }, [operadores, cloneCat.operadores]);

  /**
   * Clones alocados numa equipe. O vínculo é legível pela empresa inteira, mas
   * o PERFIL passa pela RLS de `perfis`: um clone de outro setor pode vir sem
   * nome. O vínculo aparece sempre; o que falta é só o nome, e a tela diz isso.
   */
  const clonesDaEquipe = (equipe: Equipe): CloneNoCartao[] =>
    (clones ?? []).filter(c => c.equipe_id === equipe.id).map(c => {
      const op = resolverOperadorClone(c.operador_id);
      const deOutroSetor = !!op?.setor_id && op.setor_id !== equipe.setor_id;
      const origem = !op ? 'outro setor'
        : deOutroSetor ? nomeSetorQualquer(op.setor_id) ?? 'outro setor'
        : nomeEquipeQualquer(op.equipe_id) ?? 'equipe';
      // A equipe de origem é a de HOJE: se a pessoa troca de equipe no setor
      // dela, o clone fica onde está e o selo passa a dizer a equipe nova.
      const equipeOrigem = deOutroSetor ? nomeEquipeQualquer(op?.equipe_id) : null;
      const nome = op?.nome ?? 'Operador de outro setor';
      return {
        cloneId: c.id, pessoaId: c.operador_id, nome, naoResolvido: !op,
        origem: `clone de ${origem}${equipeOrigem ? ` · ${equipeOrigem}` : ''}`,
        conta: c.conta_recebimento !== false,
        dica: !op
          ? 'Clone de outro setor: o seu acesso não mostra o nome. O recebimento continua contando aqui.'
          : deOutroSetor
            ? `Clone de ${nome}: original no setor ${origem}${equipeOrigem ? `, equipe ${equipeOrigem}` : ''}. O recebimento conta nos dois setores.`
            : `Clone de ${nome}: original na equipe ${origem}. O recebimento conta nas duas equipes.`,
      };
    });

  /** Líderes da equipe. Mesmo cuidado do clone: o vínculo nunca some. */
  const lideresDaEquipe = (equipe: Equipe): LiderNoCartao[] =>
    (lideresEq ?? []).filter(v => v.equipe_id === equipe.id).map(v => {
      const info = resolverOperadorClone(v.lider_id);
      const outro = !!info?.setor_id && info.setor_id !== equipe.setor_id;
      return {
        vinculoId: v.id, nome: info?.nome ?? 'Líder de outro setor', naoResolvido: !info,
        outroSetor: outro ? nomeSetorQualquer(info?.setor_id) ?? 'outro setor' : null,
      };
    });

  /** Líderes que podem entrar. BookPlay: a empresa toda (este setor primeiro);
   *  PaguePlay: só o setor da equipe. Exclui os já atribuídos. */
  const lideresDisponiveis = (equipe: Equipe): Candidato[] => {
    const ja = new Set((lideresEq ?? []).filter(v => v.equipe_id === equipe.id).map(v => v.lider_id));
    const permiteClone = tenant.slug === 'bookplay';
    const fonte = permiteClone ? cloneCat.operadores : operadores;
    return fonte
      .filter(o => o.perfil === 'lider' && !ja.has(o.id) && (permiteClone || o.setor_id === equipe.setor_id))
      .map(o => ({ o, mesmo: o.setor_id === equipe.setor_id }))
      .sort((a, b) => Number(b.mesmo) - Number(a.mesmo) || a.o.nome.localeCompare(b.o.nome))
      .map(({ o, mesmo }) => ({
        id: o.id, nome: o.nome,
        detalhe: mesmo ? 'este setor' : `clone de ${nomeSetorQualquer(o.setor_id) ?? 'outro setor'}`,
      }));
  };

  /** Setores (fora do dele) em que o operador está clonado. */
  const setoresEmprestado = useCallback((p: Operador): string[] => {
    if (!clonesHabilitados) return [];
    const nomes: string[] = [];
    const vistos = new Set<string>();
    for (const c of clones ?? []) {
      if (c.operador_id !== p.id) continue;
      const sid = cloneCat.equipes.find(e => e.id === c.equipe_id)?.setor_id;
      if (!sid || sid === p.setor_id || vistos.has(sid)) continue;
      vistos.add(sid);
      const n = nomeSetorQualquer(sid);
      if (n) nomes.push(n);
    }
    return nomes;
  }, [clonesHabilitados, clones, cloneCat.equipes, nomeSetorQualquer]);

  const nomeDoDestino = useCallback((d: Destino): string | null => {
    if (!d.equipeId) return null;
    const eq = equipes.find(e => e.id === d.equipeId)?.nome ?? 'equipe';
    const sg = d.subgrupoId ? (subgrupos ?? []).find(s => s.id === d.subgrupoId)?.nome : null;
    return sg ? `${eq} · ${sg}` : eq;
  }, [equipes, subgrupos]);

  // ─── Permissões no setor aberto ────────────────────────────────────────────
  const doMeuSetor = isAdmin || setorSelecionado === perfil?.setor_id;
  const podeGerenciarSetor = podeEditarEquipes && doMeuSetor;
  /** Mexer em quem está onde: qualquer uma das duas chaves de equipe, no setor permitido. */
  const podeMover = (podeEditarEquipes || podeGerenciarComposicao) && doMeuSetor;

  // ─── Seleção ───────────────────────────────────────────────────────────────

  const alternar = useCallback((id: string) => {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);
  const limparSelecao = useCallback(() => setSelecionados(new Set()), []);

  // Esc limpa a seleção (quando nenhum diálogo/popover está pedindo o Esc).
  useEffect(() => {
    if (!selecionados.size) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) limparSelecao(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecionados.size, limparSelecao]);

  function trocarSetor(id: string) {
    setSetorSelecionado(id);
    setBusca('');
    limparSelecao();
  }

  // ─── O movimento ───────────────────────────────────────────────────────────

  /**
   * Grava as mudanças: um UPDATE por destino. Quem só troca de subgrupo dentro
   * da mesma equipe recebe só `subgrupo_id` (não reescreve `equipe_id`, que
   * dispara o espelho da fase 5 à toa).
   *
   * `.select('id')` conta quem foi de fato gravado: a RLS recusa em silêncio
   * (200 com zero linhas). Quem não voltou é desfeito na tela e avisado.
   */
  const gravar = useCallback(async (mudancas: Mudanca[]): Promise<Mudanca[]> => {
    if (!mudancas.length) return [];
    setOperadores(prev => aplicarMudancas(prev, mudancas));
    const gravados = new Set<string>();
    let erro: string | null = null;
    const soSub = mudancas.filter(m => m.de.equipeId === m.para.equipeId);
    const troca = mudancas.filter(m => m.de.equipeId !== m.para.equipeId);
    try {
      for (const [lista, soSubgrupo] of [[soSub, true], [troca, false]] as const) {
        for (const g of agruparPorDestino(lista)) {
          const patch: { equipe_id?: string | null; subgrupo_id?: string | null } = soSubgrupo
            ? { subgrupo_id: g.destino.subgrupoId }
            : { equipe_id: g.destino.equipeId };
          // `subgrupo_id` só entra quando a coluna existe: nomeá-la num banco
          // sem a migration faz o PostgREST recusar o UPDATE inteiro.
          if (!soSubgrupo && subgruposHabilitados) patch.subgrupo_id = g.destino.subgrupoId;
          const { data, error } = await supabase.from('perfis').update(patch).in('id', g.ids).select('id');
          if (error) throw error;
          for (const r of (data ?? []) as { id: string }[]) gravados.add(r.id);
        }
      }
    } catch (err) {
      erro = mensagem(err);
    }
    const falharam = mudancas.filter(m => !gravados.has(m.id));
    if (falharam.length) {
      setOperadores(prev => aplicarMudancas(prev, desfazer(falharam)));
      toast.error(erro
        ? `Não foi possível mover: ${erro}`
        : `${plural(falharam.length, 'pessoa não pôde', 'pessoas não puderam')} ser movida${falharam.length === 1 ? '' : 's'}: sem permissão para alterar.`);
    }
    if (gravados.size) invalidarComposicaoEquipes();
    return mudancas.filter(m => gravados.has(m.id));
  }, [subgruposHabilitados]);

  const moverPessoas = useCallback(async (ids: Iterable<string>, destino: Destino) => {
    if (!podeMover) return;
    const lista = [...ids];
    // O setor é a fronteira de quem não é admin, e o quadro nunca mostra
    // destino de outro setor — a conferência fica pelo que chega por arrastar.
    if (!isAdmin) {
      const destinoSetor = destino.equipeId ? equipes.find(e => e.id === destino.equipeId)?.setor_id : perfil?.setor_id;
      const foraDoSetor = lista.some(id => operadores.find(o => o.id === id)?.setor_id !== perfil?.setor_id);
      if (destinoSetor !== perfil?.setor_id || foraDoSetor) {
        toast.error('Você só pode mover pessoas dentro do seu próprio setor.');
        return;
      }
    }
    const plano = planejarMovimento(operadores, lista, destino);
    if (!plano.length) { toast.info('Já estão nesse lugar.'); return; }
    const feitos = await gravar(plano);
    if (!feitos.length) return;
    setSelecionados(prev => {
      const n = new Set(prev);
      for (const m of feitos) n.delete(m.id);
      return n;
    });
    toast.success(fraseDoMovimento(feitos, nomeDoDestino(destino)), {
      duration: 7000,
      action: {
        label: 'Desfazer',
        onClick: () => { void gravar(desfazer(feitos)).then(v => { if (v.length) toast.success('Movimento desfeito.'); }); },
      },
    });
  }, [podeMover, isAdmin, equipes, operadores, perfil?.setor_id, gravar, nomeDoDestino]);

  /** Soltou alguém: se ele estava na seleção, leva a seleção inteira junto. */
  const soltar = useCallback((destino: Destino) => {
    const id = arraste.pegar();
    if (!id) return;
    void moverPessoas(selecionados.has(id) ? selecionados : [id], destino);
  }, [moverPessoas, selecionados]);

  const moverUm = useCallback((id: string, d: Destino) => { void moverPessoas([id], d); }, [moverPessoas]);
  const levarSelecionados = useCallback((d: Destino) => { void moverPessoas(selecionados, d); }, [moverPessoas, selecionados]);
  const semEquipeDestino: Destino = { equipeId: null, subgrupoId: null };

  /** O X da pessoa: tira da equipe; na transferida, abre a confirmação do fantasma. */
  function tirar(p: Operador, equipe: Equipe) {
    if (ehFantasma(p.id)) {
      setConfirmandoFantasma({ perfilId: p.id, nome: p.nome, equipeNome: equipe.nome, setorId: setorDoFantasmaDeSetor(p.id) });
      return;
    }
    void moverPessoas([p.id], semEquipeDestino);
  }

  const selecaoNaEquipe = [...selecionados].some(id => operadores.find(o => o.id === id)?.equipe_id);

  // ─── Equipe: criar, renomear, treino, excluir ──────────────────────────────

  async function handleCriarEquipe() {
    const nome = novaEquipeNome.trim();
    if (!nome) { toast.error('Informe o nome da equipe.'); return; }
    if (!empresaId || !setorSelecionado) return;
    if (!isAdmin && setorSelecionado !== perfil?.setor_id) {
      toast.error('Você só pode criar equipes no seu próprio setor.');
      return;
    }
    setCriandoEquipe(true);
    try {
      const { error } = await supabase.from('equipes').insert({ nome, setor_id: setorSelecionado, empresa_id: empresaId });
      if (error) throw error;
      invalidarComposicaoEquipes();
      toast.success(`Equipe "${nome}" criada.`);
      setNovaEquipeNome('');
      setNovaEquipeAberta(false);
      await loadData();
    } catch (err: unknown) {
      toast.error('Erro ao criar equipe: ' + mensagem(err));
    } finally {
      setCriandoEquipe(false);
    }
  }

  async function renomearEquipe(equipe: Equipe, nome: string): Promise<boolean> {
    if (!isAdmin && equipe.setor_id !== perfil?.setor_id) { toast.error('Você só pode editar equipes do seu próprio setor.'); return false; }
    if (nome === equipe.nome) return true;
    const { error } = await supabase.from('equipes').update({ nome }).eq('id', equipe.id);
    if (error) { toast.error('Erro ao renomear equipe: ' + error.message); return false; }
    invalidarComposicaoEquipes();
    setEquipes(prev => prev.map(e => (e.id === equipe.id ? { ...e, nome } : e)));
    toast.success('Equipe renomeada.');
    return true;
  }

  async function alternarTreino(equipe: Equipe) {
    if (!isAdmin && equipe.setor_id !== perfil?.setor_id) { toast.error('Você só pode editar equipes do seu próprio setor.'); return; }
    const novo = !equipe.treinamento;
    setEquipes(prev => prev.map(e => (e.id === equipe.id ? { ...e, treinamento: novo } : e)));
    const { error } = await supabase.from('equipes').update({ treinamento: novo }).eq('id', equipe.id);
    if (error) {
      toast.error('Erro ao atualizar equipe: ' + error.message);
      setEquipes(prev => prev.map(e => (e.id === equipe.id ? { ...e, treinamento: equipe.treinamento } : e)));
      return;
    }
    toast.success(novo
      ? `"${equipe.nome}" marcada como treino. Configure o início e os dias úteis na aba Metas.`
      : `"${equipe.nome}" não é mais equipe de treino.`);
  }

  const [equipeParaExcluir, setEquipeParaExcluir] = useState<Equipe | null>(null);
  const [excluindoEquipe, setExcluindoEquipe] = useState(false);

  function solicitarExcluirEquipe(equipe: Equipe) {
    if (!isAdmin && equipe.setor_id !== perfil?.setor_id) { toast.error('Você só pode excluir equipes do seu próprio setor.'); return; }
    setEquipeParaExcluir(equipe);
  }

  /**
   * Exclui a equipe. Com gente dentro, as pessoas saem antes (vão para «sem
   * equipe») — era o passo que a tela antiga pedia para fazer à mão, uma a uma.
   * Transferido do mês segura a exclusão: o recebimento dele ainda é desta
   * equipe e precisa ser tirado de propósito.
   */
  async function confirmarExcluirEquipe() {
    if (!podeExcluirEquipes) return;
    const equipe = equipeParaExcluir;
    if (!equipe) return;
    setExcluindoEquipe(true);
    try {
      const reais = operadores.filter(o => o.equipe_id === equipe.id).map(o => o.id);
      if (reais.length) {
        const plano = planejarMovimento(operadores, reais, semEquipeDestino);
        const feitos = await gravar(plano);
        if (feitos.length < plano.length) return;
      }
      const { error } = await supabase.from('equipes').delete().eq('id', equipe.id);
      if (error) throw error;
      invalidarComposicaoEquipes();
      toast.success(reais.length
        ? `Equipe "${equipe.nome}" excluída. ${plural(reais.length, 'pessoa foi', 'pessoas foram')} para «sem equipe».`
        : `Equipe "${equipe.nome}" excluída.`);
      setEquipeParaExcluir(null);
      await loadData();
    } catch (err: unknown) {
      toast.error('Erro ao excluir equipe: ' + mensagem(err));
    } finally {
      setExcluindoEquipe(false);
    }
  }

  // ─── Subgrupos ─────────────────────────────────────────────────────────────

  async function criarSubgrupoEm(equipe: Equipe, nome: string): Promise<boolean> {
    if (!empresaId) return false;
    const criado = await criarSubgrupo(empresaId, equipe.id, nome, perfil?.id ?? null);
    if (!criado) {
      // Nome repetido e RLS negada chegam iguais aqui; o índice único é por equipe.
      toast.error('Não foi possível criar. Já existe um subgrupo com esse nome nesta equipe?');
      return false;
    }
    setSubgrupos(prev => [...(prev ?? []), criado]);
    toast.success(`Subgrupo "${criado.nome}" criado em "${equipe.nome}".`);
    return true;
  }

  async function renomearSg(sg: SubgrupoEquipe, nomeBruto: string): Promise<boolean> {
    const nome = nomeBruto.trim();
    if (!nome || nome === sg.nome) return true;
    if (!(await renomearSubgrupo(sg.id, nome))) { toast.error('Não foi possível renomear o subgrupo.'); return false; }
    setSubgrupos(prev => (prev ?? []).map(s => (s.id === sg.id ? { ...s, nome } : s)));
    return true;
  }

  /** Apaga o subgrupo. Ninguém sai da equipe — só deixa de estar dividido. */
  async function excluirSg(sg: SubgrupoEquipe) {
    if (!(await excluirSubgrupo(sg.id))) { toast.error('Não foi possível excluir o subgrupo.'); return; }
    setSubgrupos(prev => (prev ?? []).filter(s => s.id !== sg.id));
    setOperadores(prev => prev.map(o => (o.subgrupo_id === sg.id ? { ...o, subgrupo_id: null } : o)));
    toast.success(`Subgrupo "${sg.nome}" removido. As pessoas seguem na equipe.`);
  }

  // ─── Líderes e clones ──────────────────────────────────────────────────────

  async function adicionarLider(equipe: Equipe, liderId: string) {
    if (!podeGerenciarComposicao || !empresaId) return;
    const criado = await adicionarLiderEquipe(empresaId, equipe.id, liderId, perfil?.id);
    if (!criado) { toast.error('Erro ao adicionar líder.'); return; }
    setLideresEq(prev => [...(prev ?? []), criado]);
    toast.success('Líder adicionado à equipe.');
  }

  async function removerLider(vinculoId: string) {
    if (!podeGerenciarComposicao) return;
    if (!(await removerLiderEquipe(vinculoId))) { toast.error('Erro ao remover líder.'); return; }
    setLideresEq(prev => (prev ?? []).filter(v => v.id !== vinculoId));
    toast.success('Líder removido da equipe.');
  }

  async function clonar(equipe: Equipe, operadorId: string) {
    if (!podeGerenciarComposicao || !empresaId) return;
    const op = resolverOperadorClone(operadorId);
    if (!op) return;
    const criado = await criarCloneEquipe(empresaId, equipe.id, operadorId, perfil?.id ?? null);
    if (!criado) { toast.error('Não foi possível clonar (já está nesta equipe?).'); return; }
    setClones(prev => [...(prev ?? []), criado]);
    const outroSetor = !!op.setor_id && op.setor_id !== equipe.setor_id;
    const nomeSetor = nomeSetorQualquer(equipe.setor_id);
    toast.success(outroSetor && nomeSetor
      ? `${op.nome} clonado para "${equipe.nome}": o recebimento dele passa a contar também no setor ${nomeSetor}.`
      : `${op.nome} clonado para "${equipe.nome}": o recebimento dele passa a contar nas duas equipes.`);
  }

  async function removerClone(c: CloneNoCartao) {
    if (!podeGerenciarComposicao) return;
    if (!(await removerCloneEquipe(c.cloneId))) { toast.error('Erro ao remover clone.'); return; }
    setClones(prev => (prev ?? []).filter(x => x.id !== c.cloneId));
    toast.success(`Clone de ${c.nome} removido (segue normal na equipe original).`);
  }

  async function contaRecebimento(cloneId: string, conta: boolean) {
    if (!(await setCloneContaRecebimento(cloneId, conta))) { toast.error('Erro ao alterar a contagem de recebimento.'); return; }
    setClones(prev => (prev ?? []).map(c => (c.id === cloneId ? { ...c, conta_recebimento: conta } : c)));
    toast.success(conta ? 'O recebimento deste clone passa a contar nesta equipe.' : 'O recebimento deste clone NÃO conta mais nesta equipe.');
  }

  const [confirmandoLimparClones, setConfirmandoLimparClones] = useState(false);
  const [limpandoClones, setLimpandoClones] = useState(false);
  async function limparTodosClones() {
    if (!empresaId) return;
    setLimpandoClones(true);
    const n = await removerTodosClonesEmpresa(empresaId);
    setLimpandoClones(false);
    setConfirmandoLimparClones(false);
    if (n === null) { toast.error('Erro ao excluir os clones.'); return; }
    setClones([]);
    toast.success(n > 0
      ? `${plural(n, 'clone excluído', 'clones excluídos')}. Os operadores seguem normais nas equipes de origem.`
      : 'Nenhum clone para excluir.');
  }

  const clonagemPara = (equipe: Equipe) => (!clonesHabilitados ? null : {
    setores: cloneCat.setores,
    candidatos: (setorId: string): Candidato[] => {
      const ja = new Set((clones ?? []).filter(c => c.equipe_id === equipe.id).map(c => c.operador_id));
      return cloneCat.operadores
        .filter(o => o.setor_id === setorId && o.equipe_id && o.equipe_id !== equipe.id && !ja.has(o.id))
        .map(o => ({ id: o.id, nome: o.nome, detalhe: nomeEquipeQualquer(o.equipe_id) ?? 'equipe' }));
    },
    aviso: (setorId: string) => (setorId !== equipe.setor_id
      ? `Operador de outro setor: o recebimento dele conta no setor de origem e também em ${nomeSetorQualquer(equipe.setor_id) ?? 'este setor'}.`
      : 'O recebimento dele passa a contar nas duas equipes.'),
    onClonar: (id: string) => { void clonar(equipe, id); },
  });

  // ─── Zona «sem equipe» ─────────────────────────────────────────────────────
  const zonaPool = useZonaDeSoltar(semEquipeDestino, soltar, podeMover);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="eq p-4 md:p-6 space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-full max-w-2xl rounded-xl" />
        <div className="eq-quadro">
          <Skeleton className="h-72 rounded-xl" />
          <div className="eq-grade">{[0, 1, 2].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
        </div>
      </div>
    );
  }

  const nSel = selecionados.size;
  const buscando = !!busca.trim();
  const qtdClones = clones?.length ?? 0;

  return (
    <div className={cn('eq p-4 md:p-6 space-y-4 pb-24', podeMover && nSel > 0 && 'eq-modo')}>

      {/* ── Topo ───────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Equipes do setor</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {podeMover
              ? 'Arraste, use «Mover para…» na pessoa, ou selecione várias pelo círculo e escolha o destino.'
              : 'Quem está em cada equipe do setor.'}
          </p>
        </div>
        {isAdmin && clonesHabilitados && qtdClones > 0 && (
          confirmandoLimparClones ? (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
              <span className="text-xs text-foreground">Excluir os <strong>{qtdClones}</strong> clones da empresa?</span>
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={limpandoClones} onClick={() => void limparTodosClones()}>
                <Trash2 className="w-3.5 h-3.5" /> {limpandoClones ? 'Excluindo…' : 'Excluir clones'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={limpandoClones} onClick={() => setConfirmandoLimparClones(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmandoLimparClones(true)}>
              <Copy className="w-3.5 h-3.5" /> Excluir todos os clones ({qtdClones})
            </Button>
          )
        )}
      </div>

      {/* ── Setores ────────────────────────────────────────────────────────── */}
      {setores.length === 0 ? (
        <div className="eq-vazio flex flex-col items-center gap-2 py-12">
          <Building2 className="w-8 h-8 opacity-30" />
          Nenhum setor cadastrado. Crie um na aba Setores para montar as equipes.
        </div>
      ) : setores.length > 1 && (
        /* Agrupados pela cidade (a marca), e quebrando linha: com doze
           setores, uma faixa que rola para o lado esconde metade deles. */
        <nav className="eq-setores" aria-label="Setor">
          {gruposDeSetores.map(g => (
            <div key={g.chave} className="eq-setores-grupo">
              {gruposDeSetores.length > 1 && (
                <span className="eq-setores-rot">
                  {g.marca && <span className={cn('eq-ponto', g.marca)} aria-hidden="true" />}{g.rotulo}
                </span>
              )}
              <div className="eq-seg" role="group" aria-label={g.rotulo}>
                {g.setores.map(s => {
                  const gente = pessoasDoSetor(s.id);
                  const falta = gente.filter(o => !o.equipe_id).length;
                  return (
                    <button key={s.id} type="button" className="eq-setor" aria-pressed={s.id === setorSelecionado} onClick={() => trocarSetor(s.id)}
                      title={falta ? `${plural(falta, 'pessoa', 'pessoas')} sem equipe` : undefined}>
                      {s.nome}
                      <small>{gente.length}</small>
                      {falta > 0 && <span className="eq-falta" aria-label={`${falta} sem equipe`}>{falta}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      )}

      {setorAtual && (
        <>
          {/* ── Ferramentas ──────────────────────────────────────────────── */}
          <div className="eq-ferr">
            <div className="eq-busca">
              <Search aria-hidden="true" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder={`Achar alguém em ${setorAtual.nome}…`}
                className="h-9" aria-label="Buscar pessoa no setor" />
            </div>
            {/* O resumo do setor numa linha: o número que pede ação é o «sem equipe». */}
            <div className="eq-resumo" aria-label={`Resumo de ${setorAtual.nome}`}>
              {buscando ? (
                <span>{plural(membrosDoSetor.filter(o => casaBusca(o.nome, busca)).length, 'pessoa encontrada', 'pessoas encontradas')}</span>
              ) : (
                <>
                  <span><b>{resumo.pessoas}</b> pessoas</span>
                  <span><b>{resumo.equipes}</b> equipes</span>
                  <span className={cn(resumo.semEquipe > 0 && 'eq-aviso')}><b>{resumo.semEquipe}</b> sem equipe</span>
                  <span className="flex items-center gap-2" title={`${resumo.emEquipe} de ${resumo.pessoas} em equipe`}>
                    <span className="eq-barra" aria-hidden="true"><i style={{ width: `${resumo.alocados}%` }} /></span>
                    <b>{resumo.alocados}%</b> alocados
                  </span>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {podeGerenciarSetor && (
                <Popover open={novaEquipeAberta} onOpenChange={o => { setNovaEquipeAberta(o); if (!o) setNovaEquipeNome(''); }}>
                  <PopoverTrigger asChild>
                    <Button size="sm" className="h-9 gap-1.5"><Plus className="w-4 h-4" /> Nova equipe</Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 space-y-2">
                    <p className="text-sm font-semibold">Nova equipe em {setorAtual.nome}</p>
                    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void handleCriarEquipe(); }}>
                      <Input autoFocus value={novaEquipeNome} onChange={e => setNovaEquipeNome(e.target.value)} placeholder="Nome da equipe"
                        className="h-9" aria-label="Nome da equipe" disabled={criandoEquipe} />
                      <Button type="submit" size="sm" className="h-9" disabled={criandoEquipe || !novaEquipeNome.trim()}>
                        {criandoEquipe ? 'Criando…' : 'Criar'}
                      </Button>
                    </form>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* ── O quadro ─────────────────────────────────────────────────── */}
          <div className="eq-quadro">
            <aside className={cn('eq-pool', zonaPool.sobre && 'eq-solta')} aria-label="Sem equipe" {...zonaPool.props}>
              <div className="eq-pool-cab">
                <span className="flex items-center gap-2">Sem equipe <span className="eq-qtd">{semEquipe.length}</span></span>
                {podeMover && semEquipeVisiveis.length > 1 && (
                  <button type="button" className="eq-link"
                    onClick={() => setSelecionados(prev => new Set([...prev, ...semEquipeVisiveis.map(o => o.id)]))}>
                    Selecionar {buscando ? 'achados' : 'todos'}
                  </button>
                )}
              </div>
              {podeMover && nSel > 0 && selecaoNaEquipe && (
                <button type="button" className="eq-alvo-btn" onClick={() => levarSelecionados(semEquipeDestino)}>
                  <LogOut /> Tirar da equipe
                </button>
              )}
              <div className="eq-pool-lista">
                {semEquipeVisiveis.length === 0 ? (
                  <div className="eq-vazio">
                    {buscando ? 'Ninguém sem equipe com esse nome.' : semEquipe.length === 0 ? 'Todo mundo do setor está numa equipe.' : ''}
                  </div>
                ) : semEquipeVisiveis.map(p => (
                  <PessoaLinha key={p.id} pessoa={p} selecionada={selecionados.has(p.id)} podeMover={podeMover}
                    emprestada={setoresEmprestado(p)} opcoes={opcoesDestino}
                    onAlternar={alternar} onArrastar={arraste.comecar} onMover={moverUm} />
                ))}
              </div>
              {podeMover && semEquipe.length > 0 && <p className="eq-pool-pe">Arraste para uma equipe, ou selecione e escolha o destino.</p>}
            </aside>

            {equipesDoSetor.length === 0 ? (
              <div className="eq-vazio flex flex-col items-center gap-3 py-16">
                <Users className="w-8 h-8 opacity-30" />
                Nenhuma equipe em {setorAtual.nome} ainda.
                {podeGerenciarSetor && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNovaEquipeAberta(true)}>
                    <Plus className="w-4 h-4" /> Criar a primeira equipe
                  </Button>
                )}
              </div>
            ) : (
              <div className="eq-grade">
                {equipesDoSetor.map(equipe => {
                  const podeGerenciarEquipe = podeEditarEquipes && (isAdmin || equipe.setor_id === perfil?.setor_id);
                  return (
                    <CartaoEquipe
                      key={equipe.id}
                      equipe={equipe}
                      membros={operadoresDaEquipe(equipe.id)}
                      grupos={subgruposHabilitados ? subgruposDaEquipe(subgrupos ?? [], equipe.id) : []}
                      lideres={lideresHabilitados ? lideresDaEquipe(equipe) : null}
                      clones={clonesHabilitados ? clonesDaEquipe(equipe) : null}
                      ehTransferida={ehFantasma}
                      emprestada={setoresEmprestado}
                      busca={busca}
                      podeGerenciar={podeGerenciarEquipe}
                      podeExcluir={podeExcluirEquipes}
                      podeComposicao={podeGerenciarComposicao}
                      podeMover={podeMover}
                      selecionados={selecionados}
                      opcoes={opcoesDestino}
                      onAlternar={alternar}
                      onArrastar={arraste.comecar}
                      onSoltar={soltar}
                      onMover={moverUm}
                      onLevarSelecionados={levarSelecionados}
                      onTirar={p => tirar(p, equipe)}
                      onRenomear={nome => renomearEquipe(equipe, nome)}
                      onAlternarTreino={() => void alternarTreino(equipe)}
                      onExcluir={() => solicitarExcluirEquipe(equipe)}
                      onCriarSubgrupo={subgruposHabilitados ? nome => criarSubgrupoEm(equipe, nome) : null}
                      onRenomearSubgrupo={renomearSg}
                      onExcluirSubgrupo={sg => void excluirSg(sg)}
                      lideresDisponiveis={() => lideresDisponiveis(equipe)}
                      onAdicionarLider={id => void adicionarLider(equipe, id)}
                      onRemoverLider={id => void removerLider(id)}
                      clonagem={clonagemPara(equipe)}
                      onRemoverClone={c => void removerClone(c)}
                      onContaRecebimento={(id, v) => void contaRecebimento(id, v)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Barra de seleção ───────────────────────────────────────────────── */}
      <div className={cn('eq-lote', podeMover && nSel > 0 && 'eq-on')} role="region" aria-label="Seleção" aria-hidden={!(podeMover && nSel > 0)}>
        <span><b>{nSel}</b> {nSel === 1 ? 'pessoa selecionada' : 'pessoas selecionadas'}</span>
        <MoverPara opcoes={opcoesDestino} onEscolher={levarSelecionados} alinhar="center">
          <button type="button" className="eq-forte"><ArrowRightLeft /> Mover para…</button>
        </MoverPara>
        {selecaoNaEquipe && (
          <button type="button" onClick={() => levarSelecionados(semEquipeDestino)}><LogOut /> Tirar da equipe</button>
        )}
        <button type="button" aria-label="Limpar seleção" onClick={limparSelecao}><X /></button>
      </div>

      {/* ── Excluir equipe ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!equipeParaExcluir} onOpenChange={o => { if (!o) setEquipeParaExcluir(null); }}>
        <AlertDialogContent>
          {(() => {
            const eq = equipeParaExcluir;
            const reais = eq ? operadores.filter(o => o.equipe_id === eq.id).length : 0;
            const transf = eq ? fantasmas.filter(f => f.origemEquipeId === eq.id && !fantasmasTirados.has(f.perfilId)).length : 0;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir a equipe «{eq?.nome}»?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      {transf > 0 ? (
                        <p>
                          Ela ainda tem {plural(transf, 'transferido', 'transferidos')} do mês, cujo recebimento conta aqui.
                          Tire esse recebimento primeiro (o X na linha dele) e depois exclua a equipe.
                        </p>
                      ) : reais > 0 ? (
                        <p>
                          As <b className="text-foreground">{plural(reais, 'pessoa', 'pessoas')}</b> dela vão para «sem equipe» e a equipe é apagada.
                          Os subgrupos dela somem junto. Não dá para desfazer.
                        </p>
                      ) : (
                        <p>A equipe está vazia e será apagada. Não dá para desfazer.</p>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={excluindoEquipe}>Cancelar</AlertDialogCancel>
                  {transf === 0 && (
                    <AlertDialogAction
                      onClick={e => { e.preventDefault(); void confirmarExcluirEquipe(); }}
                      disabled={excluindoEquipe}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {excluindoEquipe ? 'Excluindo…' : reais > 0 ? `Tirar ${plural(reais, 'pessoa', 'pessoas')} e excluir` : 'Excluir equipe'}
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Tirar o fantasma — a MESMA confirmação da aba Analítico, porque é o
          mesmo registro: tirar aqui tira lá. */}
      <ConfirmarTirarFantasma
        alvo={confirmandoFantasma}
        empresaId={empresaId ?? ''}
        mes={mesCorrente}
        removendo={tirandoFantasma}
        onCancelar={() => setConfirmandoFantasma(null)}
        onConfirmar={() => void tirarFantasma()}
      />
    </div>
  );
}
