/**
 * FaixaContexto — os blocos que só aparecem quando têm o que dizer.
 *
 * Três blocos, nenhum obrigatório:
 *
 *   Direto / Extra   PaguePlay, e só nos setores com a lógica ativa
 *   Pix Automático   BookPlay
 *   Tags             qualquer operação, quando houver acordo com tag no dia
 *
 * A regra de "só aparece quando existe" veio de uma medição: só 13 dos 1.963
 * acordos da BookPlay em 30 dias têm tag (0,6%). Na versão 1.0 o bloco de tags
 * era o maior do painel e ficava vazio em ~99% dos dias — um buraco permanente
 * que o olho aprendia a pular, e que empurrava o resto para baixo da rolagem.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { Zap, Tag, Link2 } from 'lucide-react';
import { formatCurrency } from '@/lib/index';
import type { FatiaTag, ResumoPixDia } from '@/lib/desempenhoDia';

interface FaixaContextoProps {
  /** `null` quando o setor não tem a lógica Direto/Extra. */
  diretoExtra: { direto: number; extra: number } | null;
  /** `null` na PaguePlay, onde o módulo não existe. */
  pix: ResumoPixDia | null;
  tags: FatiaTag[];
}

export function FaixaContexto({ diretoExtra, pix, tags }: FaixaContextoProps) {
  const semMovimento = useReducedMotion();

  const temDiretoExtra = diretoExtra !== null && (diretoExtra.direto > 0 || diretoExtra.extra > 0);
  const temPix = pix !== null && (pix.aprovados > 0 || pix.pendentes > 0);
  const temTags = tags.length > 0;

  if (!temDiretoExtra && !temPix && !temTags) return null;

  return (
    <div className="space-y-2.5">
      {temDiretoExtra && <BlocoDiretoExtra {...diretoExtra!} semMovimento={!!semMovimento} />}
      {temPix && <BlocoPix pix={pix!} />}
      {temTags && <BlocoTags tags={tags} semMovimento={!!semMovimento} />}
    </div>
  );
}

// ─── Direto / Extra ──────────────────────────────────────────────────────────

/**
 * A divisão vem dos ACORDOS, não do analítico: `tipo_comissao` no relatório da
 * PaguePlay é nulo em todas as linhas, e a informação de vínculo só existe na
 * tabulação. Por isso o rótulo repete a fonte.
 */
function BlocoDiretoExtra({
  direto, extra, semMovimento,
}: { direto: number; extra: number; semMovimento: boolean }) {
  const total = direto + extra;
  const pctDireto = total > 0 ? (direto / total) * 100 : 0;

  return (
    <section className="space-y-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="mr-1 inline h-3 w-3" />
        Direto e Extra
        <span className="ml-1 font-normal normal-case opacity-70">· acordos pagos</span>
      </p>

      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <motion.div
          initial={semMovimento ? false : { width: 0 }}
          animate={{ width: `${pctDireto}%` }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="h-full rounded-l-full bg-blue-500"
        />
        <motion.div
          initial={semMovimento ? false : { width: 0 }}
          animate={{ width: `${100 - pctDireto}%` }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="h-full rounded-r-full bg-violet-500"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Direto</span>
          <span className="font-mono font-semibold tabular-nums">{formatCurrency(direto)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          <span className="text-muted-foreground">Extra</span>
          <span className="font-mono font-semibold tabular-nums">{formatCurrency(extra)}</span>
        </span>
      </div>
    </section>
  );
}

// ─── Pix Automático ──────────────────────────────────────────────────────────

function BlocoPix({ pix }: { pix: ResumoPixDia }) {
  return (
    <section className="space-y-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Zap className="mr-1 inline h-3 w-3" />
          Pix Automático
        </p>
        <span className="font-mono text-sm font-bold tabular-nums text-cyan-500">
          {formatCurrency(pix.comissao)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          <strong className="font-semibold text-foreground tabular-nums">{pix.aprovados}</strong>
          {' '}aprovado{pix.aprovados !== 1 ? 's' : ''}
          {pix.pendentes > 0 && (
            <>
              {' · '}
              <strong className="font-semibold text-amber-500 tabular-nums">{pix.pendentes}</strong>
              {' '}aguardando
            </>
          )}
        </span>
        <span className="font-mono tabular-nums">
          sobre {formatCurrency(pix.valorAprovado)}
        </span>
      </div>
    </section>
  );
}

// ─── Tags ────────────────────────────────────────────────────────────────────

function BlocoTags({ tags, semMovimento }: { tags: FatiaTag[]; semMovimento: boolean }) {
  return (
    <section className="space-y-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Tag className="mr-1 inline h-3 w-3" />
        Recebido por tag
      </p>

      <div className="space-y-2">
        {tags.map((t, i) => (
          <motion.div
            key={t.tagId}
            initial={semMovimento ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: semMovimento ? 0 : i * 0.05, duration: 0.22 }}
            className="space-y-1"
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.cor }} />
                <span className="truncate font-medium">{t.nome}</span>
                <span className="shrink-0 text-muted-foreground">{t.qtd}ac.</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(t.valor)}
                </span>
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{ background: t.cor + '22', color: t.cor }}
                >
                  {t.pct}%
                </span>
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <motion.div
                initial={semMovimento ? false : { width: 0 }}
                animate={{ width: `${t.pct}%` }}
                transition={{ duration: 0.45, ease: 'easeOut', delay: semMovimento ? 0 : i * 0.05 }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${t.cor}88, ${t.cor})` }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
