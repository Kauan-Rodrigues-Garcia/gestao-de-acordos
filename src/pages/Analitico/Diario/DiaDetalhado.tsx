/**
 * DiaDetalhado — sub-aba do Recebimento diário (as DUAS empresas).
 *
 * Tabela operador × dia do mês. A conta toda vive em
 * `services/diario/diaDetalhado.ts` (pura e testada); aqui é só apresentação.
 *
 * NAVEGAÇÃO, em dois níveis, para não haver barra de rolagem horizontal:
 *  • no cabeçalho, ‹ › trocam o MÊS exibido;
 *  • sobre a tabela, ‹ › avançam e voltam os DIAS, uma página por vez, como
 *    quem passa de uma foto para outra. As setas ficam sobre um degradê que
 *    escurece a borda e vai sumindo para dentro da tabela, deixando claro que
 *    há mais conteúdo daquele lado.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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
  /** Filtro de equipe da tela; null = todas as do escopo. */
  equipeId?: string | null;
}

/** Dias visíveis por página. 10 cabe confortavelmente em tela de notebook. */
const DIAS_POR_PAGINA = 10;

/** '2026-08-05' → '05'. O cabeçalho já diz o mês. */
function rotuloDoDia(dia: string): string {
  return dia.slice(8, 10);
}

/** Sábado e domingo em tom mais fraco — dia útil é o que se cobra. */
function ehFimDeSemana(dia: string): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  return [0, 6].includes(new Date(a, m - 1, d).getDay());
}

