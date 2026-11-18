/**
 * AbaEventos — Configurações › Eventos e gincanas (03/11/2026).
 *
 * Todo evento, gincana, tema de época ou disparo para o salão mora aqui, um por
 * vez. Evento novo entra na lista `EVENTOS` e ganha o seu botão — NÃO vai para a
 * aba Geral. A Geral é do que é do sistema (crachá, chat, senha, modelos de
 * mensagem); o que é festa, tema ou disputa é daqui.
 *
 * 18/11/2026: o Tema de Natal, o Quebra-nozes e o Aviso de nascimento, que
 * tinham voltado para a Geral, vieram para cá, e os botões passaram a ficar em
 * grupos (Temas de Natal · Gincanas e disputas · Votações · Avisos para todos).
 * O evento escolhido fica na URL (`?evento=`): recarregar abre no mesmo.
 *
 * Quem decide continua sendo o banco: `fn_corrida_*`, `fn_sirene_*`,
 * `fn_natal_*` e `fn_natal_quebra_nozes_*` só aceitam super_admin,
 * `fn_ranking_quitacao_definir_setor` confere `ranking_quitacao_configurar` e
 * `fn_nascimento_*` decide quem acompanha o aviso (o botão aparece para quem o
 * banco devolve aviso). Esconder o botão é só conveniência.
 */
import { Suspense, lazy, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Flag, Siren, Medal, TrainFront, Vote, ListChecks, Megaphone, Loader2, Gift, Nut, Baby,
  type LucideIcon,
} from 'lucide-react';
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
const VotacaoOpcoesConfig = lazy(() => import('@/components/admin/VotacaoOpcoesConfig'));
const ArtesConfig = lazy(() => import('@/components/admin/ArtesConfig'));
const NatalLiberacaoConfig = lazy(() => import('@/components/admin/NatalLiberacaoConfig'));
const QuebraNozesConfig = lazy(() => import('@/components/admin/QuebraNozesConfig'));
const AvisoNascimentoConfig = lazy(() => import('@/components/admin/AvisoNascimentoConfig'));

interface Props {
  ehSuperAdmin: boolean;
  /** O banco devolveu aviso de nascimento para esta pessoa (`fn_nascimento_painel`). */
  veAvisoNascimento: boolean;
  podeConfigurarRankingQuitacao: boolean;
}

type Grupo = 'natal' | 'gincanas' | 'votacoes' | 'avisos';

const GRUPOS: { id: Grupo; titulo: string }[] = [
  { id: 'natal', titulo: 'Temas de Natal' },
  { id: 'gincanas', titulo: 'Gincanas e disputas' },
  { id: 'votacoes', titulo: 'Votações' },
  { id: 'avisos', titulo: 'Avisos para todos' },
];

interface Evento {
  id: string;
  grupo: Grupo;
  rotulo: string;
  descricao: string;
  icone: LucideIcon;
  visivel: boolean;
  conteudo: ReactNode;
}

