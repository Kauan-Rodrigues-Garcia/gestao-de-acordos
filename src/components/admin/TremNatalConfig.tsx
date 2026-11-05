/**
 * TremNatalConfig — o trenzinho de Natal: ligado ou não, e o horário da
 * estação (Cleber, 04/11/2026).
 *
 * Desligado, o trem fica na estação «em manutenção». Fora do horário, fica
 * fechado com a placa «abre às 08:00»; passou do fechamento, a volta que
 * estiver acontecendo termina antes. A primeira viagem espera os cinco
 * primeiros da fila (`trem/agenda.ts`).
 *
 * Grava por `fn_natal_trem_configurar`, que só aceita o super_admin (como a
 * Corrida e a Sirene desta aba). No `npm run dev` sem a função no banco, grava
 * neste navegador (`gravarAgendaDoDev`), para testar o trem fechado.
 */
import { useEffect, useState } from 'react';
import { Loader2, TrainFront } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import {
  PRIMEIROS_DA_FILA, agendaEhDoDev, gravarAgendaDoDev, horaDe, minutosDe, recarregarAgenda, useAgendaDoTrem,
} from '@/components/Natal/trem/agenda';

export default function TremNatalConfig() {
  const agenda = useAgendaDoTrem();
  const [ativo, setAtivo] = useState(true);
  const [abre, setAbre] = useState('08:00');
  const [fecha, setFecha] = useState('17:00');
  const [salvando, setSalvando] = useState(false);

  // O formulário começa no que está gravado (e acompanha quando a agenda muda por fora).
  useEffect(() => {
    if (!agenda) return;
    setAtivo(agenda.ativo);
    setAbre(horaDe(agenda.abreMin));
    // A agenda livre do dev vai até 24:00, que o campo de hora não aceita.
    setFecha(agenda.fechaMin >= 24 * 60 ? '23:59' : horaDe(agenda.fechaMin));
  }, [agenda]);

  async function salvar(proximoAtivo = ativo) {
    if (minutosDe(abre) >= minutosDe(fecha)) {
      toast.error('A estação tem de abrir antes de fechar.');
      return;
    }
    setSalvando(true);
    try {
      if (agendaEhDoDev()) {
        gravarAgendaDoDev({ ativo: proximoAtivo, abreMin: minutosDe(abre), fechaMin: minutosDe(fecha) });
      } else {
        const { error } = await rpcSemTipo('fn_natal_trem_configurar', { p_ativo: proximoAtivo, p_abre: abre, p_fecha: fecha });
        if (error) throw new Error(error.message);
        await recarregarAgenda();
      }
      toast.success(proximoAtivo ? 'Trenzinho salvo.' : 'Trenzinho em manutenção.');
    } catch (e) {
      toast.error('Não foi possível salvar o trenzinho', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  }

  const mudou = !!agenda && (ativo !== agenda.ativo || minutosDe(abre) !== agenda.abreMin || minutosDe(fecha) !== Math.min(agenda.fechaMin, 23 * 60 + 59));

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrainFront className="w-4 h-4 text-primary" /> Trenzinho de Natal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          O trem sai da estação do Dashboard com cinco sorteados da fila. Fora do horário, ele fica
          fechado na estação com a placa de quando abre — e, passada a hora de fechar, termina a
          viagem que estiver fazendo antes. Desligado, fica «em manutenção». A fila continua aberta
          nos três casos. Vale para todas as empresas, no horário de Brasília.
        </p>
        {!agenda ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">
                {ativo ? 'Sorteio ligado' : 'Desligado (em manutenção)'}
              </span>
              <Switch checked={ativo} disabled={salvando} onCheckedChange={setAtivo} aria-label="Trenzinho de Natal ligado" />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Abre às</span>
                <Input type="time" className="h-9 w-32" value={abre} onChange={e => setAbre(e.target.value)} disabled={salvando} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Fecha às</span>
                <Input type="time" className="h-9 w-32" value={fecha} onChange={e => setFecha(e.target.value)} disabled={salvando} />
              </label>
              <Button size="sm" onClick={() => void salvar()} disabled={salvando || !mudou}>
                {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Salvar
              </Button>
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {agenda.inicioMs === null
                ? <>A primeira viagem ainda espera os {PRIMEIROS_DA_FILA} primeiros da fila: <b>{Math.min(agenda.inscritos, PRIMEIROS_DA_FILA)}/{PRIMEIROS_DA_FILA}</b>. Ela leva esses cinco, na ordem em que entraram.</>
                : <>Rodando desde <b>{new Date(agenda.inicioMs).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</b> · {agenda.inscritos} {agenda.inscritos === 1 ? 'pessoa' : 'pessoas'} na fila (um trem só para todas as empresas).</>}
              {agendaEhDoDev() && <> <b>(dev: gravado só neste navegador.)</b></>}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
