/**
 * O formulário de um evento — o mesmo no «editar o dia» e no «aplicar em
 * vários dias».
 *
 * Os modelos vêm primeiro e só PREENCHEM: um clique em «Banco de horas ·
 * sábado» põe tipo, título e horário, e tudo continua editável. É o atalho
 * para o que a liderança escreve todo mês.
 */
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  INFO_TIPO, MODELOS, TIPOS_EVENTO, type ModeloEvento, type TipoEvento,
} from '@/lib/calendarioSetor';
import { rascunhoDoModelo, type RascunhoEvento } from './rascunho';
import type { PessoaDoSetor } from '@/services/calendario/calendario.service';
import { IconeTipo } from './tipos';

const SEM_PESSOA = '__ninguem__';

interface Props {
  valor: RascunhoEvento;
  onChange: (r: RascunhoEvento) => void;
  /** `null` enquanto carrega. */
  pessoas: PessoaDoSetor[] | null;
  /** Aviso sobre feriado fora das Metas, quando o caso se aplica. */
  avisoFeriado?: string | null;
  /** Ao escolher um modelo — o lote usa para sugerir os dias. */
  onModelo?: (m: ModeloEvento) => void;
}

export function FormEvento({ valor, onChange, pessoas, avisoFeriado, onModelo }: Props) {
  const muda = (parcial: Partial<RascunhoEvento>) => onChange({ ...valor, ...parcial });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Modelos</Label>
        <div className="flex flex-wrap gap-1.5">
          {MODELOS.map(m => (
            <button
              key={m.id}
              type="button"
              data-ligado={valor.modeloId === m.id}
              onClick={() => { onChange(rascunhoDoModelo(m)); onModelo?.(m); }}
              className="cal-opcao inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <IconeTipo tipo={m.tipo} className="h-5 w-5 rounded-full" tamanho="h-3 w-3" />
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cal-tipo">Tipo</Label>
          <Select value={valor.tipo} onValueChange={v => muda({ tipo: v as TipoEvento, modeloId: null })}>
            <SelectTrigger id="cal-tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_EVENTO.map(t => (
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

      <div className="space-y-1.5">
        <Label htmlFor="cal-detalhe">Horário ou detalhe <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Input id="cal-detalhe" value={valor.detalhe} maxLength={120}
          onChange={e => muda({ detalhe: e.target.value, modeloId: null })}
          placeholder="01 hora · 08:30 às 12:00 · até às 19:00" />
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

      <label className={cn(
        'flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5',
        valor.destaque && 'cal-opcao',
      )} data-ligado={valor.destaque}>
        <span>
          <span className="block text-sm font-medium text-foreground">Pintar o dia inteiro</span>
          <span className="block text-xs text-muted-foreground">A casa fica na cor forte do tema, para chamar a atenção.</span>
        </span>
        <Switch checked={valor.destaque} onCheckedChange={v => muda({ destaque: v })} />
      </label>

      {avisoFeriado && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          {avisoFeriado}
        </p>
      )}
    </div>
  );
}
