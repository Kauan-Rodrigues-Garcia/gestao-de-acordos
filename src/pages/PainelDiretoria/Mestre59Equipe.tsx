/**
 * Mestre59Equipe — os operadores de uma equipe, e os acordos de cada um.
 *
 * O terceiro e quarto níveis da descida: setor → equipe → **operador → NR**.
 *
 * ## O vínculo do operador é automático, e não grava nada
 *
 * `Cobradora` do relatório casa com `perfis.usuario` em minúsculo — a mesma
 * regra de `resolverOperadores`, que é quem faz esse casamento na importação do
 * 58. Aqui ele é só CALCULADO: o card diz quem casou e quem não casou, e nada é
 * escrito. Vincular sozinho enquanto o mestre está em conferência seria mudar o
 * cadastro de uma pessoa com base num número que ainda pode mudar.
 *
 * Quem não casou aparece em âmbar, com o login do relatório à vista — é o dado
 * que alguém precisa para achar a pessoa na aba Usuários.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight, UserCheck, UserX, Loader2, Receipt, ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarOperadoresDaEquipe, buscarLinhasDoOperador,
  type OperadorDaEquipe, type LinhaDoOperador,
} from '@/services/mestre/mestre.service';

interface Props {
  empresaId: string;
  mes: string;
  codGrupo: string;
  subgrupo: string;
  /** Equipe do sistema já vinculada, para comparar com o cadastro de cada um. */
  equipeVinculada: string | null;
}

const dataBR = (iso: string | null) =>
  iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';

