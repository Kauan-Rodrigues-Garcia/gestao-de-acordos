/**
 * AdminCargos.tsx
 * Página de gerenciamento de permissões de cargos.
 * Apenas administradores podem acessar e editar.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Save, RefreshCw, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Definição das permissões disponíveis ─────────────────────────────────────
const PERMISSOES_META: {
  key: string;
  label: string;
  descricao: string;
  grupo: string;
}[] = [
  // Acordos
  { key: 'ver_acordos_gerais',   label: 'Ver todos os acordos',    descricao: 'Visualizar acordos de todos os operadores do setor/empresa', grupo: 'Acordos' },
  { key: 'ver_acordos_proprios', label: 'Ver acordos próprios',    descricao: 'Visualizar apenas os próprios acordos', grupo: 'Acordos' },
  { key: 'criar_acordos',        label: 'Criar acordos',           descricao: 'Cadastrar novos acordos', grupo: 'Acordos' },
  { key: 'editar_acordos',       label: 'Editar acordos',          descricao: 'Editar acordos existentes', grupo: 'Acordos' },
  { key: 'excluir_acordos',      label: 'Excluir acordos',         descricao: 'Excluir acordos permanentemente', grupo: 'Acordos' },
  { key: 'importar_excel',       label: 'Importar Excel',          descricao: 'Importar acordos via planilha Excel', grupo: 'Acordos' },
  // Painéis
  { key: 'ver_painel_lider',     label: 'Painel Líder',            descricao: 'Acessar o painel de análise do líder', grupo: 'Painéis' },
  { key: 'ver_analiticos_setor', label: 'Analíticos do setor',     descricao: 'Ver métricas e gráficos do setor', grupo: 'Painéis' },
  { key: 'ver_analiticos_global',label: 'Analíticos globais',      descricao: 'Ver métricas e gráficos de toda a empresa', grupo: 'Painéis' },
  { key: 'ver_todos_setores',    label: 'Ver todos os setores',    descricao: 'Acesso a dados de todos os setores', grupo: 'Painéis' },
  // Filtros
  { key: 'filtrar_por_setor',    label: 'Filtrar por setor',       descricao: 'Aplicar filtro de setor nos relatórios', grupo: 'Filtros' },
  { key: 'filtrar_por_equipe',   label: 'Filtrar por equipe',      descricao: 'Aplicar filtro de equipe nos relatórios', grupo: 'Filtros' },
  { key: 'filtrar_por_usuario',  label: 'Filtrar por usuário',     descricao: 'Aplicar filtro de usuário nos relatórios', grupo: 'Filtros' },
  // Gestão
  { key: 'ver_usuarios',         label: 'Ver usuários',            descricao: 'Acessar lista de usuários', grupo: 'Gestão' },
  { key: 'ver_equipes',          label: 'Ver equipes',             descricao: 'Acessar lista de equipes', grupo: 'Gestão' },
  { key: 'ver_metas',            label: 'Ver metas',               descricao: 'Acessar configuração de metas', grupo: 'Gestão' },
  { key: 'ver_operadores',       label: 'Ver operadores',          descricao: 'Ver dados de outros operadores', grupo: 'Gestão' },
  { key: 'ver_lixeira',          label: 'Acessar lixeira',         descricao: 'Ver acordos excluídos na lixeira', grupo: 'Gestão' },
];

// Cargos editáveis (não incluímos operador e lider pois são padrão do sistema)
const CARGOS_EDITAVEIS = ['elite', 'gerencia', 'diretoria', 'operador', 'lider'];

const DESCRICOES_CARGO: Record<string, string> = {
  operador: 'Usuário operacional padrão. Pode criar e gerenciar apenas os próprios acordos.',
  lider: 'Líder de equipe/setor. Acesso aos acordos e métricas do setor.',
  elite: 'Líder híbrido com alternância entre visão individual e geral.',
  gerencia: 'Mesmas permissões de líder para uso gerencial.',
  diretoria: 'Visualização analítica completa sem capacidade de edição.',
};

type PermissoesMap = Record<string, boolean>;

interface CargoPermissao {
  id?: string;
  cargo: string;
  permissoes: PermissoesMap;
  descricao?: string;
}

export default function AdminCargos() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const isAdmin = perfil?.perfil === 'administrador' || perfil?.perfil === 'super_admin';

  const [dados, setDados] = useState<CargoPermissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [editado, setEditado] = useState<Record<string, PermissoesMap>>({});

  async function fetchDados() {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cargos_permissoes')
        .select('*')
        .eq('empresa_id', empresa.id)
        .order('cargo');
      if (error) throw error;
      setDados((data as CargoPermissao[]) || []);
    } catch (e) {
      toast.error('Erro ao carregar permissões');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDados(); }, [empresa?.id]);

  function getPermissoes(cargo: string): PermissoesMap {
    // Preferir estado local editado, senão o do banco
    if (editado[cargo]) return editado[cargo];
    const found = dados.find(d => d.cargo === cargo);
    return found?.permissoes ?? {};
  }

  function togglePermissao(cargo: string, key: string) {
    if (!isAdmin) return;
    const atual = getPermissoes(cargo);
    setEditado(prev => ({
      ...prev,
      [cargo]: { ...atual, [key]: !atual[key] },
    }));
  }

  async function salvarCargo(cargo: string) {
    if (!empresa?.id || !isAdmin) return;
    setSalvando(cargo);
    try {
      const permissoes = getPermissoes(cargo);
      const { error } = await supabase
        .from('cargos_permissoes')
        .upsert({
          empresa_id: empresa.id,
          cargo,
          permissoes,
        }, { onConflict: 'empresa_id,cargo' });
      if (error) throw error;
      toast.success(`Permissões de "${PERFIL_LABELS[cargo] ?? cargo}" salvas!`);
      // Limpar estado local após salvar
      setEditado(prev => {
        const next = { ...prev };
        delete next[cargo];
        return next;
      });
      fetchDados();
    } catch (e) {
      toast.error('Erro ao salvar permissões');
    } finally {
      setSalvando(null);
    }
  }

  const grupos = [...new Set(PERMISSOES_META.map(p => p.grupo))];

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Apenas administradores podem gerenciar permissões de cargos.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4 md:p-6">
        {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-primary" />
              Permissões de Cargos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure o que cada cargo pode acessar e fazer no sistema
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDados} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
            Recarregar
          </Button>
        </div>

        {/* ── Cards por cargo ───────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {CARGOS_EDITAVEIS.map((cargo, idx) => {
              const perms = getPermissoes(cargo);
              const temAlteracao = !!editado[cargo];
              const colorClass = PERFIL_COLORS[cargo] ?? 'bg-muted/10 text-muted border-muted/30';

              return (
                <motion.div
                  key={cargo}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className="border-border/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Badge className={cn('border', colorClass)}>
                            {PERFIL_LABELS[cargo] ?? cargo}
                          </Badge>
                          {temAlteracao && (
                            <Badge variant="outline" className="text-warning border-warning/40 text-xs">
                              Alterações não salvas
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => salvarCargo(cargo)}
                          disabled={salvando === cargo || !temAlteracao}
                          className="h-7 text-xs"
                        >
                          {salvando === cargo ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3 mr-1" />
                          )}
                          Salvar
                        </Button>
                      </div>
                      {DESCRICOES_CARGO[cargo] && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {DESCRICOES_CARGO[cargo]}
                        </p>
                      )}
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-5">
                        {grupos.map(grupo => {
                          const permsDoGrupo = PERMISSOES_META.filter(p => p.grupo === grupo);
                          return (
                            <div key={grupo}>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                {grupo}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {permsDoGrupo.map(perm => (
                                  <div
                                    key={perm.key}
                                    className={cn(
                                      'flex items-center justify-between p-2.5 rounded-lg border transition-colors',
                                      perms[perm.key]
                                        ? 'bg-primary/5 border-primary/20'
                                        : 'bg-muted/30 border-border/50',
                                    )}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs font-medium truncate">{perm.label}</span>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className="w-3 h-3 text-muted-foreground flex-shrink-0 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-52 text-xs">
                                          {perm.descricao}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Switch
                                      checked={!!perms[perm.key]}
                                      onCheckedChange={() => togglePermissao(cargo, perm.key)}
                                      disabled={!isAdmin}
                                      className="flex-shrink-0"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Nota informativa ─────────────────────────────────────────────── */}
        <Card className="border-border/50 bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Nota:</strong> As permissões aqui configuradas controlam o acesso às funcionalidades do sistema para cada cargo.</p>
                <p>Cargos como <strong>Administrador</strong> e <strong>Super Admin</strong> têm acesso total e não são configuráveis aqui.</p>
                <p>As alterações são aplicadas imediatamente após salvar, sem necessidade de recarregar a página.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
