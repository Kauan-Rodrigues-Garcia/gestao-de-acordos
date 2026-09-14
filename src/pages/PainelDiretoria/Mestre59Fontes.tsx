/**
 * Mestre59Fontes — de onde cada setor tira o número que o sistema inteiro vê.
 *
 * ## O que o botão desta tela faz
 *
 * Até aqui o 59 vivia só no Painel Diretoria. Trocar a fonte de um setor grava
 * o 59 dentro de `analitico_recebimentos` — a tabela que **~30 módulos** já
 * leem. Dashboard, Painel Líder e suas sub-abas, Analítico, comissão, desafios:
 * nenhum muda de código, e todos passam a mostrar o número do 59.
 *
 * É a mudança mais consequente do sistema, e por isso esta tela mostra o «de»
 * e o «para» antes de qualquer clique. Trocar sem ver o número é apostar com o
 * dinheiro de 301 pessoas.
 *
 * ## Um setor por vez, de propósito
 *
 * Um botão «trocar tudo» seria mais rápido e não existe aqui. Setor por setor,
 * a liderança de cada um confere o próprio número no dia seguinte e o estrago
 * possível é um setor, não a empresa.
 *
 * ## Dá para voltar
 *
 * A troca guarda o retrato anterior (`analitico_removidos`, Fase 5) antes de
 * apagar. «Devolver ao 58» repõe aquilo — sem depender de reimportar nada, já
 * que o arquivo daquele dia pode não existir mais.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, ArrowRight, Undo2, Loader2, AlertTriangle, Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarFontesDosSetores,
  deltaDaLinha,
  devolverAo58,
  fraseDaTroca,
  podeTrocarPara59,
  podeVoltarPara58,
  trocarPara59,
  type LinhaDeFonte,
} from '@/services/mestre/fonteDoSetor.service';

interface Props {
  empresaId: string;
  mes: string;
  versao?: number;
  aoTrocar?: () => void;
}

export default function Mestre59Fontes({ empresaId, mes, versao, aoTrocar }: Props) {
  const [linhas, setLinhas] = useState<LinhaDeFonte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      setLinhas(await buscarFontesDosSetores(empresaId, mes));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler as fontes.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  const resumo = useMemo(() => ({
    no59: linhas.filter(l => l.fonte === 'relatorio_59').length,
    total: linhas.length,
    deltaTotal: linhas.filter(l => l.fonte === 'relatorio_58')
                      .reduce((t, l) => t + deltaDaLinha(l), 0),
  }), [linhas]);

  const trocar = useCallback(async (l: LinhaDeFonte) => {
    const d = deltaDaLinha(l);
    const ok = window.confirm(
      `Trocar a fonte de ${l.setorNome} para o relatório 59, em ${mes}?\n\n`
      + `Hoje: ${formatBRL(l.valorHoje)} em ${l.linhasHoje} linhas\n`
      + `Depois: ${formatBRL(l.valorProjetado)} em ${l.linhasProjetado} linhas\n`
      + `Diferença: ${d >= 0 ? '+' : ''}${formatBRL(d)}\n\n`
      + 'Isso muda o número deste setor no Dashboard, no Painel Líder, no Analítico '
      + 'e na comissão — para todo mundo. O retrato atual fica guardado e dá para '
      + 'voltar.',
    );
    if (!ok) return;

    setOcupado(l.setorId);
    try {
      const r = await trocarPara59(empresaId, mes, l.setorId);
      toast.success(fraseDaTroca(r), { duration: 12000 });
      await carregar();
      aoTrocar?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível trocar.', { duration: 10000 });
    } finally {
      setOcupado(null);
    }
  }, [empresaId, mes, carregar, aoTrocar]);

  const voltar = useCallback(async (l: LinhaDeFonte) => {
    const ok = window.confirm(
      `Devolver ${l.setorNome} para o relatório 58, em ${mes}?\n\n`
      + 'As linhas que o 59 gravou saem e o retrato guardado volta. '
      + 'Correção manual lançada depois da troca não é tocada.',
    );
    if (!ok) return;

    setOcupado(l.setorId);
    try {
      const r = await devolverAo58(empresaId, mes, l.setorId);
      toast.success(
        `${r.voltaram} linha${r.voltaram !== 1 ? 's' : ''} do 58 de volta, `
        + `${r.tiradasDo59} do 59 removida${r.tiradasDo59 !== 1 ? 's' : ''}. `
        + `${formatBRL(r.valorAntes)} → ${formatBRL(r.valorDepois)}.`,
        { duration: 12000 },
      );
      await carregar();
      aoTrocar?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível devolver.', { duration: 10000 });
    } finally {
      setOcupado(null);
    }
  }, [empresaId, mes, carregar, aoTrocar]);

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

      <div className="rounded-2xl border border-border/40 bg-card/95 p-4 shadow-sm">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">
              {resumo.no59} de {resumo.total} setor{resumo.total !== 1 ? 'es' : ''} lendo o
              relatório 59 em {mes}
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Trocar a fonte de um setor grava o 59 dentro do analítico — a tabela que o
              Dashboard, o Painel Líder, o Analítico, a comissão e os desafios já leem.
              Nenhuma dessas telas muda; todas passam a mostrar o número do 59.
              {resumo.deltaTotal !== 0 && (
                <>
                  {' '}Falta trocar <strong className="text-foreground">
                    {formatBRL(Math.abs(resumo.deltaTotal))}
                  </strong> {resumo.deltaTotal > 0 ? 'que o sistema ainda não mostra' : 'a menos'}.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/40 bg-card/95 shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-semibold">Setor</th>
              <th className="px-3 py-2.5 text-left font-semibold">Fonte hoje</th>
              <th className="px-3 py-2.5 text-right font-semibold">Valor hoje</th>
              <th className="px-3 py-2.5 text-right font-semibold">Com o 59</th>
              <th className="px-3 py-2.5 text-right font-semibold">Diferença</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              const d = deltaDaLinha(l);
              const noVerde = l.fonte === 'relatorio_59';
              const trabalhando = ocupado === l.setorId;
              return (
                <tr key={l.setorId} className="border-b border-border/25">
                  <td className="px-3 py-2.5">
                    <span className="block text-xs font-medium text-foreground">{l.setorNome}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {l.linhasHoje} → {l.linhasProjetado} linhas
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                      noVerde
                        ? 'border-success/25 bg-success/10 text-success'
                        : 'border-border/50 bg-muted/40 text-muted-foreground',
                    )}>
                      {noVerde && <Check className="h-2.5 w-2.5" />}
                      {noVerde ? 'Relatório 59' : 'Relatório 58'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatBRL(l.valorHoje)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {l.linhasProjetado > 0 ? formatBRL(l.valorProjetado) : '—'}
                  </td>
                  <td className={cn(
                    'px-3 py-2.5 text-right font-mono text-xs font-semibold tabular-nums',
                    noVerde ? 'text-muted-foreground'
                            : d > 0 ? 'text-success' : d < 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}>
                    {noVerde ? '—' : <>{d >= 0 ? '+' : ''}{formatBRL(d)}</>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {podeTrocarPara59(l) && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]"
                        disabled={ocupado !== null}
                        onClick={() => void trocar(l)}>
                        {trabalhando
                          ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Trocando…</>
                          : <>Usar o 59 <ArrowRight className="ml-1 h-3 w-3" /></>}
                      </Button>
                    )}
                    {podeVoltarPara58(l) && (
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg text-[11px]"
                        disabled={ocupado !== null}
                        onClick={() => void voltar(l)}>
                        {trabalhando
                          ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Voltando…</>
                          : <><Undo2 className="mr-1 h-3 w-3" /> Devolver ao 58</>}
                      </Button>
                    )}
                    {/* Sem lote do 59, ou com projeção vazia: o banco recusaria.
                        Botão que só sabe falhar é pior que botão nenhum — mas o
                        motivo precisa aparecer, senão a ausência vira mistério. */}
                    {!podeTrocarPara59(l) && !podeVoltarPara58(l) && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                        title={
                          !l.temLote59
                            ? 'Não há lote vigente do 59 neste mês.'
                            : l.linhasProjetado === 0
                              ? 'O 59 não projeta nenhuma linha para este setor — confira o vínculo da carteira.'
                              : 'Não há retrato guardado para devolver.'
                        }>
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {!l.temLote59 ? 'sem lote do 59'
                          : l.linhasProjetado === 0 ? 'sem vínculo de carteira'
                          : 'sem retrato guardado'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Um setor por vez, de propósito: assim a liderança de cada um confere o próprio número
        no dia seguinte, e o estrago possível é um setor e não a empresa. Depois da troca,
        importar o 58 daquele setor continua servindo para <strong>conferir</strong> — a tela
        de importação avisa que ali ela não grava mais.
      </p>
    </div>
  );
}
