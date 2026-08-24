/**
 * CardEquipe — o card de setor/equipe do Desempenho Equipes, versão 2.0.
 *
 * ## O que mudou em relação ao placar anterior
 *
 * O card antigo era um cabeçalho com a % de projeção e uma grade de seis
 * quadradinhos de valor. Os seis pesavam igual, então "Acumulado" e "Diária p/
 * meta" competiam pela mesma atenção, e a informação que realmente responde
 * "estamos bem?" — a distância entre o acumulado e o que deveria ter entrado até
 * hoje — não estava em lugar nenhum: era preciso comparar dois quadrados
 * mentalmente.
 *
 * Agora há uma barra que mostra os três valores no mesmo eixo (acumulado, o
 * esperado até hoje e a meta), e a grade ficou com quatro números em vez de
 * seis. O resto desceu para a área expandida, que abre no clique.
 *
 * ## A área expandida
 *
 * Responde o que o card fechado não responde, e nada além:
 *
 *   • **degraus de quartil** — quanto falta para cada faixa acima, não só para a
 *     próxima. Quem está no 4º precisa ver o 3º, o 2º e o 1º;
 *   • **ritmo** — a diária necessária no que RESTA do mês, que sobe quando a
 *     equipe atrasa, e onde o mês fecha mantendo a média atual;
 *   • **as pessoas** — quantas em cada faixa, quem puxa e quem precisa de ajuda.
 *
 * As contas todas vêm de `desempenhoEquipe.ts`, testado à parte. Aqui não se
 * calcula nada além de largura de barra.
 */

