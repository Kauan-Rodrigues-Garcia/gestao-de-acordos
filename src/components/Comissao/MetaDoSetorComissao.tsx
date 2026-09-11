/**
 * MetaDoSetorComissao — acumulado × meta do setor, e a confirmação que liga o benefício.
 *
 * O banco não recalcula o acumulado do setor: quem confirma é a liderança,
 * olhando o MESMO número do card de setor de Desempenho Equipes
 * (`acumuladoDoSetor`). O botão só libera com o acumulado na meta, e a
 * confirmação fica registrada com nome e hora.
 *
 * A trava da meta do setor não bloqueia aqui: a meta é validada no começo do mês
 * e o setor bate a meta no fim dele.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import type { SomaDoSetor } from '@/services/analitico/acumuladoDoSetor';
import type { ConfigComissao } from '@/services/comissao/comissao';
import { confirmarMetaSetor } from '@/services/comissao/comissao.service';

interface MetaDoSetorComissaoProps {
  empresaId: string;
  setorId: string;
  ano: number;
  mes: number;
  /** Meta do setor no mês, em bruto. `null` = sem meta cadastrada. */
  metaDoSetor: number | null;
  acumulado: SomaDoSetor | null;
  carregando: boolean;
  /** A linha do setor — dona da confirmação. `null` = padrão ainda não salvo. */
  doSetor: ConfigComissao | null;
  podeConfirmar: boolean;
  onMudou: () => void;
}

export function MetaDoSetorComissao({
  empresaId, setorId, ano, mes, metaDoSetor, acumulado, carregando, doSetor, podeConfirmar, onMudou,
}: MetaDoSetorComissaoProps) {
  const [enviando, setEnviando] = useState(false);

  const confirmada = !!doSetor?.setorMetaConfirmadaEm;
  const temMeta = metaDoSetor !== null && metaDoSetor > 0;
  const bateu = temMeta && acumulado !== null && acumulado.bruto >= (metaDoSetor as number);
  const pct = temMeta && acumulado !== null
    ? Math.round((acumulado.bruto / (metaDoSetor as number)) * 100)
    : null;

  async function registrar(confirmado: boolean) {
    setEnviando(true);
    const r = await confirmarMetaSetor({ empresaId, setorId, ano, mes, confirmado });
    setEnviando(false);
    if (!r.ok) {
      toast.error(confirmado ? 'A meta do setor não foi confirmada' : 'A confirmação não foi desfeita', {
        description: r.erro,
      });
      return;
    }
    toast.success(confirmado
      ? 'Meta do setor confirmada — o benefício da comissão ligou para os operadores.'
      : 'Confirmação desfeita — a comissão voltou ao percentual normal.');
    onMudou();
  }

  return (
    <div className="space-y-2">
      {carregando ? (
        <Skeleton className="h-5 w-72" />
      ) : !temMeta ? (
        <p className="text-sm text-muted-foreground">
          Sem meta do setor neste mês. Cadastre na aba Metas para poder confirmar.
        </p>
      ) : acumulado === null ? (
        <p className="text-sm text-muted-foreground">Não foi possível ler o acumulado do setor.</p>
      ) : (
        <p className="text-sm">
          {'Acumulado '}
          <strong className="font-mono tabular-nums">{formatBRL(acumulado.bruto)}</strong>
          {' de '}
          <strong className="font-mono tabular-nums">{formatBRL(metaDoSetor)}</strong>
          {pct !== null && <span className="text-muted-foreground">{` (${pct}%)`}</span>}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        O mesmo acumulado do card do setor em Desempenho Equipes.
      </p>

      {confirmada ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {`Confirmado por ${doSetor?.setorMetaConfirmadaPorNome ?? 'liderança'} em ${
              new Date(doSetor?.setorMetaConfirmadaEm as string).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}`}
          </span>
          {podeConfirmar && (
            <Button type="button" size="sm" variant="ghost" disabled={enviando}
              onClick={() => void registrar(false)}>
              Desfazer
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!podeConfirmar || !bateu || !doSetor || enviando}
            onClick={() => void registrar(true)}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Confirmar meta atingida
          </Button>
          {temMeta && acumulado !== null && !bateu && (
            <span className="text-[11px] text-muted-foreground">
              Libera quando o acumulado alcançar a meta.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
