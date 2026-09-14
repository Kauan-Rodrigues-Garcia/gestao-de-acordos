/**
 * Mestre59Historico — quem importou o quê, quando, e o que deu errado.
 *
 * ## Os dois relatórios na mesma linha do tempo
 *
 * A pergunta que esta tela responde é «o número mudou; o que aconteceu?». Ela
 * só tem resposta se os dois relatórios aparecerem juntos e em ordem: na
 * BookPlay são 463 importações do 58 e 14 lotes do 59, 26 pessoas importando.
 * Em duas telas separadas, ninguém cruza.
 *
 * ## O que a tela NÃO esconde
 *
 * **Remoção grande ganha marca vermelha.** O 58 é retrato do mês: o que não
 * está no arquivo sai do setor. Em 13/09/2026 um export salvo da manhã do dia
 * 11 apagou 413 linhas e R$ 175.768,38 do Receptivo, e o único registro foi uma
 * frase no log, depois do fato. Aqui essa linha se enxerga de longe.
 *
 * **Coluna vazia é vazia de propósito.** O 59 substitui o mês inteiro e não
 * responde «quantas linhas foram inseridas»; o 58 não responde «qual o valor do
 * lote». Onde a pergunta não se faz àquela origem, a célula fica com um traço —
 * nunca com zero, que seria uma afirmação falsa.
 *
 * ## O desfazer aparece onde existe o que desfazer
 *
 * O botão só nasce na linha cuja importação tem linhas guardadas em
 * `analitico_removidos`. Ele desfaz a **remoção**, não a importação inteira: o
 * que ela inseriu se desfaz reimportando o arquivo, o que ela removeu não se
 * desfazia de jeito nenhum.
 *
 * **As importações anteriores a 14/09/2026 não têm botão**, e isso é verdade e
 * não defeito: até essa data nada guardava o que saía, e as 2.659 linhas
 * removidas entre agosto e setembro não estão em lugar nenhum. Um botão ali
 * seria um botão que falha — a tela diz o porquê em vez de oferecer.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  History, AlertTriangle, FileWarning, Undo2, Loader2, ChevronRight,
  ArrowDownRight, ArrowUpRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarDetalheDaImportacao,
  buscarHistoricoImportacoes,
  removeuDemais,
  resumoDoHistorico,
  ROTULO_ORIGEM,
  temDetalhe,
  totalDoDetalhe,
  type DetalheDeSetor,
  type EventoImportacao,
  type OrigemImportacao,
} from '@/services/importacoes/historico.service';
import {
  buscarRemocoesGuardadas,
  fraseDaRestauracao,
  restaurarRemocao,
  type RemocaoGuardada,
} from '@/services/importacoes/desfazer.service';

interface Props {
  empresaId: string;
  mes: string;
  versao?: number;
}

const quando = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Célula que a origem não responde. Traço, nunca zero. */
const Vazio = () => <span className="text-muted-foreground/40">—</span>;

