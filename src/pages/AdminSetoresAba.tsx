/**
 * AdminSetoresAba.tsx — Aba "Setores" dentro de Usuários, com reordenação
 * via drag-and-drop (estilo igual à aba Equipes).
 *
 * Fluxo:
 *  - Lista os setores da empresa atual em cards.
 *  - Permite criar novo setor, editar nome/descrição e ativar/desativar.
 *  - A ordem de exibição é reordenável via DnD nativo HTML5 (mesmo padrão
 *    usado em AdminEquipes.tsx para mover membros entre equipes).
 *  - Cada card expande a lista de usuários do setor (limite de 20, com
 *    "mostrar todos") e permite transferir cada usuário para outro setor.
 *
 * Persistência da ordem:
 *  - Como a tabela `setores` não possui coluna `ordem`, guardamos a ordem
 *    em localStorage via helpers em `@/lib/setores-ordem`.
 *  - Setores novos entram no final; setores ausentes na lista de ordem
 *    são exibidos depois, alfabeticamente.
 *
 * Observação: esta é a única tela de setores. A antiga página standalone
 * `AdminSetores.tsx` (rota /admin/setores) foi removida — a rota agora
 * redireciona para esta aba dentro de /admin/usuarios.
 *
 * Gate de acesso: visível/acessível apenas para perfis Gerência ou acima
 * (gerencia, diretoria, administrador, super_admin). A verificação é feita
 * pelo consumidor (AdminUsuarios.tsx) antes de montar este componente;
 * o componente em si também faz defesa-em-profundidade.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  GripVertical,
  Edit,
  Save,
  X,
  Power,
  Users,
  ChevronDown,
  ArrowRightLeft,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase, Setor, Perfil } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';
import {
  aplicarOrdemSetores,
  lerOrdemSetores,
  salvarOrdemSetores,
} from '@/lib/setores-ordem';

// ─── Drag state (module-level, evita stale closures) ────────────────────────
let draggedSetorId: string | null = null;

/** Perfil exibido numa lista de setor; `_cloneDe` marca um clone de outro setor
 *  (nome do setor de origem) — item 12. */
type PerfilComClone = Perfil & { _cloneDe?: string | null };

// Quantos usuários mostrar por setor antes do "ver todos"
const LIMITE_USUARIOS = 20;

// ─── Gate helper (usado localmente) ─────────────────────────────────────────
const PERFIS_GERENCIA_OU_ACIMA = [
  'gerencia',
  'diretoria',
  'administrador',
  'super_admin',
];

