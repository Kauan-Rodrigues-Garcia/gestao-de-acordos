/**
 * campos.tsx — os campos de escolha do formulário da Ouvidoria, no mesmo
 * desenho do calendário do acordo (popover arredondado, sombra, itens
 * redondos), no lugar do `<select>` nativo do navegador.
 *
 *   CampoLista     lista de opções (canal, situação, status, responsável, filtros)
 *   SeletorCoren   os 27 Corens numa grade de estados, como os dias do calendário
 */
import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { UFS_NO_SELETOR } from './ouvidoria';

export interface OpcaoLista {
  valor: string;
  rotulo: string;
  /** Ícone ou bolinha à esquerda do rótulo. */
  marca?: ReactNode;
}

const GATILHO =
  'w-full h-10 justify-between gap-2 px-3 text-sm font-normal rounded-lg';
const CAIXA =
  'p-1.5 rounded-xl shadow-lg border bg-popover';

export function CampoLista({
  id, valor, opcoes, aoMudar, vazio, invalido, largura, compacto, className, rotulo, desligado,
}: {
  id?: string;
  valor: string;
  opcoes: readonly OpcaoLista[];
  aoMudar: (v: string) => void;
  /** Rótulo da opção «nenhuma» (valor ''). Sem ele, não há opção vazia. */
  vazio?: string;
  invalido?: boolean;
  /** Largura da caixa aberta; padrão = a do campo. */
  largura?: string;
  /** Altura de filtro (h-9) e largura pelo conteúdo, para as barras de filtro. */
  compacto?: boolean;
  className?: string;
  /** Nome do campo para leitor de tela, quando não há Label. */
  rotulo?: string;
  desligado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find(o => o.valor === valor);
  const escolher = (v: string) => { aoMudar(v); setAberto(false); };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-haspopup="listbox"
          aria-label={rotulo}
          disabled={desligado}
          className={cn(
            GATILHO, compacto && 'h-9 w-auto min-w-[150px] max-w-[240px]',
            !atual && 'text-muted-foreground', invalido && 'border-destructive', className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            {atual?.marca}
            <span className="truncate">{atual?.rotulo ?? vazio ?? 'Escolha…'}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', aberto && 'rotate-180')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(CAIXA, 'max-h-72 overflow-y-auto', largura ?? (compacto ? 'w-auto min-w-[var(--radix-popover-trigger-width)] max-w-[300px]' : 'w-[var(--radix-popover-trigger-width)]'))}
      >
        <ul role="listbox" className="space-y-0.5">
          {vazio && (
            <Item ativo={valor === ''} onClick={() => escolher('')}>
              <span className="text-muted-foreground">{vazio}</span>
            </Item>
          )}
          {opcoes.map(o => (
            <Item key={o.valor} ativo={o.valor === valor} onClick={() => escolher(o.valor)}>
              {o.marca}
              <span className="truncate">{o.rotulo}</span>
            </Item>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Item({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={ativo}
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors',
          ativo ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent hover:text-accent-foreground',
        )}
      >
        {children}
        {ativo && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
      </button>
    </li>
  );
}

/** Os Corens numa grade, como os dias do calendário: SP, MG e RJ primeiro. */
export function SeletorCoren({ id, valor, aoMudar }: { id?: string; valor: string; aoMudar: (uf: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const escolher = (uf: string) => { aoMudar(uf); setAberto(false); };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(GATILHO, !valor && 'text-muted-foreground')}
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {valor ? <span className="font-medium text-foreground">Coren-{valor}</span> : 'Não informado'}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', aberto && 'rotate-180')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(CAIXA, 'w-[296px] p-3')}>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <p className="text-sm font-semibold">Conselho Regional</p>
          {valor && (
            <button type="button" onClick={() => escolher('')}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
              <X className="h-3 w-3" /> limpar
            </button>
          )}
        </div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">Mais usados</p>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {UFS_NO_SELETOR.slice(0, 3).map(uf => (
            <BotaoUf key={uf} uf={uf} ativo={valor === uf} destaque onClick={() => escolher(uf)} />
          ))}
        </div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5 px-0.5">Todos os estados</p>
        <div className="grid grid-cols-6 gap-1">
          {[...UFS_NO_SELETOR.slice(3)].sort().map(uf => (
            <BotaoUf key={uf} uf={uf} ativo={valor === uf} onClick={() => escolher(uf)} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BotaoUf({ uf, ativo, destaque, onClick }: { uf: string; ativo: boolean; destaque?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Coren-${uf}`}
      className={cn(
        'rounded-lg text-xs font-medium transition-colors tabular-nums',
        destaque ? 'h-9 border' : 'h-8',
        ativo
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {destaque ? `Coren-${uf}` : uf}
    </button>
  );
}
