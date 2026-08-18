/**
 * CardMetaDupla — as duas frentes de meta do operador `[PaguePlay]`.
 *
 * Só aparece para quem tem a opção **Meta direta e indireta** ligada na aba
 * Metas, o que por sua vez só é oferecido a quem tem a lógica Direto/Extra
 * ativa. Para todo o resto, o painel é exatamente o de antes.
 *
 * ## Por que um card separado, e não mais duas linhas no card de meta
 *
 * São dois dinheiros de fontes diferentes, cobrados por metas diferentes:
 *
 *   • **direta** — o recebimento do analítico, o relatório do ERP;
 *   • **indireta** — os acordos EXTRA pagos, que não estão no analítico dele
 *     (entram pelo titular direto) e até agora não somavam em lugar nenhum.
 *
 * Empilhá-los no card de meta faria parecer que um é detalhe do outro. E o
 * número que o card grande mostra já é a SOMA — este card existe para dizer de
 * onde ela vem.
 *
 * ## O que este card não faz
 *
 * Não recalcula nada. As contas chegam prontas de `combinarMetaDupla`
 * (`services/metas/metaIndireta.ts`), a mesma função que a aba Quartis usa —
 * é o que garante que a % daqui e a faixa de lá não discordem.
 */

import { motion } from 'framer-motion';
import { Target, Handshake } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { COR_QUARTIL } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';

import type { MetaDupla } from '@/services/metas/metaIndireta';

interface Props {
  dupla: MetaDupla;
  /** 'H.O.' ou 'bruto' — só para o rodapé dizer em que unidade os valores estão. */
  rotuloUnidade: string;
}

interface FrenteProps {
  titulo: string;
  descricao: string;
  Icone: typeof Target;
  cor: string;
  meta: number | null;
  recebido: number;
  pct: number | null;
  falta: number | null;
}

function Frente({ titulo, descricao, Icone, cor, meta, recebido, pct, falta }: FrenteProps) {
  // Barra limitada a 100%: passar disso a faria transbordar do card, e o
  // "quanto passou" já está escrito na % ao lado, sem teto.
  const largura = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const batida = falta === 0;

  return (
    <div className="flex-1 min-w-[190px] rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: cor }}>
          <Icone className="w-3.5 h-3.5 shrink-0" /> {titulo}
        </span>
        <span className="text-lg font-bold font-mono tabular-nums leading-none" style={{ color: cor }}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{descricao}</p>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
        <div className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${largura}%`, background: cor }} />
      </div>

      <div className="flex items-baseline justify-between gap-2 mt-2">
        <span className="text-sm font-bold font-mono tabular-nums">{formatBRL(recebido)}</span>
        <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
          de {meta !== null ? formatBRL(meta) : '—'}
        </span>
      </div>
      <p className={cn('text-[11px] font-medium mt-0.5', batida && 'font-bold')}
        style={{ color: batida ? COR_QUARTIL[1] : undefined }}>
        {falta === null ? 'Sem meta configurada'
          : batida ? 'Meta batida! 🎉'
          : `Faltam ${formatBRL(falta)}`}
      </p>
    </div>
  );
}

export function CardMetaDupla({ dupla, rotuloUnidade }: Props) {
  if (!dupla.ativa) return null;

  const pctTotal = dupla.metaTotal && dupla.metaTotal > 0
    ? Math.round((dupla.recebidoTotal / dupla.metaTotal) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-3"
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          Suas duas metas
        </p>
        <p className="text-[11px] text-muted-foreground">
          Total:{' '}
          <span className="font-mono tabular-nums font-bold text-foreground">
            {formatBRL(dupla.recebidoTotal)}
          </span>
          {dupla.metaTotal !== null && (
            <> de <span className="font-mono tabular-nums">{formatBRL(dupla.metaTotal)}</span></>
          )}
          {pctTotal !== null && <> · <strong>{pctTotal}%</strong></>}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Frente
          titulo="Direta" descricao="Recebimento do analítico" Icone={Target}
          cor={COR_QUARTIL[2]}
          meta={dupla.metaDireta} recebido={dupla.recebidoDireto}
          pct={dupla.pctDireta} falta={dupla.faltaDireta}
        />
        <Frente
          titulo="Indireta" descricao="Acordos EXTRA pagos no mês" Icone={Handshake}
          cor={COR_QUARTIL[3]}
          meta={dupla.metaIndireta} recebido={dupla.recebidoIndireto}
          pct={dupla.pctIndireta} falta={dupla.faltaIndireta}
        />
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        Valores em <strong>{rotuloUnidade}</strong>. Seu <strong>quartil</strong> é
        calculado pela soma das duas metas contra a soma dos dois recebimentos.
        A frente indireta é individual: não entra no acumulado da sua equipe nem
        do setor.
      </p>
    </motion.div>
  );
}
