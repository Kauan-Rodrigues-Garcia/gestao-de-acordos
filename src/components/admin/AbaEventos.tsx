/**
 * AbaEventos — Configurações › Eventos e gincanas (03/11/2026).
 *
 * Todo evento, gincana ou disparo para o salão mora aqui, um por vez: antes
 * eram cards soltos na aba Geral, entre o crachá e o banco de dados. Evento
 * novo entra na lista `EVENTOS` e ganha o seu botão — não volta para a Geral.
 *
 * Quem decide continua sendo o banco: `fn_corrida_*`, `fn_sirene_*` e
 * `fn_natal_trem_configurar` só aceitam super_admin, e `fn_ranking_quitacao_definir_setor` confere
 * `ranking_quitacao_configurar`. Esconder o botão é só conveniência.
 */
import { Suspense, lazy, useState, type ReactNode } from 'react';
import { Flag, Siren, Medal, TrainFront, Vote, Loader2, type LucideIcon } from 'lucide-react';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { cn } from '@/lib/utils';
import { NOME_CORRIDA } from '@/components/Corrida/nome';

// Cada evento só carrega quando é escolhido (05/11/2026): antes, abrir
// qualquer aba de Configurações baixava Corrida, Sirene, Trem e Votação juntas.
const CorridaConfig = lazy(() => import('@/components/admin/CorridaConfig'));
const SireneConfig = lazy(() => import('@/components/admin/SireneConfig'));
const RankingQuitacaoConfig = lazy(() => import('@/components/admin/RankingQuitacaoConfig'));
const TremNatalConfig = lazy(() => import('@/components/admin/TremNatalConfig'));
const VotacaoLideresConfig = lazy(() => import('@/components/admin/VotacaoLideresConfig'));

interface Props {
  ehSuperAdmin: boolean;
  podeConfigurarRankingQuitacao: boolean;
}

interface Evento {
  id: string;
  rotulo: string;
  descricao: string;
  icone: LucideIcon;
  visivel: boolean;
  conteudo: ReactNode;
}

export default function AbaEventos({ ehSuperAdmin, podeConfigurarRankingQuitacao }: Props) {
  const EVENTOS: Evento[] = [
    {
      id: 'corrida', rotulo: NOME_CORRIDA, icone: Flag, visivel: ehSuperAdmin,
      descricao: 'O sorteio em forma de corrida: prêmio, quem corre e quem assiste.',
      conteudo: <CorridaConfig />,
    },
    {
      id: 'sirene', rotulo: 'Sirene', icone: Siren, visivel: ehSuperAdmin,
      descricao: 'Luz e som por horário, cor, setor e equipe.',
      conteudo: <SireneConfig />,
    },
    {
      // O tema de Natal ainda é prévia do super_admin (`Natal/previa.ts`).
      id: 'trem_natal', rotulo: 'Trenzinho de Natal', icone: TrainFront, visivel: ehSuperAdmin,
      descricao: 'Ligado ou em manutenção, e o horário da estação.',
      conteudo: <TremNatalConfig />,
    },
    {
      id: 'ranking_quitacao', rotulo: 'Ranking de quitação', icone: Medal,
      visivel: podeConfigurarRankingQuitacao,
      descricao: 'Em que setor o ranking aparece e os prêmios do 1º ao 6º.',
      conteudo: <RankingQuitacaoConfig />,
    },
    {
      // Valendo desde 09/11/2026: liberar, encerrar, apurar e liberar o resultado.
      id: 'votacao_lideres', rotulo: 'Votação da Liderança', icone: Vote, visivel: ehSuperAdmin,
      descricao: 'Os líderes escolhem o colega de cada categoria: o mais comunicativo, o mais inspirador…',
      conteudo: <VotacaoLideresConfig />,
    },
  ];
  const visiveis = EVENTOS.filter(e => e.visivel);
  const [escolhido, setEscolhido] = useState(visiveis[0]?.id ?? '');
  const atual = visiveis.find(e => e.id === escolhido) ?? visiveis[0];
  // Monitoramento de uso: nível 2, dentro da aba «Eventos e gincanas».
  useSubAbaUso(atual?.id, 2);

  if (!atual) {
    return <p className="text-sm text-muted-foreground">Nenhum evento liberado para este cargo.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Eventos e gincanas</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cada evento tem o seu espaço. Escolha um para configurar.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map(({ id, rotulo, descricao, icone: Icone }) => {
          const ativo = id === atual.id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setEscolhido(id)}
              aria-pressed={ativo}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                ativo
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40',
              )}
            >
              <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', ativo ? 'text-primary' : 'text-muted-foreground')} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{rotulo}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{descricao}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div key={atual.id}>
        <Suspense fallback={(
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        )}>
          {atual.conteudo}
        </Suspense>
      </div>
    </div>
  );
}
