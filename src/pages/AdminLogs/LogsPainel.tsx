/**
 * src/pages/AdminLogs/LogsPainel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A leitura de cima: números do recorte, atividade por dia e por categoria.
 *
 * Todos os valores vêm de `fn_logs_resumo`, calculada no banco sobre o filtro
 * INTEIRO. É a diferença entre "42 eventos" (o que a página carregou) e "12.340
 * eventos, 18 críticos" (o que existe no período) — e a segunda é a única que
 * responde a pergunta de quem abre a tela.
 *
 * As fatias são clicáveis: clicar em "Segurança" no gráfico filtra por
 * segurança. Painel que só informa obriga a repetir no filtro o que a pessoa
 * acabou de ler.
 */
import { useMemo } from 'react';
import {
  Activity, AlertTriangle, Trash2, Users, Bot, Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { categoriaMeta, severidadeMeta, descreverAcao } from '@/lib/logs-catalogo';
import type { ResumoLogs } from '@/services/logs.service';
import { numeroBr, iconeDaCategoria } from './formatos';

interface Props {
  resumo: ResumoLogs;
  carregando: boolean;
  categoriaAtiva: string | null;
  severidadeAtiva: string | null;
  onCategoria: (c: string | null) => void;
  onSeveridade: (s: string | null) => void;
  onAcao: (a: string | null) => void;
  onUsuario: (id: string | null) => void;
}

export default function LogsPainel({
  resumo, carregando, categoriaAtiva, severidadeAtiva,
  onCategoria, onSeveridade, onAcao, onUsuario,
}: Props) {
  // Pico de atividade: a hora com mais eventos no recorte. Serve para responder
  // "quando isso aconteceu" sem varrer a lista — e para notar movimento em hora
  // que ninguém deveria estar trabalhando.
  const pico = useMemo(() => {
    if (resumo.porHora.length === 0) return null;
    return resumo.porHora.reduce((a, b) => (b.total > a.total ? b : a));
  }, [resumo.porHora]);

  if (carregando) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Números ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Tile
          icone={Activity}
          label="Eventos"
          valor={numeroBr(resumo.total)}
          detalhe="no período"
          onClick={() => { onSeveridade(null); onCategoria(null); }}
        />
        <Tile
          icone={AlertTriangle}
          label="Críticos"
          valor={numeroBr(resumo.criticos)}
          detalhe={resumo.criticos > 0 ? 'requer atenção' : 'nada crítico'}
          tom={resumo.criticos > 0 ? 'critico' : 'neutro'}
          ativo={severidadeAtiva === 'critico'}
          onClick={() => onSeveridade(severidadeAtiva === 'critico' ? null : 'critico')}
        />
        <Tile
          icone={AlertTriangle}
          label="Avisos"
          valor={numeroBr(resumo.avisos)}
          detalhe="exclusões e mudanças sensíveis"
          tom={resumo.avisos > 0 ? 'aviso' : 'neutro'}
          ativo={severidadeAtiva === 'aviso'}
          onClick={() => onSeveridade(severidadeAtiva === 'aviso' ? null : 'aviso')}
        />
        <Tile
          icone={Trash2}
          label="Exclusões"
          valor={numeroBr(resumo.exclusoes)}
          detalhe="registros apagados"
          tom={resumo.exclusoes > 0 ? 'aviso' : 'neutro'}
        />
        <Tile
          icone={Users}
          label="Pessoas ativas"
          valor={numeroBr(resumo.usuariosAtivos)}
          detalhe="autores distintos"
        />
        <Tile
          icone={pico ? Clock : Bot}
          label={pico ? 'Hora de pico' : 'Automáticos'}
          valor={pico ? `${String(pico.chave).padStart(2, '0')}h` : numeroBr(resumo.automaticos)}
          detalhe={pico ? `${numeroBr(pico.total)} eventos` : 'sem pessoa por trás'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* ── Atividade por dia ──────────────────────────────────────────── */}
        <Card className="lg:col-span-2 border-border p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs font-semibold text-foreground">Atividade por dia</h3>
            <span className="text-[10px] text-muted-foreground">
              {resumo.porDia.length} dia(s) com registro
            </span>
          </div>
          <GraficoPorDia dias={resumo.porDia} />
        </Card>

        {/* ── Categorias ─────────────────────────────────────────────────── */}
        <Card className="border-border p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3">Por categoria</h3>
          {resumo.porCategoria.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Sem eventos no período.</p>
          ) : (
            <div className="space-y-1.5">
              {resumo.porCategoria.slice(0, 7).map((c) => {
                const meta = categoriaMeta(c.chave);
                const pct = resumo.total > 0 ? (c.total / resumo.total) * 100 : 0;
                const ativa = categoriaAtiva === c.chave;
                const Icone = iconeDaCategoria(c.chave);
                return (
                  <button
                    key={c.chave}
                    type="button"
                    onClick={() => onCategoria(ativa ? null : c.chave)}
                    aria-pressed={ativa}
                    className={cn(
                      'w-full text-left group rounded-md px-2 py-1.5 transition-colors',
                      ativa ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icone className="w-3 h-3 shrink-0" style={{ color: meta.hex }} />
                      <span className="text-[11px] font-medium text-foreground flex-1 truncate">
                        {meta.label}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                        {numeroBr(c.total)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 1.5)}%`, backgroundColor: meta.hex }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Ações e autores mais frequentes ───────────────────────────────── */}
      {(resumo.porAcao.length > 0 || resumo.porUsuario.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="border-border p-4">
            <h3 className="text-xs font-semibold text-foreground mb-2.5">O que mais aconteceu</h3>
            <div className="flex flex-wrap gap-1.5">
              {resumo.porAcao.map((a) => (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => onAcao(a.chave)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors text-[11px]"
                  title={`Filtrar por ${descreverAcao(a.chave)}`}
                >
                  <span className="text-foreground truncate max-w-[180px]">
                    {descreverAcao(a.chave)}
                  </span>
                  <span className="font-mono text-muted-foreground tabular-nums">{numeroBr(a.total)}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="border-border p-4">
            <h3 className="text-xs font-semibold text-foreground mb-2.5">Quem mais agiu</h3>
            <div className="space-y-1">
              {resumo.porUsuario.map((u) => {
                const pct = resumo.total > 0 ? (u.total / resumo.total) * 100 : 0;
                return (
                  <button
                    key={`${u.id ?? 'sistema'}-${u.chave}`}
                    type="button"
                    disabled={!u.id}
                    onClick={() => onUsuario(u.id ?? null)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors',
                      u.id ? 'hover:bg-accent cursor-pointer' : 'cursor-default opacity-70',
                    )}
                  >
                    <span className="text-[11px] text-foreground flex-1 text-left truncate">{u.chave}</span>
                    <div className="w-24 h-1 rounded-full bg-muted overflow-hidden shrink-0">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-12 text-right">
                      {numeroBr(u.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Peças
// ═══════════════════════════════════════════════════════════════════════════
function Tile({
  icone: Icone,
  label,
  valor,
  detalhe,
  tom = 'neutro',
  ativo = false,
  onClick,
}: {
  icone: typeof Activity;
  label: string;
  valor: string;
  detalhe: string;
  tom?: 'neutro' | 'aviso' | 'critico';
  ativo?: boolean;
  onClick?: () => void;
}) {
  const cor =
    tom === 'critico' ? 'text-destructive'
    : tom === 'aviso' ? 'text-amber-600 dark:text-amber-400'
    : 'text-primary';

  const conteudo = (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <Icone className={cn('w-3.5 h-3.5', cor)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-foreground leading-none tabular-nums">{valor}</p>
      <p className="text-[10px] text-muted-foreground mt-1 truncate">{detalhe}</p>
    </>
  );

  if (!onClick) {
    return <Card className="border-border p-3">{conteudo}</Card>;
  }
  // `Card` é um `div` sem `asChild` neste projeto, então o botão recebe as
  // classes do cartão em vez de virar filho dele — aninhar seria um `button`
  // dentro de `div` clicável, com dois alvos de foco para o mesmo alvo visual.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm border-border p-3 text-left transition-colors',
        ativo ? 'border-primary bg-primary/5' : 'hover:bg-accent/40',
      )}
    >
      {conteudo}
    </button>
  );
}

/**
 * Barras por dia, em SVG puro.
 *
 * Sem Recharts de propósito: são no máximo 90 barras sem eixo, sem tooltip
 * elaborado e sem legenda. Um `<div>` por dia com altura proporcional resolve,
 * responde ao tema pelos tokens e não custa 40 KB de biblioteca no bundle desta
 * aba — que é interna e raramente aberta.
 */
function GraficoPorDia({ dias }: { dias: ResumoLogs['porDia'] }) {
  if (dias.length === 0) {
    return (
      <div className="h-[96px] flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Sem eventos no período selecionado.</p>
      </div>
    );
  }

  const maximo = Math.max(...dias.map((d) => d.total), 1);
  const critMeta = severidadeMeta('critico');

  return (
    <div>
      <div className="flex items-end gap-[3px] h-[96px]">
        {dias.map((d) => {
          const alturaPct = (d.total / maximo) * 100;
          const criticos = d.criticos ?? 0;
          const criticoPct = d.total > 0 ? (criticos / d.total) * 100 : 0;
          const [ano, mes, dia] = String(d.chave).split('-');
          return (
            <div
              key={d.chave}
              className="flex-1 min-w-[3px] h-full flex flex-col justify-end group relative"
              title={`${dia}/${mes}/${ano}: ${numeroBr(d.total)} evento(s)${criticos ? `, ${criticos} crítico(s)` : ''}`}
            >
              <div
                className="w-full rounded-t-sm bg-primary/70 group-hover:bg-primary transition-colors relative overflow-hidden"
                style={{ height: `${Math.max(alturaPct, 2)}%` }}
              >
                {/* Faixa de críticos dentro da própria barra: mostra o dia ruim
                    sem precisar de uma segunda série. */}
                {criticos > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: `${Math.max(criticoPct, 8)}%`, backgroundColor: critMeta.hex }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[9px] text-muted-foreground font-mono">
        <span>{rotuloCurto(dias[0]?.chave)}</span>
        {dias.length > 2 && <span>{rotuloCurto(dias[Math.floor(dias.length / 2)]?.chave)}</span>}
        <span>{rotuloCurto(dias[dias.length - 1]?.chave)}</span>
      </div>
    </div>
  );
}

/** "2026-08-12" → "12/08". Sem `new Date()`, que joga o dia para trás no fuso. */
function rotuloCurto(chave: string | undefined): string {
  if (!chave) return '';
  const [, mes, dia] = chave.split('-');
  return `${dia}/${mes}`;
}
