/**
 * FaixaContexto — os blocos que só aparecem quando têm o que dizer.
 *
 * Quatro blocos, nenhum obrigatório:
 *
 *   Jornada          Acessos e Retenções lançados — só o setor Jornada tem
 *                    (05/11/2026); o banco devolve nada para os outros
 *   Direto / Extra   PaguePlay, e só nos setores com a lógica ativa
 *   Pix Automático   BookPlay
 *   Tags             qualquer operação, quando houver acordo com tag no dia
 *
 * A regra de "só aparece quando existe" veio de uma medição: só 13 dos 1.963
 * acordos da BookPlay em 30 dias têm tag (0,6%). Na versão 1.0 o bloco de tags
 * era o maior do painel e ficava vazio em ~99% dos dias — um buraco permanente
 * que o olho aprendia a pular, e que empurrava o resto para baixo da rolagem.
 */

import { motion } from 'framer-motion';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import { Zap, Tag, Link2, KeyRound, ShieldCheck, Route } from 'lucide-react';
import { formatCurrency } from '@/lib/index';
import type { FatiaTag, ResumoPixDia } from '@/lib/desempenhoDia';
import type { ContagemJornadaDia } from '@/services/desempenhoDia/desempenhoDia.service';

import { corTexto } from '@/lib/temas';
interface FaixaContextoProps {
  /** `null` quando o setor não tem a lógica Direto/Extra. */
  diretoExtra: { direto: number; extra: number } | null;
  /** `null` na PaguePlay, onde o módulo não existe. */
  pix: ResumoPixDia | null;
  tags: FatiaTag[];
  /** `null` fora do setor Jornada — e então o bloco não existe. */
  jornada?: ContagemJornadaDia | null;
}

export function FaixaContexto({ diretoExtra, pix, tags, jornada = null }: FaixaContextoProps) {
  const { semMovimento } = useMovimentoPreferido();

  const temDiretoExtra = diretoExtra !== null && (diretoExtra.direto > 0 || diretoExtra.extra > 0);
  const temPix = pix !== null && (pix.aprovados > 0 || pix.pendentes > 0);
  const temTags = tags.length > 0;
  const temJornada = jornada !== null;

  if (!temJornada && !temDiretoExtra && !temPix && !temTags) return null;

  return (
    <div className="space-y-3">
      {temJornada && <BlocoJornada c={jornada!} />}
      {temDiretoExtra && <BlocoDiretoExtra {...diretoExtra!} semMovimento={!!semMovimento} />}
      {temPix && <BlocoPix pix={pix!} />}
      {temTags && <BlocoTags tags={tags} semMovimento={!!semMovimento} />}
    </div>
  );
}

// ─── Jornada: Acessos e Retenções ────────────────────────────────────────────

/**
 * Quantos NRs foram lançados nas abas Acesso e Retenção. Contagem, não
 * dinheiro: por isso fica num bloco próprio, com o mês ao lado para dar a
 * escala. Só a aba que o recorte tem aparece — a equipe Suporte não ganha uma
 * linha «0 retenções».
 */
function BlocoJornada({ c }: { c: ContagemJornadaDia }) {
  const itens = [
    (c.temAcesso || c.acessoMes > 0) && {
      chave: 'acesso', rotulo: c.acesso === 1 ? 'Acesso' : 'Acessos', Icone: KeyRound, dia: c.acesso, mes: c.acessoMes,
    },
    (c.temRetencao || c.retencaoMes > 0) && {
      chave: 'retencao', rotulo: c.retencao === 1 ? 'Retenção' : 'Retenções', Icone: ShieldCheck, dia: c.retencao, mes: c.retencaoMes,
    },
  ].filter(Boolean) as { chave: string; rotulo: string; Icone: typeof KeyRound; dia: number; mes: number }[];

  return (
    <section className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Route className="mr-1 inline h-3 w-3" />
        Jornada
        <span className="ml-1 font-normal normal-case opacity-70">· lançados no dia</span>
      </p>
      <div className={itens.length > 1 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1'}>
        {itens.map(({ chave, rotulo, Icone, dia, mes }) => (
          <div key={chave} className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Icone className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5 leading-none">
                <span className="font-mono text-lg font-bold tabular-nums">{dia}</span>
                <span className="text-[11px] text-muted-foreground">{rotulo}</span>
              </p>
              <p className="mt-1 text-[10px] leading-none text-muted-foreground tabular-nums">{mes} no mês</p>
            </div>
          </div>
        ))}
      </div>
    </section>
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
    <section className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="mr-1 inline h-3 w-3" />
        Direto e Extra
        <span className="ml-1 font-normal normal-case opacity-70">· acordos pagos</span>
      </p>

      {/* Uma animação de transform para a fita inteira — ver `BarraEstados`. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <motion.div
          initial={semMovimento ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ transformOrigin: 'left' }}
          className="flex h-full w-full"
        >
          <div className="h-full bg-blue-500" style={{ width: `${pctDireto}%` }} />
          <div className="h-full bg-violet-500" style={{ width: `${100 - pctDireto}%` }} />
        </motion.div>
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
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Zap className="mr-1 inline h-3 w-3" />
          Pix Automático
        </p>
        <span className="font-mono text-sm font-bold tabular-nums text-cyan-600 dark:text-cyan-500">
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
              <strong className="font-semibold text-amber-700 dark:text-amber-500 tabular-nums">{pix.pendentes}</strong>
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
    <section className="space-y-2">
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
                  style={{ background: t.cor + '22', color: corTexto(t.cor) }}
                >
                  {t.pct}%
                </span>
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <motion.div
                initial={semMovimento ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: semMovimento ? 0 : i * 0.04 }}
                className="h-full rounded-full"
                style={{
                  width: `${t.pct}%`,
                  transformOrigin: 'left',
                  background: `linear-gradient(90deg, ${t.cor}88, ${t.cor})`,
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
