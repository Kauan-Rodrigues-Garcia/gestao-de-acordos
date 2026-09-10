/**
 * ListaNumeros — os números do Núcleo, agrupados pelo aparelho em que moram.
 *
 * ## O celular é o agrupamento, e não uma coluna
 *
 * A lista era plana, com «Celular» como uma coluna no meio das outras. Com
 * duzentos números em trinta aparelhos, saber quais são do Celular 07 exigia ler
 * a coluna linha a linha, e os seis números de um mesmo aparelho apareciam
 * espalhados por três telas de rolagem.
 *
 * Agora cada aparelho é um bloco, e o que está dentro dele é dele. O seletor no
 * topo estreita para um só quando a pessoa já sabe qual procura — que é o caso
 * comum de quem está com o telefone na mão.
 *
 * O agrupamento não muda o que a pessoa enxerga: a RLS já recortou, e o que
 * chega aqui só é rearranjado.
 *
 * ## Lançado e não lançado se distinguem de relance
 *
 * Um número que já foi liberado ao setor saiu da mesa do Núcleo — não há mais
 * nada a fazer com ele por aqui. A linha fica esmaecida, a etiqueta de posse
 * ganha cor e ícone, e o bloco do aparelho mostra quantos dos seus já saíram.
 *
 * É REPRESENTAÇÃO de `posse`, e não um estado à parte: quem manda é a coluna no
 * banco. Esta tela apenas a desenha de um jeito que não exige leitura atenta.
 *
 * ## Alterar o estado e lançar ao setor são ações diferentes
 *
 * A situação muda por seletor, a qualquer momento, inclusive com o número em
 * tratamento. «Liberar» só aparece quando `podeLiberarAoSetor` diz sim — o mesmo
 * predicado que o serviço consulta e que a RPC repete no banco.
 *
 * Era o defeito central do fluxo antigo: o número voltava marcado «Banido», e a
 * única forma de tirar aquela marca da tela era lançá-lo de novo ao setor. O
 * Núcleo tratava com o número já fora das mãos, ou não tratava.
 *
 * ## O que pede confirmação, e o que não pede
 *
 * Trocar situação e etiqueta é reversível e fica no histórico — um clique. O que
 * apaga (excluir) tem confirmação. Corrigir abre diálogo porque precisa de um
 * campo, não porque é perigoso.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Send, ListFilter, Smartphone, MoreHorizontal, Pencil, Trash2,
  Wrench, CheckCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  EtiquetaPosse, EtiquetaMotivo, EtiquetaTratamento, EtiquetasOperacionais,
} from '@/components/numeros/EtiquetasNumero';
import { SeletorEtiquetas } from '@/components/numeros/SeletorEtiquetas';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  SITUACOES, SITUACAO_LABELS, LIMITE_POR_CELULAR,
  podeLiberarAoSetor, podeCorrigirNumero, podeExcluirNumero,
  podeConcluirTratamento, esperaTratamento, foiLancadoAoSetor,
  type Situacao, type Posse,
} from '@/services/numeros/numerosRegras';
import {
  alterarSituacao, liberarAoSetor, iniciarTratamento, concluirTratamento,
  type NumeroRow,
} from '@/services/numeros/numeros.service';
import type { CelularComNumeros } from '@/hooks/useControleNumeros';

const TODOS = '__todos__';

/** Um aparelho e os números dele que sobreviveram aos filtros. */
interface Grupo {
  aparelho: CelularComNumeros;
  visiveis: NumeroRow[];
  lancados: number;
}

export interface ListaNumerosProps {
  /**
   * Os aparelhos já cruzados com seus números, como o hook entrega.
   *
   * Recebe `aparelhos` e não `numeros` porque o agrupamento é o assunto da tela:
   * refazer o cruzamento aqui duplicaria o `useMemo` que `useControleNumeros` já
   * faz para a aba Celulares, e as duas contagens de `n/6` poderiam divergir.
   */
  aparelhos: CelularComNumeros[];
  nomeDoSetor: (setorId: string) => string;
  podeAdministrar: boolean;
  podeLiberar: boolean;
  onMudou: () => void;
  onVerHistorico: (numeroId: string, numero: string) => void;
  onCorrigir: (aparelho: CelularComNumeros, numero: NumeroRow) => void;
  onExcluir: (aparelho: CelularComNumeros, numero: NumeroRow) => void;
}

