/**
 * BarraFiltros — busca, filtros, ordem e modo de exibição, numa linha só.
 *
 * ## Por que um botão «Filtros» no lugar de cinco seletores
 *
 * A barra anterior tinha até nove controles lado a lado (busca, estado,
 * categoria, prioridade, responsável, empresa, ordem, agrupamento, modo), e
 * quebrava em duas ou três linhas no notebook. Quase sempre todos mostravam
 * «Todo estado», «Toda categoria»… — espaço gasto dizendo que nada está
 * filtrado.
 *
 * Agora a linha mostra o que está ATIVO: cada filtro ligado vira um chip com X,
 * e o resto mora num painel atrás de «Filtros». Ordem e agrupamento são gosto
 * de quem usa, não recorte, e vão juntos para o menu «Ordenar».
 *
 * As opções do painel são botões, não listas suspensas: com o painel aberto,
 * cada escolha é um clique, e dá para ver de uma vez tudo o que existe.
 */
import type { RefObject } from 'react';
import {
  Search, X, SlidersHorizontal, ArrowDownUp, Rows3, Columns3, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  STATUS_TICKET, ORDEM_STATUS, PRIORIDADES, ORDEM_PRIORIDADE, CATEGORIAS, rotuloCategoria,
  type StatusTicket, type PrioridadeTicket,
} from './categorias';
import { iconeDaCategoria } from './icones';
import { ORDENS, type CriteriosFila, type Ordem, type Agrupamento } from './fila';

export type Visao = 'fila' | 'quadro';

export interface BarraFiltrosProps {
  criterios: CriteriosFila;
  mudar: <K extends keyof CriteriosFila>(campo: K, valor: CriteriosFila[K]) => void;
  limpar: () => void;
  buscaRef: RefObject<HTMLInputElement | null>;
  /** Quem já pegou algum ticket — o filtro de responsável sai da própria lista. */
  responsaveis: { id: string; nome: string }[];
  /** Só para quem enxerga as duas empresas. Vazia = sem filtro de empresa. */
  empresas: { id: string; nome: string }[];
  ordem: Ordem;
  onOrdem: (o: Ordem) => void;
  agrupar: Agrupamento;
  onAgrupar: (a: Agrupamento) => void;
  visao: Visao;
  onVisao: (v: Visao) => void;
}

const AGRUPAMENTOS: { valor: Agrupamento; label: string }[] = [
  { valor: 'nenhum',     label: 'Sem agrupar' },
  { valor: 'status',     label: 'Por estado' },
  { valor: 'prioridade', label: 'Por prioridade' },
  { valor: 'categoria',  label: 'Por categoria' },
];