import { useId, useState } from 'react';
import { ChevronDown, Users, Target, CalendarClock, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { COR_QUARTIL, corProjecao } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { detalharEquipe, type OperadorNaEquipe } from './desempenhoEquipe';

import type { QuartilConfig } from '@/lib/supabase';
/**
 * O tipo vem de `lideresDaEquipe`, onde a lista é DECIDIDA.
 *
 * Havia duas declarações idênticas do mesmo tipo, uma em cada arquivo. Aqui só
 * se desenha; quem escolhe quem aparece é o módulo puro. O reexport mantém
 * `import { type LiderInfo } from './CardEquipe'` funcionando.
 */
import type { LiderInfo } from './lideresDaEquipe';

export type { LiderInfo };

/** Avatar do próprio card (setor, Receptivo) em vez das fotos dos líderes. */
export interface AvatarProprio {
  foto: string | null;
  /** Ausente = só exibe. Quem não pode editar não vê o botão de câmera. */
  onEditar?: () => void;
  salvando?: boolean;
  Icone: LucideIcon;
  /** Vai no alt/title — "Foto do setor", "Foto do Receptivo". */
  rotulo: string;
}

interface CardEquipeProps {
  titulo: string;
  subtitulo?: string;
  lideres?: LiderInfo[];
  avatarProprio?: AvatarProprio;
  /** Destaque visual do card consolidado do setor. */
  ehSetor?: boolean;
  acumulado: number;
  /** PaguePlay: H.O. do acumulado. */
  acumuladoHO?: number;
  /**
   * Quanto do acumulado veio de AJUSTE MANUAL de recebimento.
   *
   * Já está DENTRO de `acumulado` — não é parcela a somar, é a resposta para
   * «de onde veio». O card só o exibe quando existe, e é o aviso que a
   * liderança pediu: onde o valor aparece, fica dito que um pedaço foi lançado
   * à mão. Negativo é legítimo — o ajuste também tira.
   */
  ajusteManual?: number;
  mostrarHO?: boolean;
  /** H.O. da meta, quando `mostrarHO`. */
  metaHO?: number | null;
  meta: number | null;
  totalUteis: number;
  decorridos: number;
  quartis: QuartilConfig[];
  /**
   * Operadores que compõem o acumulado.
   *
   * `undefined` = card não expansível. É o caso do Receptivo, cujo valor é
   * digitado à mão e não tem pessoas atrás dele — abrir mostraria uma área
   * vazia, o que é pior que não abrir.
   */
  operadores?: readonly OperadorNaEquipe[];
}

// ── Avatares ─────────────────────────────────────────────────────────────────

function Avatares({ lideres, proprio }: { lideres: LiderInfo[]; proprio?: AvatarProprio }) {
  if (proprio) {
    const { foto, onEditar, salvando, Icone, rotulo } = proprio;
    const conteudo = foto
      ? <img src={foto} alt={rotulo} className="w-full h-full rounded-full object-cover" />
      : <Icone className="w-6 h-6" />;
    const classe = cn(
      'relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center',
      'border-2 border-border shrink-0 overflow-hidden',
      foto ? 'bg-card' : 'bg-primary/15 text-primary',
    );
    if (!onEditar) return <div className={classe} title={rotulo}>{conteudo}</div>;
    return (
      <button
        type="button"
        // `stopPropagation`: o avatar é clicável DENTRO de um card clicável.
        // Sem isto, trocar a foto também abriria/fecharia a área expandida.
        onClick={e => { e.stopPropagation(); onEditar(); }}
        disabled={salvando}
        title={`Alterar ${rotulo.toLowerCase()}`}
        className={cn(classe, 'group cursor-pointer')}
      >
        {conteudo}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-semibold">
          {salvando ? '…' : 'trocar'}
        </span>
      </button>
    );
  }

  if (lideres.length === 0) {
    return (
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 border-border shrink-0 bg-muted text-muted-foreground">
        <Users className="w-6 h-6" />
      </div>
    );
  }

  return (
    <div className="flex -space-x-3 shrink-0">
      {lideres.map((l, i) => (
        l.foto_url ? (
          <img
            key={i} src={l.foto_url} alt={l.nome} title={l.nome}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-card shadow-sm bg-card"
          />
        ) : (
          <div
            key={i} title={l.nome}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 border-card bg-muted text-muted-foreground text-base font-bold shadow-sm"
          >
            {l.nome.charAt(0).toUpperCase()}
          </div>
        )
      ))}
    </div>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

/** A fonte encolhe conforme o número cresce, para nunca cortar dígito. */
function fonteDoValor(valor: string): string {
  if (valor.length > 13) return 'text-sm sm:text-base';
  if (valor.length > 10) return 'text-base sm:text-lg';
  return 'text-lg sm:text-xl';
}

function Numero({
  label, valor, cor, hint, sub,
}: { label: string; valor: string; cor?: string; hint?: string; sub?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </p>
      <p
        className={cn('tabular-nums font-mono font-bold leading-tight mt-0.5 whitespace-nowrap', fonteDoValor(valor))}
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground tabular-nums font-mono truncate">{sub}</p>
      )}
    </div>
  );
}

/**
 * Acumulado, esperado até hoje e meta no MESMO eixo.
 *
 * É a peça que o card antigo não tinha. A barra vai de 0 ao maior entre meta e
 * acumulado — assim quem passou da meta vê a sobra em vez de uma barra cheia sem
 * informação. O tracinho marca o esperado até hoje: à esquerda dele o
 * preenchimento está adiantado, à direita está atrasado, e isso se lê sem número.
 */
function BarraProgresso({
  acumulado, esperado, meta, cor,
}: { acumulado: number; esperado: number | null; meta: number | null; cor: string }) {
  const teto = Math.max(meta ?? 0, acumulado, 1);
  const pctAcum = Math.min(100, (acumulado / teto) * 100);
  const pctEsp  = esperado !== null ? Math.min(100, (esperado / teto) * 100) : null;
  const pctMeta = meta !== null && meta > 0 ? Math.min(100, (meta / teto) * 100) : null;

  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{ width: `${pctAcum}%`, background: cor }}
        />
        {/* Meta: risco claro no fim da faixa, quando a barra passou dela. */}
        {pctMeta !== null && pctMeta < 100 && (
          <div
            className="absolute inset-y-0 w-px bg-foreground/25"
            style={{ left: `${pctMeta}%` }}
          />
        )}
      </div>
      {/* O marcador do esperado fica FORA do trilho arredondado: dentro, o
          `overflow-hidden` cortaria a ponta dele nos extremos. */}
      {pctEsp !== null && (
        <div className="relative h-0">
          <div
            className="absolute -top-[14px] w-0.5 h-[18px] bg-foreground/70 rounded-full"
            style={{ left: `calc(${pctEsp}% - 1px)` }}
            title={`Deveria ter até hoje: ${formatBRL(esperado!)}`}
          />
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
        <span className="tabular-nums font-mono">{formatBRL(acumulado)}</span>
        {esperado !== null && (
          <span className="tabular-nums font-mono">
            esperado hoje {formatBRL(esperado)}
          </span>
        )}
        <span className="tabular-nums font-mono">
          {meta !== null && meta > 0 ? `meta ${formatBRL(meta)}` : 'sem meta'}
        </span>
      </div>
    </div>
  );
}

/** Uma linha do "quanto falta para cada faixa". */
function Degrau({
  quartil, falta, alcancado, ehAtual,
}: { quartil: number; falta: number; alcancado: boolean; ehAtual: boolean }) {
  const cor = COR_QUARTIL[quartil] ?? '#6366f1';
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-2 py-1.5',
      ehAtual ? 'bg-muted/60 ring-1 ring-inset' : 'bg-muted/25',
    )}
      style={ehAtual ? { boxShadow: `inset 0 0 0 1px ${cor}55` } : undefined}
    >
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0"
        style={{ background: cor + '26', color: cor }}
      >
        {quartil}º
      </span>
      <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
        {ehAtual ? 'faixa atual' : alcancado ? 'já alcançado' : 'faltam'}
      </span>
      <span
        className="text-[11px] tabular-nums font-mono font-semibold shrink-0"
        style={{ color: alcancado ? COR_QUARTIL[1] : undefined }}
      >
        {alcancado ? '✓' : formatBRL(falta)}
      </span>
    </div>
  );
}

