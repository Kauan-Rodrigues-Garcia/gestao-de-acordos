/**
 * partes.tsx — as peças pequenas do Quadro de Pessoal: foto, pilha de fotos,
 * barra de composição e o cartão que abre ao clicar numa pessoa.
 *
 * As cores são as do tema (primary, info, success, warning), nunca o roxo dos
 * cargos: a tela é do RH e convive com qualquer tema que a pessoa escolher.
 */
import type { ReactNode } from 'react';
import { CalendarDays, Mail, MapPin, Sparkles, Sun } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { GRUPOS_CARGO, iniciais, type Numeros, type Pessoa } from '@/services/rh/quadroPessoal';
import { GRUPO_META, dataCurta, rotuloCargo, type LugarTexto } from './formato';

// ── Foto ─────────────────────────────────────────────────────────────────────

const TAMANHO = {
  xs: 'size-6 text-[9px]',
  sm: 'size-8 text-[10px]',
  md: 'size-10 text-xs',
  lg: 'size-16 text-lg',
} as const;

export function Foto({
  pessoa, tamanho = 'sm', className,
}: {
  pessoa: Pick<Pessoa, 'nome' | 'fotoUrl'>;
  tamanho?: keyof typeof TAMANHO;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-muted font-semibold text-muted-foreground ring-2 ring-background select-none',
        TAMANHO[tamanho], className,
      )}
      aria-hidden
    >
      {pessoa.fotoUrl
        ? <img src={pessoa.fotoUrl} alt="" loading="lazy" className="size-full object-cover" />
        : iniciais(pessoa.nome)}
    </span>
  );
}

/** Até `max` fotos sobrepostas e um «+N». */
export function PilhaDeFotos({
  pessoas, max = 5, tamanho = 'sm',
}: { pessoas: readonly Pessoa[]; max?: number; tamanho?: 'xs' | 'sm' }) {
  if (pessoas.length === 0) return null;
  const vis = pessoas.slice(0, max);
  const resto = pessoas.length - vis.length;
  return (
    <span className={cn('flex items-center', tamanho === 'xs' ? '-space-x-1' : '-space-x-1.5')} title={pessoas.map(p => p.nome).join(', ')}>
      {vis.map(p => <Foto key={p.id} pessoa={p} tamanho={tamanho} />)}
      {resto > 0 && (
        <span className={cn(
          'relative inline-flex items-center justify-center rounded-full bg-secondary font-semibold',
          'text-secondary-foreground ring-2 ring-background tabular-nums',
          TAMANHO[tamanho],
        )}>
          +{resto}
        </span>
      )}
    </span>
  );
}

// ── Composição ───────────────────────────────────────────────────────────────

export function BarraComposicao({
  numeros, className, alta = false,
}: { numeros: Numeros; className?: string; alta?: boolean }) {
  const total = numeros.pessoas;
  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-muted', alta ? 'h-3' : 'h-2', className)}
      role="img"
      aria-label={GRUPOS_CARGO
        .filter(g => numeros.porGrupo[g] > 0)
        .map(g => `${numeros.porGrupo[g]} ${GRUPO_META[g].rotulo.toLowerCase()}`).join(', ')}
    >
      {total > 0 && GRUPOS_CARGO.map(g => {
        const n = numeros.porGrupo[g];
        if (!n) return null;
        return (
          <span
            key={g}
            title={`${GRUPO_META[g].rotulo}: ${n}`}
            className={cn('h-full transition-[width] duration-500 first:rounded-l-full last:rounded-r-full', GRUPO_META[g].cor)}
            style={{ width: `${(n / total) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

export function LegendaComposicao({ numeros, className }: { numeros: Numeros; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs', className)}>
      {GRUPOS_CARGO.filter(g => numeros.porGrupo[g] > 0).map(g => (
        <li key={g} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className={cn('size-2.5 rounded-full', GRUPO_META[g].cor)} />
          {GRUPO_META[g].rotulo}
          <strong className="font-semibold text-foreground tabular-nums">{numeros.porGrupo[g]}</strong>
        </li>
      ))}
    </ul>
  );
}

// ── Selos ────────────────────────────────────────────────────────────────────

export function SeloFerias({ pessoa, compacto }: { pessoa: Pessoa; compacto?: boolean }) {
  if (!pessoa.emFerias) return null;
  const ate = pessoa.feriasAte ? dataCurta(pessoa.feriasAte).slice(0, 5) : null;
  return (
    <span
      title={ate ? `De férias até ${dataCurta(pessoa.feriasAte)}` : 'De férias'}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-semibold text-warning ring-1 ring-warning/30"
    >
      <Sun className="size-2.5" />
      {!compacto && <>Férias{ate && <span className="font-normal tabular-nums">até {ate}</span>}</>}
    </span>
  );
}

export function SeloNovata({ pessoa }: { pessoa: Pessoa }) {
  if (!pessoa.novata) return null;
  return (
    <span
      title={`Cadastrada em ${dataCurta(pessoa.criadoEm)}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success ring-1 ring-success/30"
    >
      <Sparkles className="size-2.5" /> Nova
    </span>
  );
}

// ── Cartão da pessoa ─────────────────────────────────────────────────────────


/**
 * O cartão que abre ao clicar numa pessoa. É só leitura: nome, cargo, contato
 * e onde ela está. Quem muda alguma coisa disso é a aba Usuários.
 */
export function CartaoPessoa({
  pessoa, lugar, children, acao,
}: {
  pessoa: Pessoa;
  lugar: LugarTexto;
  children: ReactNode;
  /** Um atalho opcional no rodapé (ex.: «Ver no organograma»). */
  acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center gap-3 p-4">
          <Foto pessoa={pessoa} tamanho="lg" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight text-foreground">{pessoa.nome}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{rotuloCargo(pessoa.cargo)}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <SeloFerias pessoa={pessoa} />
              <SeloNovata pessoa={pessoa} />
            </div>
          </div>
        </div>
        <dl className="space-y-2 border-t border-border px-4 py-3 text-xs">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <dd className="min-w-0 text-foreground">
              {lugar.setor}
              {lugar.equipe && <span className="text-muted-foreground"> › </span>}
              {lugar.equipe}
              {lugar.subgrupo && <span className="text-muted-foreground"> › {lugar.subgrupo}</span>}
            </dd>
          </div>
          {pessoa.email && (
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <dd className="min-w-0 break-all text-foreground">{pessoa.email}</dd>
            </div>
          )}
          {pessoa.criadoEm && (
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <dd className="text-foreground">No sistema desde {dataCurta(pessoa.criadoEm)}</dd>
            </div>
          )}
        </dl>
        {acao && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={acao.onClick}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-primary/10"
            >
              {acao.rotulo} →
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
