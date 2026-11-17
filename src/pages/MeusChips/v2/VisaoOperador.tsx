/**
 * VisaoOperador — Meus Chips 2.0 para quem vê só os próprios chips.
 *
 * Topo com o semáforo grande e a rosca da saúde, os indicadores, os chips em
 * cartões grandes e, ao lado, «Próximos avisos» (tempos e lembretes).
 */
import { useMemo, useState } from 'react';
import { Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';
import { contar, peso } from '@/services/chipsFisicos/chipsPainel';
import type { ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { Semaforo } from './Semaforo';
import { CartaoChip, type AcoesDoChip } from './CartaoChip';
import { RoscaSaude } from './Graficos';
import { Indicadores } from './Indicadores';
import { PainelAgenda } from './PainelAgenda';

export function VisaoOperador({
  chips, nome, recursos2, podeCuidar, onAdicionar, acoes,
}: {
  chips: ChipFisicoRow[];
  nome: string;
  recursos2: boolean;
  podeCuidar: (c: ChipFisicoRow) => boolean;
  onAdicionar: () => void;
  acoes: AcoesDoChip;
}) {
  const [status, setStatus] = useState<StatusChip | null>(null);
  const contagem = useMemo(() => contar(chips), [chips]);
  // Quem pede atenção primeiro: banido, restrição, recuperar, ativo.
  const ordenados = useMemo(() => {
    const ordem: Record<StatusChip, number> = { banido: 0, restricao: 1, recuperar: 2, ativo: 3 };
    return [...chips]
      .filter(c => !status || c.status === status)
      .sort((a, b) => ordem[a.status] - ordem[b.status] || a.numero.localeCompare(b.numero));
  }, [chips, status]);

  if (chips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-8 w-8" aria-hidden />
        </span>
        <div>
          <p className="text-xl font-semibold">Você ainda não cadastrou nenhum chip físico.</p>
          <p className="mt-1 text-base text-muted-foreground">Cadastre os chips que estão com você para acompanhar status e tempo.</p>
        </div>
        <Button size="lg" onClick={onAdicionar}>
          <Plus className="mr-1.5 h-5 w-5" aria-hidden /> Adicionar chip
        </Button>
      </div>
    );
  }

  const primeiroNome = nome.split(' ')[0] || 'Você';
  const resumoPeso = peso(contagem);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col justify-between gap-5 rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm">
          <div>
            <p className="text-base text-muted-foreground">Olá, {primeiroNome}</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
              {resumoPeso === 0
                ? 'Todos os seus chips estão ativos.'
                : contagem.ativo === 0
                  ? 'Nenhum chip ativo agora.'
                  : `${contagem.ativo} de ${contagem.total} chips ativos.`}
            </h2>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Seus chips agora</p>
            <Semaforo chips={chips} tamanho="lg" maximo={16} />
          </div>
          <Button size="lg" className="self-start" onClick={onAdicionar}>
            <Plus className="mr-1.5 h-5 w-5" aria-hidden /> Adicionar chip
          </Button>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <RoscaSaude contagem={contagem} />
        </div>
      </section>

      <Indicadores contagem={contagem} filtro={status} onFiltro={setStatus} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Seus chips <span className="font-normal text-muted-foreground">({ordenados.length})</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {ordenados.map(c => (
              <CartaoChip key={c.id} chip={c} podeCuidar={podeCuidar(c)} recursos2={recursos2} acoes={acoes} />
            ))}
          </div>
        </section>
        <aside>
          <PainelAgenda chips={chips} nomeDe={() => ''} titulo="Próximos avisos" mostrarDono={false} />
        </aside>
      </div>
    </div>
  );
}
