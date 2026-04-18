/**
 * AdminCargos.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Página de gerenciamento de permissões de cargos.
 *
 * ## UX
 * - Seletor de cargo no topo (um cargo por vez)
 * - Permissões agrupadas por categoria com Switch individual
 * - Alterações não salvas ficam marcadas visualmente
 * - Botão Salvar salva apenas o cargo selecionado
 *
 * ## Multi-tenant
 * Cada empresa tem seu próprio conjunto de permissões por cargo.
 * As permissões de uma empresa NÃO afetam a outra.
 *
 * ## Acesso
 * Apenas administrador e super_admin podem editar.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Save, RefreshCw, Info, ChevronDown,
  CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Definição completa das permissões ────────────────────────────────────────
const PERMISSOES_META: {
  key: string;
  label: string;
  descricao: string;
  grupo: string;
}[] = [
  // ── Acordos ──────────────────────────────────────────────────────────────
  { key: 'ver_acordos_proprios',   label: 'Ver acordos próprios',     descricao: 'Visualizar apenas os próprios acordos cadastrados',                           grupo: 'Acordos' },
  { key: 'ver_acordos_gerais',     label: 'Ver todos os acordos',     descricao: 'Visualizar acordos de todos os operadores da empresa/setor',                  grupo: 'Acordos' },
  { key: 'criar_acordos',          label: 'Criar acordos',            descricao: 'Cadastrar novos acordos no sistema',                                          grupo: 'Acordos' },
  { key: 'editar_acordos',         label: 'Editar acordos',           descricao: 'Editar campos de acordos já existentes',                                      grupo: 'Acordos' },
  { key: 'excluir_acordos',        label: 'Excluir acordos',          descricao: 'Excluir acordos (mover para lixeira)',                                        grupo: 'Acordos' },
  { key: 'importar_excel',         label: 'Importar Excel',           descricao: 'Importar acordos em lote via planilha Excel com suporte a IA',                grupo: 'Acordos' },
  // ── Painéis ───────────────────────────────────────────────────────────────
  { key: 'ver_painel_lider',       label: 'Painel Líder',             descricao: 'Acessar o painel analítico do líder (acordos por operador, métricas)',        grupo: 'Painéis' },
  { key: 'ver_analiticos_setor',   label: 'Analíticos do setor',      descricao: 'Ver métricas, gráficos e KPIs do próprio setor',                              grupo: 'Painéis' },
  { key: 'ver_analiticos_global',  label: 'Analíticos globais',       descricao: 'Ver métricas e KPIs de toda a empresa (todos os setores)',                    grupo: 'Painéis' },
  { key: 'ver_todos_setores',      label: 'Ver todos os setores',     descricao: 'Acesso a dados de todos os setores da empresa',                               grupo: 'Painéis' },
  // ── Filtros ───────────────────────────────────────────────────────────────
  { key: 'filtrar_por_setor',      label: 'Filtrar por setor',        descricao: 'Aplicar filtro de setor nos relatórios e listagens',                         grupo: 'Filtros' },
  { key: 'filtrar_por_equipe',     label: 'Filtrar por equipe',       descricao: 'Aplicar filtro de equipe nos relatórios e listagens',                        grupo: 'Filtros' },
  { key: 'filtrar_por_usuario',    label: 'Filtrar por usuário',      descricao: 'Aplicar filtro de usuário específico nos relatórios e listagens',            grupo: 'Filtros' },
  // ── Gestão ────────────────────────────────────────────────────────────────
  { key: 'ver_usuarios',           label: 'Ver usuários',             descricao: 'Acessar a lista de usuários cadastrados na empresa',                         grupo: 'Gestão' },
  { key: 'ver_equipes',            label: 'Ver equipes',              descricao: 'Acessar a lista e configuração de equipes',                                  grupo: 'Gestão' },
  { key: 'ver_metas',              label: 'Ver metas',                descricao: 'Acessar a aba de configuração e acompanhamento de metas',                    grupo: 'Gestão' },
  { key: 'ver_operadores',         label: 'Ver dados de operadores',  descricao: 'Ver informações detalhadas de outros operadores do setor',                   grupo: 'Gestão' },
  // ── Lixeira & Logs ────────────────────────────────────────────────────────
  { key: 'ver_lixeira',            label: 'Acessar lixeira',          descricao: 'Ver e restaurar acordos excluídos na lixeira',                               grupo: 'Lixeira & Logs' },
  { key: 'ver_logs',               label: 'Acessar logs',             descricao: 'Ver histórico de alterações e auditoria do sistema',                         grupo: 'Lixeira & Logs' },
  { key: 'ver_configuracoes',      label: 'Acessar configurações',    descricao: 'Acessar as configurações gerais da empresa',                                  grupo: 'Lixeira & Logs' },
];

// Cargos configuráveis (admin e super_admin têm acesso total, não precisam de config)
const CARGOS_EDITAVEIS = ['operador', 'lider', 'elite', 'gerencia', 'diretoria'] as const;
type CargoEditavel = typeof CARGOS_EDITAVEIS[number];

const DESCRICOES_CARGO: Record<string, string> = {
  operador:  'Usuário operacional padrão. Pode criar e gerenciar apenas os próprios acordos.',
  lider:     'Líder de equipe/setor. Acesso aos acordos e métricas do setor.',
  elite:     'Líder híbrido com alternância entre visão individual e geral.',
  gerencia:  'Mesmas permissões de líder para uso gerencial.',
  diretoria: 'Visualização analítica completa sem capacidade de edição.',
};

type PermissoesMap = Record<string, boolean>;

interface CargoPermissao {
  id?: string;
  cargo: string;
  permissoes: PermissoesMap;
  descricao?: string;
  empresa_id?: string;
}

// ── Helpers visuais ──────────────────────────────────────────────────────────
function countAtivas(perms: PermissoesMap): number {
  return Object.values(perms).filter(Boolean).length;
}

export default function AdminCargos() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const isAdmin = perfil?.perfil === 'administrador' || perfil?.perfil === 'super_admin';

  const [dados, setDados] = useState<CargoPermissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Cargo selecionado no seletor
  const [cargoSelecionado, setCargoSelecionado] = useState<CargoEditavel>('operador');

  // Estado local de edição (só para o cargo selecionado)
  const [editado, setEditado] = useState<PermissoesMap | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cargos_permissoes')
        .select('*')
        .eq('empresa_id', empresa.id)
        .order('cargo');
      if (error) throw error;
      setDados((data as CargoPermissao[]) ?? []);
    } catch {
      toast.error('Erro ao carregar permissões');
    } finally {
      setLoading(false);
    }
  }, [empresa?.id]);

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  // Quando muda o cargo selecionado, descarta edição anterior
  useEffect(() => {
    setEditado(null);
  }, [cargoSelecionado]);

  // ── Dados do cargo atual ─────────────────────────────────────────────────
  function getPermissoesBanco(cargo: string): PermissoesMap {
    const row = dados.find(d => d.cargo === cargo);
    return row?.permissoes ?? {};
  }

  // Permissões a exibir: estado editado > banco
  const permissoesAtivas = editado ?? getPermissoesBanco(cargoSelecionado);
  const temAlteracao = editado !== null;

  // ── Toggle ───────────────────────────────────────────────────────────────
  function togglePermissao(key: string) {
    if (!isAdmin) return;
    const base = editado ?? getPermissoesBanco(cargoSelecionado);
    setEditado({ ...base, [key]: !base[key] });
  }

  function toggleGrupo(grupo: string, ativar: boolean) {
    if (!isAdmin) return;
    const base = editado ?? getPermissoesBanco(cargoSelecionado);
    const updates: PermissoesMap = { ...base };
    PERMISSOES_META.filter(p => p.grupo === grupo).forEach(p => {
      updates[p.key] = ativar;
    });
    setEditado(updates);
  }

  function descartar() {
    setEditado(null);
  }

  // ── Salvar ───────────────────────────────────────────────────────────────
  async function salvar() {
    if (!empresa?.id || !isAdmin || !editado) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('cargos_permissoes')
        .upsert(
          { empresa_id: empresa.id, cargo: cargoSelecionado, permissoes: editado },
          { onConflict: 'empresa_id,cargo' }
        );
      if (error) throw error;
      toast.success(`Permissões de "${PERFIL_LABELS[cargoSelecionado] ?? cargoSelecionado}" salvas!`);
      setEditado(null);
      await fetchDados();
    } catch {
      toast.error('Erro ao salvar permissões');
    } finally {
      setSalvando(false);
    }
  }

  // ── Grupos ───────────────────────────────────────────────────────────────
  const grupos = [...new Set(PERMISSOES_META.map(p => p.grupo))];

  // ── Guard: apenas admin ──────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Apenas administradores podem gerenciar permissões de cargos.</p>
      </div>
    );
  }

  const colorClass = PERFIL_COLORS[cargoSelecionado] ?? 'bg-muted/10 text-muted border-muted/30';
  const ativasCount = countAtivas(permissoesAtivas);
  const totalCount = PERMISSOES_META.length;

  return (
    <TooltipProvider>
      <div className="space-y-5 p-4 md:p-6 max-w-4xl mx-auto">

        {/* ── Cabeçalho ────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Permissões de Cargos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure o que cada cargo pode acessar — por empresa
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDados}
            disabled={loading}
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
            Recarregar
          </Button>
        </div>

        {/* ── Seletor de cargo ─────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Selecionar cargo para configurar
                </label>
                <Select
                  value={cargoSelecionado}
                  onValueChange={(v) => setCargoSelecionado(v as CargoEditavel)}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGOS_EDITAVEIS.map(cargo => (
                      <SelectItem key={cargo} value={cargo}>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
                            PERFIL_COLORS[cargo] ?? 'bg-muted/10 text-muted border-muted/30'
                          )}>
                            {PERFIL_LABELS[cargo] ?? cargo}
                          </span>
                          <span className="text-muted-foreground text-xs hidden sm:inline">
                            {DESCRICOES_CARGO[cargo]?.split('.')[0]}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resumo do cargo */}
              {!loading && (
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{ativasCount}</p>
                    <p className="text-xs text-muted-foreground">de {totalCount} ativas</p>
                  </div>
                  <div className="w-16 h-16 relative">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9"
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="3"
                        strokeDasharray={`${(ativasCount / totalCount) * 100} 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                      {Math.round((ativasCount / totalCount) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Descrição do cargo */}
            {DESCRICOES_CARGO[cargoSelecionado] && (
              <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {DESCRICOES_CARGO[cargoSelecionado]}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Permissões do cargo selecionado ──────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={cargoSelecionado}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Barra de ações (sticky) */}
              <AnimatePresence>
                {temAlteracao && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="sticky top-2 z-10"
                  >
                    <Card className="border-warning/40 bg-warning/5">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm text-warning">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>Alterações não salvas em <strong>{PERFIL_LABELS[cargoSelecionado]}</strong></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={descartar}
                              disabled={salvando}
                              className="h-7 text-xs"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Descartar
                            </Button>
                            <Button
                              size="sm"
                              onClick={salvar}
                              disabled={salvando}
                              className="h-7 text-xs"
                            >
                              {salvando ? (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3 mr-1" />
                              )}
                              Salvar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Grupos de permissões */}
              {grupos.map(grupo => {
                const permsDoGrupo = PERMISSOES_META.filter(p => p.grupo === grupo);
                const ativasGrupo = permsDoGrupo.filter(p => !!permissoesAtivas[p.key]).length;
                const todasAtivas = ativasGrupo === permsDoGrupo.length;
                const nenhumaAtiva = ativasGrupo === 0;

                return (
                  <Card key={grupo} className="border-border/50">
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {grupo}
                          <Badge variant="outline" className="text-xs font-normal">
                            {ativasGrupo}/{permsDoGrupo.length}
                          </Badge>
                        </CardTitle>
                        {isAdmin && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => toggleGrupo(grupo, true)}
                              disabled={todasAtivas}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Ativar todos
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => toggleGrupo(grupo, false)}
                              disabled={nenhumaAtiva}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Desativar todos
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {permsDoGrupo.map(perm => {
                          const ativa = !!permissoesAtivas[perm.key];
                          return (
                            <div
                              key={perm.key}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-lg border transition-all duration-150',
                                ativa
                                  ? 'bg-primary/5 border-primary/25'
                                  : 'bg-muted/20 border-border/40',
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={cn(
                                  'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors',
                                  ativa ? 'bg-primary' : 'bg-muted-foreground/30'
                                )} />
                                <span className={cn(
                                  'text-xs font-medium truncate transition-colors',
                                  ativa ? 'text-foreground' : 'text-muted-foreground'
                                )}>
                                  {perm.label}
                                </span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="w-3 h-3 text-muted-foreground/50 flex-shrink-0 cursor-help hover:text-muted-foreground transition-colors" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-56 text-xs">
                                    {perm.descricao}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <Switch
                                checked={ativa}
                                onCheckedChange={() => togglePermissao(perm.key)}
                                disabled={!isAdmin}
                                className="flex-shrink-0 ml-2"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Botão salvar rodapé */}
              {temAlteracao && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={descartar} disabled={salvando}>
                    Descartar alterações
                  </Button>
                  <Button onClick={salvar} disabled={salvando}>
                    {salvando ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar permissões de {PERFIL_LABELS[cargoSelecionado]}
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Nota informativa ─────────────────────────────────────────── */}
        <Card className="border-border/50 bg-muted/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>Multi-tenant:</strong> As permissões são individuais por empresa.
                  Alterações na BookPlay não afetam a PaguePay e vice-versa.
                </p>
                <p>
                  Cargos <strong>Administrador</strong> e <strong>Super Admin</strong> têm
                  acesso total ao sistema e não são configuráveis aqui.
                </p>
                <p>
                  As alterações são aplicadas imediatamente após salvar,
                  sem necessidade de recarregar a página.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