export function BarraFiltros({
  criterios, mudar, limpar, buscaRef, responsaveis, empresas,
  ordem, onOrdem, agrupar, onAgrupar, visao, onVisao,
}: BarraFiltrosProps) {
  const nomeDoResponsavel = (id: string) =>
    id === 'ninguem' ? 'Sem responsável' : responsaveis.find(r => r.id === id)?.nome ?? 'Responsável';

  // O que está ligado, na ordem do painel. Cada um vira um chip com X.
  const ativos: { chave: keyof CriteriosFila; rotulo: string }[] = [
    criterios.status && { chave: 'status' as const, rotulo: STATUS_TICKET[criterios.status].label },
    criterios.prioridade && { chave: 'prioridade' as const, rotulo: PRIORIDADES[criterios.prioridade].label },
    criterios.categoria && { chave: 'categoria' as const, rotulo: rotuloCategoria(criterios.categoria) },
    criterios.responsavel && { chave: 'responsavel' as const, rotulo: nomeDoResponsavel(criterios.responsavel) },
    criterios.empresaId && { chave: 'empresaId' as const, rotulo: empresas.find(e => e.id === criterios.empresaId)?.nome ?? 'Empresa' },
  ].filter(Boolean) as { chave: keyof CriteriosFila; rotulo: string }[];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Busca: a peça que mais se usa, a maior da linha. `/` cai aqui. */}
      <div className="relative w-full sm:w-72">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={buscaRef}
          value={criterios.busca}
          onChange={e => mudar('busca', e.target.value)}
          placeholder="Buscar nº, assunto ou pessoa"
          aria-label="Buscar tickets"
          className="h-9 pl-8 pr-14"
        />
        {criterios.busca ? (
          <button
            type="button"
            onClick={() => mudar('busca', '')}
            title="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            /
          </kbd>
        )}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <SlidersHorizontal className="w-4 h-4" />
            Filtros
            {ativos.length > 0 && (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 font-mono text-[10px] leading-4 text-primary-foreground">
                {ativos.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[22rem] p-0">
          <div className="max-h-[70vh] overflow-y-auto p-3 space-y-4">
            <Secao titulo="Estado">
              {ORDEM_STATUS.map(s => (
                <Opcao key={s} ativa={criterios.status === s}
                  onClick={() => mudar('status', criterios.status === s ? null : s as StatusTicket)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_TICKET[s].ponto)} />
                  {STATUS_TICKET[s].label}
                </Opcao>
              ))}
            </Secao>

            <Secao titulo="Prioridade">
              {ORDEM_PRIORIDADE.map(p => (
                <Opcao key={p} ativa={criterios.prioridade === p}
                  onClick={() => mudar('prioridade', criterios.prioridade === p ? null : p as PrioridadeTicket)}>
                  <span className={PRIORIDADES[p].cor}>{PRIORIDADES[p].label}</span>
                </Opcao>
              ))}
            </Secao>

            {/* Todas as categorias, e não só as do produto: o formulário decide
                o que se pode ABRIR hoje; o filtro precisa alcançar o que já foi
                aberto — inclusive numa categoria que o produto deixou de
                oferecer. Uma a mais devolve zero linhas; uma a menos deixa
                ticket inalcançável. */}
            <Secao titulo="Categoria">
              {CATEGORIAS.map(c => {
                const Icone = iconeDaCategoria(c.key);
                return (
                  <Opcao key={c.key} ativa={criterios.categoria === c.key}
                    onClick={() => mudar('categoria', criterios.categoria === c.key ? null : c.key)}>
                    <Icone className="w-3.5 h-3.5 opacity-70" />
                    {c.label}
                  </Opcao>
                );
              })}
            </Secao>

            <Secao titulo="Responsável">
              <Opcao ativa={criterios.responsavel === 'ninguem'}
                onClick={() => mudar('responsavel', criterios.responsavel === 'ninguem' ? null : 'ninguem')}>
                <span className="text-amber-600 dark:text-amber-400">Sem responsável</span>
              </Opcao>
              {responsaveis.map(r => (
                <Opcao key={r.id} ativa={criterios.responsavel === r.id}
                  onClick={() => mudar('responsavel', criterios.responsavel === r.id ? null : r.id)}>
                  {r.nome}
                </Opcao>
              ))}
            </Secao>

            {empresas.length > 1 && (
              <Secao titulo="Empresa">
                {empresas.map(e => (
                  <Opcao key={e.id} ativa={criterios.empresaId === e.id}
                    onClick={() => mudar('empresaId', criterios.empresaId === e.id ? null : e.id)}>
                    {e.nome}
                  </Opcao>
                ))}
              </Secao>
            )}
          </div>
          {ativos.length > 0 && (
            <div className="flex justify-end border-t border-border px-3 py-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={limpar}>
                Limpar filtros
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* O que está ligado, à vista e com saída de um clique. */}
      {ativos.map(a => (
        <span key={a.chave}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.08] pl-2.5 pr-1 text-xs text-foreground">
          {a.rotulo}
          <button
            type="button"
            onClick={() => mudar(a.chave, null as never)}
            title={`Tirar o filtro «${a.rotulo}»`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowDownUp className="w-4 h-4" />
              <span className="hidden md:inline">{ORDENS.find(o => o.chave === ordem)?.label}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Ordenar</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={ordem} onValueChange={v => onOrdem(v as Ordem)}>
              {ORDENS.map(o => (
                <DropdownMenuRadioItem key={o.chave} value={o.chave}>{o.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {/* Agrupar só faz sentido na lista: o quadro já agrupa por estado. */}
            {visao === 'fila' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Agrupar</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={agrupar} onValueChange={v => onAgrupar(v as Agrupamento)}>
                  {AGRUPAMENTOS.map(a => (
                    <DropdownMenuRadioItem key={a.valor} value={a.valor}>{a.label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Modo de exibição">
          <BotaoVisao ativo={visao === 'fila'} onClick={() => onVisao('fila')} titulo="Ver como lista">
            <Rows3 className="w-4 h-4" />
          </BotaoVisao>
          <BotaoVisao ativo={visao === 'quadro'} onClick={() => onVisao('quadro')} titulo="Ver como quadro">
            <Columns3 className="w-4 h-4" />
          </BotaoVisao>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Opcao({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativa
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-foreground/80 hover:border-primary/40 hover:bg-accent/50',
      )}
    >
      {ativa && <Check className="w-3 h-3 text-primary" />}
      {children}
    </button>
  );
}

function BotaoVisao({
  ativo, onClick, titulo, children,
}: { ativo: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      className={cn(
        'rounded px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
