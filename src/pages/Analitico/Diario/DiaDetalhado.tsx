/**
 * DiaDetalhado — sub-aba do Recebimento diário (as DUAS empresas).
 *
 * Tabela operador × dia do mês. A conta toda vive em
 * `services/diario/diaDetalhado.ts` (pura e testada); aqui é só apresentação.
 *
 * ## Por que ela virou um mapa de calor
 *
 * A versão anterior era uma grade de números iguais: trinta colunas de valores
 * monoespaçados, todos com o mesmo peso visual. Para responder «que dia rendeu»
 * ou «quem carregou o mês» era preciso LER cada célula e comparar de cabeça —
 * numa tabela de 20 operadores × 10 dias, 200 leituras. O olho não faz isso; ele
 * desiste e vai direto na coluna Total.
 *
 * Agora o valor pinta a própria célula, proporcional à maior do mês. O padrão
 * aparece antes da leitura: a segunda-feira forte, o operador que sumiu na
 * segunda quinzena, o dia em que ninguém tabulou. O número continua lá, exato,
 * para quem precisa dele — a cor só diz onde olhar primeiro.
 *
 * ## O que a cor NÃO diz
 *
 * A escala é relativa ao maior valor visível, nunca a uma meta. Célula escura
 * significa "muito para este mês", não "bom" — dois meses diferentes não se
 * comparam pela cor, e por isso a legenda mostra o valor do topo da escala.
 *
 * NAVEGAÇÃO, em dois níveis, para não haver barra de rolagem horizontal:
 *  • no cabeçalho, ‹ › trocam o MÊS exibido;
 *  • sobre a tabela, ‹ › avançam e voltam os DIAS, uma página por vez.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Flame } from 'lucide-react';
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

/** 'seg', 'ter'… — duas letras bastam e a coluna é estreita. */
function siglaDoDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(a, m - 1, d).getDay()];
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

/** 'Ana Paula Souza' → 'AS'. Duas letras é o que cabe no círculo. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima   = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * Valor abreviado: 12.480,50 → '12,4k'.
 *
 * A célula do mapa tem ~54px. `formatBRL` inteiro ("R$ 12.480,50") não cabe e
 * era truncado pelo `overflow`, o que é pior que abreviar: o número aparecia
 * cortado e parecia outro. O valor exato continua no `title` da célula.
 */