export default function Mestre59Historico({ empresaId, mes, versao }: Props) {
  const [eventos, setEventos] = useState<EventoImportacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [origem, setOrigem] = useState<OrigemImportacao | 'all'>('all');
  const [doMes, setDoMes] = useState(true);
  const [guardadas, setGuardadas] = useState<RemocaoGuardada[]>([]);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  /** Detalhe por setor, carregado sob demanda e guardado por lote. */
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, DetalheDeSetor[]>>({});
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const [hist, snap] = await Promise.all([
        buscarHistoricoImportacoes(empresaId, {
          mes: doMes ? mes : null,
          origem: origem === 'all' ? null : origem,
          limite: 300,
        }),
        buscarRemocoesGuardadas(empresaId, doMes ? mes : null),
      ]);
      setEventos(hist); setGuardadas(snap);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar o histórico.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes, origem, doMes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  const resumo = useMemo(() => resumoDoHistorico(eventos), [eventos]);

  /*
   * O detalhe é buscado quando a linha é aberta, e fica guardado.
   *
   * Carregar os detalhes das 300 importações da lista de uma vez seria 300
   * consultas para mostrar, no máximo, uma. Guardar depois de abrir é o que
   * permite abrir e fechar sem repetir a ida ao banco.
   */
  const alternar = useCallback(async (e: EventoImportacao) => {
    if (!e.loteId) return;
    const chave = `${e.origem}-${e.id}`;
    if (aberto === chave) { setAberto(null); return; }
    setAberto(chave);
    if (detalhes[chave]) return;

    setCarregandoDetalhe(chave);
    try {
      const d = await buscarDetalheDaImportacao(empresaId, e.loteId);
      setDetalhes(prev => ({ ...prev, [chave]: d }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao abrir o detalhe.');
      setAberto(null);
    } finally {
      setCarregandoDetalhe(null);
    }
  }, [aberto, detalhes, empresaId]);

  /** Lote → o que ele apagou e ainda dá para trazer de volta. */
  const desfazivel = useMemo(() => {
    const m = new Map<string, RemocaoGuardada>();
    for (const g of guardadas) if (g.podeDesfazer) m.set(g.loteId, g);
    return m;
  }, [guardadas]);

  /*
   * Confirmação explícita antes de mexer em dinheiro. A operação é segura — ela
   * só insere o que estava guardado, não apaga nada —, mas trazer centenas de
   * linhas de volta muda números que outras pessoas estão olhando, e isso
   * merece um «tem certeza».
   */
  const desfazer = useCallback(async (g: RemocaoGuardada) => {
    const ok = window.confirm(
      `Trazer de volta ${g.linhas} linha${g.linhas !== 1 ? 's' : ''} `
      + `(${formatBRL(g.valor)}) que esta importação apagou?\n\n`
      + 'Nada é apagado: as linhas guardadas voltam para o analítico. '
      + 'As que outra importação já tiver trazido de volta são ignoradas.',
    );
    if (!ok) return;

    setDesfazendo(g.loteId);
    try {
      const r = await restaurarRemocao(g.loteId);
      toast.success(fraseDaRestauracao(r), { duration: 8000 });
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível desfazer.', {
        duration: 8000,
      });
    } finally {
      setDesfazendo(null);
    }
  }, [carregar]);

  if (carregando) return <Skeleton className="h-64 rounded-2xl" />;
  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {erro}
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5">
            <History className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {resumo.total} importaç{resumo.total === 1 ? 'ão' : 'ões'}
              {doMes ? ` em ${mes}` : ''} · {resumo.pessoas} pessoa
              {resumo.pessoas !== 1 ? 's' : ''}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {resumo.falhas > 0 && (
                <>
                  <strong className="text-destructive">{resumo.falhas} falharam</strong>
                  {' · '}
                </>
              )}
              {resumo.removidas > 0
                ? <><strong>{resumo.removidas} linha{resumo.removidas !== 1 ? 's' : ''}</strong> removida{resumo.removidas !== 1 ? 's' : ''} pelo 58 no período</>
                : 'Nenhuma linha removida no período'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={doMes ? 'mes' : 'tudo'} onValueChange={v => setDoMes(v === 'mes')}>
            <SelectTrigger className="h-9 w-36 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês de {mes}</SelectItem>
              <SelectItem value="tudo">Todo o histórico</SelectItem>
            </SelectContent>
          </Select>
          <Select value={origem} onValueChange={v => setOrigem(v as OrigemImportacao | 'all')}>
            <SelectTrigger className="h-9 w-40 rounded-xl text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Os dois relatórios</SelectItem>
              <SelectItem value="58">{ROTULO_ORIGEM['58'].curto}</SelectItem>
              <SelectItem value="59">{ROTULO_ORIGEM['59'].curto}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── O que dá e o que não dá para desfazer ───────────────────────── */}
      <div className="flex items-start gap-2 rounded-2xl border border-border/40 bg-muted/30 p-3">
        <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          {desfazivel.size > 0 ? (
            <>
              <strong className="text-foreground">
                {desfazivel.size} importaç{desfazivel.size === 1 ? 'ão tem' : 'ões têm'} o que
                desfazer.
              </strong>{' '}
              O botão traz de volta as linhas que aquela importação apagou. Ele desfaz a
              <strong> remoção</strong>, não a importação inteira — o que ela inseriu se desfaz
              reimportando o arquivo, o que ela removeu não se desfazia de jeito nenhum.
            </>
          ) : (
            <>
              <strong className="text-foreground">Nenhuma importação com o que desfazer aqui.</strong>{' '}
              O registro do que a importação apaga passou a existir em 14/09/2026. As 2.659 linhas
              removidas entre agosto e setembro não estão guardadas — nada as guardava —, e por
              isso as importações antigas não têm botão: ele só falharia.
            </>
          )}
        </p>
      </div>

      {/* ── A lista ─────────────────────────────────────────────────────── */}
      {eventos.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/95 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma importação nesse recorte.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card/95 shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-2.5" />
                <th className="px-3 py-2.5 text-left font-semibold">Quando</th>
                <th className="px-3 py-2.5 text-left font-semibold">Relatório</th>
                <th className="px-3 py-2.5 text-left font-semibold">Quem</th>
                <th className="px-3 py-2.5 text-left font-semibold">Setor</th>
                <th className="px-3 py-2.5 text-right font-semibold">Linhas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Novas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Removidas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                <th className="px-3 py-2.5 text-left font-semibold">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {eventos.map(e => {
                const grande = removeuDemais(e);
                const guardada = e.loteId ? desfazivel.get(e.loteId) : undefined;
                const chave = `${e.origem}-${e.id}`;
                const expandido = aberto === chave;
                const detalhe = detalhes[chave];
                const podeAbrir = temDetalhe(e);
                return (
                  <Fragment key={chave}>
                  <tr
                    className={cn(
                      'border-b border-border/25',
                      e.deuErrado && 'bg-destructive/5',
                      grande && 'bg-destructive/10',
                      podeAbrir && 'cursor-pointer hover:bg-muted/30',
                      expandido && 'bg-muted/40',
                    )}
                    onClick={podeAbrir ? () => void alternar(e) : undefined}
                  >
                    <td className="px-2 py-2 text-center">
                      {podeAbrir && (
                        carregandoDetalhe === chave
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          : <ChevronRight className={cn(
                              'h-3.5 w-3.5 text-muted-foreground transition-transform',
                              expandido && 'rotate-90',
                            )} />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-foreground">
                      {quando(e.quando)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        title={ROTULO_ORIGEM[e.origem].longo}
                        className={cn(
                          'inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium',
                          e.origem === '59'
                            ? 'border-primary/25 bg-primary/10 text-primary'
                            : 'border-border/50 bg-muted/40 text-muted-foreground',
                        )}
                      >
                        {ROTULO_ORIGEM[e.origem].curto}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">{e.quem}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {e.setorNome ?? (e.origem === '59' ? 'todos' : <Vazio />)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
                      {e.linhas.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {e.inseridos === null ? <Vazio /> : e.inseridos.toLocaleString('pt-BR')}
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right font-mono text-xs tabular-nums',
                      grande ? 'font-bold text-destructive' : 'text-muted-foreground',
                    )}>
                      {e.removidos === null ? <Vazio /> : (
                        <span className="inline-flex items-center gap-1">
                          {grande && <AlertTriangle className="h-3 w-3" />}
                          {e.removidos.toLocaleString('pt-BR')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground">
                      {e.valor === null ? <Vazio /> : formatBRL(e.valor)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        title={e.descricao}
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-medium',
                          e.deuErrado ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {e.deuErrado && <FileWarning className="h-3 w-3" />}
                        {e.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right" onClick={ev => ev.stopPropagation()}>
                      {/* Só onde existe o que trazer de volta. Botão que só sabe
                          falhar é pior que botão nenhum. */}
                      {guardada && (
                        <Button
                          variant="outline" size="sm"
                          className="h-7 rounded-lg text-[11px]"
                          disabled={desfazendo !== null}
                          onClick={() => void desfazer(guardada)}
                          title={
                            `Traz de volta ${guardada.linhas} linha(s), `
                            + `${formatBRL(guardada.valor)}, que esta importação apagou.`
                          }
                        >
                          {desfazendo === guardada.loteId
                            ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Voltando…</>
                            : <><Undo2 className="mr-1 h-3 w-3" /> Desfazer</>}
                        </Button>
                      )}
                    </td>
                  </tr>

                  {/* ── O detalhe: o que entrou e o que saiu, setor a setor ── */}
                  {expandido && detalhe && (
                    <tr className="border-b border-border/25 bg-muted/20">
                      <td colSpan={9} className="px-3 py-3">
                        {detalhe.length === 0 ? (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Sem detalhe por setor para esta importação. O registro do que sai
                            passou a existir em <strong>14/09/2026</strong>, e as linhas que esta
                            importação escreveu já foram substituídas por outra desde então —
                            então não há o que atribuir a ela hoje. As contagens da linha acima
                            vêm do log e continuam válidas.
                          </p>
                        ) : (
                          <>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  <th className="py-1 text-left font-semibold">Setor</th>
                                  <th className="py-1 text-right font-semibold">Entrou</th>
                                  <th className="py-1 text-right font-semibold">Saiu</th>
                                  <th className="py-1 text-right font-semibold">Diferença</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detalhe.map(d => (
                                  <tr key={d.setorId ?? d.setorNome} className="border-t border-border/20">
                                    <td className="py-1.5 text-foreground">{d.setorNome}</td>
                                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                                      {d.entrouLinhas > 0 ? (
                                        <span className="inline-flex items-center gap-1">
                                          <ArrowDownRight className="h-3 w-3 text-success" />
                                          {formatBRL(d.entrouValor)}
                                          <span className="text-[10px] opacity-60">({d.entrouLinhas})</span>
                                        </span>
                                      ) : '—'}
                                    </td>
                                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                                      {d.saiuLinhas > 0 ? (
                                        <span className="inline-flex items-center gap-1">
                                          <ArrowUpRight className="h-3 w-3 text-destructive" />
                                          {formatBRL(d.saiuValor)}
                                          <span className="text-[10px] opacity-60">({d.saiuLinhas})</span>
                                          {d.saiuRestaurado > 0 && (
                                            <span className="text-[10px] text-success">
                                              · {d.saiuRestaurado} de volta
                                            </span>
                                          )}
                                        </span>
                                      ) : '—'}
                                    </td>
                                    <td className={cn(
                                      'py-1.5 text-right font-mono font-semibold tabular-nums',
                                      d.delta > 0 ? 'text-success'
                                        : d.delta < 0 ? 'text-destructive' : 'text-muted-foreground',
                                    )}>
                                      {d.delta > 0 ? '+' : ''}{formatBRL(d.delta)}
                                    </td>
                                  </tr>
                                ))}
                                {detalhe.length > 1 && (() => {
                                  const t = totalDoDetalhe(detalhe);
                                  return (
                                    <tr className="border-t-2 border-border/40 font-semibold">
                                      <td className="py-1.5 text-foreground">Total</td>
                                      <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                                        {formatBRL(t.entrouValor)}
                                        <span className="ml-1 text-[10px] font-normal opacity-60">
                                          ({t.entrouLinhas})
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                                        {formatBRL(t.saiuValor)}
                                        <span className="ml-1 text-[10px] font-normal opacity-60">
                                          ({t.saiuLinhas})
                                        </span>
                                      </td>
                                      <td className={cn(
                                        'py-1.5 text-right font-mono tabular-nums',
                                        t.delta > 0 ? 'text-success'
                                          : t.delta < 0 ? 'text-destructive' : 'text-foreground',
                                      )}>
                                        {t.delta > 0 ? '+' : ''}{formatBRL(t.delta)}
                                      </td>
                                    </tr>
                                  );
                                })()}
                              </tbody>
                            </table>
                            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                              <strong>Entrou</strong> são as linhas que esta importação escreveu e
                              que ainda estão lá — se outra as substituiu depois, contam para a
                              outra. <strong>Saiu</strong> é o que ela apagou, guardado para poder
                              voltar; esse registro só existe desde 14/09/2026.
                            </p>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-snug text-muted-foreground">
        Linha em vermelho é importação do 58 que removeu <strong>10 linhas ou mais</strong>.
        Remoção é normal — o ERP cancela acordo e o relatório encolhe —, mas dezenas de linhas
        de uma vez costumam ser arquivo antigo importado por engano. O traço «—» quer dizer que
        aquela pergunta não se faz àquele relatório, e não que o valor é zero.
      </p>
    </div>
  );
}
