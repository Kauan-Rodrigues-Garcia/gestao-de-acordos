/**
 * src/pages/AdminLogs/LogsFiltros.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A barra de filtros.
 *
 * ## Duas camadas, de propósito
 * A linha de cima tem o que se usa sempre: período, busca e severidade. O resto
 * (categoria, ação, autor, tabela, origem, campo alterado) fica atrás de "Mais
 * filtros". Nove seletores lado a lado transformam a busca de um evento numa
 * tarefa de configuração — e nove seletores é o que a lista de filtros deste
 * recurso realmente tem.
 *
 * ## Cada filtro aplicado aparece como ficha removível
 * Filtro escondido dentro de um `<select>` colapsado é filtro esquecido: a
 * pessoa conclui "não há nada aqui" quando na verdade há um recorte ativo de
 * meia hora atrás. As fichas mostram o recorte inteiro e cada uma sai com um
 * clique.
 */
import { useState } from 'react';
import {
  Search, Filter, X, ChevronDown, Calendar, Building2, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Empresa } from '@/lib/supabase';
import { TODAS_EMPRESAS_SELECT_VALUE } from '@/lib/index';
import {
  CATEGORIAS, SEVERIDADES, ORIGENS,
  categoriaMeta, severidadeMeta, origemLabel, descreverAcao, campoLabel,
} from '@/lib/logs-catalogo';
import { PERIODO_LABEL, type FiltrosTela, type PeriodoPreset } from '@/hooks/useLogs';
import type { OpcoesFiltro } from '@/services/logs.service';

/** Valor sentinela do Radix Select: `''` fecha o componente com erro. */
const TODOS = '__todos__';

const PERIODOS: PeriodoPreset[] = ['hoje', '24h', '7d', '30d', '90d', 'tudo'];

interface Props {
  filtros: FiltrosTela;
  opcoes: OpcoesFiltro;
  filtrosAtivos: number;
  isSuperAdmin: boolean;
  empresas: Empresa[];
  setFiltro: <K extends keyof FiltrosTela>(chave: K, valor: FiltrosTela[K]) => void;
  limparFiltros: () => void;
}

