/**
 * FiltroEscopo — o recorte do Dashboard, num controle só.
 *
 * ## O que havia antes
 *
 * Dois filtros, em lugares diferentes da tela e sem conversa entre si:
 *
 *   • "Visualizar:" — setor geral / equipes / individual, no cabeçalho, visível
 *     só para `lider` e `elite`;
 *   • "Filtrar setor:" — pílulas de setor, acima do painel, visível só para
 *     `administrador` e `super_admin`.
 *
 * Isso produzia três defeitos de uma vez:
 *
 *   1. **A diretoria não tinha filtro nenhum.** Ela carregava a lista de
 *      setores e nunca via o controle: enxergava todos os setores sem como
 *      estreitar.
 *   2. **As equipes não seguiam o setor.** Com alcance amplo, a lista trazia as
 *      equipes da empresa inteira. Escolher o setor B e depois uma equipe do
 *      setor A cruzava dois recortes impossíveis e devolvia tela vazia —
 *      parecendo "não há dados" quando o filtro é que era contraditório.
 *   3. **Quem podia o quê saía de listas de cargo escritas à mão**, que
 *      discordavam das permissões configuradas.
 *
 * ## O desenho agora
 *
 * O mesmo controle para TODOS os cargos — o que muda de um para outro é só até
 * onde ele alcança, e isso sai dos níveis da aba, não de lista de cargo:
 *
 *   Minha visão · Minha equipe · Meu setor   ← a régua, sempre em cima
 *   Setor   → só para quem enxerga mais de um setor (`todos_setores`)
 *   Equipe  → só com UM setor em foco, e só as equipes DAQUELE setor
 *
 * Duas regras de cascata, e as duas são o mesmo princípio — não oferecer um
 * recorte que não tem resposta:
 *
 *   • "Todos os setores" esconde a linha de equipe, porque «equipe de qual
 *     setor?» não tem resposta;
 *   • «Minha visão» esconde setor e equipe, porque o recorte já é uma pessoa
 *     só — um filtro de setor por cima dele não teria o que fazer.
 *
 * ## Por que a régua de três, e não o interruptor
 *
 * O individual já foi uma linha «Pessoa» com dois chips, e depois um
 * interruptor «Só os meus números». O interruptor respondia bem a UMA pergunta
 * — ligado ou desligado — e escondia a que importa: *desligado mostra o quê?*
 * A resposta era «o que estiver valendo em setor/equipe», que a pessoa tinha de
 * ir conferir nas linhas de baixo. Quem olhava a tela de longe não sabia dizer
 * em que altura estava.
 *
 * Agora a altura é o próprio controle, e ela é uma escada de três degraus na
 * ordem em que se sobe:
 *
 *   Minha visão  → só o próprio (`individual`)
 *   Minha equipe → a equipe do cadastro (`equipe:<id>`)
 *   Meu setor    → o setor inteiro (`setor`)
 *
 * Cada degrau exige o nível correspondente, e «Minha equipe» exige também que
 * a pessoa TENHA equipe no cadastro — um degrau que não leva a lugar nenhum é
 * pior que degrau nenhum. Sobrando um só, a régua inteira some: uma opção não
 * é escolha, é a descrição do que a pessoa já está vendo.
 *
 * O tipo `VisaoEscopo` não mudou. «Minha equipe» é o mesmo `equipe:<id>` que os
 * chips de baixo produzem, e por isso nada a jusante — `useAnalytics`,
 * `useAcordos`, o `AnalyticsPanel` — precisou saber que esta régua existe.
 */

import { Building2, Layers, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NivelEscopo } from '@/lib/permissoes-escopo';
import type { SetorResumo, EquipeResumo } from '@/hooks/useSetoresEquipes';

/** O que a tela mostra hoje. `equipe:<id>` guarda a equipe escolhida. */
export type VisaoEscopo = 'setor' | 'individual' | `equipe:${string}`;

interface Props {
  /** Níveis que este cargo pode escolher no Dashboard. */
  niveis: readonly NivelEscopo[];
  setores: readonly SetorResumo[];
  /** Setor escolhido. `null` = todos os setores. */
  setorFiltro: string | null;
  onSetor: (id: string | null) => void;
  /** Equipes do setor em foco — já recortadas por quem chama. */
  equipes: readonly EquipeResumo[];
  /**
   * O alcance de equipe cobre TODAS as equipes do setor?
   *
   * `false` esconde o botão «Todas as equipes» — ele É o setor sem recorte, e
   * oferecê-lo a quem foi limitado à própria equipe desfaz o limite com um
   * clique.
   */
  podeTodasEquipes: boolean;
  visao: VisaoEscopo;
  onVisao: (v: VisaoEscopo) => void;
  /** Setor do próprio perfil, para quem não escolhe. */
  setorDoPerfil: string | null;
  /**
   * Equipe do próprio perfil — o destino do degrau «Minha equipe».
   *
   * `null` esconde o degrau. Não é um caso de erro: gente sem equipe no
   * cadastro existe, e para ela o degrau não teria para onde apontar.
   */
  equipeDoPerfil: string | null;
}

