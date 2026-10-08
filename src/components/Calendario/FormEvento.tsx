/**
 * O formulário de um evento — o mesmo no «editar o dia» e no «aplicar em
 * vários dias».
 *
 * Os modelos vêm primeiro e só PREENCHEM: um clique em «Banco de horas» põe
 * tipo e título, e tudo continua editável. O banco de horas é um modelo só, e
 * o horário dele se configura logo abaixo (`HorarioDoBanco`): quanto tempo,
 * de que horas a que horas, ou até quando.
 *
 * Feriado não se lança aqui: quem diz se a operação para é a aba Metas.
 */
import type { ReactNode } from 'react';
import { Info, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  INFO_TIPO, MODELOS, TIPOS_LANCAVEIS, textoDoBanco, type HorarioBanco, type TipoEvento,
} from '@/lib/calendarioSetor';
import { comTipo, detalheDoRascunho, rascunhoDoModelo, type RascunhoEvento } from './rascunho';
import type { PessoaDoSetor } from '@/services/calendario/calendario.service';
import { IconeTipo } from './tipos';

const SEM_PESSOA = '__ninguem__';

interface Props {
  valor: RascunhoEvento;
  onChange: (r: RascunhoEvento) => void;
  /** `null` enquanto carrega. */
  pessoas: PessoaDoSetor[] | null;
  /** De onde vem o feriado (Metas ou Metas de Vendas), para quem procurar o modelo. */
  notaFeriado: string;
}

