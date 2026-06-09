import { Building2, Layers, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { cn } from '@/lib/utils';
import type { VisaoFiltroAcordos } from './helpers';

export interface AcordosFiltersProps {
  activeTab: 'analitico' | 'todos' | 'pagos' | 'nao_pagos';
  setActiveTab: (tab: 'analitico' | 'todos' | 'pagos' | 'nao_pagos') => void;
  isLider: boolean;
  isElite: boolean;
  equipesDoSetor: { id: string; nome: string }[];
  visaoFiltroAcordos: VisaoFiltroAcordos;
  setVisaoFiltroAcordos: (v: VisaoFiltroAcordos) => void;
  busca: string;
  setBusca: (v: string) => void;
  filtroStatus: string;
  setFiltroStatus: (v: string) => void;
  filtroTipo: string;
  setFiltroTipo: (v: string) => void;
  filtroData: string;
  setFiltroData: (v: string) => void;
  filtroOperador: string;
  setFiltroOperador: (v: string) => void;
  filtroVinculo: 'todos' | 'direto' | 'extra';
  setFiltroVinculo: (v: 'todos' | 'direto' | 'extra') => void;
  statusLabels: Record<string, string>;
  tipoLabels: Record<string, string>;
  operadoresMap: Record<string, string>;
  filtrosAtivosCount: number;
  temFiltros: boolean;
  isPP: boolean;
  usuarioTemLogicaDiretoExtra: boolean;
  temPermissao: (p: string) => boolean;
  setCurrentPage: (n: number) => void;
  limparFiltros: () => void;
}

export function AcordosFilters({
  activeTab, setActiveTab,
  isLider, isElite, equipesDoSetor, visaoFiltroAcordos, setVisaoFiltroAcordos,
  busca, setBusca, filtroStatus, setFiltroStatus, filtroTipo, setFiltroTipo,
  filtroData, setFiltroData, filtroOperador, setFiltroOperador,
  filtroVinculo, setFiltroVinculo,
  statusLabels, tipoLabels, operadoresMap,
  filtrosAtivosCount, temFiltros, isPP, usuarioTemLogicaDiretoExtra, temPermissao,
  setCurrentPage, limparFiltros,
}: AcordosFiltersProps) {
  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {([
          { key: 'analitico', label: 'Analítico' },
          { key: 'todos',     label: 'Todos' },
          { key: 'pagos',     label: 'Pagos / Quitados' },
          { key: 'nao_pagos', label: 'Não Pagos' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Seletor de visão Líder/Elite */}
      {(isLider || isElite) && equipesDoSetor.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-3 rounded-xl border border-border bg-card">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Visualizar acordos de:</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setVisaoFiltroAcordos('setor')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                visaoFiltroAcordos === 'setor'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40',
              )}
            >
              <Building2 className="w-3 h-3" /> Setor geral
            </button>
            {equipesDoSetor.map(eq => (
              <button
                key={eq.id}
                onClick={() => setVisaoFiltroAcordos(`equipe:${eq.id}` as VisaoFiltroAcordos)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                  visaoFiltroAcordos === `equipe:${eq.id}`
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/40',
                )}
              >
                <Layers className="w-3 h-3" /> {eq.nome}
              </button>
            ))}
            {isElite && (
              <button
                onClick={() => setVisaoFiltroAcordos('individual')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                  visaoFiltroAcordos === 'individual'
                    ? 'bg-role-elite text-white border-role-elite'
                    : 'bg-background text-muted-foreground border-border hover:border-role-elite/40',
                )}
              >
                Individual
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      <Card className="border-border mb-4" data-tour="filtros">
        <CardContent className="p-3">
          {filtrosAtivosCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pb-2.5 border-b border-border/50">
              <span className="text-[11px] font-medium text-muted-foreground">
                {filtrosAtivosCount} {filtrosAtivosCount === 1 ? 'filtro ativo' : 'filtros ativos'}:
              </span>
              {busca && (
                <button onClick={() => { setBusca(''); setCurrentPage(1); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors">
                  &quot;{busca}&quot; <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filtroStatus && filtroStatus !== 'all' && (
                <button onClick={() => { setFiltroStatus(''); setCurrentPage(1); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors">
                  {statusLabels[filtroStatus] || filtroStatus} <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filtroTipo && filtroTipo !== 'all' && (
                <button onClick={() => { setFiltroTipo(''); setCurrentPage(1); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors">
                  {tipoLabels[filtroTipo] || filtroTipo} <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filtroVinculo !== 'todos' && (
                <button onClick={() => { setFiltroVinculo('todos'); setCurrentPage(1); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors">
                  {filtroVinculo === 'direto' ? 'Apenas Direto' : 'Apenas Extra'} <X className="w-2.5 h-2.5" />
                </button>
              )}
              {filtroOperador && filtroOperador !== 'all' && (
                <button onClick={() => { setFiltroOperador(''); setCurrentPage(1); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors">
                  {operadoresMap[filtroOperador] || 'Operador'} <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar NR, nome, WhatsApp..."
                value={busca}
                onChange={e => { setBusca(e.target.value); setCurrentPage(1); }}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filtroStatus} onValueChange={v => { setFiltroStatus(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                {Object.entries(tipoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {usuarioTemLogicaDiretoExtra && (
              <Select
                value={filtroVinculo}
                onValueChange={v => { setFiltroVinculo(v as 'todos' | 'direto' | 'extra'); setCurrentPage(1); }}
              >
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Direto/Extra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Direto e Extra</SelectItem>
                  <SelectItem value="direto">Apenas Direto</SelectItem>
                  <SelectItem value="extra">Apenas Extra</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isPP && temPermissao('filtrar_por_usuario') && (
              <Select value={filtroOperador} onValueChange={v => { setFiltroOperador(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Operador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Operadores</SelectItem>
                  {Object.entries(operadoresMap).map(([id, nome]) => (
                    <SelectItem key={id} value={id}>{nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-1">
              <DatePickerField
                value={filtroData}
                onChange={v => { setFiltroData(v); setCurrentPage(1); }}
                triggerClassName="w-40 text-xs"
                placeholder="Filtrar data"
              />
              {filtroData && (
                <button
                  type="button"
                  onClick={() => { setFiltroData(''); setCurrentPage(1); }}
                  className="h-8 w-8 flex items-center justify-center rounded-md border border-input text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Limpar filtro de data"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {temFiltros && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-8 text-xs gap-1">
                <X className="w-3 h-3" /> Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
