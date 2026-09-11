/**
 * SituacaoDoNumero — a situação, e o tempo que ela carrega.
 *
 * ## Três jeitos de ter tempo
 *
 *   espera (12 h / 24 h) .. contagem regressiva; no fim, selo «Pronto»;
 *   restrição .............. contagem regressiva; no fim, «Dentro do prazo»;
 *   proxy .................. há quanto tempo — «Movimentando no Proxy — 1 dia».
 *
 * O resto das situações não tem tempo, e o componente desenha só a etiqueta.
 *
 * ## Quem conta é o prazo gravado
 *
 * `prazo_ate` e `situacao_desde` vêm do banco, e a tela só compara com o relógio
 * (`useAgora`). Duas telas abertas mostram a mesma contagem, e recarregar não
 * reinicia nada. O fim do prazo NÃO muda a situação — a decisão de 11/09/2026 —,
 * e o selo aparece no segundo exato, sem esperar o aviso do banco.
 *
 * Os componentes que batem com o relógio são separados dos que não batem: um
 * número «Ativo» não assina o relógio, e a lista não redesenha duzentas
 * etiquetas por segundo por causa de cinco cronômetros.
 */
import { CheckCircle2, Timer, Waypoints } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgora } from '@/hooks/useAgora';
import {
  SITUACAO_LABELS, contaTempoDecorrido, eEspera, estadoDoPrazo,
  formatarDecorrido, formatarRestante, temPrazo, type Situacao,
} from '@/services/numeros/numerosRegras';
import type { NumeroRow } from '@/services/numeros/numeros.service';
import { CORES_SITUACAO } from './coresSituacao';
import { EtiquetaSituacao } from './EtiquetasNumero';

/** O que basta de um número para desenhar a situação com o tempo. */
export type NumeroComTempo =
  Pick<NumeroRow, 'situacao'> & Partial<Pick<NumeroRow, 'prazo_ate' | 'situacao_desde'>>;

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Contagem regressiva de uma situação com prazo, e o selo quando ele acaba. */
function ContagemDoPrazo({ situacao, prazoAte }: { situacao: Situacao; prazoAte: string }) {
  const agora = useAgora();
  const prazo = estadoDoPrazo(prazoAte, agora);
  if (!prazo) return null;

  if (prazo.acabou) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-success/30 bg-success/15 font-semibold text-success"
        title={`O prazo terminou em ${dataHora(prazoAte)}`}
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        {eEspera(situacao) ? 'Pronto' : 'Dentro do prazo'}
      </Badge>
    );
  }

  const restante = formatarRestante(prazo.restanteMs);
  return (
    <Badge
      variant="outline"
      role="timer"
      className="gap-1 font-mono tabular-nums"
      title={`Termina em ${dataHora(prazoAte)}`}
      aria-label={`Faltam ${restante}. Termina em ${dataHora(prazoAte)}.`}
    >
      <Timer className="h-3 w-3" aria-hidden />
      {restante}
    </Badge>
  );
}

/** Há quanto tempo o número está no proxy. `soTempo` omite o nome da situação. */
function TempoNoProxy({ desde, soTempo }: { desde: string; soTempo: boolean }) {
  const agora = useAgora();
  const texto = formatarDecorrido(desde, agora);
  if (!texto) return null;
  return (
    <Badge
      variant="outline"
      className={cn('gap-1', CORES_SITUACAO.movimentando_proxy)}
      title={`No proxy desde ${dataHora(desde)}`}
    >
      <Waypoints className="h-3 w-3" aria-hidden />
      {soTempo ? texto : `${SITUACAO_LABELS.movimentando_proxy} — ${texto}`}
    </Badge>
  );
}

/**
 * Só o tempo, para ficar ao lado de um seletor de situação — o seletor já diz
 * qual é a situação. Não desenha nada quando ela não tem tempo.
 */
export function CronometroSituacao({ numero }: { numero: NumeroComTempo }) {
  if (contaTempoDecorrido(numero.situacao) && numero.situacao_desde) {
    return <TempoNoProxy desde={numero.situacao_desde} soTempo />;
  }
  if (temPrazo(numero.situacao) && numero.prazo_ate) {
    return <ContagemDoPrazo situacao={numero.situacao} prazoAte={numero.prazo_ate} />;
  }
  return null;
}

/** A situação para quem só olha: a etiqueta e, quando houver, o tempo. */
export function SituacaoDoNumero({ numero }: { numero: NumeroComTempo }) {
  if (contaTempoDecorrido(numero.situacao) && numero.situacao_desde) {
    return <TempoNoProxy desde={numero.situacao_desde} soTempo={false} />;
  }
  return (
    <>
      <EtiquetaSituacao situacao={numero.situacao} />
      <CronometroSituacao numero={numero} />
    </>
  );
}
