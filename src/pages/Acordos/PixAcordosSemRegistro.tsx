/**
 * PixAcordosSemRegistro — o acordo que ficou só na aba Acordos.
 *
 * ## O buraco que isto tapa
 *
 * PIX Automático e Cartão Recorrente são tabulados na lista de acordos como
 * qualquer outra forma de pagamento. A comissão deles NÃO sai dali: sai desta
 * aba, que tem tabela, meta e percentual próprios. Quem tabula e não registra
 * aqui perde a comissão, perde o acordo na contagem da dobra — e não recebe
 * nenhum sinal de que perdeu.
 *
 * O aviso pós-gravação (`ModalAvisoPixAutomatico`) cobre quem acabou de lançar
 * e clicou. Não cobre quem fechou a janela, quem lançou por importação, quem
 * lançou ontem. Foi o que aconteceu no Play 3 com um lote inteiro.
 *
 * Este cartão é a lista do que falta, e some sozinho quando não falta nada.
 *
 * ## O caminho contrário NÃO é duplicidade
 *
 * Registrar aqui um NR que já está na lista de acordos é exatamente o que se
 * quer: mesmo acordo, mesma pessoa, acompanhado nos dois lugares. As duas
 * tabelas não se falam, e o teste-guarda em `pix_nr_duplicidade.test.ts`
 * existe para que continue assim.
 */
import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/index';
import { nomeDaFormaRecorrente } from '@/lib/formasRecorrentes';
import type { AcordoSemRegistroPix } from '@/services/pix_automatico.service';

interface Props {
  acordos: AcordoSemRegistroPix[];
  /** Registrar direto daqui, com o NR e o valor que já estão no acordo. */
  onRegistrar: (acordo: AcordoSemRegistroPix) => Promise<void>;
  /** Setor com registro manual desligado: a lista informa, mas não age. */
  podeRegistrar: boolean;
}

/** '2026-09-12' → '12/09'. */
function dia(iso: string): string {
  const [ano, mes, d] = String(iso).split('-');
  return ano && mes && d ? `${d}/${mes}` : String(iso);
}

/*
 * Desde 16/10/2026 mora na seção «Sem registro no Pix» da sub-aba NRs
 * divergentes, que já traz título e explicação: aqui fica só a lista, sem
 * moldura colorida nem abrir/fechar — fechada, ela sumia justamente na aba
 * aberta para resolvê-la.
 */
export function PixAcordosSemRegistro({ acordos, onRegistrar, podeRegistrar }: Props) {
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  if (acordos.length === 0) return null;

  async function registrar(a: AcordoSemRegistroPix) {
    setOcupadoId(a.id);
    try { await onRegistrar(a); } finally { setOcupadoId(null); }
  }

  const total = acordos.reduce((s, a) => s + Number(a.valor), 0);

  return (
    <Card className="overflow-hidden border-border">
      <CardContent className="p-0">
        <div className="divide-y divide-border">
            {acordos.map(a => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5"
              >
                <span className="font-mono text-sm font-semibold text-foreground">
                  NR {a.nr_cliente}
                </span>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">
                  {nomeDaFormaRecorrente(a.tipo)}
                </Badge>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(a.valor)} · vence {dia(a.vencimento)}
                </span>
                <div className="ml-auto">
                  {podeRegistrar ? (
                    <Button
                      size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                      disabled={ocupadoId != null}
                      onClick={() => void registrar(a)}
                    >
                      {ocupadoId === a.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Plus className="h-3.5 w-3.5" />}
                      Registrar no Pix
                    </Button>
                  ) : (
                    /* Setor com registro manual desligado: dizer o que fazer é
                       melhor que um botão que devolve erro. */
                    <span className="text-[11px] text-muted-foreground">
                      Peça ao seu líder para registrar.
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
        {acordos.length > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <span>{acordos.length} acordos</span>
            <span className="tabular-nums">somando <strong className="text-foreground">{formatCurrency(total)}</strong></span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
