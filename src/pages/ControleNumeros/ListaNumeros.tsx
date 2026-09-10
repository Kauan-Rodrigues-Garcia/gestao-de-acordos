/**
 * ListaNumeros — todos os números do Núcleo, com filtro e as duas ações dele.
 *
 * ## As ações aparecem quando a REGRA permite, não quando o cargo permite
 *
 * «Liberar ao setor» só aparece quando `podeLiberarAoSetor` responde sim — o
 * mesmo predicado puro que o serviço consulta e que a RPC repete no banco. Três
 * lugares, uma regra: é o que impede a tela oferecer um botão que o banco vai
 * recusar.
 *
 * ## A situação muda por seletor, sem confirmação
 *
 * O desenho previa um diálogo de confirmação. Não entrou: trocar situação é
 * reversível, fica gravado no histórico com autor e hora, e um diálogo a cada
 * chip aquecido seria um clique a mais em cima da ação mais repetida do módulo.
 * O que é irreversível — relançar, apagar — continua com confirmação.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Send, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EtiquetaPosse, EtiquetaMotivo } from '@/components/numeros/EtiquetasNumero';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  SITUACOES, SITUACAO_LABELS, podeLiberarAoSetor, type Situacao, type Posse,
} from '@/services/numeros/numerosRegras';
import { alterarSituacao, liberarAoSetor, type NumeroRow } from '@/services/numeros/numeros.service';

const TODOS = '__todos__';

export interface ListaNumerosProps {
  numeros: NumeroRow[];
  nomeDoSetor: (setorId: string) => string;
  nomeDoCelular: (celularId: string) => string;
  podeAdministrar: boolean;
  podeLiberar: boolean;
  onMudou: () => void;
  onVerHistorico: (numeroId: string, numero: string) => void;
}

export function ListaNumeros({
  numeros, nomeDoSetor, nomeDoCelular, podeAdministrar, podeLiberar,
  onMudou, onVerHistorico,
}: ListaNumerosProps) {
  const [filtroSituacao, setFiltroSituacao] = useState<string>(TODOS);
  const [filtroPosse, setFiltroPosse]       = useState<string>(TODOS);
  const [ocupado, setOcupado]               = useState<string | null>(null);

  const visiveis = useMemo(() => numeros.filter(n =>
    (filtroSituacao === TODOS || n.situacao === filtroSituacao)
    && (filtroPosse === TODOS || n.posse === filtroPosse)
  ), [numeros, filtroSituacao, filtroPosse]);

  async function trocarSituacao(n: NumeroRow, situacao: Situacao) {
    setOcupado(n.id);
    const r = await alterarSituacao(n.id, situacao);
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível alterar.'); return; }
    toast.success(`${mascararNumero(n.numero)} agora está ${SITUACAO_LABELS[situacao].toLowerCase()}.`);
    onMudou();
  }

  async function liberar(n: NumeroRow) {
    setOcupado(n.id);
    const r = await liberarAoSetor(n.id);
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível liberar.'); return; }
    toast.success(`${mascararNumero(n.numero)} liberado para ${nomeDoSetor(n.setor_id)}.`);
    onMudou();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter className="h-4 w-4 text-muted-foreground" />
        <Select value={filtroSituacao} onValueChange={setFiltroSituacao}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as situações</SelectItem>
            {SITUACOES.map(s => (
              <SelectItem key={s} value={s}>{SITUACAO_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroPosse} onValueChange={setFiltroPosse}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Em qualquer lugar</SelectItem>
            <SelectItem value={'nucleo' satisfies Posse}>No Núcleo</SelectItem>
            <SelectItem value={'setor' satisfies Posse}>No setor</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {visiveis.length} de {numeros.length}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum número neste recorte.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Celular</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Onde está</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map(n => (
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
                  <TableCell className="text-sm">{nomeDoSetor(n.setor_id)}</TableCell>
                  <TableCell>
                    {podeAdministrar ? (
                      <Select
                        value={n.situacao}
                        onValueChange={v => void trocarSituacao(n, v as Situacao)}
                        disabled={ocupado === n.id}
                      >
                        <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SITUACOES.map(s => (
                            <SelectItem key={s} value={s}>{SITUACAO_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{SITUACAO_LABELS[n.situacao]}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <EtiquetaPosse posse={n.posse} />
                      <EtiquetaMotivo motivo={n.motivo_retorno} />
                    </div>
                    {n.observacao_retorno && (
                      <p className="mt-1 max-w-[24ch] truncate text-xs text-muted-foreground"
                         title={n.observacao_retorno}>
                        {n.observacao_retorno}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {podeLiberar && podeLiberarAoSetor({
                      situacao: n.situacao, posse: n.posse, operadorId: n.operador_id,
                    }) && (
                      <Button
                        size="sm" variant="outline"
                        disabled={ocupado === n.id}
                        onClick={() => void liberar(n)}
                      >
                        <Send className="mr-1 h-3.5 w-3.5" /> Liberar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