export function ListaNumeros({
  aparelhos, nomeDoSetor, podeAdministrar, podeLiberar,
  onMudou, onVerHistorico, onCorrigir, onExcluir,
}: ListaNumerosProps) {
  const [filtroCelular, setFiltroCelular]   = useState<string>(TODOS);
  const [filtroSituacao, setFiltroSituacao] = useState<string>(TODOS);
  const [filtroPosse, setFiltroPosse]       = useState<string>(TODOS);
  const [ocupado, setOcupado]               = useState<string | null>(null);

  const grupos = useMemo<Grupo[]>(() => {
    return aparelhos
      .filter(a => filtroCelular === TODOS || a.celular.id === filtroCelular)
      .map(a => ({
        aparelho: a,
        visiveis: a.numeros.filter(n =>
          (filtroSituacao === TODOS || n.situacao === filtroSituacao)
          && (filtroPosse === TODOS || n.posse === filtroPosse)),
        lancados: a.numeros.filter(foiLancadoAoSetorRow).length,
      }))
      // Aparelho que ficou sem nenhum número no recorte sai: um cartão vazio
      // dizendo «nada aqui» trinta vezes é a mesma poluição que o agrupamento
      // veio resolver. O único que fica é quando ele é o escolhido no seletor.
      .filter(g => g.visiveis.length > 0 || filtroCelular === g.aparelho.celular.id);
  }, [aparelhos, filtroCelular, filtroSituacao, filtroPosse]);

  const totalVisivel = grupos.reduce((s, g) => s + g.visiveis.length, 0);
  const totalGeral   = aparelhos.reduce((s, a) => s + a.numeros.length, 0);

  async function executar(
    n: NumeroRow, acao: () => Promise<{ ok: boolean; erro?: string }>,
    sucesso: string, falhaPadrao: string,
  ) {
    setOcupado(n.id);
    const r = await acao();
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro ?? falhaPadrao); return; }
    toast.success(sucesso);
    onMudou();
  }

  function linha(n: NumeroRow, aparelho: CelularComNumeros) {
    const estado = {
      situacao: n.situacao, posse: n.posse,
      operadorId: n.operador_id, tratamento: n.tratamento,
    };
    const lancado = foiLancadoAoSetor(estado);
    const ocupadoAgora = ocupado === n.id;

    return (
      <TableRow
        key={n.id}
        // A diferença visual do lançado. `opacity` e não outra cor de fundo
        // porque a linha continua legível e não compete com o destaque de erro
        // (borda vermelha) que um banido pode ter na mesma tela.
        className={cn(lancado && 'bg-muted/40 opacity-70')}
      >
        <TableCell>
          <button
            type="button"
            className="font-mono text-sm underline-offset-2 hover:underline"
            onClick={() => onVerHistorico(n.id, n.numero)}
          >
            {mascararNumero(n.numero)}
          </button>
        </TableCell>

        <TableCell>
          {podeAdministrar ? (
            <Select
              value={n.situacao}
              onValueChange={v => void executar(
                n, () => alterarSituacao(n.id, v as Situacao),
                `${mascararNumero(n.numero)} agora está ${SITUACAO_LABELS[v as Situacao].toLowerCase()}.`,
                'Não foi possível alterar.',
              )}
              disabled={ocupadoAgora}
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
            <EtiquetaTratamento tratamento={n.tratamento} />
            <EtiquetaMotivo motivo={n.motivo_retorno} />
            <EtiquetasOperacionais etiquetas={n.etiquetas} />
          </div>
          {n.observacao_retorno && (
            <p className="mt-1 max-w-[28ch] truncate text-xs text-muted-foreground"
               title={n.observacao_retorno}>
              {n.observacao_retorno}
            </p>
          )}
        </TableCell>

        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {/* O tratamento vem primeiro: é o que está travando a liberação. */}
            {podeAdministrar && esperaTratamento(estado) && (
              <Button
                size="sm" variant="outline" disabled={ocupadoAgora}
                onClick={() => void executar(
                  n, () => iniciarTratamento(n.id),
                  `Tratamento de ${mascararNumero(n.numero)} iniciado.`,
                  'Não foi possível iniciar o tratamento.',
                )}
              >
                <Wrench className="mr-1 h-3.5 w-3.5" /> Tratar
              </Button>
            )}
            {podeAdministrar && podeConcluirTratamento(estado) && (
              <Button
                size="sm" variant="outline" disabled={ocupadoAgora}
                onClick={() => void executar(
                  n, () => concluirTratamento(n.id),
                  `Tratamento de ${mascararNumero(n.numero)} encerrado. `
                    + 'Ele voltou a ser um número comum do Núcleo.',
                  'Não foi possível encerrar o tratamento.',
                )}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Encerrar
              </Button>
            )}

            {podeLiberar && podeLiberarAoSetor(estado) && (
              <Button
                size="sm" variant="outline" disabled={ocupadoAgora}
                onClick={() => void executar(
                  n, () => liberarAoSetor(n.id),
                  `${mascararNumero(n.numero)} liberado para ${nomeDoSetor(n.setor_id)}.`,
                  'Não foi possível liberar.',
                )}
              >
                <Send className="mr-1 h-3.5 w-3.5" /> Liberar
              </Button>
            )}

            {podeAdministrar && <SeletorEtiquetas numero={n} onMudou={onMudou} />}

            {/* Corrigir e excluir moram num menu: são raros — conserto de
                cadastro —, e ocupando espaço fixo competiriam com as ações do
                dia a dia. */}
            {podeAdministrar && (podeCorrigirNumero(estado) || podeExcluirNumero(estado)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8"
                    disabled={ocupadoAgora}
                    aria-label={`Mais ações para ${mascararNumero(n.numero)}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {podeCorrigirNumero(estado) && (
                    <DropdownMenuItem onSelect={() => onCorrigir(aparelho, n)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Corrigir número
                    </DropdownMenuItem>
                  )}
                  {podeExcluirNumero(estado) && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onExcluir(aparelho, n)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir do cadastro
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilter className="h-4 w-4 text-muted-foreground" />

        {/* O celular vem primeiro entre os filtros porque é o agrupamento. */}
        <Select value={filtroCelular} onValueChange={setFiltroCelular}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os celulares</SelectItem>
            {aparelhos.map(a => (
              <SelectItem key={a.celular.id} value={a.celular.id}>
                {a.celular.identificacao} ({a.numeros.length}/{LIMITE_POR_CELULAR})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Em qualquer lugar</SelectItem>
            <SelectItem value={'nucleo' satisfies Posse}>No Núcleo</SelectItem>
            <SelectItem value={'setor' satisfies Posse}>Já lançados ao setor</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {totalVisivel} de {totalGeral}
        </span>
      </div>

      {grupos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {totalGeral === 0
              ? 'Nenhum número cadastrado ainda. Comece pela aba Celulares.'
              : 'Nenhum número neste recorte.'}
          </CardContent>
        </Card>
      ) : (
        grupos.map(({ aparelho, visiveis, lancados }) => (
          <Card key={aparelho.celular.id} className={aparelho.celular.ativo ? '' : 'opacity-60'}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  {aparelho.celular.identificacao}
                  <span className="text-xs font-normal text-muted-foreground">
                    {nomeDoSetor(aparelho.celular.setor_id)}
                    {aparelho.celular.modelo ? ` · ${aparelho.celular.modelo}` : ''}
                    {aparelho.celular.ativo ? '' : ' · inativo'}
                  </span>
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {lancados > 0 && (
                    <Badge variant="outline"
                           className="border-primary/30 bg-primary/10 text-primary">
                      {lancados} no setor
                    </Badge>
                  )}
                  <Badge variant={aparelho.cheio ? 'secondary' : 'outline'}>
                    {aparelho.numeros.length}/{LIMITE_POR_CELULAR}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {visiveis.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  {aparelho.numeros.length === 0
                    ? 'Este aparelho ainda não tem números.'
                    : 'Nenhum número deste aparelho no recorte escolhido.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Onde está</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{visiveis.map(n => linha(n, aparelho))}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

/** Atalho para o `filter` do cabeçalho — a linha crua, sem montar `EstadoNumero`. */
function foiLancadoAoSetorRow(n: NumeroRow): boolean {
  return n.posse === 'setor';
}
