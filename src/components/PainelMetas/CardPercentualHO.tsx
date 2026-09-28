/**
 * CardPercentualHO — o percentual de H.O. da PaguePlay, editável na aba Metas.
 *
 * Toda conversão entre bruto e H.O. que não tem relatório por trás passa por
 * este número: meta, comissão, bônus, agendado, indireto. O H.O. do analítico
 * NÃO passa — ele vem pronto da coluna do relatório.
 *
 * Por isso o card mostra, ao lado, o percentual que o relatório do mês está
 * praticando (Total HO ÷ Recebido). Quando os dois divergem, a % da meta em
 * H.O. deixa de bater com a % em bruto, e é aqui que se corrige.
 */
import { useEffect, useState } from 'react';
import { Percent, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  useHoPercentual, setHoPercentual, rotuloHoPercentual, percentualImplicito,
} from '@/lib/hoPercentual';
import {
  definirHoPercentual, lerPercentualDigitado, percentualParaCampo,
} from '@/services/metas/hoPercentual.service';
import { buscarResumoMensal } from '@/services/analitico/analitico.service';

interface Props {
  /** `yyyy-MM` — o mês da tela, para ler o percentual do relatório. */
  mes: string;
  podeEditar: boolean;
}

export function CardPercentualHO({ mes, podeEditar }: Props) {
  const { empresa } = useEmpresa();
  const atual = useHoPercentual();
  const [texto, setTexto] = useState(() => percentualParaCampo(atual));
  const [salvando, setSalvando] = useState(false);
  const [doRelatorio, setDoRelatorio] = useState<number | null>(null);

  // O campo acompanha o valor gravado quando ele muda por fora (outra aba,
  // recarga da empresa).
  useEffect(() => { setTexto(percentualParaCampo(atual)); }, [atual]);

  useEffect(() => {
    if (!empresa?.id) return;
    let vivo = true;
    buscarResumoMensal(empresa.id, mes).then(({ data }) => {
      if (!vivo) return;
      setDoRelatorio(data ? percentualImplicito(Number(data.total_recebido), Number(data.total_ho)) : null);
    });
    return () => { vivo = false; };
  }, [empresa?.id, mes]);

  const digitado = lerPercentualDigitado(texto);
  const mudou = digitado !== null && Math.abs(digitado - atual) > 0.00001;

  async function salvar(fracao: number | null = digitado) {
    if (!empresa?.id || fracao === null) return;
    setSalvando(true);
    const r = await definirHoPercentual(empresa.id, fracao);
    setSalvando(false);
    if ('erro' in r) { toast.error(r.erro); return; }
    // O store já passa a valer para a tela inteira. Recarregar a empresa
    // (`refresh`) ligaria o loading do provider e desmontaria a página.
    setHoPercentual(fracao);
    toast.success(`Percentual de H.O. agora é ${rotuloHoPercentual(fracao)}.`);
  }

  const divergente = doRelatorio !== null && Math.abs(doRelatorio - atual) >= 0.0005;

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-primary"><Percent className="h-4 w-4" /></span>
          <CardTitle className="text-base">Percentual de H.O.</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Converte bruto em H.O. nas metas, na comissão e nos valores de acordo. O
          recebido do analítico não usa este número: o H.O. dele vem do relatório.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ho-percentual" className="text-xs">Percentual (%)</Label>
            <Input
              id="ho-percentual"
              inputMode="decimal"
              className="h-9 w-28 font-mono"
              value={texto}
              disabled={!podeEditar || salvando}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && mudou) void salvar(); }}
              aria-invalid={digitado === null}
            />
          </div>
          {podeEditar && (
            <Button size="sm" className="h-9" disabled={!mudou || salvando} onClick={() => void salvar()}>
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          )}
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {doRelatorio !== null ? (
              <p>
                Relatório analítico deste mês:{' '}
                <span className={divergente ? 'font-semibold text-warning' : 'font-semibold text-foreground'}>
                  {rotuloHoPercentual(doRelatorio)}
                </span>
                {divergente && podeEditar && (
                  <Button
                    variant="link" size="sm" className="ml-1 h-auto p-0 text-xs"
                    disabled={salvando}
                    onClick={() => void salvar(Math.round(doRelatorio * 10000) / 10000)}
                  >
                    usar este
                  </Button>
                )}
              </p>
            ) : (
              <p>Sem relatório analítico importado neste mês.</p>
            )}
          </div>
        </div>
        {digitado === null && (
          <p className="mt-2 text-xs text-destructive">Digite um percentual entre 0 e 100, como 22,60.</p>
        )}
      </CardContent>
    </Card>
  );
}
