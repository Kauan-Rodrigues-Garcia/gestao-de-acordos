import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { BarChart3, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ESTADOS_BRASIL } from '@/lib/index';

interface PPTableFiltersProps {
  activeTab: 'todos' | 'pagos' | 'nao_pagos' | 'analitico';
  setActiveTab: (tab: 'todos' | 'pagos' | 'nao_pagos' | 'analitico') => void;
  mesFiltro: string;
  setMesFiltro: (mes: string) => void;
  busca: string;
  setBusca: (v: string) => void;
  filtroStatus: string;
  setFiltroStatus: (v: string) => void;
  filtroTipo: string;
  setFiltroTipo: (v: string) => void;
  filtroData: string;
  setFiltroData: (v: string) => void;
  filtroVinculo: 'todos' | 'direto' | 'extra';
  setFiltroVinculo: (v: 'todos' | 'direto' | 'extra') => void;
  colFiltroEstado: string;
  setColFiltroEstado: (v: string) => void;
  estadoDropdown: boolean;
  setEstadoDropdown: (v: boolean) => void;
  setCurrentPage: (p: number) => void;
  statusLabels: Record<string, string>;
  tipoLabels: Record<string, string>;
  isPP: boolean;
  usuarioTemLogicaDiretoExtra: boolean;
  temFiltros: boolean;
  limparFiltros: () => void;
}

export function PPTableFilters({
  activeTab, setActiveTab,
  mesFiltro, setMesFiltro,
  busca, setBusca,
  filtroStatus, setFiltroStatus,
  filtroTipo, setFiltroTipo,
  filtroData, setFiltroData,
  filtroVinculo, setFiltroVinculo,
  colFiltroEstado, setColFiltroEstado,
  estadoDropdown, setEstadoDropdown,
  setCurrentPage,
  statusLabels, tipoLabels,
  isPP,
  usuarioTemLogicaDiretoExtra,
  temFiltros, limparFiltros,
}: PPTableFiltersProps) {
  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {([
          { key: 'todos',      label: 'Todos',             icon: null },
          { key: 'pagos',      label: 'Pagos / Quitados',  icon: null },
          { key: 'nao_pagos',  label: 'Não Pagos',         icon: null },
          { key: 'analitico',  label: 'Analítico',         icon: BarChart3 },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Seletor de mês */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Mês:</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon" className="h-7 w-7"
            onClick={() => {
              const [y, m] = mesFiltro.split('-').map(Number);
              const prev = new Date(y, m - 2, 1);
              setMesFiltro(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
              setCurrentPage(1);
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-semibold min-w-[110px] text-center">
            {new Date(mesFiltro + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <Button
            variant="outline" size="icon" className="h-7 w-7"
            onClick={() => {
              const [y, m] = mesFiltro.split('-').map(Number);
              const next = new Date(y, m, 1);
              setMesFiltro(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
              setCurrentPage(1);
            }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => {
              const d = new Date();
              setMesFiltro(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              setCurrentPage(1);
            }}
          >
            Mês atual
          </Button>
        </div>
      </div>

      {/* Filtros — ocultos na aba Analítico */}
      {activeTab !== 'analitico' && <Card className="border-border mb-4" data-tour="filtros">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar Código ou nome..."
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
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setEstadoDropdown(!estadoDropdown)}
                className={cn(
                  'h-8 text-sm bg-background border border-input rounded-md px-3 font-normal flex items-center gap-1.5 whitespace-nowrap hover:bg-accent transition-colors',
                  colFiltroEstado ? 'border-primary/60 bg-primary/5 text-primary' : 'text-muted-foreground'
                )}
              >
                <span>{colFiltroEstado || 'Estado'}</span>
                {colFiltroEstado && (
                  <span
                    className="text-[10px] text-muted-foreground hover:text-destructive cursor-pointer leading-none ml-0.5"
                    onClick={e => { e.stopPropagation(); setColFiltroEstado(''); setEstadoDropdown(false); setCurrentPage(1); }}
                  >✕</span>
                )}
              </button>
              {estadoDropdown && (
                <div className="absolute top-9 left-0 z-50 bg-background border border-border rounded-lg shadow-xl p-1.5 grid grid-cols-4 gap-0.5 min-w-[140px]">
                  {(ESTADOS_BRASIL as readonly string[]).map(uf => (
                    <button
                      key={uf} type="button"
                      onClick={() => { setColFiltroEstado(uf); setEstadoDropdown(false); setCurrentPage(1); }}
                      className={cn(
                        'text-[10px] font-mono px-1 py-0.5 rounded hover:bg-primary/10 hover:text-primary transition-colors',
                        colFiltroEstado === uf && 'bg-primary/15 text-primary font-semibold'
                      )}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                {isPP
                  ? [
                      <SelectItem key="boleto" value="boleto">Boleto / PIX</SelectItem>,
                      <SelectItem key="cartao" value="cartao">Cartão de Crédito</SelectItem>,
                    ]
                  : Object.entries(tipoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)
                }
              </SelectContent>
            </Select>
            {usuarioTemLogicaDiretoExtra && (
              <Select
                value={filtroVinculo}
                onValueChange={(v) => { setFiltroVinculo(v as 'todos' | 'direto' | 'extra'); setCurrentPage(1); }}
              >
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Direto/Extra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Direto e Extra</SelectItem>
                  <SelectItem value="direto">Apenas Direto</SelectItem>
                  <SelectItem value="extra">Apenas Extra</SelectItem>
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
      </Card>}
    </>
  );
}
