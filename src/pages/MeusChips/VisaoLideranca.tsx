/**
 * VisaoLideranca — o setor inteiro, separado em duas listas.
 *
 * ## Por que duas listas, e não uma com coluna «operador»
 *
 * As duas metades pedem ações diferentes. «Disponíveis» é uma fila de trabalho:
 * são números parados que alguém deveria estar usando. «Com operador» é um
 * cadastro: consulta-se para saber quem está com o quê.
 *
 * Numa lista só, com uma coluna a mais, os disponíveis se dissolveriam no meio
 * dos distribuídos — e o número parado há duas semanas continuaria parado.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Send, Undo2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EtiquetaSituacao, EtiquetaMotivo } from '@/components/numeros/EtiquetasNumero';
import { DialogoMotivoRetorno } from '@/components/numeros/DialogoMotivoRetorno';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { podeLancarAoOperador, type MotivoRetorno } from '@/services/numeros/numerosRegras';
import { relancarAoNucleo, type NumeroRow } from '@/services/numeros/numeros.service';
import { DialogoLancar } from './DialogoLancar';

export interface VisaoLiderancaProps {
  empresaId: string;
  semOperador: NumeroRow[];
  comOperador: NumeroRow[];
  nomeDoCelular: (celularId: string) => string;
  nomeDoOperador: (operadorId: string | null) => string;
  podeLancar: boolean;
  podeRelancar: boolean;
  onMudou: () => void;
  onVerHistorico: (numeroId: string, numero: string) => void;
}

export function VisaoLideranca({
  empresaId, semOperador, comOperador, nomeDoCelular, nomeDoOperador,
  podeLancar, podeRelancar, onMudou, onVerHistorico,
}: VisaoLiderancaProps) {
  const [paraLancar, setParaLancar]     = useState<NumeroRow | null>(null);
  const [paraRelancar, setParaRelancar] = useState<NumeroRow | null>(null);
  const [salvando, setSalvando]         = useState(false);

  async function relancar(motivo: MotivoRetorno, observacao: string) {
    if (!paraRelancar) return;
    setSalvando(true);
    const r = await relancarAoNucleo(paraRelancar.id, motivo, observacao);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível relançar.'); return; }
    toast.success(`${mascararNumero(paraRelancar.numero)} voltou ao Núcleo.`);
    setParaRelancar(null);
    onMudou();
  }

  function linhasDe(lista: NumeroRow[], comDono: boolean) {
    return lista.map(n => (
      <TableRow key={n.id}>
        <TableCell>
          <button
            type="button"
            className="font-mono text-sm underline-offset-2 hover:underline"
            onClick={() => onVerHistorico(n.id, n.numero)}
          >
            {mascararNumero(n.numero)}
          </button>
        </TableCell>
        <TableCell className="text-sm">{nomeDoCelular(n.celular_id)}</TableCell>
        {comDono && (
          <TableCell className="text-sm">{nomeDoOperador(n.operador_id)}</TableCell>
        )}
        <TableCell>
          <div className="flex flex-wrap items-center gap-1.5">
            <EtiquetaSituacao situacao={n.situacao} />
            <EtiquetaMotivo motivo={n.motivo_retorno} />
          </div>
          {n.observacao_retorno && (
            <p className="mt-1 max-w-[28ch] truncate text-xs text-muted-foreground"
               title={n.observacao_retorno}>
              {n.observacao_retorno}
            </p>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {podeLancar && podeLancarAoOperador({
              situacao: n.situacao, posse: n.posse, operadorId: n.operador_id,
            }) && (
              <Button size="sm" variant="outline" onClick={() => setParaLancar(n)}>
                {comDono
                  ? <><UserPlus className="mr-1 h-3.5 w-3.5" /> Trocar</>
                  : <><Send className="mr-1 h-3.5 w-3.5" /> Lançar</>}
              </Button>
            )}
            {podeRelancar && (
              <Button size="sm" variant="ghost" onClick={() => setParaRelancar(n)}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Relançar
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Disponíveis para lançar ({semOperador.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {semOperador.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhum número livre no setor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Celular</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{linhasDe(semOperador, false)}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Com operador ({comOperador.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {comOperador.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhum número distribuído.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Celular</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{linhasDe(comOperador, true)}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DialogoLancar
        numero={paraLancar}
        empresaId={empresaId}
        nomeAtual={paraLancar?.operador_id ? nomeDoOperador(paraLancar.operador_id) : null}
        onFechar={() => setParaLancar(null)}
        onLancado={onMudou}
      />

      <DialogoMotivoRetorno
        aberto={paraRelancar !== null}
        titulo="Relançar ao Núcleo"
        descricao={
          paraRelancar
            ? `${mascararNumero(paraRelancar.numero)} sai do setor e volta para o `
              + 'Núcleo tratar. O registro e o histórico são preservados.'
            : ''
        }
        rotuloConfirmar="Relançar"
        salvando={salvando}
        onConfirmar={relancar}
        onFechar={() => setParaRelancar(null)}
      />
    </div>
  );
}
