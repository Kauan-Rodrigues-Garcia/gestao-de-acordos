import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ESTADOS_BRASIL } from '@/lib/index';

interface PPTableFiltersProps {
  activeTab: 'todos' | 'pendentes' | 'pagos' | 'nao_pagos';
  setActiveTab: (tab: 'todos' | 'pendentes' | 'pagos' | 'nao_pagos') => void;
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
  /** Entre as abas e os filtros: o «Visualizar acordos de:». */
  children?: ReactNode;
}

export function PPTableFilters({
  activeTab, setActiveTab,
  busca, setBusca,
  filtroTipo, setFiltroTipo,
  filtroData, setFiltroData,
  filtroVinculo, setFiltroVinculo,
  colFiltroEstado, setColFiltroEstado,
  estadoDropdown, setEstadoDropdown,
  setCurrentPage,
  tipoLabels,
  isPP,
  usuarioTemLogicaDiretoExtra,
  temFiltros, limparFiltros,
  children,
}: PPTableFiltersProps) {
  return (
    <>
      {/* Tabs */}
      {/* `data-natal-chao`: a linha das abas é o chão do chalé de Natal (`Natal/chale`), como no Nosso produto. */}
      <div data-natal-chao className="flex items-center gap-1 mb-4 border-b border-border">
        {([
          { key: 'todos',      label: 'Todos' },
          { key: 'pendentes',  label: 'Pendentes' },
          { key: 'pagos',      label: 'Pagos / Quitados' },
          { key: 'nao_pagos',  label: 'Não Pagos' },
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

      {/* «Visualizar acordos de:» (`SeletorAlcance`) — depois das abas, como no Nosso produto. */}
      {children}

      {/* Filtros */}
      <Card className="border-border mb-4" data-tour="filtros">
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
            {/* Filtro de status por dropdown removido — as abas superiores
                (Todos / Pendentes / Pagos / Não Pagos) já cobrem o status. */}
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
      </Card>
    </>
  );
}

/**
 * O seletor de mês da regra Cofen, no cabeçalho debaixo do título (10/11/2026),
 * no mesmo lugar e no mesmo jeito do Nosso produto. Antes ficava abaixo das
 * abas; com ele no cabeçalho a ordem das duas mesas é a mesma, e o chalé de
 * Natal tem a mesma altura nas duas.
 */
export function SeletorMesCofen({ mesFiltro, setMesFiltro, setCurrentPage }: {
  mesFiltro: string;
  setMesFiltro: (mes: string) => void;
  setCurrentPage: (p: number) => void;
}) {
  const irPara = (y: number, m0: number) => {
    const d = new Date(y, m0, 1);
    setMesFiltro(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setCurrentPage(1);
  };
  const [y, m] = mesFiltro.split('-').map(Number);
  return (
    <div className="flex items-center gap-1 mt-2">
      <Button variant="outline" size="icon" className="h-6 w-6" aria-label="Mês anterior" onClick={() => irPara(y, m - 2)}>
        <ChevronLeft className="w-3 h-3" />
      </Button>
      <span className="text-xs font-semibold min-w-[100px] text-center text-muted-foreground">
        {new Date(mesFiltro + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </span>
      <Button variant="outline" size="icon" className="h-6 w-6" aria-label="Próximo mês" onClick={() => irPara(y, m)}>
        <ChevronRight className="w-3 h-3" />
      </Button>
      <Button
        variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground px-2"
        onClick={() => { const d = new Date(); irPara(d.getFullYear(), d.getMonth()); }}
      >
        Mês atual
      </Button>
    </div>
  );
}