function valorCurto(v: number): string {
  if (v === 0) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1).replace('.', ',')}k`;
  return String(Math.round(v));
}

/**
 * Quanto a célula "pesa" na escala de cor, de 0 a 1.
 *
 * Raiz quadrada em vez de proporção direta: o recebimento é muito desigual —
 * um dia de fechamento faz 10× a média —, e no linear todo o resto do mês
 * viraria a mesma lavagem quase branca. A raiz levanta o meio da escala e é
 * onde está quase toda a informação.
 */
function pesoDaCor(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.sqrt(Math.min(valor / maximo, 1));
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

  // Lado para onde a pessoa navegou — define de que direção as colunas entram.
  const [direcao, setDirecao] = useState<'esq' | 'dir'>('dir');

  const podeVoltar  = inicio > 0;
  const podeAvancar = inicio + DIAS_POR_PAGINA < totalDias;
  const irPara = (n: number) => {
    setDirecao(n > 0 ? 'dir' : 'esq');
    setInicio(i => Math.min(Math.max(0, i + n), Math.max(0, totalDias - DIAS_POR_PAGINA)));
  };

  /** Deslize da coluna `i` na troca de página. */
  const animacaoDaColuna = (i: number) => ({
    className: direcao === 'dir' ? 'dia-slide-dir' : 'dia-slide-esq',
    // A varredura acompanha o sentido da navegação: indo para a frente começa
    // pela esquerda; voltando, pela direita.
    style: {
      animationDelay: `${(direcao === 'dir' ? i : DIAS_POR_PAGINA - 1 - i) * 22}ms`,
    } as React.CSSProperties,
  });

  const mesAtualLabel = mesVisto ? rotuloDoMes(mesVisto) : '';
  const mesDeHoje = hojeISO.slice(0, 7);

  const cabecalhoMes = (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-sm">
      <button
        type="button"
        onClick={() => setMesVisto(m => (m ? somarMeses(m, -1) : m))}
        className="h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
        title="Mês anterior"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="px-2 text-xs font-semibold capitalize min-w-[132px] text-center tabular-nums">
        {mesAtualLabel}
      </span>
      <button
        type="button"
        onClick={() => setMesVisto(m => (m ? somarMeses(m, 1) : m))}
        // Não deixa passar do mês corrente: mês futuro não tem coluna nenhuma
        // e a tabela ficaria vazia sem explicar por quê.
        disabled={!mesVisto || mesVisto >= mesDeHoje}
        className="h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-14 text-center text-sm text-muted-foreground">
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

  // Topo da escala de cor: a maior célula da PÁGINA, não do mês. A página é o
  // que a pessoa está comparando; usar o máximo do mês apagaria uma semana
  // inteira só porque houve um pico em outra.
  const maxCelula = m.linhas.reduce((topo, l) => {
    for (let i = inicio; i < inicio + DIAS_POR_PAGINA; i++) {
      const v = l.valores[i] ?? 0;
      if (v > topo) topo = v;
    }
    return topo;
  }, 0);

  // Maior mês individual — a barrinha da coluna Total é proporcional a ele.
  const maxLinha = m.linhas.reduce((t, l) => Math.max(t, l.total), 0);
  const maxDia   = m.totaisPorDia.reduce((t, v) => Math.max(t, v), 0);

  /** Fundo da célula proporcional ao valor. Zero não pinta nada. */
  function fundoDaCelula(v: number): React.CSSProperties | undefined {
    const p = pesoDaCor(v, maxCelula);
    if (p <= 0) return undefined;
    return {
      // `color-mix` deixa a escala seguir o tema: no claro escurece do branco
      // para o primário, no escuro clareia a partir do fundo do card.
      backgroundColor: `color-mix(in oklab, var(--primary) ${(p * 68).toFixed(1)}%, transparent)`,
    };
  }

  /**
   * Seta flutuante sobre o degradê.
   *
   * Fica INVISÍVEL até o mouse chegar perto (o `group` é o container da
   * tabela): dado é o que importa na tela, e um botão fixo por cima da
   * primeira e da última coluna atrapalharia a leitura o tempo todo.
   */
  function Seta({ lado, onClick, ativo }: {
    lado: 'esq' | 'dir'; onClick: () => void; ativo: boolean;
  }) {
    if (!ativo) return null;
    const esq = lado === 'esq';
    return (
      <div
        className={cn(
          'absolute top-0 bottom-0 z-30 flex items-center pointer-events-none',
          'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300',
          esq
            ? 'left-0 pl-1 pr-10 bg-gradient-to-r from-background/85 via-background/40 to-transparent'
            : 'right-0 pr-1 pl-10 bg-gradient-to-l from-background/85 via-background/40 to-transparent',
        )}
      >
        <button
          type="button"
          onClick={onClick}
          title={esq ? 'Dias anteriores' : 'Próximos dias'}
          className={cn(
            'pointer-events-auto h-9 w-9 rounded-full flex items-center justify-center',
            'bg-card border border-border text-foreground shadow-lg',
            'transition-all duration-200 hover:scale-110 hover:bg-accent active:scale-95',
          )}
        >
          {esq ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Barra de contexto ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          <span>
            {m.linhas.length} {m.linhas.length === 1 ? 'operador' : 'operadores'}
          </span>
          <span className="text-border">·</span>
          <span>
            dias <strong className="text-foreground tabular-nums">{primeiro}–{ultimo}</strong> de {totalDias}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 leading-tight">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total do mês</p>
            <p className="text-sm font-bold tabular-nums text-primary">{formatBRL(m.totalGeral)}</p>
          </div>
          {cabecalhoMes}
        </div>
      </div>

      {/* `relative` ancora as setas; `overflow-hidden` corta o degradê no
          arredondado. Sem barra de rolagem: a página de dias troca no clique. */}
      <div className="group relative rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-20 bg-muted/60 backdrop-blur px-3 py-2 text-left font-semibold border-b border-r border-border w-[210px]">
                Operador
              </th>
              {diasVisiveis.map((d, i) => {
                const hoje = d === hojeISO;
                return (
                  <th
                    // A `key` inclui `inicio`: a célula é recriada a cada página,
                    // e é isso que faz a animação CSS tocar de novo.
                    key={`${inicio}-${d}`}
                    className={cn(
                      'px-1 py-1.5 text-center font-semibold tabular-nums border-b border-border',
                      ehFimDeSemana(d) && 'bg-muted/50',
                      hoje && 'bg-primary/15',
                    )}
                    title={d.split('-').reverse().join('/')}
                  >
                    <span className="block leading-tight" {...animacaoDaColuna(i)}>
                      <span className={cn(
                        'block text-[9px] font-medium uppercase',
                        hoje ? 'text-primary' : 'text-muted-foreground/70',
                      )}>
                        {siglaDoDia(d)}
                      </span>
                      <span className={cn('block text-[13px]', hoje && 'text-primary')}>
                        {rotuloDoDia(d)}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-semibold border-b border-l border-border w-[128px]">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {m.linhas.map((l, idx) => (
              <tr key={l.operadorId} className="group/linha">
                <td
                  className={cn(
                    'sticky left-0 z-10 px-2.5 py-1.5 border-b border-r border-border/70',
                    'bg-card group-hover/linha:bg-accent/40 transition-colors',
                  )}
                  title={l.nome}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
                      {idx + 1}
                    </span>
                    <span className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      'text-[9px] font-bold',
                      idx === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {iniciais(l.nome)}
                    </span>
                    <span className="truncate font-medium">{l.nome}</span>
                  </div>
                </td>

                {l.valores.slice(inicio, inicio + DIAS_POR_PAGINA).map((v, i) => {
                  const dia = diasVisiveis[i];
                  return (
                    <td
                      key={`${inicio}-${dia}`}
                      style={fundoDaCelula(v)}
                      className={cn(
                        'px-0.5 py-1.5 text-center tabular-nums border-b border-border/40',
                        'transition-colors',
                        v === 0 && ehFimDeSemana(dia) && 'bg-muted/40',
                        v === 0 ? 'text-muted-foreground/25' : 'font-medium',
                        dia === hojeISO && v === 0 && 'bg-primary/5',
                      )}
                      // O exato fica aqui: a célula mostra o abreviado para caber.
                      title={`${l.nome} · ${dia.split('-').reverse().join('/')} · ${formatBRL(v)}`}
                    >
                      <span className="block" {...animacaoDaColuna(i)}>
                        {valorCurto(v)}
                      </span>
                    </td>
                  );
                })}

                <td className="px-3 py-1.5 border-b border-l border-border/70 bg-card group-hover/linha:bg-accent/40 transition-colors">
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular-nums font-semibold leading-none">
                      {formatBRL(l.total)}
                    </span>
                    {/* Barrinha: onde este mês está em relação ao maior da tela.
                        Responde "quem carregou" sem obrigar a comparar números. */}
                    <span className="block h-1 w-full max-w-[92px] rounded-full bg-muted overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${maxLinha > 0 ? (l.total / maxLinha) * 100 : 0}%` }}
                      />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="bg-muted/70 font-semibold">
              <td className="sticky left-0 z-10 bg-muted/70 backdrop-blur px-3 py-2 border-t-2 border-r border-primary/30">
                Total do dia
              </td>
              {m.totaisPorDia.slice(inicio, inicio + DIAS_POR_PAGINA).map((t, i) => {
                const dia = diasVisiveis[i];
                const topo = maxDia > 0 && t === maxDia && t > 0;
                return (
                  <td
                    key={`${inicio}-${dia}`}
                    className={cn(
                      'px-0.5 py-2 text-center tabular-nums border-t-2 border-primary/30',
                      t === 0 && 'text-muted-foreground/35',
                      topo && 'text-primary',
                    )}
                    title={`${dia.split('-').reverse().join('/')} · ${formatBRL(t)}`}
                  >
                    <span className="block" {...animacaoDaColuna(i)}>
                      {topo && <Flame className="inline w-2.5 h-2.5 mr-0.5 -mt-0.5" />}
                      {valorCurto(t)}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums border-t-2 border-l border-primary/30 text-primary">
                {formatBRL(m.totalGeral)}
              </td>
            </tr>
          </tfoot>
        </table>

        <Seta lado="esq" ativo={podeVoltar}  onClick={() => irPara(-DIAS_POR_PAGINA)} />
        <Seta lado="dir" ativo={podeAvancar} onClick={() => irPara(DIAS_POR_PAGINA)} />
      </div>

      {/* ── Legenda e nota ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[11px] text-muted-foreground">
          Valores abreviados (<span className="tabular-nums">12,4k</span> = R$ 12.400).
          O valor exato aparece ao passar o mouse.
        </p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>menos</span>
          <span className="flex overflow-hidden rounded-sm border border-border">
            {[0.12, 0.3, 0.5, 0.72, 1].map(p => (
              <span
                key={p}
                className="block h-3 w-6"
                style={{ backgroundColor: `color-mix(in oklab, var(--primary) ${(pesoDaCor(p, 1) * 68).toFixed(1)}%, transparent)` }}
              />
            ))}
          </span>
          <span>mais</span>
          <span className="tabular-nums">(topo: {formatBRL(maxCelula)})</span>
        </div>
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