export function FiltroEscopo({
  niveis, setores, setorFiltro, onSetor, equipes, podeTodasEquipes,
  visao, onVisao, setorDoPerfil, equipeDoPerfil,
}: Props) {
  const podeEscolherSetor = niveis.includes('todos_setores');
  const podeEquipe = niveis.includes('equipe');
  /*
   * «Todas as equipes» é o SETOR sem recorte, e some por dois motivos
   * independentes:
   *
   *   • sem alcance de setor, ele daria num clique a visão que o painel negou;
   *   • com `dashboard_escopo_equipe_todas` desligada, ele desfaz o limite que
   *     a chave acabou de impor — a pessoa foi limitada à própria equipe e o
   *     botão devolveria o setor inteiro.
   *
   * O segundo motivo é pedido explícito: «se essa opção de ver todas as
   * equipes estiver desativada, o botão de todas as equipes deve sumir».
   */
  const mostrarTodasEquipes =
    (niveis.includes('setor') || podeEscolherSetor) && podeTodasEquipes;

  /*
   * Quem escolhe setor usa o escolhido; quem não escolhe fica no próprio. Este
   * valor decide se a linha de equipe faz sentido — e é por isso que "todos os
   * setores" (`null` com escolha possível) a esconde.
   */
  const setorEmFoco = podeEscolherSetor ? setorFiltro : setorDoPerfil;

  const podeVerEquipes = podeEquipe && setorEmFoco !== null && equipes.length > 0;

  /*
   * Os três degraus, na ordem em que se sobe. Cada um só existe com o nível
   * que o autoriza — e «Minha equipe» também precisa de uma equipe para onde
   * apontar.
   */
  const minhaVisaoDisponivel = niveis.includes('individual');
  const minhaEquipeDisponivel = podeEquipe && equipeDoPerfil !== null;
  const meuSetorDisponivel = niveis.includes('setor') || podeEscolherSetor;

  const degraus = [
    minhaVisaoDisponivel && {
      key: 'individual' as const,
      rotulo: 'Minha visão',
      titulo: 'Ver somente os seus números',
      Icone: User,
      alvo: 'individual' as VisaoEscopo,
      ativo: visao === 'individual',
    },
    minhaEquipeDisponivel && {
      key: 'minha_equipe' as const,
      rotulo: 'Minha equipe',
      titulo: 'Ver os números da sua equipe',
      Icone: Layers,
      alvo: `equipe:${equipeDoPerfil}` as VisaoEscopo,
      ativo: visao === `equipe:${equipeDoPerfil}`,
    },
    meuSetorDisponivel && {
      key: 'setor' as const,
      rotulo: 'Meu setor',
      titulo: 'Ver os números consolidados do setor',
      Icone: Building2,
      alvo: 'setor' as VisaoEscopo,
      ativo: visao === 'setor',
    },
  ].filter(Boolean) as {
    key: string; rotulo: string; titulo: string;
    Icone: typeof User; alvo: VisaoEscopo; ativo: boolean;
  }[];

  // Um degrau sozinho não é escada — é a legenda do que a pessoa já vê.
  const mostrarRegua = degraus.length > 1;

  const soOsMeus = visao === 'individual';

  /*
   * Ligado o individual, o recorte JÁ É uma pessoa só.
   *
   * Setor e equipe somem inteiros em vez de ficarem visíveis sem efeito: um
   * filtro aceso que não muda nada na tela é a forma mais rápida de fazer
   * alguém achar que o sistema está errado. Desligar traz os dois de volta com
   * a escolha que estava valendo — o `setorFiltro` não é apagado, só deixa de
   * ser perguntado enquanto o individual manda.
   */
  const mostrarSetores = !soOsMeus && podeEscolherSetor && setores.length > 0;

  /*
   * A linha de equipe repetiria a régua?
   *
   * Quem foi limitado à própria equipe recebe `equipes` já recortado a ela — e
   * sem «Todas as equipes» isso é UM chip, que leva exatamente aonde «Minha
   * equipe» acabou de levar. Duas formas de dar o mesmo clique, uma delas
   * escondida numa segunda linha, é a moldura vazia que o resto deste arquivo
   * evita. A linha volta assim que houver uma equipe a mais para escolher.
   */
  const linhaEquipeRepetiria =
    minhaEquipeDisponivel && !mostrarTodasEquipes
    && equipes.length === 1 && equipes[0].id === equipeDoPerfil;

  const mostrarEquipes = !soOsMeus && podeVerEquipes && !linhaEquipeRepetiria;

  // Nada a oferecer: o controle inteiro some em vez de virar moldura vazia.
  if (!podeEscolherSetor && !podeVerEquipes && !mostrarRegua) return null;

  const equipeAtiva = visao.startsWith('equipe:') ? visao.slice('equipe:'.length) : null;

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 rounded-xl border border-border bg-card"
      data-tour="filtro-escopo"
    >
      {/*
        A régua vem primeiro e sozinha: é ela que decide se as outras duas
        linhas existem, e um controle que governa os de baixo lendo-se depois
        deles obrigaria a percorrer a caixa duas vezes para entender.
      */}
      {mostrarRegua && (
        <div className={cn(
          'flex items-center gap-2 flex-wrap',
          // A divisória só faz sentido quando há algo embaixo para separar.
          (mostrarSetores || mostrarEquipes) && 'border-b border-border pb-2',
        )}>
          <div
            className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/30"
            role="group"
            aria-label="Nível de visualização"
          >
            {degraus.map(({ key, rotulo, titulo, Icone, alvo, ativo }) => (
              <button
                key={key}
                type="button"
                onClick={() => onVisao(alvo)}
                title={titulo}
                aria-pressed={ativo}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  ativo
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icone className="w-3.5 h-3.5 shrink-0" /> {rotulo}
              </button>
            ))}
          </div>
          {soOsMeus && (mostrarSetores || mostrarEquipes || podeEscolherSetor) && (
            <span className="text-[11px] text-muted-foreground">
              Setor e equipe não se aplicam a uma pessoa só.
            </span>
          )}
        </div>
      )}

      {mostrarSetores && (
        <Linha icone={<Building2 className="w-4 h-4 text-muted-foreground shrink-0" />} rotulo="Setor">
          <Chip
            ativo={setorFiltro === null}
            onClick={() => { onSetor(null); onVisao('setor'); }}
            titulo="Ver todos os setores da empresa"
          >
            Todos os setores
          </Chip>
          {setores.map(s => (
            <Chip
              key={s.id}
              ativo={setorFiltro === s.id}
              // Trocar de setor volta a visão para "setor geral": manter a
              // equipe anterior selecionada deixaria um recorte de outro setor
              // vivo, que é o defeito nº 2 do cabeçalho.
              onClick={() => { onSetor(setorFiltro === s.id ? null : s.id); onVisao('setor'); }}
              titulo={`Ver dados do setor ${s.nome}`}
            >
              {s.nome}
            </Chip>
          ))}
        </Linha>
      )}

      {mostrarEquipes && (
        <Linha icone={<Layers className="w-4 h-4 text-muted-foreground shrink-0" />} rotulo="Equipe">
          {mostrarTodasEquipes && (
            <Chip
              ativo={visao === 'setor'}
              onClick={() => onVisao('setor')}
              titulo="Ver o setor inteiro, sem recorte por equipe"
            >
              Todas as equipes
            </Chip>
          )}
          {equipes.map(eq => (
            <Chip
              key={eq.id}
              ativo={equipeAtiva === eq.id}
              /*
               * Clicar na equipe ATIVA desliga o recorte e devolve a visão do
               * setor — o mesmo que o chip de setor já fazia.
               *
               * Sem isto, quem não enxerga o botão «Todas as equipes» entrava
               * na própria equipe e não tinha como sair: a visão de setor é o
               * estado em que a tela ABRE, mas nenhum controle a alcançava de
               * volta. Não é alcance novo — é o estado inicial, que a pessoa já
               * via antes de tocar no filtro.
               */
              onClick={() => onVisao(equipeAtiva === eq.id ? 'setor' : `equipe:${eq.id}`)}
              titulo={equipeAtiva === eq.id
                ? `Sair do recorte da equipe ${eq.nome} e voltar ao setor`
                : `Ver dados da equipe ${eq.nome}`}
            >
              {eq.nome}
            </Chip>
          ))}
        </Linha>
      )}

    </div>
  );
}

function Linha({
  icone, rotulo, children,
}: { icone: React.ReactNode; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {icone}
      <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">{rotulo}:</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  ativo, onClick, titulo, children,
}: { ativo: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
        ativo
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
