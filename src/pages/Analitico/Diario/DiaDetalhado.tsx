/**
 * DiaDetalhado — sub-aba do Recebimento diário (as DUAS empresas).
 *
 * Tabela operador × dia do mês: quem recebeu quanto, em cada dia. A conta toda
 * vive em `services/diario/diaDetalhado.ts` (pura e testada); aqui é só a
 * apresentação.
 *
 * A tabela rola na horizontal — um mês fechado tem 31 colunas de dia e não cabe
 * em tela nenhuma. A coluna do operador fica GRUDADA na esquerda (`sticky`):
 * rolar até o dia 28 sem saber de quem é a linha não serviria para nada.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { buscarResumoMensalDiario } from '@/services/diario/diario.service';
import { montarDiaDetalhado } from '@/services/diario/diaDetalhado';
import type { EscopoDiario, VinculosDiario } from '@/services/diario/escopoDiario';

interface DiaDetalhadoProps {
  empresaId: string;
  /** 'yyyy-MM' — mês do dia que a aba está exibindo. */
  mes:      string | null;
  hojeISO:  string;
  escopo:   EscopoDiario | null;
  vinculos: VinculosDiario | null;
}

/** '2026-08-05' → '05'. O cabeçalho já diz o mês. */
function rotuloDoDia(dia: string): string {
  return dia.slice(8, 10);
}

/** Sábado e domingo ganham um tom mais fraco — dia útil é o que se cobra. */
function ehFimDeSemana(dia: string): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  const semana = new Date(a, m - 1, d).getDay();
  return semana === 0 || semana === 6;
}

export function DiaDetalhado({
  empresaId, mes, hojeISO, escopo, vinculos,
}: DiaDetalhadoProps) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [bruto, setBruto] = useState<Awaited<ReturnType<typeof buscarResumoMensalDiario>> | null>(null);

  // Uma leitura por mês. A matriz é remontada sem reler quando o escopo chega
  // depois (a composição das equipes carrega em paralelo).
  useEffect(() => {
    let cancelado = false;
    if (!empresaId || !mes) { setBruto(null); setCarregando(false); return; }
    setCarregando(true);
    setErro(null);
    void buscarResumoMensalDiario(empresaId, mes).then(r => {
      if (cancelado) return;
      if (r.error) setErro(r.error);
      setBruto(r);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [empresaId, mes]);

  const matriz = useMemo(() => {
    if (!bruto || !mes) return null;
    return montarDiaDetalhado({
      linhasDia: bruto.linhasDia,
      resumos:   bruto.resumos,
      mes, hojeISO, escopo, vinculos,
    });
  }, [bruto, mes, hojeISO, escopo, vinculos]);

  // Enquanto o escopo não resolve a aba segue "carregando": a matriz vem vazia
  // de propósito nesse intervalo, e uma tabela vazia pareceria "mês sem dados".
  const esperando = carregando || !vinculos || !escopo;

  if (esperando) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando o mês...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Não foi possível carregar o mês: {erro}
      </div>
    );
  }

  const m = matriz;
  if (!m || m.dias.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhum dia para exibir neste mês ainda.
      </div>
    );
  }

  if (m.linhas.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhum recebimento vinculado a operador neste mês.
        {m.totalForaDaMatriz > 0 && (
          <span className="block mt-1 text-xs">
            Há {formatBRL(m.totalForaDaMatriz)} sem operador vinculado — veja a aba “Sem operador”.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          {m.linhas.length} {m.linhas.length === 1 ? 'operador' : 'operadores'} ·{' '}
          {m.dias.length} {m.dias.length === 1 ? 'dia' : 'dias'} · role para o lado para ver o mês todo
        </p>
        <p className="text-xs font-semibold tabular-nums">
          Total do mês: <span className="text-primary">{formatBRL(m.totalGeral)}</span>
        </p>
      </div>

      {/* `overflow-x-auto` no container, não na página: só a tabela rola. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-max min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              {/* sticky: a identidade da linha acompanha a rolagem */}
              <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur px-3 py-2 text-left font-semibold border-r border-border min-w-[180px]">
                Operador
              </th>
              {m.dias.map(d => (
                <th
                  key={d}
                  className={cn(
                    'px-2 py-2 text-right font-semibold tabular-nums min-w-[76px]',
                    ehFimDeSemana(d) && 'text-muted-foreground/60',
                    d === hojeISO && 'text-primary',
                  )}
                  title={d.split('-').reverse().join('/')}
                >
                  {rotuloDoDia(d)}
                </th>
              ))}
              <th className="sticky right-0 z-20 bg-muted/95 backdrop-blur px-3 py-2 text-right font-semibold border-l border-border min-w-[110px]">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {m.linhas.map((l, idx) => (
              <tr
                key={l.operadorId}
                className={cn('border-t border-border', idx % 2 === 1 && 'bg-muted/20')}
              >
                <td className={cn(
                  'sticky left-0 z-10 px-3 py-1.5 font-medium border-r border-border truncate max-w-[220px] backdrop-blur',
                  idx % 2 === 1 ? 'bg-card/95' : 'bg-background/95',
                )}
                  title={l.nome}
                >
                  {l.nome}
                </td>
                {l.valores.map((v, i) => (
                  <td
                    key={m.dias[i]}
                    className={cn(
                      'px-2 py-1.5 text-right tabular-nums font-mono',
                      // Zero fica apagado: o olho procura onde ENTROU dinheiro.
                      v === 0 ? 'text-muted-foreground/35' : 'text-foreground',
                      ehFimDeSemana(m.dias[i]) && v === 0 && 'text-muted-foreground/20',
                    )}
                  >
                    {v === 0 ? '—' : formatBRL(v)}
                  </td>
                ))}
                <td className={cn(
                  'sticky right-0 z-10 px-3 py-1.5 text-right tabular-nums font-mono font-semibold border-l border-border backdrop-blur',
                  idx % 2 === 1 ? 'bg-card/95' : 'bg-background/95',
                )}>
                  {formatBRL(l.total)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-primary/30 bg-primary/5 font-semibold">
              <td className="sticky left-0 z-20 bg-primary/10 backdrop-blur px-3 py-2 border-r border-border">
                Total do dia
              </td>
              {m.totaisPorDia.map((t, i) => (
                <td key={m.dias[i]} className={cn(
                  'px-2 py-2 text-right tabular-nums font-mono',
                  t === 0 && 'text-muted-foreground/40',
                )}>
                  {t === 0 ? '—' : formatBRL(t)}
                </td>
              ))}
              <td className="sticky right-0 z-20 bg-primary/10 backdrop-blur px-3 py-2 text-right tabular-nums font-mono border-l border-border">
                {formatBRL(m.totalGeral)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sem esta nota o total da aba parece divergir do total do mês. */}
      {m.totalForaDaMatriz > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Fora da tabela: <strong>{formatBRL(m.totalForaDaMatriz)}</strong> sem operador
          vinculado (órfãos, “sem vínculo” e fora do vínculo). Esse valor conta no total da
          empresa, mas não pertence a nenhuma pessoa.
        </p>
      )}
    </div>
  );
}
