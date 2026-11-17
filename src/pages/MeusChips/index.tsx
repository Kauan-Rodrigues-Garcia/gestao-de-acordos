/**
 * Meus Chips — os chips físicos de cada pessoa (2.0, 17/11/2026).
 *
 * ## Uma página só
 *
 * Até 17/11 a tela tinha duas separações: «Números de WhatsApp» (os números do
 * Núcleo lançados para cada um) e «Chips Físicos». O Cleber pediu para ficar
 * só os Chips Físicos, como página normal, sem aba interna. Os números do
 * Núcleo continuam no Controle de Números.
 *
 * O que cada pessoa vê vem do alcance (`useChipsFisicos`): os próprios chips,
 * o setor, ou todos os setores — e o banco recorta de novo.
 */
import { Cpu, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
import { MeusChipsV2 } from './v2/MeusChipsV2';

export default function MeusChips() {
  // A mesma conta de `useChipsFisicos`, sem ler a lista duas vezes: o hook
  // de verdade roda dentro de <MeusChipsV2 />.
  const { temPermissao, loading: permLoading } = useCargoPermissoes();
  const habilitado = temPermissao('ver_chips_fisicos');
  const alcance = temPermissao('chips_fisicos_todos_setores') ? 'todos'
    : escopoEfetivo('chips', temPermissao) === 'setor' ? 'setor' : 'proprios';

  const subtitulo = alcance === 'todos'
    ? 'Os chips de todos os setores: saúde, status, tempo e quem está movimentando.'
    : alcance === 'setor'
      ? 'Os chips do seu setor: saúde, status, tempo e quem está movimentando.'
      : 'Os seus chips: status, tempo, lembretes e há quantos dias estão ativos.';

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Cpu className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight">Meus Chips</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
      </header>

      {permLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : habilitado ? (
        <MeusChipsV2 />
      ) : (
        <Card className="border-dashed">
          <CardContent className="space-y-2 py-12 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Seu cargo ainda não acessa os chips físicos.</p>
            <p className="text-xs text-muted-foreground">
              Peça para liberar «Meus Chips: Chips Físicos» no painel de permissões.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
