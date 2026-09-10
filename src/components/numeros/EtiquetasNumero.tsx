/**
 * As etiquetas de um número: situação e posse.
 *
 * Ficam juntas e compartilhadas porque as duas páginas mostram as mesmas cores
 * para as mesmas coisas. Duas cópias divergiriam no dia em que alguém trocasse
 * o tom de «Banido» num lado só, e aí a mesma palavra passaria a significar
 * gravidades diferentes conforme a tela.
 */
import { Badge } from '@/components/ui/badge';
import {
  SITUACAO_LABELS, POSSE_LABELS, MOTIVO_LABELS,
  type Situacao, type Posse, type MotivoRetorno,
} from '@/services/numeros/numerosRegras';

const CORES_SITUACAO: Record<Situacao, string> = {
  em_aquecimento: 'bg-warning/15 text-warning border-warning/30',
  ativo:          'bg-success/15 text-success border-success/30',
  banido:         'bg-destructive/15 text-destructive border-destructive/30',
};

export function EtiquetaSituacao({ situacao }: { situacao: Situacao }) {
  return (
    <Badge variant="outline" className={CORES_SITUACAO[situacao]}>
      {SITUACAO_LABELS[situacao]}
    </Badge>
  );
}

export function EtiquetaPosse({ posse }: { posse: Posse }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {POSSE_LABELS[posse]}
    </Badge>
  );
}

/**
 * O motivo pelo qual o número voltou, quando voltou.
 *
 * Só aparece quando existe: um número que nunca saiu do Núcleo não tem motivo
 * de retorno, e mostrar «—» ali sugeriria que a informação falta.
 */
export function EtiquetaMotivo({ motivo }: { motivo: MotivoRetorno | null }) {
  if (!motivo) return null;
  return (
    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/25">
      Voltou: {MOTIVO_LABELS[motivo]}
    </Badge>
  );
}
