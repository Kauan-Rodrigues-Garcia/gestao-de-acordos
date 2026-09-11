/**
 * VisaoOperador — os números que foram lançados para esta pessoa.
 *
 * ## O que ela NÃO vê, e por quê
 *
 * Os números do setor que ninguém recebeu ainda, e os que estão com colegas. A
 * lista chega assim do banco (`fn_numeros_visivel` com alcance individual) —
 * esta tela não filtra nada, só desenha o que veio.
 *
 * ## Devolver não é relançar
 *
 * O botão daqui solta o número de volta para a liderança, e ele CONTINUA no
 * setor. Mandar de volta ao Núcleo é decisão de quem responde pelo setor, e
 * fica na outra visão.
 *
 * A diferença importa no dia em que um número for banido: o operador avisa em
 * dois cliques, com motivo, e o líder decide se vale devolver ao Núcleo ou
 * passar para outra pessoa.
 *
 * ## O tempo da situação aparece para ele também
 *
 * Quem marca «Aguardando 12 horas» ou «Em restrição» é o Núcleo, mas quem vai
 * usar o número é o operador: a contagem regressiva diz a ele quando o número
 * volta a servir, sem precisar perguntar a ninguém.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Undo2, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EtiquetasOperacionais } from '@/components/numeros/EtiquetasNumero';
import { SituacaoDoNumero } from '@/components/numeros/SituacaoDoNumero';
import { DialogoMotivoRetorno } from '@/components/numeros/DialogoMotivoRetorno';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { podeDevolverALideranca, type MotivoRetorno } from '@/services/numeros/numerosRegras';
import { devolverALideranca, type NumeroRow } from '@/services/numeros/numeros.service';

export interface VisaoOperadorProps {
  numeros: NumeroRow[];
  meuId: string | null;
  nomeDoCelular: (celularId: string) => string;
  podeDevolver: boolean;
  onMudou: () => void;
  onVerHistorico: (numeroId: string, numero: string) => void;
}

export function VisaoOperador({
  numeros, meuId, nomeDoCelular, podeDevolver, onMudou, onVerHistorico,
}: VisaoOperadorProps) {
  const [paraDevolver, setParaDevolver] = useState<NumeroRow | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function devolver(motivo: MotivoRetorno, observacao: string) {
    if (!paraDevolver) return;
    setSalvando(true);
    const r = await devolverALideranca(paraDevolver.id, motivo, observacao);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível devolver.'); return; }
    toast.success(`${mascararNumero(paraDevolver.numero)} devolvido à liderança.`);
    setParaDevolver(null);
    onMudou();
  }

  if (numeros.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-2">
          <Hash className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum número lançado para você ainda.
          </p>
          <p className="text-xs text-muted-foreground">
            A liderança do seu setor distribui os números que o Núcleo libera.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {numeros.map(n => (
          <Card key={n.id}>
            <CardContent className="space-y-2 py-4">
              <button
                type="button"
                className="font-mono text-lg underline-offset-2 hover:underline"
                onClick={() => onVerHistorico(n.id, n.numero)}
              >
                {mascararNumero(n.numero)}
              </button>
              <p className="text-xs text-muted-foreground">
                {nomeDoCelular(n.celular_id)}
              </p>
              {/* As etiquetas aparecem para o operador também: «Não chegou SMS»
                  é justamente o aviso de que aquele número não vai funcionar
                  agora, e escondê-lo faria a pessoa descobrir tentando. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <SituacaoDoNumero numero={n} />
                <EtiquetasOperacionais etiquetas={n.etiquetas} />
              </div>

              {podeDevolver && meuId && podeDevolverALideranca(
                {
                  situacao: n.situacao, posse: n.posse,
                  operadorId: n.operador_id, tratamento: n.tratamento,
                },
                meuId,
              ) && (
                <Button
                  size="sm" variant="outline" className="w-full"
                  onClick={() => setParaDevolver(n)}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Devolver à liderança
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <DialogoMotivoRetorno
        aberto={paraDevolver !== null}
        titulo="Devolver à liderança"
        descricao={
          paraDevolver
            ? `${mascararNumero(paraDevolver.numero)} volta para a liderança do `
              + 'seu setor. Ele continua no setor — quem decide mandá-lo ao '
              + 'Núcleo é a liderança.'
            : ''
        }
        rotuloConfirmar="Devolver"
        salvando={salvando}
        onConfirmar={devolver}
        onFechar={() => setParaDevolver(null)}
      />
    </>
  );
}
