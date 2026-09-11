/**
 * As etiquetas de um número: situação e posse.
 *
 * Ficam juntas e compartilhadas porque as duas páginas mostram as mesmas cores
 * para as mesmas coisas. Duas cópias divergiriam no dia em que alguém trocasse
 * o tom de «Banido» num lado só, e aí a mesma palavra passaria a significar
 * gravidades diferentes conforme a tela.
 */
import { Send, Tag, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CORES_SITUACAO } from './coresSituacao';
import {
  SITUACAO_LABELS, POSSE_LABELS, MOTIVO_LABELS,
  ETIQUETA_LABELS, ETIQUETA_DESCRICOES, TRATAMENTO_LABELS, etiquetasConhecidas,
  type Situacao, type Posse, type MotivoRetorno, type Tratamento,
} from '@/services/numeros/numerosRegras';

export function EtiquetaSituacao({ situacao }: { situacao: Situacao }) {
  return (
    <Badge variant="outline" className={CORES_SITUACAO[situacao]}>
      {SITUACAO_LABELS[situacao]}
    </Badge>
  );
}

/**
 * Onde o número está.
 *
 * `setor` ganha peso — fundo, cor e ícone —, e `nucleo` fica discreto. Não é
 * enfeite: na lista do Núcleo os dois estados precisam se distinguir de relance,
 * porque significam coisas opostas para quem está olhando. «No Núcleo» é
 * trabalho em cima da mesa; «No setor» é trabalho que já saiu das mãos.
 *
 * Ao lado disto, a linha inteira fica esmaecida quando o número foi lançado —
 * ver `ListaNumeros`. As duas coisas juntas resolvem em relance o que um badge
 * cinza sozinho não resolvia.
 *
 * Isto é a REPRESENTAÇÃO de `posse`, e não um estado à parte: quem manda é a
 * coluna no banco, e esta função só a desenha.
 */
export function EtiquetaPosse({ posse }: { posse: Posse }) {
  if (posse === 'setor') {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
        <Send className="mr-1 h-3 w-3" />
        {POSSE_LABELS.setor}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {POSSE_LABELS.nucleo}
    </Badge>
  );
}

/**
 * As marcas operacionais do momento.
 *
 * Só aparece quando existe alguma — a esmagadora maioria dos números não tem
 * etiqueta, e um «—» ali sugeriria que falta informação.
 *
 * `etiquetasConhecidas` descarta o que esta versão da tela não sabe nomear: um
 * deploy antigo lendo uma etiqueta nova pintaria um badge em branco, e uma
 * etiqueta a menos é melhor do que uma etiqueta vazia.
 */
export function EtiquetasOperacionais({ etiquetas }: { etiquetas: unknown }) {
  const lista = etiquetasConhecidas(etiquetas);
  if (lista.length === 0) return null;

  return (
    <>
      {lista.map(e => (
        <Badge
          key={e}
          variant="outline"
          className="border-primary/30 bg-primary/10 text-primary"
          title={ETIQUETA_DESCRICOES[e]}
        >
          <Tag className="mr-1 h-3 w-3" />
          {ETIQUETA_LABELS[e]}
        </Badge>
      ))}
    </>
  );
}

/**
 * Em que pé está o tratamento de um número que voltou de um setor.
 *
 * `null` — o caso normal — não desenha nada: a grande maioria dos números nunca
 * voltou de lugar nenhum, e não há nada pendente sobre eles.
 */
export function EtiquetaTratamento({ tratamento }: { tratamento: Tratamento | null }) {
  if (!tratamento) return null;

  const emAndamento = tratamento === 'em_andamento';
  return (
    <Badge
      variant="outline"
      className={emAndamento
        ? 'border-primary/30 bg-primary/10 text-primary'
        : 'border-warning/30 bg-warning/15 text-warning'}
    >
      <Wrench className="mr-1 h-3 w-3" />
      {TRATAMENTO_LABELS[tratamento]}
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