export function FormEvento({ valor, onChange, pessoas, notaFeriado }: Props) {
  const muda = (parcial: Partial<RascunhoEvento>) => onChange({ ...valor, ...parcial });
  // Um feriado lançado antes da regra das Metas ainda se corrige com o tipo dele.
  const tipos = valor.tipo === 'feriado' ? [...TIPOS_LANCAVEIS, 'feriado' as const] : TIPOS_LANCAVEIS;
  const detalhe = detalheDoRascunho(valor);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <Rotulo>O que lançar</Rotulo>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODELOS.map(m => {
            const ligado = valor.modeloId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                data-ligado={ligado}
                aria-pressed={ligado}
                onClick={() => onChange(rascunhoDoModelo(m))}
                className={cn(
                  'cal-opcao flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 text-left',
                  'text-xs font-medium text-foreground transition-colors hover:bg-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <IconeTipo tipo={m.tipo} className="h-7 w-7 rounded-lg" tamanho="h-3.5 w-3.5" />
                <span className="min-w-0 leading-tight">{m.rotulo}</span>
              </button>
            );
          })}
        </div>
      </section>

      {valor.banco ? (
        <HorarioDoBanco valor={valor.banco} onChange={banco => muda({ banco })} />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="cal-detalhe">Horário ou detalhe <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input id="cal-detalhe" value={valor.detalhe} maxLength={120}
            onChange={e => muda({ detalhe: e.target.value })}
            placeholder="08:00 às 17:00 · sala de reunião · tema da campanha" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="cal-tipo">Tipo</Label>
          <Select value={valor.tipo} onValueChange={v => onChange(comTipo(valor, v as TipoEvento))}>
            <SelectTrigger id="cal-tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tipos.map(t => (
                <SelectItem key={t} value={t}>
                  <span className="flex items-center gap-2">
                    <IconeTipo tipo={t} className="h-5 w-5 rounded-md" tamanho="h-3 w-3" />
                    {INFO_TIPO[t].rotulo}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-titulo">Título</Label>
          <Input id="cal-titulo" value={valor.titulo} maxLength={80}
            onChange={e => muda({ titulo: e.target.value, modeloId: null })} placeholder="Banco de horas" />
        </div>
      </div>

      {valor.tipo === 'aniversario' && (
        <div className="space-y-1.5">
          <Label htmlFor="cal-pessoa">Aniversariante</Label>
          <Select
            value={valor.pessoa_id ?? SEM_PESSOA}
            onValueChange={v => muda({ pessoa_id: v === SEM_PESSOA ? null : v })}
            disabled={pessoas === null}
          >
            <SelectTrigger id="cal-pessoa">
              <SelectValue placeholder={pessoas === null ? 'Carregando…' : 'Escolha a pessoa'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PESSOA}>Ninguém do setor (só o título)</SelectItem>
              {(pessoas ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Com a pessoa marcada, a foto dela aparece em «Aniversariantes do mês».</p>
        </div>
      )}

      <label
        className={cn(
          'flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors',
          valor.destaque && 'cal-opcao',
        )}
        data-ligado={valor.destaque}
      >
        <span>
          <span className="block text-sm font-medium text-foreground">Pintar o dia inteiro</span>
          <span className="block text-xs text-muted-foreground">A casa fica na cor forte do tema, para chamar a atenção.</span>
        </span>
        <Switch checked={valor.destaque} onCheckedChange={v => muda({ destaque: v })} />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-muted/50 px-3 py-2.5">
        <p className="min-w-0 text-xs text-muted-foreground">
          Na casa do dia:{' '}
          <span className="font-semibold text-foreground">{valor.titulo.trim() || 'Sem título'}</span>
          {detalhe && <span className="text-foreground"> · {detalhe}</span>}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" /> {notaFeriado}
        </p>
      </div>
    </div>
  );
}

function Rotulo({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

// ── O horário do banco de horas ──────────────────────────────────────────────

const MODOS: { modo: HorarioBanco['modo']; rotulo: string }[] = [
  { modo: 'duracao', rotulo: 'Duração' },
  { modo: 'intervalo', rotulo: 'Das … às …' },
  { modo: 'ate', rotulo: 'Até às …' },
  { modo: 'livre', rotulo: 'Outro' },
];

const DURACOES = [30, 60, 90, 120, 180, 240];
const PASSO = 30;
const DURACAO_MAX = 12 * 60;

/** Trocar de modo mantém o que já dá para aproveitar (o «até» vira o fim do intervalo). */
function trocarModo(atual: HorarioBanco, modo: HorarioBanco['modo']): HorarioBanco {
  const fim = atual.modo === 'intervalo' || atual.modo === 'ate' ? atual.ate : '19:00';
  switch (modo) {
    case 'duracao':   return { modo, minutos: atual.modo === 'duracao' ? atual.minutos : 60 };
    case 'intervalo': return { modo, de: atual.modo === 'intervalo' ? atual.de : '08:30', ate: atual.modo === 'intervalo' ? atual.ate : '12:00' };
    case 'ate':       return { modo, ate: fim };
    case 'livre':     return { modo, texto: atual.modo === 'livre' ? atual.texto : textoDoBanco(atual) };
  }
}

function HorarioDoBanco({ valor, onChange }: { valor: HorarioBanco; onChange: (h: HorarioBanco) => void }) {
  return (
    <section className="cal-bloco-banco space-y-3 rounded-2xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Rotulo>Horário do banco</Rotulo>
        <div role="radiogroup" aria-label="Como escrever o horário" className="flex rounded-lg bg-muted p-0.5">
          {MODOS.map(m => (
            <button
              key={m.modo}
              type="button"
              role="radio"
              aria-checked={valor.modo === m.modo}
              onClick={() => onChange(trocarModo(valor, m.modo))}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                valor.modo === m.modo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>

      {valor.modo === 'duracao' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Menos meia hora"
              disabled={valor.minutos <= PASSO}
              onClick={() => onChange({ modo: 'duracao', minutos: Math.max(PASSO, valor.minutos - PASSO) })}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-24 text-center text-base font-semibold tabular-nums text-foreground" aria-live="polite">
              {textoDoBanco(valor)}
            </span>
            <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Mais meia hora"
              disabled={valor.minutos >= DURACAO_MAX}
              onClick={() => onChange({ modo: 'duracao', minutos: Math.min(DURACAO_MAX, valor.minutos + PASSO) })}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {DURACOES.map(min => (
              <button
                key={min}
                type="button"
                data-ligado={valor.minutos === min}
                onClick={() => onChange({ modo: 'duracao', minutos: min })}
                className="cal-opcao rounded-full border border-border px-2.5 py-1 text-[11px] font-medium tabular-nums text-foreground transition-colors hover:bg-muted"
              >
                {min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)}h${min % 60}` : `${min / 60}h`}
              </button>
            ))}
          </div>
        </div>
      )}

      {valor.modo === 'intervalo' && (
        <div className="flex items-center gap-2">
          <Input type="time" aria-label="Início do banco de horas" className="w-32 tabular-nums" value={valor.de}
            onChange={e => onChange({ ...valor, de: e.target.value })} />
          <span className="text-sm text-muted-foreground">às</span>
          <Input type="time" aria-label="Fim do banco de horas" className="w-32 tabular-nums" value={valor.ate}
            onChange={e => onChange({ ...valor, ate: e.target.value })} />
        </div>
      )}

      {valor.modo === 'ate' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">até às</span>
          <Input type="time" aria-label="Até que horas" className="w-32 tabular-nums" value={valor.ate}
            onChange={e => onChange({ modo: 'ate', ate: e.target.value })} />
        </div>
      )}

      {valor.modo === 'livre' && (
        <Input aria-label="Horário do banco de horas" value={valor.texto} maxLength={120}
          onChange={e => onChange({ modo: 'livre', texto: e.target.value })}
          placeholder="Ex.: 30 minutos antes do expediente" />
      )}
    </section>
  );
}
