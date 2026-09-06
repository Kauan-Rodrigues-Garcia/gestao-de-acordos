/**
 * DiaDetalhado — o mapa de calor operador × dia do mês.
 *
 * Tabela operador × dia. Vive dentro da aba "Por operador" do Analítico, como o
 * outro formato da MESMA lista: Lista × Mapa do mês.
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
 * ## De onde vêm os números
 *
 * Das linhas do ANALÍTICO (`fn_analitico_dashboard_mes`), as mesmas que
 * alimentam a aba Formas de pagamento e o card «Total recebido» do topo. Antes
 * vinham do resumo mensal do DIÁRIO: duas somas do mesmo dinheiro, na mesma
 * tela, livres para discordar sem avisar. A regra da tela é curta — o analítico
 * responde pelo mês, o diário responde pelo dia —, e o mapa é mensal.
 *
 * As linhas chegam JÁ dentro do escopo de quem chama; este componente não
 * decide quem enxerga o quê.
 *
 * NAVEGAÇÃO: sobre a tabela, ‹ › avançam e voltam os DIAS, uma página por vez —
 * é o que evita a barra de rolagem horizontal. O MÊS não se troca aqui: quem
 * manda nele é a lente da página, e dois controles de mês na mesma tela, um
 * dentro do outro, discordariam sem que ninguém percebesse.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { getTodayISO } from '@/lib/index';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
// As colunas do mês continuam saindo daqui: a função é pura, tem teste próprio
// e já sabe parar no dia de hoje quando o mês é o corrente. O que mudou foi a
// fonte dos VALORES, não a régua do calendário.
import { diasDoMes } from '@/services/diario/diaDetalhado';

interface DiaDetalhadoProps {
  /**
   * Linhas do mês vindas de `useAnaliticoDashboard`, JÁ escopadas por quem
   * chama (setor, equipe, permissão). Ver o cabeçalho.
   *
   * Obrigatória. Como opcional, um caller que esquecesse de passá-la veria um
   * mapa vazio em vez de um erro — e mapa vazio é indistinguível de "mês sem
   * recebimento".
   */
  linhas: readonly AnaliticoDashboardLinha[];
  /** 'yyyy-MM' — o mês da lente. `null` enquanto ela não resolveu. */
  mes: string | null;
  /**
   * operador_id → nome de exibição. Quem chama tem os resumos; aqui não.
   *
   * Obrigatória pelo mesmo motivo: sem ela o mapa desenhava uma coluna inteira
   * de '—' e continuava parecendo funcionar.
   */
  nomeDoOperador: (id: string) => string;
  /**
   * 'yyyy-MM-dd'. Só decide onde as colunas param e qual delas é "hoje".
   *
   * Continua opcional — o padrão (`getTodayISO()`) está certo, e deixá-la
   * injetável é o que permite testar o mapa sem mexer no relógio.
   */
  hojeISO?: string;
}

/** Dias visíveis por página. 10 cabe confortavelmente em tela de notebook. */
const DIAS_POR_PAGINA = 10;

/** Uma linha do mapa: um operador e o que ele recebeu em cada dia. */
interface LinhaDoMapa {
  operadorId: string;
  nome: string;
  /** Um valor por dia, na mesma ordem das colunas. 0 = nada recebido. */
  valores: number[];
  /** Soma da linha — o mês do operador. */
  total: number;
}

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
  linhas, mes, nomeDoOperador, hojeISO = getTodayISO(),
}: DiaDetalhadoProps) {
  const dias = useMemo(
    () => (mes ? diasDoMes(mes, hojeISO) : []),
    [mes, hojeISO],
  );

  /*
   * A matriz sai das linhas recebidas.
   *
   * Linha SEM operador (órfão, "sem vínculo", fora do vínculo) não pertence a
   * ninguém e fica de fora da tabela — mas conta no total da empresa, então é
   * somada à parte e informada no rodapé. Sem isso o total do mapa pareceria
   * divergir do card do topo, e a diferença é justamente essa.
   */
  const matriz = useMemo(() => {
    const indiceDoDia = new Map(dias.map((d, i) => [d, i] as const));
    const porOperador = new Map<string, LinhaDoMapa>();
    let totalForaDaMatriz = 0;

    for (const l of linhas) {
      const i = indiceDoDia.get(l.dia);
      if (i === undefined) continue;          // dia fora das colunas do mês
      const v = Number(l.total) || 0;
      if (!l.operador_id) { totalForaDaMatriz += v; continue; }

      let linha = porOperador.get(l.operador_id);
      if (!linha) {
        linha = {
          operadorId: l.operador_id,
          nome:       nomeDoOperador(l.operador_id),
          valores:    dias.map(() => 0),
          total:      0,
        };
        porOperador.set(l.operador_id, linha);
      }
      linha.valores[i] += v;
      linha.total      += v;
    }

    // Maior mês primeiro, como o resto do analítico. Empate pelo nome, para a
    // ordem não dançar entre renders quando dois zeram.
    const ordenadas = [...porOperador.values()].sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'),
    );

    return {
      linhas:       ordenadas,
      totaisPorDia: dias.map((_, i) => ordenadas.reduce((s, l) => s + l.valores[i], 0)),
      totalGeral:   ordenadas.reduce((s, l) => s + l.total, 0),
      totalForaDaMatriz,
    };
  }, [linhas, dias, nomeDoOperador]);

  const totalDias = dias.length;
  const [inicio, setInicio] = useState(0);

  // Ao trocar de mês (ou de escopo) abre na ÚLTIMA página: o que interessa
  // primeiro é o fim do período, não o dia 1º.
  useEffect(() => {
    setInicio(Math.max(0, totalDias - DIAS_POR_PAGINA));
  }, [totalDias, mes]);

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

  const m = matriz;
  const vazio = totalDias === 0 || m.linhas.length === 0;

  if (vazio) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-14 text-center text-sm text-muted-foreground">
        {totalDias === 0
          ? 'Nenhum dia para exibir neste mês ainda.'
          : 'Nenhum recebimento vinculado a operador neste mês.'}
        {m.totalForaDaMatriz > 0 && (
          <span className="block mt-1 text-xs">
            Há {formatBRL(m.totalForaDaMatriz)} sem operador vinculado — veja a aba “Sem operador”.
          </span>
        )}
      </div>
    );
  }

  const diasVisiveis = dias.slice(inicio, inicio + DIAS_POR_PAGINA);
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
      {/* O mês aparece por ESCRITO, e não como controle: as colunas mostram só
          o número do dia, e sem esta linha "05" não diria de que mês é. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" />
          {mes && (
            <>
              <span className="font-semibold capitalize text-foreground">{rotuloDoMes(mes)}</span>
              <span className="text-border">·</span>
            </>
          )}
          <span>
            {m.linhas.length} {m.linhas.length === 1 ? 'operador' : 'operadores'}
          </span>
          <span className="text-border">·</span>
          <span>
            dias <strong className="text-foreground tabular-nums">{primeiro}–{ultimo}</strong> de {totalDias}
          </span>
        </div>
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 leading-tight">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total do mês</p>
          <p className="text-sm font-bold tabular-nums text-primary">{formatBRL(m.totalGeral)}</p>
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

      {/* Sem esta nota o total do mapa parece divergir do card «Total recebido»
          do topo — e a diferença é exatamente este valor. */}
      {m.totalForaDaMatriz > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Fora da tabela: <strong>{formatBRL(m.totalForaDaMatriz)}</strong> sem operador
          vinculado (órfãos e “sem vínculo”). Conta no total da empresa, mas não
          pertence a nenhuma pessoa.
        </p>
      )}
    </div>
  );
}