export default function LogsFiltros({
  filtros, opcoes, filtrosAtivos, isSuperAdmin, empresas, setFiltro, limparFiltros,
}: Props) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="space-y-2">
      {/* ── Linha principal ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Período */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFiltro('periodo', p)}
              aria-pressed={filtros.periodo === p}
              className={cn(
                'px-2.5 h-7 text-[11px] font-medium rounded-md transition-colors',
                filtros.periodo === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {PERIODO_LABEL[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFiltro('periodo', 'custom')}
            aria-pressed={filtros.periodo === 'custom'}
            title="Período personalizado"
            className={cn(
              'px-2 h-7 rounded-md transition-colors',
              filtros.periodo === 'custom'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={filtros.busca}
            onChange={(e) => setFiltro('busca', e.target.value)}
            placeholder="Buscar por descrição, cliente, NR, autor ou ação…"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {filtros.busca && (
            <button
              type="button"
              onClick={() => setFiltro('busca', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Severidade */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setFiltro('severidade', null)}
            aria-pressed={!filtros.severidade}
            className={cn(
              'px-2.5 h-7 text-[11px] font-medium rounded-md transition-colors',
              !filtros.severidade
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            Tudo
          </button>
          {SEVERIDADES.map((s) => {
            const meta = severidadeMeta(s);
            const ativo = filtros.severidade === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFiltro('severidade', ativo ? null : s)}
                aria-pressed={ativo}
                className={cn(
                  'px-2.5 h-7 text-[11px] font-medium rounded-md transition-colors inline-flex items-center gap-1.5',
                  ativo
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.ponto)} />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Empresa (só super_admin) */}
        {isSuperAdmin && empresas.length > 1 && (
          <Select
            value={filtros.empresaId ?? TODAS_EMPRESAS_SELECT_VALUE}
            onValueChange={(v) =>
              setFiltro('empresaId', v === TODAS_EMPRESAS_SELECT_VALUE ? null : v)
            }
          >
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1 shrink-0" />
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_EMPRESAS_SELECT_VALUE}>Todas as empresas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant={expandido ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs shrink-0"
          onClick={() => setExpandido((v) => !v)}
        >
          <Filter className="w-3.5 h-3.5" />
          Mais filtros
          {filtrosAvancadosAtivos(filtros) > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
              {filtrosAvancadosAtivos(filtros)}
            </Badge>
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expandido && 'rotate-180')} />
        </Button>
      </div>

      {/* ── Período personalizado ─────────────────────────────────────────── */}
      {filtros.periodo === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg border border-border bg-muted/20">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">De</Label>
            <Input
              type="date"
              value={filtros.customDe ?? ''}
              max={filtros.customAte ?? undefined}
              onChange={(e) => setFiltro('customDe', e.target.value || null)}
              className="h-8 text-xs w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Até</Label>
            <Input
              type="date"
              value={filtros.customAte ?? ''}
              min={filtros.customDe ?? undefined}
              onChange={(e) => setFiltro('customAte', e.target.value || null)}
              className="h-8 text-xs w-[150px]"
            />
          </div>
          <p className="text-[10px] text-muted-foreground pb-2">
            Os dois limites entram no resultado, do início do primeiro dia ao fim do último.
          </p>
        </div>
      )}

      {/* ── Filtros avançados ─────────────────────────────────────────────── */}
      {expandido && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 p-3 rounded-lg border border-border bg-muted/20">
          <CampoSelect
            label="Categoria"
            valor={filtros.categoria}
            onChange={(v) => setFiltro('categoria', v)}
            opcoes={CATEGORIAS.map((c) => ({ valor: c, label: categoriaMeta(c).label }))}
            rotuloTodos="Todas"
          />
          <CampoSelect
            label="Ação"
            valor={filtros.acao}
            onChange={(v) => setFiltro('acao', v)}
            opcoes={opcoes.acoes.map((a) => ({ valor: a, label: descreverAcao(a) }))}
            rotuloTodos="Todas"
            vazio="Nenhuma ação no período"
          />
          <CampoSelect
            label="Autor"
            valor={filtros.usuarioId}
            onChange={(v) => setFiltro('usuarioId', v)}
            opcoes={opcoes.usuarios.map((u) => ({ valor: u.id, label: u.nome }))}
            rotuloTodos="Todos"
            vazio="Nenhum autor no período"
          />
          <CampoSelect
            label="Tabela"
            valor={filtros.tabela}
            onChange={(v) => setFiltro('tabela', v)}
            opcoes={opcoes.tabelas.map((t) => ({ valor: t, label: t }))}
            rotuloTodos="Todas"
            vazio="Nenhuma tabela no período"
          />
          <CampoSelect
            label="Origem"
            valor={filtros.origem}
            onChange={(v) => setFiltro('origem', v)}
            opcoes={ORIGENS.map((o) => ({ valor: o, label: origemLabel(o) }))}
            rotuloTodos="Todas"
          />
        </div>
      )}

      {/* ── Fichas do recorte ativo ───────────────────────────────────────── */}
      {filtrosAtivos > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
            Filtrando por
          </span>

          {filtros.periodo !== '7d' && (
            <Ficha
              label={
                filtros.periodo === 'custom'
                  ? `${filtros.customDe ?? '…'} → ${filtros.customAte ?? '…'}`
                  : PERIODO_LABEL[filtros.periodo]
              }
              onRemover={() => setFiltro('periodo', '7d')}
            />
          )}
          {filtros.severidade && (
            <Ficha
              label={severidadeMeta(filtros.severidade).label}
              onRemover={() => setFiltro('severidade', null)}
            />
          )}
          {filtros.categoria && (
            <Ficha
              label={categoriaMeta(filtros.categoria).label}
              onRemover={() => setFiltro('categoria', null)}
            />
          )}
          {filtros.acao && (
            <Ficha label={descreverAcao(filtros.acao)} onRemover={() => setFiltro('acao', null)} />
          )}
          {filtros.usuarioId && (
            <Ficha
              label={
                opcoes.usuarios.find((u) => u.id === filtros.usuarioId)?.nome ?? 'Autor selecionado'
              }
              onRemover={() => setFiltro('usuarioId', null)}
            />
          )}
          {filtros.tabela && (
            <Ficha label={filtros.tabela} onRemover={() => setFiltro('tabela', null)} />
          )}
          {filtros.origem && (
            <Ficha label={origemLabel(filtros.origem)} onRemover={() => setFiltro('origem', null)} />
          )}
          {filtros.campo && (
            <Ficha
              label={`Campo: ${campoLabel(filtros.campo)}`}
              onRemover={() => setFiltro('campo', null)}
            />
          )}
          {filtros.busca.trim() && (
            <Ficha label={`"${filtros.busca.trim()}"`} onRemover={() => setFiltro('busca', '')} />
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
            onClick={limparFiltros}
          >
            <RotateCcw className="w-3 h-3" /> Limpar tudo
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Peças
// ═══════════════════════════════════════════════════════════════════════════
function CampoSelect({
  label, valor, onChange, opcoes, rotuloTodos, vazio,
}: {
  label: string;
  valor: string | null;
  onChange: (v: string | null) => void;
  opcoes: { valor: string; label: string }[];
  rotuloTodos: string;
  vazio?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Select
        value={valor ?? TODOS}
        onValueChange={(v) => onChange(v === TODOS ? null : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={rotuloTodos} />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          <SelectItem value={TODOS}>{rotuloTodos}</SelectItem>
          {opcoes.length === 0 && vazio && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{vazio}</div>
          )}
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Ficha({ label, onRemover }: { label: string; onRemover: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-[10px] text-primary max-w-[220px]">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemover}
        className="hover:bg-primary/20 rounded-full p-0.5 shrink-0"
        aria-label={`Remover filtro ${label}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

function filtrosAvancadosAtivos(f: FiltrosTela): number {
  return [f.categoria, f.acao, f.usuarioId, f.tabela, f.origem, f.campo].filter(Boolean).length;
}
