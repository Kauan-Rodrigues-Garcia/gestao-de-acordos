/**
 * PixAbaRanking — a sub-aba Ranking, só de quem vê o Pix dos outros: o
 * operador enxerga apenas os próprios acordos (RLS), e um «ranking» dele
 * teria uma pessoa só.
 */
import { Medal } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { PixRankingSetor } from './PixRankingSetor';
import type { PixTela } from './usePixAutomatico';

export function PixAbaRanking({ pix }: { pix: PixTela }) {
  const { perfil, mes, loading, abasRanking, setorFoco, meuSetor, fotoPorOperador } = pix;
  return (
    loading ? (
      <Skeleton className="h-64 w-full rounded-xl" />
    ) : (
      <PixRankingSetor
        abas={abasRanking}
        /* Abre no setor em foco quando há um; as abas do card seguem
           independentes da barra depois disso — ver o cabeçalho do card. */
        setorInicial={setorFoco ?? meuSetor}
        fotoPorOperador={fotoPorOperador}
        destacarOperadorId={perfil?.id}
        recolhivel={false}
        vazio={
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
            <Medal className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">Ranking vazio em {rotuloDoMes(mes)}</p>
            <p className="max-w-sm text-[11px] text-muted-foreground">
              Assim que o setor tiver acordos Pix registrados no mês, o pódio aparece aqui.
            </p>
          </div>
        }
      />
    )
  );
}
