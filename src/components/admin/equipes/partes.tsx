/**
 * As peças pequenas do quadro de equipes: a linha da pessoa, a lista de
 * destinos do «Mover para…» e a zona de soltar.
 */
import { useState, type ReactNode } from 'react';
import { ArrowRightLeft, Check, Copy, CornerDownRight, GripVertical, X } from 'lucide-react';
import { TagDesligado } from '@/components/TagDesligado';
import { TagFerias } from '@/components/TagFerias';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { PERFIL_COLORS, PERFIL_LABELS } from '@/lib/index';
import { cn } from '@/lib/utils';
import { iniciais, mesmoDestino, type Destino, type OpcaoDeDestino, type PessoaEq } from './modelo';

// ── Mover para… ──────────────────────────────────────────────────────────────

/**
 * A lista de destinos com busca. O destino onde a pessoa já está aparece
 * marcado e desligado: mostrar «para onde» sem mostrar «de onde» faz a lista
 * parecer maior do que é.
 */
export function ListaDeDestinos({ opcoes, atual, onEscolher, placeholder = 'Para qual equipe?' }: {
  opcoes: OpcaoDeDestino[]; atual?: Destino | null; onEscolher: (d: Destino) => void; placeholder?: string;
}) {
  return (
    <Command>
      <CommandInput placeholder={placeholder} className="h-9" />
      <CommandList>
        <CommandEmpty>Nenhuma equipe com esse nome.</CommandEmpty>
        <CommandGroup>
          {opcoes.map(o => {
            const aqui = !!atual && mesmoDestino(atual, o);
            return (
              <CommandItem key={o.chave} value={`${o.rotulo} ${o.equipeNome ?? ''} ${o.chave}`} disabled={aqui}
                onSelect={() => onEscolher({ equipeId: o.equipeId, subgrupoId: o.subgrupoId })}
                className={cn('gap-2', o.subgrupoId && 'eq-dest-sub')}>
                {o.subgrupoId ? <CornerDownRight className="w-3.5 h-3.5 opacity-50" /> : null}
                <span className={cn('truncate', !o.equipeId && 'italic')}>{o.rotulo}</span>
                {aqui ? <span className="eq-dest-qtd">aqui</span> : <span className="eq-dest-qtd">{o.qtd}</span>}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function MoverPara({ opcoes, atual, onEscolher, children, alinhar = 'end' }: {
  opcoes: OpcaoDeDestino[]; atual?: Destino | null; onEscolher: (d: Destino) => void;
  children: ReactNode; alinhar?: 'start' | 'end' | 'center';
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={alinhar} className="p-0 w-[260px]">
        <ListaDeDestinos opcoes={opcoes} atual={atual} onEscolher={d => { setAberto(false); onEscolher(d); }} />
      </PopoverContent>
    </Popover>
  );
}

// ── A pessoa ─────────────────────────────────────────────────────────────────

export interface PessoaLinhaProps {
  pessoa: PessoaEq;
  selecionada: boolean;
  /** Pode ser selecionada e arrastada. Falso para quem só olha. */
  podeMover: boolean;
  /** Transferida no mês: o recebimento ainda conta aqui, mas ela não é da equipe. */
  transferida?: boolean;
  /** Setores (fora do dela) em que está clonada. */
  emprestada?: string[];
  /** A busca: `true` acha, `false` não acha, `null` sem busca. */
  casa?: boolean | null;
  opcoes: OpcaoDeDestino[];
  onAlternar: (id: string) => void;
  onArrastar: (id: string) => void;
  onMover: (id: string, d: Destino) => void;
  /** O X: tirar da equipe, ou, na transferida, tirar o recebimento dela daqui. */
  onTirar?: (pessoa: PessoaEq) => void;
}

export function PessoaLinha({
  pessoa, selecionada, podeMover, transferida = false, emprestada = [], casa = null,
  opcoes, onAlternar, onArrastar, onMover, onTirar,
}: PessoaLinhaProps) {
  const movel = podeMover && !transferida;
  const cargo = PERFIL_LABELS[pessoa.perfil] ?? pessoa.perfil;
  return (
    <div
      className="eq-pessoa"
      data-sel={selecionada || undefined}
      data-transf={transferida || undefined}
      data-casa={casa === true || undefined}
      data-longe={casa === false || undefined}
      draggable={movel}
      onDragStart={movel ? (e => { e.dataTransfer.effectAllowed = 'move'; onArrastar(pessoa.id); }) : undefined}
      title={transferida
        ? 'Transferida neste mês. Continua aqui porque o recebimento dela ainda conta nesta equipe até alguém tirar.'
        : undefined}
    >
      <button type="button" className="eq-av" disabled={!movel} aria-pressed={selecionada}
        aria-label={selecionada ? `Desmarcar ${pessoa.nome}` : `Selecionar ${pessoa.nome}`}
        onClick={() => onAlternar(pessoa.id)}>
        {pessoa.foto_url ? <img src={pessoa.foto_url} alt="" loading="lazy" /> : iniciais(pessoa.nome)}
        <i aria-hidden="true"><Check /></i>
      </button>
      <div className="eq-pessoa-nome">
        <span>{pessoa.nome}</span>
        <span className={cn('eq-cargo', PERFIL_COLORS[pessoa.perfil] ?? 'border-border text-muted-foreground')}>{cargo}</span>
        <TagDesligado situacao={pessoa.situacao} />
        <TagFerias situacao={pessoa.situacao} feriasAte={pessoa.ferias_ate} />
        {transferida && <span className="eq-selo transf"><ArrowRightLeft /> transferida</span>}
        {emprestada.map(nome => (
          <span key={nome} className="eq-selo clone" title={`Clonada em ${nome}: o recebimento conta neste setor e em ${nome}.`}>
            <Copy /> {nome}
          </span>
        ))}
      </div>
      <div className="eq-acoes">
        {movel && (
          <MoverPara opcoes={opcoes} atual={{ equipeId: pessoa.equipe_id, subgrupoId: pessoa.subgrupo_id ?? null }}
            onEscolher={d => onMover(pessoa.id, d)}>
            <button type="button" className="eq-icone" aria-label={`Mover ${pessoa.nome} para…`} title="Mover para…">
              <ArrowRightLeft />
            </button>
          </MoverPara>
        )}
        {onTirar && (
          <button type="button" className="eq-icone perigo" onClick={() => onTirar(pessoa)}
            aria-label={transferida ? `Tirar o recebimento de ${pessoa.nome} desta equipe` : `Tirar ${pessoa.nome} da equipe`}
            title={transferida ? 'Tirar o recebimento dela desta equipe' : 'Tirar da equipe'}>
            <X />
          </button>
        )}
        {movel && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 hidden md:block" aria-hidden="true" />}
      </div>
    </div>
  );
}
