import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, RefreshCw, Filter, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { supabase, LogSistema, Empresa } from '@/lib/supabase';
import { fetchEmpresas } from '@/services/empresas.service';
import { TODAS_EMPRESAS_SELECT_VALUE } from '@/lib/index';
import { cn } from '@/lib/utils';

const ACAO_CORES: Record<string, string> = {
  INSERT: 'bg-success/10 text-success border-success/30',
  UPDATE: 'bg-warning/10 text-warning border-warning/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
  LOGIN: 'bg-primary/10 text-primary border-primary/30',
};

export default function AdminLogs() {
  const { perfil } = useAuth();
  const { empresa: tenantEmpresa } = useEmpresa();
  const isSuperAdmin = perfil?.perfil === 'super_admin';
  const [logs, setLogs] = useState<LogSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTabela, setFiltroTabela] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  useEffect(() => {
    if (tenantEmpresa?.id) {
      setFiltroEmpresa((current) => current || tenantEmpresa.id);
    }
  }, [tenantEmpresa?.id]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchEmpresas().then(setEmpresas).catch(() => {});
      return;
    }

    setEmpresas(tenantEmpresa ? [tenantEmpresa] : []);
  }, [isSuperAdmin, tenantEmpresa]);

  async function fetchLogs() {
    setLoading(true);
    let query = supabase
      .from('logs_sistema')
      .select('*, perfis(nome,email), empresas(id,nome)')
      .order('criado_em', { ascending: false })
      .limit(200);
    if (filtroTabela) query = query.eq('tabela', filtroTabela);
    if (isSuperAdmin) {
      if (filtroEmpresa) query = query.eq('empresa_id', filtroEmpresa);
    } else if (tenantEmpresa?.id) {
      query = query.eq('empresa_id', tenantEmpresa.id);
    }
    const { data } = await query;
    setLogs((data as LogSistema[]) || []);
    setLoading(false);
  }

  useEffect(() => { fetchLogs(); }, [filtroTabela, filtroEmpresa, tenantEmpresa?.id, isSuperAdmin]);

  const tabelas = ['acordos', 'perfis', 'modelos_mensagem'];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" /> Logs do Sistema
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro de todas as ações realizadas</p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && empresas.length > 1 && (
            <Select
              value={filtroEmpresa || TODAS_EMPRESAS_SELECT_VALUE}
              onValueChange={(value) => setFiltroEmpresa(value === TODAS_EMPRESAS_SELECT_VALUE ? '' : value)}
            >
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_EMPRESAS_SELECT_VALUE}>Todas Empresas</SelectItem>
                {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {!isSuperAdmin && tenantEmpresa && (
            <Badge variant="outline" className="h-8 px-3 text-xs">
              {tenantEmpresa.nome}
            </Badge>
          )}
          <Select value={filtroTabela} onValueChange={setFiltroTabela}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Filtrar tabela" /></SelectTrigger>
            <SelectContent>
              {tabelas.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtroTabela && <Button variant="ghost" size="sm" className="h-8" onClick={() => setFiltroTabela('')}>Limpar</Button>}
          <Button variant="outline" size="sm" className="h-8" onClick={fetchLogs}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">DATA/HORA</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">USUÁRIO</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">EMPRESA</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">AÇÃO</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">TABELA</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">REGISTRO</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">DETALHES</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando logs...</td></tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <ClipboardList className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground">Nenhum log encontrado</p>
                    </td>
                  </tr>
                ) : logs.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className={cn('border-b border-border/50 hover:bg-accent/40', i % 2 === 0 && 'bg-muted/10')}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(log.criado_em).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {(log.perfis as { nome?: string; email?: string } | undefined)?.nome || (log.perfis as { email?: string } | undefined)?.email || 'Sistema'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {(log as any).empresas?.nome || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                        ACAO_CORES[log.acao] || 'bg-muted text-muted-foreground border-border'
                      )}>
                        {log.acao}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{log.tabela || '-'}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{log.registro_id || '-'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                      {log.detalhes ? JSON.stringify(log.detalhes) : '-'}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
