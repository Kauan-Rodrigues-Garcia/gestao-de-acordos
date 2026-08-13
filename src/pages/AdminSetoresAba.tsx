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
import { executarTransferencia } from '@/services/admin/transferenciaUsuario.service';
import { HistoricoTransferencias } from '@/components/admin/HistoricoTransferencias';
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

  // Transferência — aceita 1 ou vários usuários de uma vez. Esta é a ÚNICA
  // porta: os campos Setor/Empresa do modal de editar usuário viraram somente
  // leitura em 13/08/2026, porque mudá-los é transferir e transferir mexe em
  // tabulação, NR, equipe, clone e fantasma.
  const [transferindo, setTransferindo] = useState<Perfil[] | null>(null);
  const [transferAlvo, setTransferAlvo] = useState<string>('');
  const [transfSalvando, setTransfSalvando] = useState(false);
  /** Empresa de destino. Igual à atual = transferência de setor. */
  const [transferEmpresa, setTransferEmpresa] = useState<string>('');
  /** Setores da empresa de DESTINO — pode não ser a atual. */
  const [setoresDestino, setSetoresDestino] = useState<Setor[]>([]);
  const [carregandoDestino, setCarregandoDestino] = useState(false);
  const [levarAcordos, setLevarAcordos] = useState(false);
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  // Seleção múltipla via checkbox nas listas de usuários
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const acessoOk = temAcessoSetores(perfilAtual?.perfil);

  /** O destino é outra empresa? Muda o título, some a escolha e o aviso troca. */
  const trocaDeEmpresa = !!transferEmpresa && transferEmpresa !== empresaAtual?.id;

  /** Nomes para o histórico. Setor de outra empresa não está em `setores`. */
  const nomeDoSetorPorId = useCallback((id: string | null): string => {
    if (!id) return 'sem setor';
    return setores.find(s => s.id === id)?.nome
      ?? setoresDestino.find(s => s.id === id)?.nome
      ?? 'outro setor';
  }, [setores, setoresDestino]);

  const nomeDaEmpresaPorId = useCallback((id: string | null): string => {
    if (!id) return 'empresa';
    if (id === empresaAtual?.id) return empresaAtual?.nome ?? 'esta empresa';
    return empresas.find(e => e.id === id)?.nome ?? 'outra empresa';
  }, [empresas, empresaAtual?.id, empresaAtual?.nome]);

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
      // `equipe_id` entra por causa da transferência: é a equipe de ORIGEM, e
      // sem ela o fantasma não teria para onde devolver o recebimento do mês.
      .select('id, nome, perfil, setor_id, equipe_id, foto_url, usuario')
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

  // Empresas para o destino da transferência. Só super_admin: `setores_select`
  // usa `fn_can_access_empresa`, que só abre a outra empresa para ele — um
  // administrador comum veria a lista de setores vazia e o UPDATE seria barrado
  // pela RLS de `perfis`. Oferecer o campo a quem não pode usar é pior que não
  // oferecer.
  const podeTrocarEmpresa = perfilAtual?.perfil === 'super_admin';

  useEffect(() => {
    if (!podeTrocarEmpresa) { setEmpresas([]); return; }
    let cancel = false;
    void supabase.from('empresas').select('id, nome').order('nome').then(({ data }) => {
      if (!cancel) setEmpresas((data as { id: string; nome: string }[]) ?? []);
    });
    return () => { cancel = true; };
  }, [podeTrocarEmpresa]);

  /**
   * Setores da empresa de DESTINO.
   *
   * Sem isto o seletor de setor listava sempre os da empresa atual: ao escolher
   * a outra empresa, não aparecia setor nenhum para escolher e a transferência
   * ficava impossível de concluir.
   */
  useEffect(() => {
    if (!transferindo || !transferEmpresa) return;
    if (transferEmpresa === empresaAtual?.id) { setSetoresDestino(setores); return; }

    let cancel = false;
    setCarregandoDestino(true);
    void supabase.from('setores')
      .select('*').eq('empresa_id', transferEmpresa).order('nome')
      .then(({ data }) => {
        if (cancel) return;
        setSetoresDestino((data as Setor[]) ?? []);
        setCarregandoDestino(false);
      });
    return () => { cancel = true; };
  }, [transferindo, transferEmpresa, empresaAtual?.id, setores]);

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

  /** Estado inicial do diálogo: empresa atual, sem setor, sem levar nada. */
  function prepararTransferencia(lista: Perfil[]) {
    setTransferindo(lista);
    setTransferAlvo('');
    setTransferEmpresa(empresaAtual?.id ?? '');
    setSetoresDestino(setores);
    // Recomeça sempre em "chegar limpo": herdar a escolha da transferência
    // anterior é como se apaga um histórico sem querer.
    setLevarAcordos(false);
  }

  function abrirTransferir(usuario: Perfil) {
    prepararTransferencia([usuario]);
  }

  function abrirTransferirSelecionados() {
    const lista = perfis.filter(p => selecionados.has(p.id));
    if (lista.length === 0) return;
    prepararTransferencia(lista);
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Executa a transferência de todo mundo que está selecionado.
   *
   * ## Por que não é mais um `update` direto
   *
   * Até 13/08/2026 este botão fazia `update({ setor_id, equipe_id: null })` e
   * mais nada. As tabulações ficavam carimbadas no setor ANTIGO
   * (`acordos.setor_id` alimenta o Dashboard e o Painel Líder) e contavam lá
   * para sempre; os clones em `equipe_operadores_clones` ficavam pendurados, e a
   * pessoa seguia somando no setor emprestado; o recebimento dela sumia na hora
   * da equipe de origem, no meio do mês; e nada disso deixava rastro para
   * desfazer. Agora tudo passa por `executarTransferencia`.
   *
   * ## Um de cada vez, de propósito
   *
   * Cada pessoa gera o próprio relatório de tabulações ANTES de qualquer DELETE
   * (regra de 20260805c). Em lote isso é um arquivo por pessoa — e é o certo:
   * as tabulações são de cada uma, e um arquivo só não diria de quem é o quê.
   * Sequencial também garante que a falha de uma não leve as outras junto.
   */
  async function transferir() {
    if (!transferindo?.length || !transferAlvo || !empresaAtual?.id) return;
    setTransfSalvando(true);

    const destinoEmpresa = transferEmpresa || empresaAtual.id;
    let ok = 0;
    let apagados = 0;
    let movidos = 0;
    const falhas: string[] = [];

    for (const p of transferindo) {
      const r = await executarTransferencia({
        alvo: {
          perfilId:         p.id,
          nome:             p.nome,
          usuario:          p.usuario ?? null,
          origemEmpresaId:  empresaAtual.id,
          origemSetorId:    p.setor_id ?? null,
          origemEquipeId:   p.equipe_id ?? null,
          destinoEmpresaId: destinoEmpresa,
          destinoSetorId:   transferAlvo,
        },
        levarAcordos,
        executadoPorId: perfilAtual?.id ?? null,
      });

      if (r.status === 'falha') { falhas.push(`${p.nome}: ${r.mensagem}`); continue; }
      ok++;
      apagados += r.acordosApagados;
      movidos  += r.acordosMovidos;
      if (r.avisoRegistro) toast.warning(`${p.nome} — ${r.avisoRegistro}`, { duration: 12000 });
    }

    if (ok > 0) {
      const partes = [ok === 1 ? '1 usuário transferido.' : `${ok} usuários transferidos.`];
      if (apagados > 0) {
        partes.push(`${apagados.toLocaleString('pt-BR')} tabulações apagadas (relatórios baixados).`);
      }
      if (movidos > 0) partes.push(`${movidos.toLocaleString('pt-BR')} tabulações foram junto.`);
      partes.push('O recebimento continua na equipe de origem até a liderança tirar.');
      toast.success(partes.join(' '), { duration: 9000 });
    }
    // Falha de uma pessoa não some no meio de um "sucesso" agregado.
    for (const f of falhas) toast.error(f, { duration: 12000 });

    setTransfSalvando(false);
    if (ok > 0) {
      setTransferindo(null);
      setSelecionados(new Set());
      fetchPerfis();
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

      {/* ── Transferências recentes, com o desfazer ──────────────────────────
          Ao lado do botão que transfere: quem errou volta ao lugar de onde
          transferiu, não a uma tela de auditoria noutro canto. */}
      <div className="mt-6">
        <HistoricoTransferencias
          empresaId={empresaAtual?.id}
          podeDesfazer={
            perfilAtual?.perfil === 'administrador' || perfilAtual?.perfil === 'super_admin'
          }
          nomeDoSetor={nomeDoSetorPorId}
          nomeDaEmpresa={nomeDaEmpresaPorId}
          nomeDoPerfil={id => perfis.find(p => p.id === id)?.nome}
          onDesfeita={() => { fetchPerfis(); fetchSetores(); }}
        />
      </div>

      {/* ── Dialog transferir usuário(s): setor e/ou empresa ── */}
      <Dialog open={!!transferindo} onOpenChange={o => { if (!o && !transfSalvando) setTransferindo(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" aria-describedby="modal-transferir-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Transferir {trocaDeEmpresa ? 'de empresa' : 'de setor'}
            </DialogTitle>
            <DialogDescription id="modal-transferir-desc" className="text-xs">
              {transferindo && transferindo.length === 1 ? (
                <>Escolha o destino de <strong>{transferindo[0].nome}</strong>.</>
              ) : (
                <>Escolha o destino de <strong>{transferindo?.length ?? 0} usuários</strong>.</>
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

          <div className="space-y-3 py-2">
            {/* Empresa: só super_admin. Ver `podeTrocarEmpresa`. */}
            {podeTrocarEmpresa && empresas.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Select
                  value={transferEmpresa}
                  onValueChange={v => {
                    setTransferEmpresa(v);
                    // O setor escolhido pertence à empresa anterior — mantê-lo
                    // gravaria um setor de outra empresa no perfil.
                    setTransferAlvo('');
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">
                Novo setor <span className="text-destructive">*</span>
              </Label>
              <Select value={transferAlvo} onValueChange={setTransferAlvo} disabled={carregandoDestino}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={carregandoDestino ? 'Carregando setores…' : 'Selecione o setor...'} />
                </SelectTrigger>
                <SelectContent>
                  {setoresDestino.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Nenhum setor nesta empresa
                    </SelectItem>
                  ) : (
                    setoresDestino
                      // Esconde o setor de origem só quando TODOS os selecionados
                      // já estão nele — e só faz sentido na mesma empresa.
                      .filter(s => trocaDeEmpresa
                        || !(transferindo && transferindo.every(t => t.setor_id === s.id)))
                      .map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}{!s.ativo && ' (inativo)'}</SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              {/* Setor é obrigatório: sem ele a pessoa some de todo painel
                  escopado por setor, e é um estado que ninguém escolhe de
                  propósito. O botão fica travado até escolher. */}
              {!transferAlvo && (
                <p className="text-[11px] text-muted-foreground">
                  Escolha um setor de destino para continuar.
                </p>
              )}
            </div>

            {/* A escolha do destino das tabulações. Só troca de setor a tem. */}
            {!trocaDeEmpresa ? (
              <div className="space-y-1.5">
                <Label className="text-xs">As tabulações deles</Label>
                <button
                  type="button" role="radio" aria-checked={!levarAcordos}
                  onClick={() => setLevarAcordos(false)}
                  className={cn(
                    'w-full text-left rounded-md border p-2.5 transition-colors',
                    !levarAcordos ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span className={cn('block text-sm font-medium', !levarAcordos && 'text-primary')}>
                    Chegar limpo
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    Baixa o relatório das tabulações e apaga o histórico. Os NRs voltam
                    a ficar livres para outros tabularem. Um arquivo por pessoa.
                  </span>
                </button>
                <button
                  type="button" role="radio" aria-checked={levarAcordos}
                  onClick={() => setLevarAcordos(true)}
                  className={cn(
                    'w-full text-left rounded-md border p-2.5 transition-colors',
                    levarAcordos ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span className={cn('block text-sm font-medium', levarAcordos && 'text-primary')}>
                    Levar as tabulações junto
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    As tabulações mudam de setor com eles e os vínculos continuam de pé.
                    Nada é apagado. Use só quando o setor mudou de nome na prática.
                  </span>
                </button>
              </div>
            ) : (
              <p className="text-[11px] rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                Troca de empresa é sempre limpa: o relatório das tabulações é baixado e
                o histórico apagado. Tabulação não muda de empresa — são cadastros de
                clientes de CNPJs diferentes.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground rounded-md border border-border bg-muted/30 p-2.5">
              Eles saem de qualquer equipe e dos vínculos de clone. O recebimento
              deste mês <strong>continua na equipe de origem</strong>, marcado como
              transferido, até a liderança de lá tirar. Dá para desfazer depois.
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