export function Mestre59Equipe({ empresaId, mes, codGrupo, subgrupo, equipeVinculada }: Props) {
  const [operadores, setOperadores] = useState<OperadorDaEquipe[] | null>(null);
  const [aberto, setAberto]         = useState<string | null>(null);
  const [linhas, setLinhas]         = useState<Record<string, LinhaDoOperador[]>>({});
  const [carregandoNr, setCarregandoNr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setOperadores(null);
    void buscarOperadoresDaEquipe(empresaId, mes, codGrupo, subgrupo)
      .then(o => { if (!cancel) setOperadores(o); })
      .catch(() => { if (!cancel) setOperadores([]); });
    return () => { cancel = true; };
  }, [empresaId, mes, codGrupo, subgrupo]);

  const abrir = useCallback(async (cobradora: string) => {
    if (aberto === cobradora) { setAberto(null); return; }
    setAberto(cobradora);
    if (linhas[cobradora]) return;
    setCarregandoNr(cobradora);
    try {
      const l = await buscarLinhasDoOperador(empresaId, mes, codGrupo, cobradora, subgrupo);
      setLinhas(m => ({ ...m, [cobradora]: l }));
    } catch {
      setLinhas(m => ({ ...m, [cobradora]: [] }));
    } finally {
      setCarregandoNr(null);
    }
  }, [aberto, linhas, empresaId, mes, codGrupo, subgrupo]);

  if (operadores === null) return <Skeleton className="h-16 rounded-lg" />;
  if (operadores.length === 0) {
    return <p className="text-[11px] text-muted-foreground px-1 py-2">Nenhum operador com valor.</p>;
  }

  return (
    <div className="rounded-lg border border-border/40 bg-background/70 divide-y divide-border/25">
      {operadores.map(o => {
        const expandido = aberto === o.cobradora;
        const vinculado = o.perfil_id !== null;
        // O cadastro concorda com a equipe que o relatório diz? Só faz sentido
        // perguntar quando a equipe já foi vinculada a uma do sistema.
        const equipeDivergente = vinculado && equipeVinculada !== null
          && o.equipe_atual !== equipeVinculada;

        return (
          <div key={o.cobradora}>
            <button type="button" onClick={() => void abrir(o.cobradora)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left hover:bg-accent/25 transition-colors">
              <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform',
                expandido && 'rotate-90')} />
              {vinculado
                ? <UserCheck className="w-3.5 h-3.5 text-success shrink-0" />
                : <UserX className="w-3.5 h-3.5 text-warning shrink-0" />}

              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">
                  {o.perfil_nome ?? o.cobradora}
                </span>
                <span className="font-mono text-[10px] ml-1.5 px-1 rounded bg-muted text-muted-foreground">
                  {o.cobradora}
                </span>
                {!vinculado && (
                  <span className="text-warning ml-1.5">sem cadastro</span>
                )}
                {o.perfil_ativo === false && (
                  <span className="text-muted-foreground ml-1.5">· desligado</span>
                )}
                {equipeDivergente && (
                  <span className="text-warning ml-1.5">
                    · cadastro diz {o.equipe_atual ?? 'sem equipe'}
                  </span>
                )}
              </div>

              {o.extra_valor > 0 && (
                <Badge variant="outline" className="text-[10px] text-chart-4 border-chart-4/40 shrink-0">
                  Extra {formatBRL(o.extra_valor)}
                </Badge>
              )}
              {/* Fora do valor à direita, pela mesma regra do 58. Aparece aqui
                  porque some do total, e ninguém deve descobrir isso somando. */}
              {o.colchao_fora > 0 && (
                <Badge variant="outline"
                  className="text-[10px] text-muted-foreground border-border/60 shrink-0"
                  title="Colchão fora da janela de exceção. O 58 guarda essas linhas em tabela separada e não as soma em meta nenhuma.">
                  + {formatBRL(o.colchao_fora)} fora da meta
                </Badge>
              )}
              <span className="text-muted-foreground tabular-nums shrink-0 w-20 text-right">
                {o.nrs} NR{o.nrs !== 1 ? 's' : ''}
              </span>
              <span className="tabular-nums font-semibold text-foreground shrink-0 w-28 text-right">
                {formatBRL(o.recebido)}
              </span>
            </button>

            {expandido && (
              <div className="px-3 pb-3 pt-1">
                {carregandoNr === o.cobradora ? (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> carregando acordos…
                  </div>
                ) : (linhas[o.cobradora] ?? []).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-2">Sem linhas.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-md border border-border/40 bg-card/60">
                      <table className="w-full min-w-[720px] text-[11px]">
                        <thead>
                          <tr className="text-[9.5px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                            <th className="text-left font-semibold px-2.5 py-1.5">NR · parcela</th>
                            <th className="text-left font-semibold px-2.5 py-1.5">Cliente</th>
                            <th className="text-left font-semibold px-2.5 py-1.5">Forma</th>
                            <th className="text-right font-semibold px-2.5 py-1.5">Pago em</th>
                            <th className="text-right font-semibold px-2.5 py-1.5">Atraso</th>
                            <th className="text-right font-semibold px-2.5 py-1.5">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(linhas[o.cobradora] ?? []).map((l, i) => (
                            <tr key={`${l.nr_documento}-${l.parcela}-${l.linha_num}-${i}`}
                              className={cn('border-b border-border/20 last:border-0',
                                // A lista traz TUDO — é tela de conferência. O que
                                // não entra no total fica apagado, para a soma da
                                // tela não parecer erro do card.
                                !l.conta_na_meta && 'opacity-55')}>
                              <td className="px-2.5 py-1.5 whitespace-nowrap">
                                <span className="font-mono text-foreground">{l.nr_documento}</span>
                                <span className="text-muted-foreground">/{l.parcela}</span>
                                {l.colchao && (
                                  <Badge variant="outline" className={cn('ml-1.5 text-[9px]',
                                    l.conta_na_meta
                                      ? 'text-muted-foreground'
                                      : 'text-warning border-warning/40')}>
                                    {l.conta_na_meta ? 'colchão' : 'colchão · fora da meta'}
                                  </Badge>
                                )}
                                {l.tipo.toLowerCase() === 'extra' && (
                                  <Badge variant="outline" className="ml-1.5 text-[9px] text-chart-4 border-chart-4/40">
                                    Extra
                                  </Badge>
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 max-w-[230px] truncate text-muted-foreground"
                                title={l.cliente}>
                                {l.cliente}
                              </td>
                              <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">
                                {l.tp_doc}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                {dataBR(l.dt_pgto)}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                                {l.dias_atraso ?? '—'}
                              </td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                                {formatBRL(l.recebido)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* O card do operador agrega SEM teto; a lista tem. Dizer
                        isso evita alguém somar a tela e achar que falta dinheiro. */}
                    {(linhas[o.cobradora] ?? []).length >= 300 && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                        <Receipt className="w-3 h-3 shrink-0" />
                        Mostrando as 300 linhas mais recentes. O total do card ({formatBRL(o.recebido)})
                        soma todas as {o.linhas.toLocaleString('pt-BR')}.
                      </p>
                    )}
                    {!vinculado && (
                      <p className="text-[10px] text-warning mt-1.5 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span>
                          <span className="font-mono">{o.cobradora}</span> não existe no cadastro
                          desta empresa. O casamento é pelo login — corrigir é na aba Usuários.
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Mestre59Equipe;
