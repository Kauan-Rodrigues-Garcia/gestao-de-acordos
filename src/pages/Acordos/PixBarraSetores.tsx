/**
 * PixBarraSetores — o setor em foco da aba do Pix Automático.
 *
 * ## Por que existe
 *
 * O filtro de setor era um `Select` no meio da barra de filtros da TABELA, e
 * isso o tornava invisível para o que ele mais governa: a área de painéis. Com
 * «Todos os setores» a aba empilhava um painel de metas por setor, a fila de
 * NRs da empresa inteira e um ranking somando gente de setores diferentes —
 * tudo num scroll só. Apresentar aquilo para a diretoria era rolar a tela
 * procurando o número.
 *
 * A barra sobe para o topo porque ela é NAVEGAÇÃO, não refinamento. O que ela
 * escolhe rege metas, NRs, premiações, ranking e a tabela de uma vez; o
 * `Select` saiu da barra de filtros no mesmo movimento — dois controles para o
 * mesmo estado é pior que um mal colocado.
 *
 * ## O que cada chip carrega
 *
 * O nome do setor, quantos acordos ele tem no mês e um ponto âmbar quando há
 * NR duplicado esperando decisão ali. Sem esses dois números a barra seria uma
 * lista de nomes, e escolher setor viraria tentativa e erro: o ponto âmbar é o
 * que responde «onde está o trabalho parado?» sem entrar em cada um.
 *
 * ## «Todos os setores» continua existindo
 *
 * Deixou de ser o padrão, não de ser possível. É o único lugar onde aparece o
 * pedido de NR sem setor — ver `pedidosDoSetor` — e é a visão que a diretoria
 * usa para comparar. Só não é mais o estado em que a aba abre.
 */
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResumoSetorPix {
  /** Acordos feitos no mês (pendente + aprovado). */
  acordos: number;
  /** NRs duplicados esperando decisão. */
  pedidos: number;
}

export interface PixBarraSetoresProps {
  setores: { id: string; nome: string }[];
  /** Setor em foco. `null` = todos os setores. */
  setorFoco: string | null;
  onEscolher: (setorId: string | null) => void;
  /** Números de cada setor, por id. Setor ausente conta como zerado. */
  resumo: Record<string, ResumoSetorPix>;
  /** Pedidos de NR sem setor — só o chip «Todos» os alcança. */
  pedidosSemSetor?: number;
}

export function PixBarraSetores({
  setores, setorFoco, onEscolher, resumo, pedidosSemSetor = 0,
}: PixBarraSetoresProps) {
  // Um setor só não é escolha: a barra viraria uma moldura em volta de um
  // rótulo. Quem tem um setor já sabe qual é — o cabeçalho dos painéis diz.
  if (setores.length < 2) return null;

  const pedidosTotais =
    setores.reduce((s, x) => s + (resumo[x.id]?.pedidos ?? 0), 0) + pedidosSemSetor;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <Building2 className="h-4 w-4 shrink-0 text-violet-400" />
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Setor:</span>
      <div className="flex flex-wrap gap-1.5">
        {setores.map(s => (
          <ChipSetor
            key={s.id}
            nome={s.nome}
            ativo={setorFoco === s.id}
            acordos={resumo[s.id]?.acordos ?? 0}
            pedidos={resumo[s.id]?.pedidos ?? 0}
            onClick={() => onEscolher(s.id)}
          />
        ))}
        <ChipSetor
          nome="Todos os setores"
          ativo={setorFoco === null}
          acordos={setores.reduce((s, x) => s + (resumo[x.id]?.acordos ?? 0), 0)}
          pedidos={pedidosTotais}
          onClick={() => onEscolher(null)}
        />
      </div>
    </div>
  );
}

function ChipSetor({
  nome, ativo, acordos, pedidos, onClick,
}: {
  nome: string; ativo: boolean; acordos: number; pedidos: number; onClick: () => void;
}) {
  const titulo = [
    `${acordos} acordo${acordos === 1 ? '' : 's'} no mês`,
    pedidos > 0
      ? `${pedidos} NR duplicado${pedidos === 1 ? '' : 's'} esperando decisão`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${nome} — ${titulo}`}
      aria-pressed={ativo}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        ativo
          ? 'border-violet-500 bg-violet-500 text-white'
          : 'border-border bg-background text-muted-foreground hover:border-violet-500/50 hover:text-foreground',
      )}
    >
      <span className="truncate">{nome}</span>
      <span className={cn(
        'tabular-nums text-[10.5px]',
        ativo ? 'text-white/75' : 'text-muted-foreground/70',
      )}>
        {acordos}
      </span>
      {/* O ponto âmbar é fila parada, e por isso não é um número dentro do
          chip: ele tem de saltar mesmo no chip que não está ativo. */}
      {pedidos > 0 && (
        <span
          aria-label={`${pedidos} NR duplicado aguardando`}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
        />
      )}
    </button>
  );
}
