/**
 * AdminSetoresAba.tsx — a administração dos SETORES. Só isso, agora.
 *
 * ## O que saiu daqui, e por quê
 *
 * Até 06/09/2026 esta aba também listava as pessoas de cada setor e era a única
 * porta da transferência. Isso duplicava a aba Usuários, que já agrupa a mesma
 * gente pelos mesmos setores — duas telas lendo `perfis` por conta própria,
 * cada uma reimplementando a resolução de clone. Duas cópias da mesma verdade
 * divergem; é questão de tempo.
 *
 * E a porta estava no lugar errado. `usuarios_transferir` liga por padrão para
 * líder, elite, gerência e diretoria; `ver_setores` liga só para gerência e
 * diretoria. Líder e elite tinham a permissão ligada e nenhum lugar onde
 * exercê-la — a chave existia no painel e não agia em tela nenhuma.
 *
 * A lista de pessoas e a transferência foram para a aba Usuários. O que sobra
 * aqui é o setor como ENTIDADE: criar, editar, ativar, desativar e ordenar.
 *
 * O contador de pessoas fica — mas como atalho, não como lista: ele leva para a
 * aba Usuários já filtrada naquele setor. Uma verdade, um lugar, e um caminho
 * daqui até lá.
 *
 * ## Persistência da ordem
 *
 * A tabela `setores` não tem coluna `ordem`; a ordem mora em localStorage via
 * `@/lib/setores-ordem`. Setores novos entram no fim; ausentes da lista de
 * ordem vêm depois, alfabeticamente.
 *
 * O painel de permissões controla tanto a abertura da aba quanto cada ação.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building2, Plus, GripVertical, Edit, Save, X, Power, Users, ArrowRight,
} from 'lucide-react';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase, Setor } from '@/lib/supabase';
import { useClonesCross } from '@/hooks/useClonesCross';
import { useEmpresa } from '@/hooks/useEmpresa';
import { cn } from '@/lib/utils';
import {
  aplicarOrdemSetores, lerOrdemSetores, salvarOrdemSetores,
} from '@/lib/setores-ordem';

// ─── Drag state (module-level, evita stale closures) ────────────────────────
let draggedSetorId: string | null = null;

// ─── Componente ─────────────────────────────────────────────────────────────

export default function AdminSetoresAba() {
  const { empresa: empresaAtual } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const [, setSearchParams] = useSearchParams();

  const podeVerSetores      = temPermissao('ver_setores');
  const podeCriarEditar     = temPermissao('setores_criar_editar');
  const podeAtivarDesativar = temPermissao('setores_ativar_desativar');
  const podeReordenar       = temPermissao('setores_reordenar');
  /* O atalho só é atalho se houver para onde ir. */
  const podeIrParaUsuarios  = temPermissao('usuarios_sub_usuarios');

  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Dialog criar/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando,   setEditando]   = useState<Setor | null>(null);
  const [form, setForm] = useState<{ nome: string; descricao: string; ativo: boolean; alternativo: boolean }>({
    nome: '', descricao: '', ativo: true, alternativo: false,
  });

  /*
   * Quantas pessoas há em cada setor.
   *
   * Só o vínculo, e nada mais: `id, setor_id, arquivado`. A consulta antiga
   * trazia nome, cargo, foto e login de todo mundo para desenhar uma lista que
   * não existe mais aqui — carga de página inteira para mostrar um número.
   */
  const [vinculos, setVinculos] = useState<{ id: string; setor_id: string | null }[]>([]);
  const clonesCross = useClonesCross(empresaAtual?.id);

  const fetchSetores = useCallback(async () => {
    if (!empresaAtual?.id) { setSetores([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('setores').select('*')
        .eq('empresa_id', empresaAtual.id).order('nome');
      if (error) {
        console.warn('[AdminSetoresAba] fetchSetores error:', error.message);
        setSetores([]);
      } else {
        setSetores(aplicarOrdemSetores((data as Setor[]) || [], empresaAtual.id));
      }
    } finally {
      setLoading(false);
    }
  }, [empresaAtual?.id]);

  const fetchVinculos = useCallback(async () => {
    if (!empresaAtual?.id) { setVinculos([]); return; }
    const { data, error } = await supabase
      .from('perfis').select('id, setor_id, arquivado')
      .eq('empresa_id', empresaAtual.id);
    if (error) {
      console.warn('[AdminSetoresAba] fetchVinculos error:', error.message);
      setVinculos([]);
      return;
    }
    // Arquivados moram na aba Desligados; contá-los aqui daria um número que
    // não bate com o da lista de Usuários.
    const linhas = (data as { id: string; setor_id: string | null; arquivado: boolean | null }[]) ?? [];
    setVinculos(linhas.filter(l => !l.arquivado).map(l => ({ id: l.id, setor_id: l.setor_id })));
  }, [empresaAtual?.id]);

  useEffect(() => { void fetchSetores(); void fetchVinculos(); }, [fetchSetores, fetchVinculos]);

  /**
   * Pessoas por setor — membros mais os clones de outro setor.
   *
   * Os clones entram porque a aba Usuários também os mostra no setor destino:
   * dois números diferentes para a mesma pergunta é o defeito que esta reforma
   * veio tirar.
   */
  const totalPorSetor = useMemo(() => {
    const conta: Record<string, number> = {};
    const setorDaPessoa = new Map<string, string | null>();
    for (const v of vinculos) {
      setorDaPessoa.set(v.id, v.setor_id);
      if (v.setor_id) conta[v.setor_id] = (conta[v.setor_id] ?? 0) + 1;
    }
    for (const c of clonesCross) {
      const origem = setorDaPessoa.get(c.operadorId);
      if (!origem || origem === c.destinoSetorId) continue;   // só cross-setor
      conta[c.destinoSetorId] = (conta[c.destinoSetorId] ?? 0) + 1;
    }
    return conta;
  }, [vinculos, clonesCross]);

  /** Leva para a aba Usuários já recortada neste setor. */
  function verPessoasDoSetor(setorId: string) {
    setSearchParams({ tab: 'usuarios', setor: setorId }, { replace: false });
  }

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  function handleDragStart(setorId: string) {
    if (!podeReordenar) return;
    draggedSetorId = setorId;
  }

  function handleDropOver(alvoId: string) {
    if (!podeReordenar) return;
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
    if (!podeCriarEditar) return;
    setEditando(null);
    setForm({ nome: '', descricao: '', ativo: true, alternativo: false });
    setDialogOpen(true);
  }

  function abrirEditar(s: Setor) {
    if (!podeCriarEditar) return;
    setEditando(s);
    setForm({ nome: s.nome, descricao: s.descricao ?? '', ativo: s.ativo, alternativo: s.alternativo === true });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim())  { toast.error('Informe o nome do setor'); return; }
    if (!empresaAtual?.id)  { toast.error('Empresa não identificada'); return; }
    setSaving(true);
    try {
      if (editando) {
        const { error } = await supabase.from('setores').update({
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          ativo: form.ativo,
          alternativo: form.alternativo,
        }).eq('id', editando.id);
        if (error) throw error;
        toast.success('Setor atualizado!');
      } else {
        const { data: inserido, error } = await supabase.from('setores').insert({
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          ativo: form.ativo,
          alternativo: form.alternativo,
          empresa_id: empresaAtual.id,
        }).select('id').single();
        if (error) throw error;
        // Acrescenta ao fim da ordem persistida.
        if (inserido?.id) {
          const ordem = lerOrdemSetores(empresaAtual.id);
          if (!ordem.includes(inserido.id)) {
            salvarOrdemSetores(empresaAtual.id, [...ordem, inserido.id]);
          }
        }
        toast.success('Setor criado!');
      }
      setDialogOpen(false);
      void fetchSetores();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar setor');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(s: Setor) {
    if (!podeAtivarDesativar) return;
    const { error } = await supabase.from('setores').update({ ativo: !s.ativo }).eq('id', s.id);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success(s.ativo ? 'Setor desativado' : 'Setor ativado');
    void fetchSetores();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalAtivos = useMemo(() => setores.filter(s => s.ativo).length, [setores]);
  const semSetor = useMemo(() => vinculos.filter(v => !v.setor_id).length, [vinculos]);

  if (!podeVerSetores) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
        <Building2 className="w-6 h-6 opacity-60" />
        <p>A aba Setores não foi liberada para este cargo.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* ── Cabeçalho ── */}
      <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Setores da empresa</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {setores.length} {setores.length === 1 ? 'setor' : 'setores'}
            {' · '}{totalAtivos} ativo{totalAtivos !== 1 && 's'}
            {semSetor > 0 && (
              <>
                {' · '}
                <span className="text-warning font-medium">
                  {semSetor} {semSetor === 1 ? 'pessoa sem setor' : 'pessoas sem setor'}
                </span>
              </>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            {podeReordenar
              ? 'Arraste um setor sobre outro para reordenar. A ordem é salva automaticamente e vale também na aba Usuários.'
              : 'A ordem dos setores está disponível somente para visualização.'}
          </p>
        </div>
        {podeCriarEditar && (
          <Button size="sm" onClick={abrirCriar} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> Novo Setor
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-[58px] rounded-xl border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : setores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <Building2 className="w-6 h-6 opacity-60" />
            <p>Nenhum setor cadastrado ainda.</p>
            {podeCriarEditar && (
              <Button size="sm" variant="outline" onClick={abrirCriar} className="mt-1 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Criar primeiro setor
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {setores.map(s => {
              const total = totalPorSetor[s.id] ?? 0;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  draggable={podeReordenar}
                  onDragStart={() => handleDragStart(s.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleDropOver(s.id); }}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl border border-border bg-card',
                    'px-3 py-2.5 transition-all',
                    'hover:border-primary/40 hover:shadow-sm',
                    podeReordenar && 'cursor-grab active:cursor-grabbing',
                    !s.ativo && 'opacity-60',
                  )}
                >
                  {/* Fio de cor à esquerda: dá ao cartão um lado "de frente" e
                      separa ativo de inativo sem depender só da opacidade. */}
                  <span className={cn(
                    'absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-colors',
                    s.ativo ? 'bg-primary/60' : 'bg-muted-foreground/25',
                  )} />

                  {podeReordenar && (
                    <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 ml-1 transition-colors" />
                  )}

                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                    s.ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    <Building2 className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm text-foreground truncate">{s.nome}</p>
                      {s.alternativo && (
                        <span
                          className="text-[10px] uppercase tracking-wide font-semibold bg-warning/15 text-warning border border-warning/30 rounded-full px-2 py-0.5 shrink-0"
                          title="Setor sem relatório próprio: o total é a soma dos usuários"
                        >
                          Alternativo
                        </span>
                      )}
                      {!s.ativo && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 shrink-0">
                          Inativo
                        </span>
                      )}
                    </div>
                    {s.descricao && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{s.descricao}</p>
                    )}
                  </div>

                  {/* ── Contador: atalho para a lista, não uma segunda lista ──
                      Antes isto abria os usuários do setor aqui dentro. Agora
                      leva para a aba Usuários filtrada — mesma gente, um lugar
                      só, com busca, situação e transferência à mão. */}
                  {podeIrParaUsuarios ? (
                    <button
                      type="button"
                      onClick={() => verPessoasDoSetor(s.id)}
                      title={`Ver as ${total} pessoas de ${s.nome} na aba Usuários`}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 shrink-0',
                        'text-xs text-muted-foreground transition-colors',
                        'hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
                      )}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="tabular-nums font-medium">{total}</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground shrink-0">
                      <Users className="w-3.5 h-3.5" />
                      <span className="tabular-nums font-medium">{total}</span>
                    </span>
                  )}

                  <div className="flex items-center gap-0.5 shrink-0">
                    {podeAtivarDesativar && (
                      <Button
                        variant="ghost" size="icon" className="w-7 h-7"
                        title={s.ativo ? 'Desativar setor' : 'Ativar setor'}
                        onClick={() => toggleAtivo(s)}
                      >
                        <Power className={cn('w-3.5 h-3.5', s.ativo ? 'text-success' : 'text-muted-foreground')} />
                      </Button>
                    )}
                    {podeCriarEditar && (
                      <Button
                        variant="ghost" size="icon" className="w-7 h-7"
                        title="Editar setor" onClick={() => abrirEditar(s)}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
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
    </div>
  );
}