/** '2026-08' → 'agosto de 2026'. */
function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** '2026-08' + n meses. */
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function DiaDetalhado({
  empresaId, mes, hojeISO, escopo, vinculos, equipeId = null,
}: DiaDetalhadoProps) {
  // Mês próprio da aba, semeado pelo dia selecionado lá em cima. Ter estado
  // próprio é o que permite navegar meses aqui sem mexer no seletor de dia da
  // tela toda — trocar aquele recarregaria o dia e as outras sub-abas junto.
  const [mesVisto, setMesVisto] = useState<string | null>(mes);
  useEffect(() => { setMesVisto(mes); }, [mes]);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [bruto, setBruto] = useState<Awaited<ReturnType<typeof buscarResumoMensalDiario>> | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (!empresaId || !mesVisto) { setBruto(null); setCarregando(false); return; }
    setCarregando(true);
    setErro(null);
    void buscarResumoMensalDiario(empresaId, mesVisto).then(r => {
      if (cancelado) return;
      if (r.error) setErro(r.error);
      setBruto(r);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [empresaId, mesVisto]);

  const matriz = useMemo(() => {
    if (!bruto || !mesVisto) return null;
    return montarDiaDetalhado({
      linhasDia: bruto.linhasDia,
      resumos:   bruto.resumos,
      mes: mesVisto, hojeISO, escopo, vinculos, equipeId,
    });
  }, [bruto, mesVisto, hojeISO, escopo, vinculos, equipeId]);

  const totalDias = matriz?.dias.length ?? 0;
  const [inicio, setInicio] = useState(0);

  // Ao trocar de mês (ou de filtro) abre na ÚLTIMA página: o que interessa
  // primeiro é o fim do período, não o dia 1º.
  useEffect(() => {
    setInicio(Math.max(0, totalDias - DIAS_POR_PAGINA));
  }, [totalDias, mesVisto, equipeId]);

  const podeVoltar  = inicio > 0;
  const podeAvancar = inicio + DIAS_POR_PAGINA < totalDias;
  const irPara = (n: number) =>
    setInicio(i => Math.min(Math.max(0, i + n), Math.max(0, totalDias - DIAS_POR_PAGINA)));

  const mesAtualLabel = mesVisto ? rotuloDoMes(mesVisto) : '';
  const mesDeHoje = hojeISO.slice(0, 7);

  const cabecalhoMes = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setMesVisto(m => (m ? somarMeses(m, -1) : m))}
        className="h-7 w-7 rounded-md border border-border bg-background hover:bg-accent flex items-center justify-center transition-colors"
        title="Mês anterior"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs font-semibold capitalize min-w-[130px] text-center tabular-nums">
        {mesAtualLabel}
      </span>
      <button
        type="button"
        onClick={() => setMesVisto(m => (m ? somarMeses(m, 1) : m))}
        // Não deixa passar do mês corrente: mês futuro não tem coluna nenhuma
        // e a tabela ficaria vazia sem explicar por quê.
        disabled={!mesVisto || mesVisto >= mesDeHoje}
        className="h-7 w-7 rounded-md border border-border bg-background hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Próximo mês"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (carregando || !vinculos || !escopo) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{cabecalhoMes}</div>
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando o mês...
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{cabecalhoMes}</div>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar o mês: {erro}
        </div>
      </div>
    );
  }

  const m = matriz;
  const vazio = !m || m.dias.length === 0 || m.linhas.length === 0;

  if (vazio) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{cabecalhoMes}</div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
          {m && m.dias.length === 0
            ? 'Nenhum dia para exibir neste mês ainda.'
            : 'Nenhum recebimento vinculado a operador neste mês.'}
          {m && m.totalForaDaMatriz > 0 && (
            <span className="block mt-1 text-xs">
              Há {formatBRL(m.totalForaDaMatriz)} sem operador vinculado — veja a aba “Sem operador”.
            </span>
          )}
        </div>
      </div>
    );
  }

  const diasVisiveis = m.dias.slice(inicio, inicio + DIAS_POR_PAGINA);
  const primeiro = inicio + 1;
  const ultimo   = Math.min(inicio + DIAS_POR_PAGINA, totalDias);

  /** Seta flutuante sobre o degradê. */
  function Seta({ lado, onClick, ativo }: {
    lado: 'esq' | 'dir'; onClick: () => void; ativo: boolean;
  }) {
    if (!ativo) return null;
    const esq = lado === 'esq';
    return (
      <div
        className={cn(
          'absolute top-0 bottom-0 z-30 flex items-center pointer-events-none',
          // O degradê escurece a borda e vai sumindo para dentro da tabela —
          // é o que sinaliza "tem mais coisa deste lado".
          esq
            ? 'left-0 pl-1 pr-8 bg-gradient-to-r from-black/80 via-black/45 to-transparent'
            : 'right-0 pr-1 pl-8 bg-gradient-to-l from-black/80 via-black/45 to-transparent',
        )}
      >
        <button
          type="button"
          onClick={onClick}
          title={esq ? 'Dias anteriores' : 'Próximos dias'}
          className="pointer-events-auto h-9 w-9 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center shadow-lg backdrop-blur-sm transition-colors"
        >
          {esq ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          {m.linhas.length} {m.linhas.length === 1 ? 'operador' : 'operadores'} · dias{' '}
          <strong className="text-foreground tabular-nums">{primeiro}–{ultimo}</strong> de {totalDias}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold tabular-nums">
            Total do mês: <span className="text-primary">{formatBRL(m.totalGeral)}</span>
          </p>
          {cabecalhoMes}
        </div>
      </div>

      {/* `relative` ancora as setas; `overflow-hidden` corta o degradê no
          arredondado. Sem barra de rolagem: a página de dias troca no clique. */}
      <div className="relative rounded-lg border-2 border-border overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted">
              <th className="px-3 py-2 text-left font-semibold border-r-2 border-border w-[190px]">
                Operador
              </th>
              {diasVisiveis.map(d => (
                <th
                  key={d}
                  className={cn(
                    'px-1 py-2 text-right font-semibold tabular-nums border-r border-border/60',
                    ehFimDeSemana(d) && 'text-muted-foreground/60',
                    d === hojeISO && 'text-primary bg-primary/10',
                  )}
                  title={d.split('-').reverse().join('/')}
                >
                  {rotuloDoDia(d)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold border-l-2 border-border w-[110px]">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {m.linhas.map((l, idx) => (
              <tr
                key={l.operadorId}
                // Borda em cada linha + zebra: é o que dá cara de tabela e
                // impede o olho de pular de linha ao seguir para a direita.
                className={cn(
                  'border-t-2 border-border/70 hover:bg-primary/5 transition-colors',
                  idx % 2 === 1 && 'bg-muted/40',
                )}
              >
                <td
                  className="px-3 py-2 font-medium border-r-2 border-border truncate max-w-[190px]"
                  title={l.nome}
                >
                  {l.nome}
                </td>
                {l.valores.slice(inicio, inicio + DIAS_POR_PAGINA).map((v, i) => (
                  <td
                    key={diasVisiveis[i]}
                    className={cn(
                      'px-1 py-2 text-right tabular-nums font-mono border-r border-border/40',
                      // Zero apagado: o olho procura onde ENTROU dinheiro.
                      v === 0 ? 'text-muted-foreground/30' : 'text-foreground',
                    )}
                  >
                    {v === 0 ? '—' : formatBRL(v)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-mono font-semibold border-l-2 border-border">
                  {formatBRL(l.total)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-primary/40 bg-primary/10 font-semibold">
              <td className="px-3 py-2 border-r-2 border-border">Total do dia</td>
              {m.totaisPorDia.slice(inicio, inicio + DIAS_POR_PAGINA).map((t, i) => (
                <td
                  key={diasVisiveis[i]}
                  className={cn(
                    'px-1 py-2 text-right tabular-nums font-mono border-r border-border/40',
                    t === 0 && 'text-muted-foreground/40',
                  )}
                >
                  {t === 0 ? '—' : formatBRL(t)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-mono border-l-2 border-border">
                {formatBRL(m.totalGeral)}
              </td>
            </tr>
          </tfoot>
        </table>

        <Seta lado="esq" ativo={podeVoltar}  onClick={() => irPara(-DIAS_POR_PAGINA)} />
        <Seta lado="dir" ativo={podeAvancar} onClick={() => irPara(DIAS_POR_PAGINA)} />
      </div>

      {/* Sem esta nota o total da aba parece divergir do total do mês. */}
      {m.totalForaDaMatriz > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Fora da tabela: <strong>{formatBRL(m.totalForaDaMatriz)}</strong> sem operador
          vinculado (órfãos, “sem vínculo” e fora do vínculo). Conta no total da empresa,
          mas não pertence a nenhuma pessoa.
        </p>
      )}
    </div>
  );
}
