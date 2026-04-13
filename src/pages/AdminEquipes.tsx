import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Users,
  Plus,
  X,
  GripVertical,
  Building2,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';

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

// ─── Drag state (module-level ref, avoids stale closure issues) ───────────────
let draggedOperadorId: string | null = null;

// ─── Chip de Operador ─────────────────────────────────────────────────────────

interface OperadorChipProps {
  operador: Operador;
  onRemove?: (operadorId: string) => void;
  onDragStart: (operadorId: string) => void;
}

function OperadorChip({ operador, onRemove, onDragStart }: OperadorChipProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      draggable
      onDragStart={() => onDragStart(operador.id)}
      className="flex items-center gap-1.5 bg-muted/60 border border-border rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing select-none group hover:bg-muted transition-colors"
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
      <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
        {operador.nome}
      </span>
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 h-4 capitalize flex-shrink-0"
      >
        {operador.perfil}
      </Badge>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(operador.id)}
          className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
          title="Remover da equipe"
        >
          <X className="w-3.5 h-3.5" />
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
      className={`transition-all rounded-lg ${
        isOver ? 'ring-2 ring-primary/50 bg-primary/5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminEquipes() {
  const { user } = useAuth();
  const { empresa } = useEmpresa();

  const [setores, setSetores] = useState<Setor[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);

  // Controla quais setores estão expandidos
  const [expandedSetores, setExpandedSetores] = useState<Record<string, boolean>>({});

  // Estado para criação de nova equipe por setor
  const [novaEquipe, setNovaEquipe] = useState<Record<string, string>>({}); // setor_id -> nome
  const [criandoEquipe, setCriandoEquipe] = useState<Record<string, boolean>>({}); // setor_id -> loading
  const [showInput, setShowInput] = useState<Record<string, boolean>>({}); // setor_id -> show

  const empresaId = empresa?.id;

  // ─── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [setoresRes, equipesRes, operadoresRes] = await Promise.all([
        supabase
          .from('setores')
          .select('id, nome')
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('equipes')
          .select('id, nome, setor_id, empresa_id')
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('perfis')
          .select('id, nome, email, perfil, setor_id, equipe_id, empresa_id')
          .eq('empresa_id', empresaId)
          .eq('perfil', 'operador')
          .order('nome'),
      ]);

      if (setoresRes.error) throw setoresRes.error;
      if (equipesRes.error) throw equipesRes.error;
      if (operadoresRes.error) throw operadoresRes.error;

      setSetores(setoresRes.data ?? []);
      setEquipes(equipesRes.data ?? []);
      setOperadores(operadoresRes.data ?? []);

      // Expand todos os setores por padrão
      const expanded: Record<string, boolean> = {};
      (setoresRes.data ?? []).forEach((s: Setor) => { expanded[s.id] = true; });
      setExpandedSetores(prev =>
        Object.keys(prev).length === 0 ? expanded : prev
      );
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + (err?.message ?? 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const toggleSetor = (setorId: string) =>
    setExpandedSetores(prev => ({ ...prev, [setorId]: !prev[setorId] }));

  const equipesDoSetor = (setorId: string) =>
    equipes.filter(e => e.setor_id === setorId);

  const operadoresDaEquipe = (equipeId: string) =>
    operadores.filter(o => o.equipe_id === equipeId);

  const operadoresSemEquipe = operadores.filter(o => !o.equipe_id);

  // ─── Criar equipe ──────────────────────────────────────────────────────────

  async function handleCriarEquipe(setorId: string) {
    const nome = (novaEquipe[setorId] ?? '').trim();
    if (!nome) { toast.error('Informe o nome da equipe.'); return; }
    if (!empresaId) return;

    setCriandoEquipe(prev => ({ ...prev, [setorId]: true }));
    try {
      const { error } = await supabase.from('equipes').insert({
        nome,
        setor_id: setorId,
        empresa_id: empresaId,
      });
      if (error) throw error;
      toast.success(`Equipe "${nome}" criada com sucesso!`);
      setNovaEquipe(prev => ({ ...prev, [setorId]: '' }));
      setShowInput(prev => ({ ...prev, [setorId]: false }));
      await loadData();
    } catch (err: any) {
      toast.error('Erro ao criar equipe: ' + (err?.message ?? 'Erro desconhecido'));
    } finally {
      setCriandoEquipe(prev => ({ ...prev, [setorId]: false }));
    }
  }

  // ─── Excluir equipe ────────────────────────────────────────────────────────

  async function handleExcluirEquipe(equipe: Equipe) {
    const membros = operadoresDaEquipe(equipe.id);
    if (membros.length > 0) {
      toast.error('Remova todos os operadores antes de excluir a equipe.');
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
    if (operador.equipe_id === equipeId) return; // nada mudou

    // Otimista: atualiza localmente
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
          ? `${operador.nome} movido para "${equipeNome}".`
          : `${operador.nome} removido de equipe.`
      );
    } catch (err: any) {
      toast.error('Erro ao mover operador: ' + (err?.message ?? 'Erro desconhecido'));
      // Reverte
      setOperadores(prev =>
        prev.map(o => o.id === operadorId ? { ...o, equipe_id: operador.equipe_id } : o)
      );
    }
  }

  // ─── Remover operador da equipe ────────────────────────────────────────────

  async function handleRemoverDaEquipe(operadorId: string) {
    const operador = operadores.find(o => o.id === operadorId);
    if (!operador) return;

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
      toast.error('Erro ao remover operador: ' + (err?.message ?? 'Erro desconhecido'));
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
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Gestão de Equipes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize operadores em equipes dentro de cada setor. Arraste para mover entre equipes.
          </p>
        </div>
      </motion.div>

      {/* Setores */}
      {setores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Building2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhum setor encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {setores.map((setor, idx) => {
            const eqs = equipesDoSetor(setor.id);
            const expanded = expandedSetores[setor.id] ?? true;

            return (
              <motion.div
                key={setor.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="overflow-hidden">
                  {/* Cabeçalho do setor */}
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => toggleSetor(setor.id)}
                  >
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        {setor.nome}
                        <Badge variant="outline" className="text-xs font-normal">
                          {eqs.length} equipe{eqs.length !== 1 ? 's' : ''}
                        </Badge>
                      </CardTitle>
                      {expanded
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </CardHeader>
                  </button>

                  <AnimatePresence>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <CardContent className="p-4 space-y-3">
                          {/* Equipes do setor */}
                          {eqs.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-3">
                              Nenhuma equipe neste setor.
                            </p>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {eqs.map(equipe => {
                              const membros = operadoresDaEquipe(equipe.id);
                              return (
                                <DropZone
                                  key={equipe.id}
                                  equipeId={equipe.id}
                                  onDrop={handleDrop}
                                  className="h-full"
                                >
                                  <div className="border border-border rounded-xl p-3 bg-background h-full flex flex-col gap-2">
                                    {/* Header da equipe */}
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-semibold text-foreground truncate">
                                        {equipe.nome}
                                      </span>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <Badge variant="secondary" className="text-[10px] px-1.5">
                                          {membros.length}
                                        </Badge>
                                        <button
                                          type="button"
                                          title="Excluir equipe (somente se vazia)"
                                          onClick={() => handleExcluirEquipe(equipe)}
                                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Membros */}
                                    <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                                      <AnimatePresence>
                                        {membros.length === 0 ? (
                                          <p className="text-[11px] text-muted-foreground/60 italic w-full text-center py-2">
                                            Arraste operadores aqui
                                          </p>
                                        ) : (
                                          membros.map(op => (
                                            <OperadorChip
                                              key={op.id}
                                              operador={op}
                                              onRemove={handleRemoverDaEquipe}
                                              onDragStart={handleDragStart}
                                            />
                                          ))
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  </div>
                                </DropZone>
                              );
                            })}
                          </div>

                          {/* Criar nova equipe */}
                          <div className="pt-1">
                            <AnimatePresence>
                              {showInput[setor.id] ? (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="flex gap-2"
                                >
                                  <Input
                                    autoFocus
                                    placeholder="Nome da equipe..."
                                    value={novaEquipe[setor.id] ?? ''}
                                    onChange={e =>
                                      setNovaEquipe(prev => ({ ...prev, [setor.id]: e.target.value }))
                                    }
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleCriarEquipe(setor.id);
                                      if (e.key === 'Escape')
                                        setShowInput(prev => ({ ...prev, [setor.id]: false }));
                                    }}
                                    className="h-8 text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleCriarEquipe(setor.id)}
                                    disabled={criandoEquipe[setor.id]}
                                    className="h-8"
                                  >
                                    {criandoEquipe[setor.id] ? (
                                      <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                    ) : (
                                      'Criar'
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setShowInput(prev => ({ ...prev, [setor.id]: false }))
                                    }
                                    className="h-8"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </motion.div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-muted-foreground hover:text-foreground gap-1"
                                  onClick={() =>
                                    setShowInput(prev => ({ ...prev, [setor.id]: true }))
                                  }
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Nova Equipe
                                </Button>
                              )}
                            </AnimatePresence>
                          </div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Operadores sem equipe */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: setores.length * 0.05 + 0.1 }}
      >
        <DropZone equipeId={null} onDrop={handleDrop}>
          <Card className="border-dashed border-muted-foreground/30">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Operadores sem equipe
                <Badge variant="outline" className="text-xs font-normal">
                  {operadoresSemEquipe.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {operadoresSemEquipe.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic text-center py-4">
                  Todos os operadores estão alocados em equipes.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>
                    {operadoresSemEquipe.map(op => (
                      <OperadorChip
                        key={op.id}
                        operador={op}
                        onDragStart={handleDragStart}
                        // Sem botão de remover pois já está sem equipe
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </DropZone>
      </motion.div>
    </div>
  );
}