function temAcessoSetores(perfil: string | undefined): boolean {
  return !!perfil && PERFIS_GERENCIA_OU_ACIMA.includes(perfil);
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function AdminSetoresAba() {
  const { perfil: perfilAtual } = useAuth();
  const { empresa: empresaAtual } = useEmpresa();
  const tenant = useTenant();

  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog criar/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Setor | null>(null);
  const [form, setForm] = useState<{ nome: string; descricao: string; ativo: boolean; alternativo: boolean }>({
    nome: '',
    descricao: '',
    ativo: true,
    alternativo: false,
  });

  // Lista de usuários por setor
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  // Item 12 (BookPlay): operadores clonados em equipe de OUTRO setor aparecem
  // na lista do setor destino, com tag "clone de <setor de origem>".
  const [clonesCross, setClonesCross] = useState<{ operadorId: string; destinoSetorId: string }[]>([]);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [verTodos, setVerTodos] = useState<Set<string>>(new Set());

  // Transferência de setor — aceita 1 ou vários usuários de uma vez
  const [transferindo, setTransferindo] = useState<Perfil[] | null>(null);
  const [transferAlvo, setTransferAlvo] = useState<string>('');
  const [transfSalvando, setTransfSalvando] = useState(false);
  // Seleção múltipla via checkbox nas listas de usuários
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const acessoOk = temAcessoSetores(perfilAtual?.perfil);

  const fetchSetores = useCallback(async () => {
    if (!empresaAtual?.id) {
      setSetores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('setores')
        .select('*')
        .eq('empresa_id', empresaAtual.id)
        .order('nome');
      if (error) {
        console.warn('[AdminSetoresAba] fetchSetores error:', error.message);
        setSetores([]);
      } else {
        const lista = aplicarOrdemSetores((data as Setor[]) || [], empresaAtual.id);
        setSetores(lista);
      }
    } finally {
      setLoading(false);
    }
  }, [empresaAtual?.id]);

  const fetchPerfis = useCallback(async () => {
    if (!empresaAtual?.id) {
      setPerfis([]);
      return;
    }
    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, perfil, setor_id, foto_url, usuario')
      .eq('empresa_id', empresaAtual.id)
      .order('nome');
    if (error) {
      console.warn('[AdminSetoresAba] fetchPerfis error:', error.message);
      setPerfis([]);
    } else {
      setPerfis((data as Perfil[]) || []);
    }
  }, [empresaAtual?.id]);

  useEffect(() => {
    fetchSetores();
    fetchPerfis();
  }, [fetchSetores, fetchPerfis]);

  // Item 12: carrega os clones (operador→equipe) e resolve o setor destino de
  // cada equipe. Só cross-setor entra na lista (o filtro final é no memo).
  useEffect(() => {
    if (!empresaAtual?.id || tenant.slug !== 'bookplay') { setClonesCross([]); return; }
    let cancel = false;
    void (async () => {
      const [clones, equipesData] = await Promise.all([
        supabase.from('equipe_operadores_clones').select('operador_id, equipe_id').eq('empresa_id', empresaAtual.id),
        supabase.from('equipes').select('id, setor_id').eq('empresa_id', empresaAtual.id),
      ]);
      if (cancel) return;
      const setorDaEquipe = new Map<string, string | null>();
      for (const e of (equipesData.data as { id: string; setor_id: string | null }[]) ?? []) {
        setorDaEquipe.set(e.id, e.setor_id ?? null);
      }
      const out: { operadorId: string; destinoSetorId: string }[] = [];
      const seen = new Set<string>();
      for (const c of (clones.data as { operador_id: string; equipe_id: string }[]) ?? []) {
        const destino = setorDaEquipe.get(c.equipe_id);
        if (!destino) continue;
        const key = `${c.operador_id}::${destino}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ operadorId: c.operador_id, destinoSetorId: destino });
      }
      setClonesCross(out);
    })();
    return () => { cancel = true; };
  }, [empresaAtual?.id, tenant.slug]);

  // Usuários agrupados por setor_id. Inclui os clones de OUTRO setor no setor
  // destino, marcados com `_cloneDe` (nome do setor de origem) para exibir a tag.
  const perfisPorSetor = useMemo(() => {
    const map: Record<string, PerfilComClone[]> = {};
    for (const p of perfis) {
      if (!p.setor_id) continue;
      (map[p.setor_id] ??= []).push(p);
    }
    const nomeSetor = (id: string | null) => (id ? setores.find(s => s.id === id)?.nome ?? null : null);
    const perfilPorId = new Map(perfis.map(p => [p.id, p]));
    for (const c of clonesCross) {
      const p = perfilPorId.get(c.operadorId);
      if (!p || !p.setor_id || p.setor_id === c.destinoSetorId) continue;  // só cross-setor
      const destino = (map[c.destinoSetorId] ??= []);
      if (destino.some(x => x.id === p.id)) continue;  // já listado
      destino.push({ ...p, _cloneDe: nomeSetor(p.setor_id) });
    }
    return map;
  }, [perfis, clonesCross, setores]);

  function toggleExpandido(setorId: string) {
    setExpandido(prev => {
      const next = new Set(prev);
      if (next.has(setorId)) next.delete(setorId);
      else next.add(setorId);
      return next;
    });
  }

  function abrirTransferir(usuario: Perfil) {
    setTransferindo([usuario]);
    setTransferAlvo('');
  }

  function abrirTransferirSelecionados() {
    const lista = perfis.filter(p => selecionados.has(p.id));
    if (lista.length === 0) return;
    setTransferindo(lista);
    setTransferAlvo('');
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function transferir() {
    if (!transferindo?.length || !transferAlvo) return;
    setTransfSalvando(true);
    try {
      // Ao trocar de setor, remove os usuários de qualquer equipe do setor antigo.
      const ids = transferindo.map(t => t.id);
      const { error } = await supabase
        .from('perfis')
        .update({ setor_id: transferAlvo, equipe_id: null })
        .in('id', ids);
      if (error) throw error;
      toast.success(
        transferindo.length === 1
          ? `${transferindo[0].nome} transferido de setor!`
          : `${transferindo.length} usuários transferidos de setor!`,
      );
      setTransferindo(null);
      setSelecionados(new Set());
      fetchPerfis();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao transferir usuário');
    } finally {
      setTransfSalvando(false);
    }
  }

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  function handleDragStart(setorId: string) {
    draggedSetorId = setorId;
  }

  function handleDropOver(alvoId: string) {
    const srcId = draggedSetorId;
    draggedSetorId = null;
    if (!srcId || srcId === alvoId || !empresaAtual?.id) return;

    setSetores(prev => {
      const srcIdx = prev.findIndex(s => s.id === srcId);
      const dstIdx = prev.findIndex(s => s.id === alvoId);
      if (srcIdx < 0 || dstIdx < 0) return prev;
      const clone = [...prev];
      const [moved] = clone.splice(srcIdx, 1);
      clone.splice(dstIdx, 0, moved);
      salvarOrdemSetores(empresaAtual.id!, clone.map(s => s.id));
      return clone;
    });
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  function abrirCriar() {
    setEditando(null);
    setForm({ nome: '', descricao: '', ativo: true, alternativo: false });
    setDialogOpen(true);
  }

  function abrirEditar(s: Setor) {
    setEditando(s);
    setForm({ nome: s.nome, descricao: s.descricao ?? '', ativo: s.ativo, alternativo: s.alternativo === true });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast.error('Informe o nome do setor');
      return;
    }
    if (!empresaAtual?.id) {
      toast.error('Empresa não identificada');
      return;
    }
    setSaving(true);
    try {
      if (editando) {
        const { error } = await supabase
          .from('setores')
          .update({
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || null,
            ativo: form.ativo,
            alternativo: form.alternativo,
          })
          .eq('id', editando.id);
        if (error) throw error;
        toast.success('Setor atualizado!');
      } else {
        const { data: inserido, error } = await supabase
          .from('setores')
          .insert({
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || null,
            ativo: form.ativo,
            alternativo: form.alternativo,
            empresa_id: empresaAtual.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        // Acrescenta ao fim da ordem persistida
        if (inserido?.id) {
          const ordem = lerOrdemSetores(empresaAtual.id);
          if (!ordem.includes(inserido.id)) {
            salvarOrdemSetores(empresaAtual.id, [...ordem, inserido.id]);
          }
        }
        toast.success('Setor criado!');
      }
      setDialogOpen(false);
      fetchSetores();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar setor');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(s: Setor) {
    const { error } = await supabase
      .from('setores')
      .update({ ativo: !s.ativo })
      .eq('id', s.id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    toast.success(s.ativo ? 'Setor desativado' : 'Setor ativado');
    fetchSetores();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalAtivos = useMemo(() => setores.filter(s => s.ativo).length, [setores]);

  if (!acessoOk) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
        <Building2 className="w-6 h-6 opacity-60" />
        <p>Acesso restrito à Gerência ou superior.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {setores.length} {setores.length === 1 ? 'setor cadastrado' : 'setores cadastrados'}
            {' · '}
            {totalAtivos} ativo{totalAtivos !== 1 && 's'}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Arraste um setor sobre outro para reordenar. A ordem é salva automaticamente.
          </p>
        </div>
        <Button size="sm" onClick={abrirCriar} className="gap-1.5">
          <Plus className="w-4 h-4" /> Novo Setor
        </Button>
      </div>

      {/* Barra de seleção múltipla (marque usuários nas listas dos setores) */}
      {selecionados.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-xs text-foreground flex-1">
            <strong>{selecionados.size}</strong> usuário{selecionados.size !== 1 && 's'} selecionado{selecionados.size !== 1 && 's'}
          </p>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelecionados(new Set())}>
            <X className="w-3 h-3 mr-1" /> Limpar
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={abrirTransferirSelecionados}>
            <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir selecionados
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Carregando...
        </div>
      ) : setores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <Building2 className="w-6 h-6 opacity-60" />
            <p>Nenhum setor cadastrado ainda.</p>
            <Button size="sm" variant="outline" onClick={abrirCriar} className="mt-1 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Criar primeiro setor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {setores.map(s => {
              const usuarios = perfisPorSetor[s.id] ?? [];
              const aberto = expandido.has(s.id);
              const mostrarTodos = verTodos.has(s.id);
              const visiveis = mostrarTodos ? usuarios : usuarios.slice(0, LIMITE_USUARIOS);
              return (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={cn(
                  'group rounded-xl border border-border bg-card',
                  'hover:border-primary/40 transition-colors',
                  !s.ativo && 'opacity-60',
                )}
              >
                {/* Cabeçalho do setor (área de arraste) */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(s.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    handleDropOver(s.id);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-grab active:cursor-grabbing select-none"
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{s.nome}</p>
                      {s.descricao && (
                        <p className="text-xs text-muted-foreground truncate">{s.descricao}</p>
                      )}
                    </div>
                    {s.alternativo && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold bg-amber-500/15 text-amber-600 border border-amber-500/30 rounded-full px-2 py-0.5 flex-shrink-0">
                        Alternativo
                      </span>
                    )}
                    {!s.ativo && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 flex-shrink-0">
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs px-2"
                      title="Ver usuários do setor"
                      onClick={() => toggleExpandido(s.id)}
                    >
                      <Users className="w-3.5 h-3.5" /> {usuarios.length}
                      <ChevronDown className={cn('w-3 h-3 transition-transform', aberto && 'rotate-180')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      title={s.ativo ? 'Desativar setor' : 'Ativar setor'}
                      onClick={() => toggleAtivo(s)}
                    >
                      <Power className={cn('w-3.5 h-3.5', s.ativo ? 'text-success' : 'text-muted-foreground')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      title="Editar setor"
                      onClick={() => abrirEditar(s)}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Lista de usuários do setor */}
                {aberto && (
                  <div className="border-t border-border px-3 py-2 space-y-1">
                    {usuarios.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1.5 pl-1">Nenhum usuário neste setor.</p>
                    ) : (
                      <>
                        {visiveis.map(u => {
                          const ehClone = !!u._cloneDe;
                          return (
                          <div key={ehClone ? `clone-${u.id}` : u.id} className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-muted/50">
                            {ehClone ? (
                              <span className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                            ) : (
                              <input
                                type="checkbox"
                                checked={selecionados.has(u.id)}
                                onChange={() => toggleSelecionado(u.id)}
                                className="h-3.5 w-3.5 accent-primary cursor-pointer flex-shrink-0"
                                title="Selecionar para transferência"
                              />
                            )}
                            {u.foto_url ? (
                              <img src={u.foto_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                                {(u.nome || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                                {u.nome}
                                {ehClone && (
                                  <span className="text-[9px] font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5 shrink-0">
                                    clone de {u._cloneDe}
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize truncate">{u.perfil}</p>
                            </div>
                            {!ehClone && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 text-[11px] px-2 flex-shrink-0"
                                onClick={() => abrirTransferir(u)}
                              >
                                <ArrowRightLeft className="w-3 h-3" /> Transferir
                              </Button>
                            )}
                          </div>
                          );
                        })}
                        {usuarios.length > LIMITE_USUARIOS && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] w-full text-muted-foreground"
                            onClick={() => setVerTodos(prev => {
                              const next = new Set(prev);
                              if (next.has(s.id)) next.delete(s.id);
                              else next.add(s.id);
                              return next;
                            })}
                          >
                            {mostrarTodos ? 'Mostrar menos' : `Mostrar todos (${usuarios.length})`}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Dialog criar/editar setor ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="modal-setor-aba-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {editando ? 'Editar Setor' : 'Novo Setor'}
            </DialogTitle>
            <DialogDescription id="modal-setor-aba-desc" className="sr-only">
              {editando ? 'Editar dados do setor' : 'Criar novo setor'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Play 1"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição do setor (opcional)"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-medium">Setor ativo</Label>
              <Switch
                checked={form.ativo}
                onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))}
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="min-w-0">
                <Label className="text-xs font-medium">Setor alternativo</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Setor sem relatório próprio. O total acumulado passa a ser a
                  <strong> soma dos usuários</strong> que estão nele (membros + clones),
                  em vez do total do relatório importado. Use para setores como o Digital.
                </p>
              </div>
              <Switch
                checked={form.alternativo}
                onCheckedChange={v => setForm(f => ({ ...f, alternativo: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog transferir usuário(s) de setor ── */}
      <Dialog open={!!transferindo} onOpenChange={o => { if (!o) setTransferindo(null); }}>
        <DialogContent className="max-w-md" aria-describedby="modal-transferir-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Transferir de setor
            </DialogTitle>
            <DialogDescription id="modal-transferir-desc" className="text-xs">
              {transferindo && transferindo.length === 1 ? (
                <>Selecione o novo setor para <strong>{transferindo[0].nome}</strong>.</>
              ) : (
                <>Selecione o novo setor para <strong>{transferindo?.length ?? 0} usuários</strong>.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {transferindo && transferindo.length > 1 && (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto -mt-1">
              {transferindo.map(t => (
                <span key={t.id} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground/80">
                  {t.nome}
                </span>
              ))}
            </div>
          )}
          <div className="space-y-2 py-2">
            <Label className="text-xs">Novo setor</Label>
            <Select value={transferAlvo} onValueChange={setTransferAlvo}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o setor..." /></SelectTrigger>
              <SelectContent>
                {setores
                  // Esconde o setor de origem só quando TODOS os selecionados já estão nele
                  .filter(s => !(transferindo && transferindo.every(t => t.setor_id === s.id)))
                  .map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}{!s.ativo && ' (inativo)'}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Ao transferir, {transferindo && transferindo.length === 1 ? 'o usuário sai' : 'os usuários saem'} de qualquer equipe do setor atual.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTransferindo(null)} disabled={transfSalvando}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={transferir} disabled={transfSalvando || !transferAlvo} className="gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              {transfSalvando
                ? 'Transferindo...'
                : transferindo && transferindo.length > 1
                  ? `Transferir ${transferindo.length}`
                  : 'Transferir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
