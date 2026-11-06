import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePickerField } from '@/components/DatePickerField';
import { cn } from '@/lib/utils';
import type { VisaoFiltroAcordos } from './helpers';
import { BotaoMensagensWhatsapp } from './MensagensWhatsapp';
import { SeletorAlcance } from './SeletorAlcance';
import type { NivelEscopo } from '@/lib/permissoes-escopo';
import type { AcordoTag } from '@/lib/supabase';

export interface AcordosFiltersProps {
  activeTab: 'analitico' | 'todos' | 'pagos' | 'nao_pagos';
  setActiveTab: (tab: 'analitico' | 'todos' | 'pagos' | 'nao_pagos') => void;
  /** Níveis que este cargo pode escolher na aba Acordos. */
  niveis: readonly NivelEscopo[];
  equipesDoSetor: { id: string; nome: string }[];
  /**
   * Setores da empresa. Só chega preenchido para quem tem `todos_setores` —
   * quem enxerga um setor só não tem escolha a fazer e não ganha o seletor.
   */
  setoresDisponiveis: { id: string; nome: string }[];
  /** Setor em foco. `null` = todos. Recorta a lista de equipes E os acordos. */
  filtroSetor: string | null;
  setFiltroSetor: (v: string | null) => void;
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
  filtroTag: string;
  setFiltroTag: (v: string) => void;
  /** Só as tags presentes em algum acordo que esta pessoa enxerga. */
  tagsDisponiveis: AcordoTag[];
  setFiltroVinculo: (v: 'todos' | 'direto' | 'extra') => void;
  statusLabels: Record<string, string>;
  tipoLabels: Record<string, string>;
  /** Nomes para o chip do filtro ativo (qualquer operador já visto). */
  operadoresMap: Record<string, string>;
  /** As opções do seletor de operador: só quem está no setor/equipe em foco. */
  operadoresDoFiltro: { id: string; nome: string }[];
  filtrosAtivosCount: number;
  temFiltros: boolean;
  usuarioTemLogicaDiretoExtra: boolean;
  temPermissao: (p: string) => boolean;
  setCurrentPage: (n: number) => void;
  limparFiltros: () => void;
  /** Abre o editor das mensagens de WhatsApp (botão ao lado de «Filtrar data»). */
  onAbrirMensagens?: () => void;
}

export function AcordosFilters({
  activeTab, setActiveTab,
  niveis, equipesDoSetor, setoresDisponiveis, filtroSetor, setFiltroSetor,
  visaoFiltroAcordos, setVisaoFiltroAcordos,
  busca, setBusca, filtroStatus, setFiltroStatus, filtroTipo, setFiltroTipo,
  filtroData, setFiltroData, filtroOperador, setFiltroOperador,
  filtroVinculo, setFiltroVinculo,
  filtroTag, setFiltroTag, tagsDisponiveis,
  statusLabels, tipoLabels, operadoresMap, operadoresDoFiltro,
  filtrosAtivosCount, temFiltros, usuarioTemLogicaDiretoExtra, temPermissao,
  setCurrentPage, limparFiltros,
  onAbrirMensagens,
}: AcordosFiltersProps) {
  return (
    <>
      {/* Tabs */}
      {/* `data-natal-chao`: a linha das abas é o chão do chalé de Natal (`Natal/chale`). */}
      <div data-natal-chao className="flex items-center gap-1 mb-4 border-b border-border">
        {([
          { key: 'todos',     label: 'Todos' },
          { key: 'analitico', label: 'Verificar' },
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
            {/* `data-alvo-feitico`: o Cavalo da Guerra derruba a aba com a cabeçada (só visual, ver Corrida/guerra/alvos.js). */}
            <span data-alvo-feitico="aba">{tab.label}</span>
          </button>
        ))}

        {/* O Pix Automático era a quinta aba daqui; desde 16/10/2026 é tela
            própria no menu, embaixo de Novo Acordo. */}
      </div>

      {/* «Visualizar acordos de:» — setor, equipe e Individual, pelos NÍVEIS da aba
          (`SeletorAlcance`, o mesmo da mesa da regra Cofen). */}
      <SeletorAlcance
        niveis={niveis} equipesDoSetor={equipesDoSetor} setoresDisponiveis={setoresDisponiveis}
        filtroSetor={filtroSetor} setFiltroSetor={setFiltroSetor}
        visao={visaoFiltroAcordos} setVisao={setVisaoFiltroAcordos}
        aoMudar={() => setCurrentPage(1)}
      />

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
            {/* Filtro de status por dropdown removido — as abas superiores
                (Todos / Verificar / Pagos / Não Pagos) já cobrem esse filtro. */}
            <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                {Object.entries(tipoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Some quando nenhuma tag aparece no que a pessoa enxerga: um
                filtro sem opção só ocupa espaço na barra. */}
            {tagsDisponiveis.length > 0 && (
              <Select value={filtroTag} onValueChange={v => { setFiltroTag(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Tag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tags</SelectItem>
                  {tagsDisponiveis.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: t.cor }}
                          aria-hidden
                        />
                        {t.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            {/* Filtro de operador — cargos superiores (permissão `filtrar_por_usuario`).
                Antes vinha com `isPP &&` na frente e nunca aparecia: esta página
                redireciona a PaguePlay na entrada, então `isPP` é sempre false aqui. */}
            {temPermissao('filtrar_por_usuario') && (
              <Select value={filtroOperador} onValueChange={v => { setFiltroOperador(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Operador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Operadores</SelectItem>
                  {operadoresDoFiltro.map(({ id, nome }) => (
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
              {/* Pedido de 28/09/2026: pequeno, colado no filtro de data. */}
              {onAbrirMensagens && <BotaoMensagensWhatsapp onClick={onAbrirMensagens} />}
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
