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
 * ## Ainda não dá para voltar
 *
 * O botão de rollback não está aqui, e a razão é dado e não tela: a importação
 * do 58 apaga as linhas ausentes e **nada guarda o que apagou**. Foram 2.659
 * linhas entre agosto e setembro. Enquanto não existir o snapshot, um botão de
 * voltar seria um botão que mente — e a tela diz isso, em vez de fingir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, AlertTriangle, FileWarning, Undo2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarHistoricoImportacoes,
  removeuDemais,
  resumoDoHistorico,
  ROTULO_ORIGEM,
  type EventoImportacao,
  type OrigemImportacao,
} from '@/services/importacoes/historico.service';

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

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      setEventos(await buscarHistoricoImportacoes(empresaId, {
        mes: doMes ? mes : null,
        origem: origem === 'all' ? null : origem,
        limite: 300,
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar o histórico.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes, origem, doMes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  const resumo = useMemo(() => resumoDoHistorico(eventos), [eventos]);

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

      {/* ── A verdade sobre o rollback ──────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-2xl border border-border/40 bg-muted/30 p-3">
        <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          <strong className="text-foreground">Ainda não dá para voltar uma importação.</strong>{' '}
          Não é limitação de tela: a importação do 58 apaga as linhas ausentes do arquivo e
          nada guarda o que apagou — foram {resumo.removidas > 0 ? '' : 'cerca de '}2.659 linhas
          entre agosto e setembro. Um botão de voltar hoje seria um botão que mente. O que falta
          é o registro do que sai, e é o próximo passo.
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
                <th className="px-3 py-2.5 text-left font-semibold">Quando</th>
                <th className="px-3 py-2.5 text-left font-semibold">Relatório</th>
                <th className="px-3 py-2.5 text-left font-semibold">Quem</th>
                <th className="px-3 py-2.5 text-left font-semibold">Setor</th>
                <th className="px-3 py-2.5 text-right font-semibold">Linhas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Novas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Removidas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                <th className="px-3 py-2.5 text-left font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map(e => {
                const grande = removeuDemais(e);
                return (
                  <tr key={`${e.origem}-${e.id}`}
                    className={cn(
                      'border-b border-border/25',
                      e.deuErrado && 'bg-destructive/5',
                      grande && 'bg-destructive/10',
                    )}
                  >
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
                  </tr>
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
