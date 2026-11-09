/**
 * AgendarRetorno — marcar dia e hora para dar retorno ao profissional.
 *
 * A aba avisa uma hora antes (`CardAlertas`). Atalhos para o caso comum
 * («daqui a 1 h», «amanhã 9h»); o horário é sempre o de Brasília.
 */
import { useState } from 'react';
import { AlarmClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatePickerField } from '@/components/DatePickerField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { contemCpf } from '@/lib/cpf';
import { getTodayISO } from '@/lib/index';
import { agendarRetorno } from '@/services/ouvidoriaCofen.service';
import { ANTECEDENCIA_MINUTOS, isoDeDataHora, type Manifestacao } from './ouvidoria';

const BR = 'America/Sao_Paulo';

/** Dia (ISO) e hora (HH:MM) de Brasília de um instante. */
function partesBr(ms: number): { dia: string; hora: string } {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: BR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: BR, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  return { dia, hora };
}

function amanhaAs(hora: string): { dia: string; hora: string } {
  return { dia: partesBr(Date.now() + 86_400_000).dia, hora };
}

/** Daqui a `min` minutos, arredondado para os próximos 5 minutos. */
function daquiA(min: number): { dia: string; hora: string } {
  const passo = 5 * 60_000;
  return partesBr(Math.ceil((Date.now() + min * 60_000) / passo) * passo);
}

export function AgendarRetorno({ m, aoMudar, children }: {
  m: Manifestacao; aoMudar: () => void; children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const inicial = m.retorno_agendado_em ? partesBr(Date.parse(m.retorno_agendado_em)) : daquiA(60);
  const [dia, setDia] = useState(inicial.dia);
  const [hora, setHora] = useState(inicial.hora);
  const [nota, setNota] = useState(m.retorno_agendado_nota ?? '');
  const [salvando, setSalvando] = useState(false);

  const usar = (p: { dia: string; hora: string }) => { setDia(p.dia); setHora(p.hora); };

  async function salvar() {
    if (!dia || !/^\d{2}:\d{2}$/.test(hora)) { toast.error('Escolha o dia e a hora.'); return; }
    const iso = isoDeDataHora(dia, hora);
    if (Date.parse(iso) <= Date.now()) { toast.error('Esse horário já passou.'); return; }
    if (contemCpf(nota)) { toast.error('A nota tem um CPF. CPF não pode ser gravado no sistema.'); return; }
    setSalvando(true);
    try {
      await agendarRetorno(m.id, iso, nota.trim() || null);
      toast.success(`Retorno agendado. A aba avisa ${ANTECEDENCIA_MINUTOS} min antes.`);
      setAberto(false);
      aoMudar();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{m.retorno_agendado_em ? 'Reagendar retorno' : 'Agendar retorno'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { rotulo: 'Daqui a 1 h', p: () => daquiA(60) },
            { rotulo: 'Daqui a 2 h', p: () => daquiA(120) },
            { rotulo: 'Amanhã 9h', p: () => amanhaAs('09:00') },
            { rotulo: 'Amanhã 14h', p: () => amanhaAs('14:00') },
          ].map(a => (
            <button key={a.rotulo} type="button" onClick={() => usar(a.p())}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium hover:bg-muted">
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <div>
            <Label className="mb-1 block text-xs">Dia</Label>
            <DatePickerField value={dia} minDate={getTodayISO()} size="md" onChange={setDia}
                             triggerClassName="h-9 rounded-lg font-sans text-sm" />
          </div>
          <div>
            <Label htmlFor="ouv-agenda-hora" className="mb-1 block text-xs">Hora</Label>
            <Input id="ouv-agenda-hora" type="time" value={hora} onChange={e => setHora(e.target.value)}
                   className="h-9 rounded-lg tabular-nums" />
          </div>
        </div>
        <div>
          <Label htmlFor="ouv-agenda-nota" className="mb-1 block text-xs">Lembrete (opcional)</Label>
          <Input id="ouv-agenda-nota" value={nota} maxLength={300} onChange={e => setNota(e.target.value)}
                 placeholder="Ex.: ligar no celular, confirmar o estorno" className="h-9 rounded-lg" />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</Button>
          <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Agendar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
