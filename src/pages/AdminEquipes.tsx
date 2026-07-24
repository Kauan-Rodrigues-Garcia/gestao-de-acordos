/**
 * AdminEquipes.tsx — v3 (filtro de setor + UX redesenhada)
 *
 * NOVO FLUXO:
 * 1. Usuário seleciona o setor desejado via selector no topo
 * 2. Ao selecionar, aparecem os membros disponíveis (sem equipe) e as equipes existentes
 * 3. Drag & drop para mover membros entre equipes
 * 4. Visual redesenhado: sidebar de membros disponíveis + grid de equipes
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users,
  Plus,
  X,
  GripVertical,
  Building2,
  Trash2,
  Pencil,
  Check,
  ChevronDown,
  UserCheck,
  Layers,
  Search,
  Copy,
  GraduationCap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import {
  listarClonesEquipes, criarCloneEquipe, removerCloneEquipe, setCloneContaRecebimento,
  removerTodosClonesEmpresa, type CloneEquipe,
} from '@/services/equipes/equipesClones.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Setor {
  id: string;
  nome: string;
}

interface Equipe {
  id: string;
  nome: string;
  setor_id: string;
  empresa_id: string;
  /** Equipe de treinamento: dias úteis contam a partir de treinamento_inicio. */
  treinamento?: boolean;
  treinamento_inicio?: string | null;
}

interface Operador {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  setor_id: string | null;
  equipe_id: string | null;
  empresa_id: string;
}

/** Catálogo enxuto da empresa inteira, só para o clone entre setores.
 *  As listas principais da tela ficam trancadas no setor do líder; o clone
 *  precisa enxergar além, então carrega à parte e com poucos campos. */
interface CloneCatalogo {
  setores:    Setor[];
  equipes:    { id: string; nome: string; setor_id: string }[];
  operadores: { id: string; nome: string; setor_id: string | null; equipe_id: string | null }[];
}

const CLONE_CATALOGO_VAZIO: CloneCatalogo = { setores: [], equipes: [], operadores: [] };

/** Operador de um clone: vem da lista do setor ou do catálogo da empresa. */
interface CloneOperadorInfo {
  id: string;
  nome: string;
  equipe_id: string | null;
  setor_id: string | null;
}

// ─── Drag state (module-level ref, avoids stale closure issues) ───────────────
let draggedOperadorId: string | null = null;

// ─── Chip de Membro ───────────────────────────────────────────────────────────

interface OperadorChipProps {
  operador: Operador;
  onRemove?: (operadorId: string) => void;
  onDragStart: (operadorId: string) => void;
  compact?: boolean;
  /** Nomes dos setores (fora do dele) em que o operador está clonado — o
   *  recebimento conta lá também. Aparece no setor de origem. */
  setoresEmprestado?: string[];
}

function OperadorChip({
  operador, onRemove, onDragStart, compact = false, setoresEmprestado = [],
}: OperadorChipProps) {
  const cargoLabel = PERFIL_LABELS[operador.perfil] ?? operador.perfil;
  const cargoCss = PERFIL_COLORS[operador.perfil] ?? 'bg-muted/10 text-muted-foreground border-border';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      draggable
      onDragStart={() => onDragStart(operador.id)}
      className={`flex items-center gap-1.5 bg-muted/60 border border-border rounded-lg cursor-grab active:cursor-grabbing select-none group hover:bg-muted hover:border-primary/30 transition-all ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'}`}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
      <span className={`font-medium text-foreground truncate ${compact ? 'text-xs max-w-[90px]' : 'text-sm max-w-[110px]'}`}>
        {operador.nome}
      </span>
      <span className={`inline-flex items-center rounded-full border font-medium flex-shrink-0 ${compact ? 'text-[9px] px-1 py-0 h-3.5' : 'text-[10px] px-1.5 py-0 h-4'} ${cargoCss}`}>
        {cargoLabel}
      </span>
      {setoresEmprestado.map(nome => (
        <span
          key={nome}
          title={`Clonado em ${nome} — o recebimento dele conta neste setor e em ${nome}.`}
          className={`inline-flex items-center gap-0.5 rounded-full border border-dashed border-primary/40 bg-primary/5 text-primary font-medium flex-shrink-0 ${compact ? 'text-[9px] px-1 py-0 h-3.5' : 'text-[10px] px-1.5 py-0 h-4'}`}
        >
          <Copy className={compact ? 'w-2 h-2' : 'w-2.5 h-2.5'} />
          {nome}
        </span>
      ))}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(operador.id)}
          className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
          title="Remover da equipe"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

interface DropZoneProps {
  equipeId: string | null;
  onDrop: (equipeId: string | null) => void;
  children: React.ReactNode;
  className?: string;
}

