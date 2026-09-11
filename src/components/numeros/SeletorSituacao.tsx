/**
 * SeletorSituacao — trocar a situação de um número, com o tempo quando ela tem.
 *
 * Mora em `components/` porque as duas telas do módulo o usam: a aba Números do
 * Controle de Números e Meus Chips, onde o Assistente ADM acompanha os números
 * que estão com os setores. Quem pode é o Núcleo (`numeros_administrar`); quem
 * recusa de verdade é `fn_numeros_alterar_situacao`.
 *
 * ## Um clique, menos na restrição
 *
 * Trocar a situação é reversível e fica no histórico — um clique, como sempre
 * foi. A restrição pede o tempo antes de gravar, e por isso abre a janela; o
 * seletor continua mostrando a situação de antes até o banco confirmar.
 *
 * Marcar «Em restrição» num número que já está restrito não dispara nada no
 * seletor (é o mesmo valor). O lápis ao lado do cronômetro é a porta para
 * corrigir o tempo.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  SITUACOES, SITUACAO_LABELS, exigeTempoInformado, type Situacao,
} from '@/services/numeros/numerosRegras';
import { alterarSituacao, type NumeroRow } from '@/services/numeros/numeros.service';
import { CronometroSituacao } from './SituacaoDoNumero';
import { DialogoTempoRestricao } from './DialogoTempoRestricao';

export interface SeletorSituacaoProps {
  numero: NumeroRow;
  onMudou: () => void;
  className?: string;
}

export function SeletorSituacao({ numero, onMudou, className }: SeletorSituacaoProps) {
  const [salvando, setSalvando]         = useState(false);
  const [pedindoTempo, setPedindoTempo] = useState(false);

  const rotuloDoNumero = mascararNumero(numero.numero);

  async function aplicar(situacao: Situacao, prazoMinutos?: number): Promise<boolean> {
    setSalvando(true);
    const r = await alterarSituacao(numero.id, situacao, prazoMinutos);
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.erro ?? 'Não foi possível alterar a situação.');
      return false;
    }
    toast.success(`${rotuloDoNumero} agora está ${SITUACAO_LABELS[situacao].toLowerCase()}.`);
    onMudou();
    return true;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Select
        value={numero.situacao}
        disabled={salvando}
        onValueChange={v => {
          const situacao = v as Situacao;
          if (exigeTempoInformado(situacao)) { setPedindoTempo(true); return; }
          void aplicar(situacao);
        }}
      >
        <SelectTrigger className="h-8 w-[196px]" aria-label={`Situação de ${rotuloDoNumero}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SITUACOES.map(s => (
            <SelectItem key={s} value={s}>{SITUACAO_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <CronometroSituacao numero={numero} />

      {numero.situacao === 'em_restricao' && (
        <Button
          size="icon" variant="ghost" className="h-7 w-7"
          disabled={salvando}
          onClick={() => setPedindoTempo(true)}
          title="Corrigir o tempo de restrição"
          aria-label={`Corrigir o tempo de restrição de ${rotuloDoNumero}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      <DialogoTempoRestricao
        aberto={pedindoTempo}
        numero={numero.numero}
        salvando={salvando}
        onFechar={() => setPedindoTempo(false)}
        onConfirmar={minutos => {
          void aplicar('em_restricao', minutos).then(ok => { if (ok) setPedindoTempo(false); });
        }}
      />
    </div>
  );
}