export default function AbaEventos({ ehSuperAdmin, veAvisoNascimento, podeConfigurarRankingQuitacao }: Props) {
  const EVENTOS: Evento[] = [
    // ── Temas de Natal ──
    {
      // 09/11/2026: liberar para todos, recolher, e quem já abriu o presente.
      id: 'natal', grupo: 'natal', rotulo: 'Tema de Natal', icone: Gift, visivel: ehSuperAdmin,
      descricao: 'Liberar ou recolher o tema para todos, e quem já abriu o presente em Birigui e em Marília.',
      conteudo: <NatalLiberacaoConfig />,
    },
    {
      // 12/11/2026: as aparições, a chamada das 10h e a agenda do dia.
      id: 'quebra_nozes', grupo: 'natal', rotulo: 'Quebra-nozes', icone: Nut, visivel: ehSuperAdmin,
      descricao: 'Ligar as aparições e a chamada das 10h, ver a agenda do dia e chamar na hora.',
      conteudo: <QuebraNozesConfig />,
    },
    {
      id: 'trem_natal', grupo: 'natal', rotulo: 'Trenzinho de Natal', icone: TrainFront, visivel: ehSuperAdmin,
      descricao: 'Ligado ou em manutenção, e o horário da estação.',
      conteudo: <TremNatalConfig />,
    },
    // ── Gincanas e disputas ──
    {
      id: 'corrida', grupo: 'gincanas', rotulo: NOME_CORRIDA, icone: Flag, visivel: ehSuperAdmin,
      descricao: 'O sorteio em forma de corrida: prêmio, quem corre e quem assiste.',
      conteudo: <CorridaConfig />,
    },
    {
      id: 'ranking_quitacao', grupo: 'gincanas', rotulo: 'Ranking de quitação', icone: Medal,
      visivel: podeConfigurarRankingQuitacao,
      descricao: 'Em que setor aparece, quem disputa (setor ou equipe), o critério, os prêmios e os destaques do mês.',
      conteudo: <RankingQuitacaoConfig />,
    },
    // ── Votações ──
    {
      // Valendo desde 09/11/2026: liberar, encerrar, apurar e liberar o resultado.
      id: 'votacao_lideres', grupo: 'votacoes', rotulo: 'Votação da Liderança', icone: Vote, visivel: ehSuperAdmin,
      descricao: 'Os líderes escolhem o colega de cada categoria: o mais comunicativo, o mais inspirador…',
      conteudo: <VotacaoLideresConfig />,
    },
    {
      // 16/11/2026: a de dezembro, Sorteio de prêmios OU Happy hour no Ibis.
      id: 'votacao_opcoes', grupo: 'votacoes', rotulo: 'Votação de opções', icone: ListChecks, visivel: ehSuperAdmin,
      descricao: 'Uma pergunta com opções (prêmios ou happy hour…) para os setores, equipes ou pessoas que você escolher.',
      conteudo: <VotacaoOpcoesConfig />,
    },
    // ── Avisos para todos ──
    {
      // 17/11/2026: um card (Deu a louca na gerente, Parabéns, Recado, imagem própria) que abre para todos.
      id: 'artes', grupo: 'avisos', rotulo: 'Artes para todos', icone: Megaphone, visivel: ehSuperAdmin,
      descricao: 'Lance um card (parabéns, desafio, recado ou imagem própria) que abre na tela de todo mundo.',
      conteudo: <ArtesConfig />,
    },
    {
      // 18/11/2026: acompanhar quem viu, ler os recadinhos e liberar.
      id: 'aviso_nascimento', grupo: 'avisos', rotulo: 'Aviso de nascimento', icone: Baby, visivel: ehSuperAdmin || veAvisoNascimento,
      descricao: 'A cegonha trazendo a novidade: quem já viu, os recadinhos e liberar ou recolher.',
      conteudo: <AvisoNascimentoConfig mostrarVazio />,
    },
    {
      id: 'sirene', grupo: 'avisos', rotulo: 'Sirene', icone: Siren, visivel: ehSuperAdmin,
      descricao: 'Luz e som por horário, cor, setor e equipe.',
      conteudo: <SireneConfig />,
    },
  ];
  const visiveis = EVENTOS.filter(e => e.visivel);
  const [params, setParams] = useSearchParams();
  const atual = visiveis.find(e => e.id === params.get('evento')) ?? visiveis[0];
  const escolher = (id: string) => setParams(p => {
    const n = new URLSearchParams(p);
    n.set('evento', id);
    return n;
  }, { replace: true });
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
          Temas de época, gincanas, votações e avisos para o salão. Escolha um para configurar.
        </p>
      </div>

      <div className="space-y-3">
        {GRUPOS.map(g => {
          const doGrupo = visiveis.filter(e => e.grupo === g.id);
          if (!doGrupo.length) return null;
          return (
            <section key={g.id} aria-label={g.titulo}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {doGrupo.map(({ id, rotulo, descricao, icone: Icone }) => {
                  const ativo = id === atual.id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => escolher(id)}
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
            </section>
          );
        })}
      </div>

      <div key={atual.id} className="border-t border-border pt-4">
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