/** Bloco de leitura da área expandida. */
function Bloco({
  Icone, titulo, children,
}: { Icone: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icone className="w-3.5 h-3.5 shrink-0" /> {titulo}
      </p>
      {children}
    </div>
  );
}

function LinhaValor({
  label, valor, cor, hint,
}: { label: string; valor: string; cor?: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="text-[11px] text-muted-foreground min-w-0 truncate">{label}</span>
      <span
        className="text-[11px] tabular-nums font-mono font-semibold shrink-0"
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </span>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function CardEquipe({
  titulo, subtitulo, lideres, avatarProprio, ehSetor,
  acumulado, acumuladoHO, mostrarHO, metaHO, meta,
  totalUteis, decorridos, quartis, operadores, ajusteManual,
}: CardEquipeProps) {
  const [aberto, setAberto] = useState(false);
  const painelId = useId();

  const d = detalharEquipe({
    acumulado, meta, totalUteis, decorridos, quartis,
    operadores: operadores ?? [],
  });

  const expansivel = operadores !== undefined;
  const cor = d.projecaoPct !== null ? corProjecao(d.projecaoPct) : 'var(--muted-foreground)';
  const esperado = meta !== null && meta > 0 && totalUteis > 0
    ? (meta / totalUteis) * Math.max(decorridos, 1)
    : null;

  const metaBatida = d.faltaMeta !== null && d.faltaMeta === 0;

  const Cabecalho = (
    <div className="flex items-center gap-3">
      <Avatares lideres={lideres ?? []} proprio={avatarProprio} />
      <div className="flex-1 min-w-0">
        <p className="text-base sm:text-lg font-bold leading-tight truncate">{titulo}</p>
        {subtitulo && (
          <p className="text-[11px] text-muted-foreground truncate">{subtitulo}</p>
        )}
      </div>
      <div className="shrink-0 text-center rounded-xl px-3 py-1.5"
        style={d.projecaoPct !== null ? { background: cor + '1a' } : undefined}>
        <p className="text-2xl sm:text-3xl font-extrabold tabular-nums font-mono leading-none"
          style={{ color: cor }}>
          {d.projecaoPct !== null ? `${d.projecaoPct}%` : '—'}
        </p>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
          projeção
        </p>
      </div>
      {expansivel && (
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform shrink-0',
          aberto && 'rotate-180 text-primary',
        )} />
      )}
    </div>
  );

  return (
    <div className={cn(
      'rounded-2xl border bg-card shadow-sm transition-shadow',
      ehSetor
        ? 'border-primary/40 ring-1 ring-primary/10 bg-gradient-to-br from-primary/[0.06] to-transparent'
        : 'border-border',
      aberto && 'shadow-md',
    )}>
      {/* O cabeçalho inteiro é o alvo do clique. `<button>` em volta de conteúdo
          com imagens e outro botão dentro é HTML inválido (botão aninhado), então
          é uma `div` com role/tabIndex e as duas teclas que um botão responde. */}
      <div
        className={cn('p-4 sm:p-5', expansivel && 'cursor-pointer')}
        {...(expansivel ? {
          role: 'button',
          tabIndex: 0,
          'aria-expanded': aberto,
          'aria-controls': painelId,
          onClick: () => setAberto(v => !v),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberto(v => !v); }
          },
        } : {})}
      >
        {Cabecalho}

        <BarraProgresso acumulado={acumulado} esperado={esperado} meta={meta} cor={cor} />

        {/* De onde veio um pedaço do acumulado. Só aparece quando há ajuste —
            o card já tem números demais para carregar uma linha sempre vazia. */}
        {!!ajusteManual && (
          <p
            title="Lançado no Painel Líder › Ajuste de recebimento. Já está somado no acumulado."
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-500"
          >
            <SlidersHorizontal className="w-3 h-3 shrink-0" />
            {ajusteManual > 0 ? 'Inclui ' : 'Descontado '}
            {formatBRL(Math.abs(ajusteManual))} de ajuste manual
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Numero
            label="Acumulado" valor={formatBRL(acumulado)} cor={COR_QUARTIL[1]}
            sub={mostrarHO ? `H.O. ${formatBRL(acumuladoHO ?? 0)}` : undefined}
          />
          <Numero
            label="Meta" valor={meta ? formatBRL(meta) : '—'}
            sub={mostrarHO && metaHO ? `H.O. ${formatBRL(metaHO)}` : undefined}
          />
          <Numero
            label="Falta p/ meta"
            valor={d.faltaMeta === null ? '—' : metaBatida ? 'Batida! 🎉' : formatBRL(d.faltaMeta)}
            cor={d.faltaMeta === null ? undefined : metaBatida ? COR_QUARTIL[1] : undefined}
            hint="Quanto falta para bater a meta do mês"
          />
          <Numero
            label="Média diária" valor={formatBRL(d.mediaDiaria)}
            hint="Acumulado ÷ dias úteis trabalhados"
            sub={`${decorridos} de ${totalUteis} dias`}
          />
        </div>
      </div>

      {expansivel && aberto && (
        <div id={painelId} className="border-t border-border/70 p-4 sm:p-5 pt-4">
          <div className="grid gap-5 md:grid-cols-3">

            {/* ── Degraus de quartil ─────────────────────────────────────── */}
            <Bloco Icone={Target} titulo="Quanto falta por faixa">
              {d.degraus.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Sem meta configurada — não há faixa a alcançar.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {d.degraus.map(g => (
                    <Degrau
                      key={g.quartil}
                      quartil={g.quartil}
                      falta={g.falta}
                      alcancado={g.alcancado}
                      ehAtual={d.faixaAtual?.quartil === g.quartil}
                    />
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-0.5">
                    Medido contra o esperado até hoje, igual à % do card.
                  </p>
                </div>
              )}
            </Bloco>

            {/* ── Ritmo ──────────────────────────────────────────────────── */}
            <Bloco Icone={CalendarClock} titulo="Ritmo e fechamento">
              <div className="space-y-1.5">
                <LinhaValor
                  label="Dias úteis restantes" valor={String(d.diasRestantes)}
                />
                <LinhaValor
                  label="Precisa por dia restante"
                  valor={d.ritmoNecessario !== null ? formatBRL(d.ritmoNecessario) : '—'}
                  cor={d.ritmoNecessario !== null && d.ritmoNecessario > d.mediaDiaria
                    ? COR_QUARTIL[4] : COR_QUARTIL[1]}
                  hint={d.ritmoNecessario === null
                    ? 'Sem meta, meta já batida, ou sem dia útil sobrando'
                    : 'O que falta ÷ dias úteis que restam'}
                />
                <LinhaValor
                  label="Fecha o mês em"
                  valor={formatBRL(d.projecaoFechamento)}
                  hint="Mantendo a média diária atual"
                />
                {d.sobraProjetada !== null && (
                  <LinhaValor
                    label={d.sobraProjetada >= 0 ? 'Sobra projetada' : 'Falta projetada'}
                    valor={`${d.sobraProjetada >= 0 ? '+' : '−'}${formatBRL(Math.abs(d.sobraProjetada))}`}
                    cor={d.sobraProjetada >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4]}
                    hint="Projeção de fechamento menos a meta"
                  />
                )}
                <LinhaValor
                  label="Média por operador"
                  valor={formatBRL(d.mediaPorOperador)}
                  hint={`Acumulado ÷ ${d.totalOperadores} operador(es)`}
                />
              </div>
            </Bloco>

            {/* ── Pessoas ────────────────────────────────────────────────── */}
            <Bloco Icone={Users} titulo={`Pessoas (${d.totalOperadores})`}>
              {d.totalOperadores === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum operador vinculado neste mês.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {d.porQuartil.map(f => {
                    const c = COR_QUARTIL[f.quartil] ?? '#6366f1';
                    return (
                      <div key={f.quartil} className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: c }} />
                        <span className="text-[11px] flex-1 min-w-0 truncate"
                          title={f.nomes.join(', ') || 'ninguém'}>
                          {f.quartil}º quartil
                        </span>
                        <span className="text-[11px] tabular-nums font-mono font-bold shrink-0"
                          style={{ color: c }}>
                          {f.qtd}
                        </span>
                      </div>
                    );
                  })}
                  {d.semMeta > 0 && (
                    <p className="text-[10px] text-muted-foreground pt-0.5">
                      {d.semMeta} sem meta — fora da distribuição.
                    </p>
                  )}
                  {d.destaque && (
                    <div className="pt-1.5 space-y-1 border-t border-border/50">
                      <LinhaValor
                        label={`🔥 ${d.destaque.nome.split(' ')[0]}`}
                        valor={formatBRL(d.destaque.recebido)}
                        cor={COR_QUARTIL[1]}
                        hint={`Maior recebimento: ${d.destaque.nome}`}
                      />
                      {d.atencao && d.atencao.id !== d.destaque.id && (
                        <LinhaValor
                          label={`🎯 ${d.atencao.nome.split(' ')[0]}`}
                          valor={formatBRL(d.atencao.recebido)}
                          cor={COR_QUARTIL[4]}
                          hint={`Menor projeção — mais longe do próprio ritmo: ${d.atencao.nome}`}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </Bloco>
          </div>
        </div>
      )}
    </div>
  );
}