function DropZone({ equipeId, onDrop, children, className = '' }: DropZoneProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsOver(false);
        onDrop(equipeId);
      }}
      className={`transition-all rounded-xl ${
        isOver ? 'ring-2 ring-primary/60 bg-primary/5 scale-[1.01]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminEquipes() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();

  const isAdmin = perfil?.perfil === 'administrador' || perfil?.perfil === 'super_admin';
  // Permissão configurável para criar/editar/excluir equipes e membros.
  // Admin/super_admin sempre têm (temPermissao retorna true). Padrão = true
  // (espelha o acesso atual); desligar na tela de Cargos passa a restringir.
  const podeEditarEquipes = temPermissao('editar_equipes');

  const [setores, setSetores] = useState<Setor[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Setor selecionado no filtro ─────────────────────────────────────────────
  const [setorSelecionado, setSetorSelecionado] = useState<string>('');

  // ── Busca de membros disponíveis ────────────────────────────────────────────
  const [buscaMembro, setBuscaMembro] = useState('');

  // Estado para criação de nova equipe
  const [novaEquipeNome, setNovaEquipeNome] = useState('');
  const [showNovaEquipe, setShowNovaEquipe] = useState(false);
  const [criandoEquipe, setCriandoEquipe] = useState(false);

  // Estado para renomear equipe (edição inline no card)
  const [editandoEquipeId, setEditandoEquipeId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);

  // ── Clones (BookPlay): operador contando em mais de uma equipe ─────────────
  // null = tabela ausente (migration 20260712a pendente) → recurso oculto
  const [clones, setClones] = useState<CloneEquipe[] | null>(null);
  const [clonandoEquipeId, setClonandoEquipeId] = useState<string | null>(null);
  const clonesHabilitados = tenant.slug === 'bookplay' && clones !== null;
  // Setor escolhido no seletor de clone — começa no setor da própria equipe,
  // então o caso comum (clonar de dentro do setor) segue a um clique.
  const [cloneSetorSel, setCloneSetorSel] = useState<string>('');
  const [cloneCat, setCloneCat] = useState<CloneCatalogo>(CLONE_CATALOGO_VAZIO);

  const empresaId = empresa?.id;

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      let setoresQuery = supabase
        .from('setores')
        .select('id, nome')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (!isAdmin && perfil?.setor_id) {
        setoresQuery = setoresQuery.eq('id', perfil.setor_id) as typeof setoresQuery;
      }

      let equipesQuery = supabase
        .from('equipes')
        .select('id, nome, setor_id, empresa_id, treinamento, treinamento_inicio')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (!isAdmin && perfil?.setor_id) {
        equipesQuery = equipesQuery.eq('setor_id', perfil.setor_id) as typeof equipesQuery;
      }

      let operadoresQuery = supabase
        .from('perfis')
        .select('id, nome, email, perfil, setor_id, equipe_id, empresa_id')
        .eq('empresa_id', empresaId)
        .in('perfil', ['operador', 'lider', 'elite'])
        .order('nome');

      if (!isAdmin && perfil?.setor_id) {
        operadoresQuery = operadoresQuery.eq('setor_id', perfil.setor_id) as typeof operadoresQuery;
      }

      const [setoresRes, equipesRes, operadoresRes] = await Promise.all([
        setoresQuery,
        equipesQuery,
        operadoresQuery,
      ]);

      if (setoresRes.error) throw setoresRes.error;
      if (equipesRes.error) throw equipesRes.error;
      if (operadoresRes.error) throw operadoresRes.error;

      const setoresList = setoresRes.data ?? [];
      setSetores(setoresList);
      setEquipes(equipesRes.data ?? []);
      setOperadores(operadoresRes.data ?? []);
      setClones(await listarClonesEquipes(empresaId));

      // Auto-selecionar: líder vai para seu setor, admin para o primeiro da lista
      setSetorSelecionado(prev => {
        if (prev) return prev; // mantém seleção existente
        if (!isAdmin && perfil?.setor_id) return perfil.setor_id;
        return setoresList[0]?.id ?? '';
      });
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + (err?.message ?? 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }, [empresaId, isAdmin, perfil?.setor_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Catálogo da empresa p/ clone entre setores ────────────────────────────
  // Fetch separado e tolerante: o líder só carrega o próprio setor acima, mas
  // o clone precisa alcançar operadores de outros setores (o setor misto
  // empresta gente para play 4 / play 5). A RLS já permite — quem restringia
  // ao setor era só o filtro do front. Não alimenta o drag & drop.
  useEffect(() => {
    if (!empresaId || tenant.slug !== 'bookplay') { setCloneCat(CLONE_CATALOGO_VAZIO); return; }
    let cancel = false;
    void (async () => {
      const [s, e, o] = await Promise.all([
        supabase.from('setores').select('id, nome').eq('empresa_id', empresaId).order('nome'),
        supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId).order('nome'),
        supabase.from('perfis').select('id, nome, setor_id, equipe_id')
          .eq('empresa_id', empresaId).eq('ativo', true)
          .in('perfil', ['operador', 'lider', 'elite']).order('nome'),
      ]);
      if (cancel) return;
      setCloneCat({
        setores:    (s.data as CloneCatalogo['setores'])    ?? [],
        equipes:    (e.data as CloneCatalogo['equipes'])    ?? [],
        operadores: (o.data as CloneCatalogo['operadores']) ?? [],
      });
    })();
    return () => { cancel = true; };
  }, [empresaId, tenant.slug]);

  // ─── Derivados do setor selecionado ────────────────────────────────────────

  const setorAtual = setores.find(s => s.id === setorSelecionado);
  const equipesDoSetor = equipes.filter(e => e.setor_id === setorSelecionado);

  // Membros do setor selecionado
  const membrosDoSetor = operadores.filter(o => o.setor_id === setorSelecionado);
  // Membros sem equipe (disponíveis para alocar), com filtro de busca
  const membrosSemEquipe = membrosDoSetor.filter(o => !o.equipe_id).filter(o =>
    !buscaMembro || o.nome.toLowerCase().includes(buscaMembro.toLowerCase())
  );

  const operadoresDaEquipe = (equipeId: string) =>
    operadores.filter(o => o.equipe_id === equipeId);

  // Nomes de equipe/setor que podem estar fora do setor carregado: procura na
  // lista principal e cai no catálogo da empresa.
  const nomeEquipeQualquer = useCallback((id: string | null | undefined): string | null =>
    (id ? equipes.find(e => e.id === id)?.nome ?? cloneCat.equipes.find(e => e.id === id)?.nome : null) ?? null,
  [equipes, cloneCat.equipes]);

  const nomeSetorQualquer = useCallback((id: string | null | undefined): string | null =>
    (id ? setores.find(s => s.id === id)?.nome ?? cloneCat.setores.find(s => s.id === id)?.nome : null) ?? null,
  [setores, cloneCat.setores]);

  /** Operador de um clone — pode ser de outro setor, então resolve no catálogo. */
  const resolverOperadorClone = useCallback((operadorId: string): CloneOperadorInfo | null => {
    const l = operadores.find(o => o.id === operadorId);
    if (l) return { id: l.id, nome: l.nome, equipe_id: l.equipe_id, setor_id: l.setor_id };
    const c = cloneCat.operadores.find(o => o.id === operadorId);
    return c ? { id: c.id, nome: c.nome, equipe_id: c.equipe_id, setor_id: c.setor_id } : null;
  }, [operadores, cloneCat.operadores]);

  /** Clones alocados numa equipe (com o operador original resolvido). */
  const clonesDaEquipe = (equipeId: string) =>
    (clones ?? [])
      .filter(c => c.equipe_id === equipeId)
      .map(c => ({ clone: c, operador: resolverOperadorClone(c.operador_id) }))
      .filter((x): x is { clone: CloneEquipe; operador: CloneOperadorInfo } => !!x.operador);

  /** Setores (fora do dele) em que o operador está clonado. Alimenta a tag que
   *  aparece no card dele no setor de origem. */
  const setoresEmprestadoDoOperador = useCallback((operadorId: string, setorOrigem: string | null): string[] => {
    const nomes: string[] = [];
    const vistos = new Set<string>();
    for (const c of clones ?? []) {
      if (c.operador_id !== operadorId) continue;
      const sid = cloneCat.equipes.find(e => e.id === c.equipe_id)?.setor_id;
      if (!sid || sid === setorOrigem || vistos.has(sid)) continue;
      vistos.add(sid);
      const n = nomeSetorQualquer(sid);
      if (n) nomes.push(n);
    }
    return nomes;
  }, [clones, cloneCat.equipes, nomeSetorQualquer]);

  // ── Clonar operador para outra equipe ──────────────────────────────────────

  async function handleClonarOperador(equipe: Equipe, operadorId: string) {
    const operador = resolverOperadorClone(operadorId);
    if (!operador || !empresaId) return;
    const criado = await criarCloneEquipe(empresaId, equipe.id, operadorId, perfil?.id ?? null);
    if (!criado) { toast.error('Não foi possível clonar (já está nesta equipe?).'); return; }
    setClones(prev => [...(prev ?? []), criado]);
    setClonandoEquipeId(null);
    // Cruzou setor: o recebimento passa a contar nos dois setores, não só nas equipes.
    const outroSetor = !!operador.setor_id && operador.setor_id !== equipe.setor_id;
    const nomeSetorEquipe = nomeSetorQualquer(equipe.setor_id);
    toast.success(
      outroSetor && nomeSetorEquipe
        ? `${operador.nome} clonado para "${equipe.nome}" — o recebimento dele passa a contar também no setor ${nomeSetorEquipe}.`
        : `${operador.nome} clonado para "${equipe.nome}" — o recebimento dele passa a contar nas duas equipes.`,
    );
  }

  async function handleRemoverClone(cloneId: string, nomeOperador: string) {
    const ok = await removerCloneEquipe(cloneId);
    if (!ok) { toast.error('Erro ao remover clone.'); return; }
    setClones(prev => (prev ?? []).filter(c => c.id !== cloneId));
    toast.success(`Clone de ${nomeOperador} removido (segue normal na equipe original).`);
  }

  // Apaga TODOS os clones da empresa de uma vez (confirmação em dois cliques).
  const [confirmandoLimparClones, setConfirmandoLimparClones] = useState(false);
  const [limpandoClones, setLimpandoClones] = useState(false);
  async function handleLimparTodosClones() {
    if (!empresaId) return;
    setLimpandoClones(true);
    const n = await removerTodosClonesEmpresa(empresaId);
    setLimpandoClones(false);
    setConfirmandoLimparClones(false);
    if (n === null) { toast.error('Erro ao excluir os clones.'); return; }
    setClones([]);
    toast.success(n > 0
      ? `${n} clone${n !== 1 ? 's' : ''} excluído${n !== 1 ? 's' : ''}. Os operadores seguem normais nas equipes de origem.`
      : 'Nenhum clone para excluir.');
  }

  // Item 1: liga/desliga a contagem de recebimento do clone naquela equipe.
  async function handleToggleContaRecebimento(cloneId: string, conta: boolean) {
    const ok = await setCloneContaRecebimento(cloneId, conta);
    if (!ok) { toast.error('Erro ao alterar a contagem de recebimento.'); return; }
    setClones(prev => (prev ?? []).map(c => (c.id === cloneId ? { ...c, conta_recebimento: conta } : c)));
    toast.success(conta
      ? 'Recebimento deste clone passa a contar nesta equipe.'
      : 'Recebimento deste clone NÃO conta mais nesta equipe.');
  }

  const podeGerenciarSetorSelecionado = podeEditarEquipes && (isAdmin || setorSelecionado === perfil?.setor_id);

  // Stats do setor selecionado
  const totalMembros = membrosDoSetor.length;
  const totalAlocados = membrosDoSetor.filter(o => o.equipe_id).length;

  // ─── Criar equipe ──────────────────────────────────────────────────────────

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
      const { error } = await supabase.from('equipes').insert({
        nome,
        setor_id: setorSelecionado,
        empresa_id: empresaId,
      });
      if (error) throw error;
      toast.success(`Equipe "${nome}" criada com sucesso!`);
      setNovaEquipeNome('');
      setShowNovaEquipe(false);
      await loadData();
    } catch (err: any) {
      toast.error('Erro ao criar equipe: ' + (err?.message ?? 'Erro desconhecido'));
    } finally {
      setCriandoEquipe(false);
    }
  }

  // ─── Excluir equipe ────────────────────────────────────────────────────────

  async function handleExcluirEquipe(equipe: Equipe) {
    if (!isAdmin && equipe.setor_id !== perfil?.setor_id) {
      toast.error('Você só pode excluir equipes do seu próprio setor.');
      return;
    }

    const membros = operadoresDaEquipe(equipe.id);
    if (membros.length > 0) {
      toast.error('Remova todos os membros antes de excluir a equipe.');
      return;
    }
    try {
      const { error } = await supabase.from('equipes').delete().eq('id', equipe.id);
      if (error) throw error;
      toast.success(`Equipe "${equipe.nome}" excluída.`);
      await loadData();
    } catch (err: any) {
      toast.error('Erro ao excluir equipe: ' + (err?.message ?? 'Erro desconhecido'));
    }
  }

  // ─── Renomear equipe ─────────────────────────────────────────────────────────

  function iniciarEdicaoNome(equipe: Equipe) {
    setEditandoEquipeId(equipe.id);
    setEditNome(equipe.nome);
  }

  function cancelarEdicaoNome() {
    setEditandoEquipeId(null);
    setEditNome('');
  }

  async function handleRenomearEquipe(equipe: Equipe) {
    if (!isAdmin && equipe.setor_id !== perfil?.setor_id) {
      toast.error('Você só pode editar equipes do seu próprio setor.');
      return;
    }
    const nome = editNome.trim();
    if (!nome) { toast.error('Informe o nome da equipe.'); return; }
    if (nome === equipe.nome) { cancelarEdicaoNome(); return; }
    setSalvandoNome(true);
    try {
      const { error } = await supabase.from('equipes').update({ nome }).eq('id', equipe.id);
      if (error) throw error;
      toast.success('Nome da equipe atualizado.');
      cancelarEdicaoNome();
      await loadData();
    } catch (err: any) {
      toast.error('Erro ao renomear equipe: ' + (err?.message ?? 'Erro desconhecido'));
    } finally {
      setSalvandoNome(false);
    }
  }

  // ─── Marcar/desmarcar equipe como treinamento ──────────────────────────────

  async function handleToggleTreinamento(equipe: Equipe) {
    if (!isAdmin && equipe.setor_id !== perfil?.setor_id) {
      toast.error('Você só pode editar equipes do seu próprio setor.');
      return;
    }
    const novo = !equipe.treinamento;
    // Atualização otimista
    setEquipes(prev => prev.map(e => e.id === equipe.id ? { ...e, treinamento: novo } : e));
    try {
      const { error } = await supabase.from('equipes').update({ treinamento: novo }).eq('id', equipe.id);
      if (error) throw error;
      toast.success(
        novo
          ? `"${equipe.nome}" marcada como treinamento. Configure a data de início e os dias úteis na aba Metas.`
          : `"${equipe.nome}" não é mais equipe de treinamento.`,
      );
    } catch (err: any) {
      toast.error('Erro ao atualizar equipe: ' + (err?.message ?? 'Erro desconhecido'));
      setEquipes(prev => prev.map(e => e.id === equipe.id ? { ...e, treinamento: equipe.treinamento } : e));
    }
  }

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  function handleDragStart(operadorId: string) {
    draggedOperadorId = operadorId;
  }

  async function handleDrop(equipeId: string | null) {
    const operadorId = draggedOperadorId;
    draggedOperadorId = null;
    if (!operadorId) return;

    const operador = operadores.find(o => o.id === operadorId);
    if (!operador) return;
    if (operador.equipe_id === equipeId) return;

    if (!isAdmin) {
      if (equipeId !== null) {
        const equipeDestino = equipes.find(e => e.id === equipeId);
        if (!equipeDestino || equipeDestino.setor_id !== perfil?.setor_id) {
          toast.error('Você só pode mover membros dentro do seu próprio setor.');
          return;
        }
      }
      if (operador.setor_id !== perfil?.setor_id) {
        toast.error('Você só pode mover membros dentro do seu próprio setor.');
        return;
      }
    }

    // Atualização otimista
    setOperadores(prev =>
      prev.map(o => o.id === operadorId ? { ...o, equipe_id: equipeId } : o)
    );

    try {
      const { error } = await supabase
        .from('perfis')
        .update({ equipe_id: equipeId })
        .eq('id', operadorId);
      if (error) throw error;

      const equipeNome = equipeId
        ? equipes.find(e => e.id === equipeId)?.nome ?? 'equipe'
        : null;

      toast.success(
        equipeNome
          ? `${operador.nome} → "${equipeNome}"`
          : `${operador.nome} removido de equipe`
      );
    } catch (err: any) {
      toast.error('Erro ao mover membro: ' + (err?.message ?? 'Erro desconhecido'));
      setOperadores(prev =>
        prev.map(o => o.id === operadorId ? { ...o, equipe_id: operador.equipe_id } : o)
      );
    }
  }

  async function handleRemoverDaEquipe(operadorId: string) {
    const operador = operadores.find(o => o.id === operadorId);
    if (!operador) return;

    if (!isAdmin && operador.setor_id !== perfil?.setor_id) {
      toast.error('Você só pode gerenciar membros do seu próprio setor.');
      return;
    }

    setOperadores(prev =>
      prev.map(o => o.id === operadorId ? { ...o, equipe_id: null } : o)
    );

    try {
      const { error } = await supabase
        .from('perfis')
        .update({ equipe_id: null })
        .eq('id', operadorId);
      if (error) throw error;
      toast.success(`${operador.nome} removido da equipe.`);
    } catch (err: any) {
      toast.error('Erro ao remover membro: ' + (err?.message ?? 'Erro desconhecido'));
      setOperadores(prev =>
        prev.map(o => o.id === operadorId ? { ...o, equipe_id: operador.equipe_id } : o)
      );
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm">Carregando equipes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Gestão de Equipes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? 'Selecione um setor para visualizar e organizar as equipes.'
              : 'Gerencie os membros e equipes do seu setor.'}
          </p>
        </div>

        {/* Excluir todos os clones (admin, BookPlay) — confirmação em 2 cliques */}
        {isAdmin && clonesHabilitados && (clones?.length ?? 0) > 0 && (
          confirmandoLimparClones ? (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
              <span className="text-xs text-foreground">
                Excluir os <strong>{clones?.length}</strong> clones da empresa?
              </span>
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                disabled={limpandoClones} onClick={handleLimparTodosClones}>
                <Trash2 className="w-3.5 h-3.5" /> {limpandoClones ? 'Excluindo…' : 'Confirmar'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                disabled={limpandoClones} onClick={() => setConfirmandoLimparClones(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmandoLimparClones(true)}>
              <Trash2 className="w-4 h-4" /> Excluir todos os clones ({clones?.length})
            </Button>
          )
        )}
      </motion.div>

      {/* ── Seletor de Setor ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card"
      >
        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
          <Building2 className="w-4 h-4" />
          <span className="text-sm font-medium">Setor:</span>
        </div>

        {setores.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhum setor cadastrado.</p>
        ) : (
          <div className="flex-1 max-w-xs">
            <Select value={setorSelecionado || 'none'} onValueChange={v => {
              setSetorSelecionado(v === 'none' ? '' : v);
              setBuscaMembro('');
              setShowNovaEquipe(false);
            }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione um setor..." />
              </SelectTrigger>
              <SelectContent>
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Stats do setor selecionado */}
        {setorAtual && (
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <strong className="text-foreground">{totalMembros}</strong> membros
            </span>
            <span className="flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              <strong className="text-foreground">{totalAlocados}</strong> alocados
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              <strong className="text-foreground">{equipesDoSetor.length}</strong> equipes
            </span>
          </div>
        )}
      </motion.div>

      {/* ── Conteúdo principal — só exibe quando setor está selecionado ───── */}
      <AnimatePresence mode="wait">
        {!setorSelecionado ? (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Building2 className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Selecione um setor para começar</p>
                <p className="text-xs opacity-70">As equipes e membros aparecerão aqui</p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key={setorSelecionado}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5"
          >
            {/* ── Coluna esquerda: Membros disponíveis ──────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Membros disponíveis
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    {membrosSemEquipe.length}
                  </Badge>
                </h2>
              </div>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar membro..."
                  value={buscaMembro}
                  onChange={e => setBuscaMembro(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {/* Lista de membros sem equipe */}
              <DropZone equipeId={null} onDrop={handleDrop} className="min-h-[120px]">
                <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-3 min-h-[120px]">
                  {membrosSemEquipe.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-muted-foreground/50 gap-2">
                      <UserCheck className="w-6 h-6" />
                      <p className="text-xs text-center">
                        {buscaMembro
                          ? 'Nenhum membro encontrado'
                          : 'Todos os membros estão em equipes'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <AnimatePresence>
                        {membrosSemEquipe.map(op => (
                          <OperadorChip
                            key={op.id}
                            operador={op}
                            onDragStart={handleDragStart}
                            compact
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </DropZone>

              <p className="text-[11px] text-muted-foreground/60 text-center">
                Arraste membros para uma equipe →
              </p>
            </div>

            {/* ── Coluna direita: Equipes ───────────────────────────────── */}
            <div className="space-y-3">
              {/* Header equipes + botão criar */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Equipes
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    {equipesDoSetor.length}
                  </Badge>
                </h2>
                {podeGerenciarSetorSelecionado && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => { setShowNovaEquipe(v => !v); setNovaEquipeNome(''); }}
                  >
                    {showNovaEquipe ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showNovaEquipe ? 'Cancelar' : 'Nova Equipe'}
                  </Button>
                )}
              </div>

              {/* Input criar nova equipe */}
              <AnimatePresence>
                {showNovaEquipe && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-2 overflow-hidden"
                  >
                    <Input
                      autoFocus
                      placeholder="Nome da equipe..."
                      value={novaEquipeNome}
                      onChange={e => setNovaEquipeNome(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCriarEquipe();
                        if (e.key === 'Escape') { setShowNovaEquipe(false); setNovaEquipeNome(''); }
                      }}
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleCriarEquipe}
                      disabled={criandoEquipe}
                      className="h-8 px-4"
                    >
                      {criandoEquipe ? (
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      ) : 'Criar'}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Grid de equipes */}
              {equipesDoSetor.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                    <Layers className="w-8 h-8 opacity-20" />
                    <p className="text-sm">Nenhuma equipe neste setor.</p>
                    {podeGerenciarSetorSelecionado && (
                      <Button
                        variant="outline" size="sm" className="text-xs gap-1"
                        onClick={() => setShowNovaEquipe(true)}
                      >
                        <Plus className="w-3.5 h-3.5" /> Criar primeira equipe
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {equipesDoSetor.map((equipe, idx) => {
                    const membros = operadoresDaEquipe(equipe.id);
                    const podeGerenciarEquipe = podeEditarEquipes && (isAdmin || equipe.setor_id === perfil?.setor_id);
                    return (
                      <motion.div
                        key={equipe.id}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <DropZone equipeId={equipe.id} onDrop={handleDrop} className="h-full">
                          <div className="border border-border rounded-xl bg-card h-full flex flex-col overflow-hidden hover:border-primary/30 transition-colors">
                            {/* Header da equipe */}
                            <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 border-b border-border">
                              {editandoEquipeId === equipe.id ? (
                                <div className="flex items-center gap-1 min-w-0 flex-1">
                                  <Input
                                    autoFocus
                                    value={editNome}
                                    onChange={(e) => setEditNome(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRenomearEquipe(equipe);
                                      if (e.key === 'Escape') cancelarEdicaoNome();
                                    }}
                                    disabled={salvandoNome}
                                    className="h-7 text-sm"
                                  />
                                  <button
                                    type="button"
                                    title="Salvar nome"
                                    onClick={() => handleRenomearEquipe(equipe)}
                                    disabled={salvandoNome}
                                    className="p-1 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Cancelar"
                                    onClick={cancelarEdicaoNome}
                                    disabled={salvandoNome}
                                    className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-foreground truncate">
                                      {equipe.nome}
                                    </span>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
                                      {membros.length}
                                    </Badge>
                                    {equipe.treinamento && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 shrink-0 gap-0.5 border-amber-500/40 bg-amber-500/10 text-amber-600"
                                        title="Equipe de treinamento — dias úteis configurados na aba Metas"
                                      >
                                        <GraduationCap className="w-3 h-3" /> Treino
                                      </Badge>
                                    )}
                                  </div>
                                  {podeGerenciarEquipe && (
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        title={equipe.treinamento ? 'Desmarcar equipe de treinamento' : 'Marcar como equipe de treinamento'}
                                        onClick={() => handleToggleTreinamento(equipe)}
                                        className={`p-1 rounded transition-colors ${
                                          equipe.treinamento
                                            ? 'text-amber-600 bg-amber-500/10'
                                            : 'text-muted-foreground/50 hover:text-amber-600 hover:bg-amber-500/10'
                                        }`}
                                      >
                                        <GraduationCap className="w-3.5 h-3.5" />
                                      </button>
                                      {clonesHabilitados && (
                                        <button
                                          type="button"
                                          title="Clonar operador de outra equipe ou de outro setor (o recebimento conta nos dois)"
                                          onClick={() => {
                                            setClonandoEquipeId(prev => (prev === equipe.id ? null : equipe.id));
                                            setCloneSetorSel('');  // reabre no setor da própria equipe
                                          }}
                                          className={`p-1 rounded transition-colors ${
                                            clonandoEquipeId === equipe.id
                                              ? 'text-primary bg-primary/10'
                                              : 'text-muted-foreground/50 hover:text-primary hover:bg-primary/10'
                                          }`}
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        title="Editar nome da equipe"
                                        onClick={() => iniciarEdicaoNome(equipe)}
                                        className="p-1 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        title="Excluir equipe (somente se vazia)"
                                        onClick={() => handleExcluirEquipe(equipe)}
                                        className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Membros da equipe */}
                            <div className="p-2.5 flex-1 min-h-[80px]">
                              {/* Seletor de clone (aberto pelo botão de copiar no header) */}
                              {clonesHabilitados && clonandoEquipeId === equipe.id && (() => {
                                // Passo 1: setor de origem (começa no da própria equipe).
                                // Passo 2: operadores daquele setor que ainda não estão aqui.
                                const setorBusca = cloneSetorSel || equipe.setor_id;
                                const candidatos = cloneCat.operadores.filter(o =>
                                  o.setor_id === setorBusca
                                  && o.equipe_id
                                  && o.equipe_id !== equipe.id
                                  && !clonesDaEquipe(equipe.id).some(c => c.operador.id === o.id));
                                const cruzandoSetor = setorBusca !== equipe.setor_id;
                                return (
                                  <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                                      <Copy className="w-3 h-3" /> Clonar operador para esta equipe
                                    </p>
                                    <Select value={setorBusca} onValueChange={setCloneSetorSel}>
                                      <SelectTrigger className="h-7 text-xs bg-background">
                                        <SelectValue placeholder="Setor…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {cloneCat.setores.map(s => (
                                          <SelectItem key={s.id} value={s.id}>
                                            {s.nome}
                                            {s.id === equipe.setor_id && (
                                              <span className="text-muted-foreground ml-1.5">(este setor)</span>
                                            )}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select onValueChange={v => void handleClonarOperador(equipe, v)}>
                                      <SelectTrigger className="h-7 text-xs bg-background">
                                        <SelectValue placeholder="Escolha o operador…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {candidatos.length === 0 ? (
                                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                            Nenhum operador com equipe neste setor.
                                          </div>
                                        ) : candidatos.map(o => (
                                          <SelectItem key={o.id} value={o.id}>
                                            {o.nome}
                                            <span className="text-muted-foreground ml-1.5">
                                              ({nomeEquipeQualquer(o.equipe_id) ?? 'equipe'})
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground">
                                      {cruzandoSetor
                                        ? `Operador de outro setor: o recebimento dele conta no setor de origem dele e também em ${nomeSetorQualquer(equipe.setor_id) ?? 'este setor'}.`
                                        : 'O recebimento do analítico dele passa a contar nas duas equipes.'}
                                    </p>
                                  </div>
                                );
                              })()}

                              <div className="flex flex-col gap-1.5 min-h-[60px]">
                                <AnimatePresence>
                                  {membros.length === 0 && clonesDaEquipe(equipe.id).length === 0 ? (
                                    <div className="flex items-center justify-center h-12 text-muted-foreground/40 text-[11px] italic">
                                      Arraste membros aqui
                                    </div>
                                  ) : (
                                    membros.map(op => (
                                      <OperadorChip
                                        key={op.id}
                                        operador={op}
                                        onRemove={podeGerenciarEquipe ? handleRemoverDaEquipe : undefined}
                                        onDragStart={handleDragStart}
                                        compact
                                        setoresEmprestado={
                                          clonesHabilitados
                                            ? setoresEmprestadoDoOperador(op.id, op.setor_id)
                                            : []
                                        }
                                      />
                                    ))
                                  )}
                                </AnimatePresence>

                                {/* Clones — vinculados ao operador original */}
                                {clonesHabilitados && clonesDaEquipe(equipe.id).map(({ clone, operador }) => {
                                  // Veio de outro setor: mostra o setor de origem, não só a equipe
                                  const deOutroSetor = !!operador.setor_id && operador.setor_id !== equipe.setor_id;
                                  const origem = deOutroSetor
                                    ? nomeSetorQualquer(operador.setor_id) ?? 'outro setor'
                                    : nomeEquipeQualquer(operador.equipe_id) ?? 'equipe';
                                  return (
                                  <div
                                    key={clone.id}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 select-none group"
                                    title={
                                      deOutroSetor
                                        ? `Clone de ${operador.nome} — original no setor "${origem}", equipe "${nomeEquipeQualquer(operador.equipe_id) ?? '?'}". O recebimento conta nos dois setores.`
                                        : `Clone de ${operador.nome} — original na equipe "${origem}". O recebimento conta nas duas equipes.`
                                    }
                                  >
                                    <Copy className="w-3 h-3 text-primary/60 flex-shrink-0" />
                                    <span className="font-medium text-foreground truncate text-xs max-w-[90px]">
                                      {operador.nome}
                                    </span>
                                    <span className="inline-flex items-center rounded-full border border-primary/30 text-primary font-medium flex-shrink-0 text-[9px] px-1 py-0 h-3.5">
                                      clone de {origem}
                                    </span>
                                    {/* Item 1: caixinha de contar recebimento nesta equipe */}
                                    <label
                                      className="flex items-center gap-0.5 flex-shrink-0 cursor-pointer"
                                      title="Contar o recebimento deste clone nesta equipe (desligado = não conta aqui nem no setor dela; o setor de origem continua contando)"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={clone.conta_recebimento !== false}
                                        disabled={!podeGerenciarEquipe}
                                        onChange={e => void handleToggleContaRecebimento(clone.id, e.target.checked)}
                                        className="h-3 w-3 accent-primary cursor-pointer disabled:cursor-not-allowed"
                                      />
                                      <span className="text-[9px] text-muted-foreground">receb.</span>
                                    </label>
                                    {podeGerenciarEquipe && (
                                      <button
                                        type="button"
                                        onClick={() => void handleRemoverClone(clone.id, operador.nome)}
                                        className="ml-auto text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                        title="Remover clone (não afeta a equipe original)"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </DropZone>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
