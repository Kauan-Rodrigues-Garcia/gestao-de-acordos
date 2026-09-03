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
 *   [ Só os meus números ]  ← interruptor, sempre em cima e sozinho
 *   Setor   → só para quem enxerga mais de um setor (`todos_setores`)
 *   Equipe  → só com UM setor em foco, e só as equipes DAQUELE setor
 *
 * Duas regras de cascata, e as duas são o mesmo princípio — não oferecer um
 * recorte que não tem resposta:
 *
 *   • "Todos os setores" esconde a linha de equipe, porque «equipe de qual
 *     setor?» não tem resposta;
 *   • o individual LIGADO esconde setor e equipe, porque o recorte já é uma
 *     pessoa só — um filtro de setor por cima dele não teria o que fazer.
 *
 * ## Por que o individual virou interruptor
 *
 * Ele era uma terceira linha, «Pessoa», com dois chips: «Todas as pessoas» e
 * «Só os meus». Era um filtro fingindo ter duas dimensões quando só tem uma —
 * e «Todas as pessoas» precisava de três condições para decidir se aparecia,
 * porque em metade dos casos ele repetia o que a linha de equipe já dizia.
 *
 * Sendo um interruptor a pergunta fica com a forma que ela tem: ligado ou
 * desligado. Desligar devolve o recorte de setor/equipe que estava valendo.
 */

import { Building2, Layers, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
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
}

export function FiltroEscopo({
  niveis, setores, setorFiltro, onSetor, equipes, podeTodasEquipes,
  visao, onVisao, setorDoPerfil,
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
  // Um "individual" sozinho não é escolha — é a única coisa que a pessoa vê.
  const mostrarIndividual = niveis.includes('individual') && niveis.length > 1;

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
  const mostrarEquipes = !soOsMeus && podeVerEquipes;

  // Nada a oferecer: o controle inteiro some em vez de virar moldura vazia.
  if (!podeEscolherSetor && !podeVerEquipes && !mostrarIndividual) return null;

  const equipeAtiva = visao.startsWith('equipe:') ? visao.slice('equipe:'.length) : null;

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3 rounded-xl border border-border bg-card"
      data-tour="filtro-escopo"
    >
      {/*
        O interruptor vem primeiro e sozinho: é ele que decide se as outras
        duas linhas existem, e um controle que governa os de baixo lendo-se
        depois deles obrigaria a percorrer a caixa duas vezes para entender.
      */}
      {mostrarIndividual && (
        <div className={cn(
          'flex items-center gap-2',
          // A divisória só faz sentido quando há algo embaixo para separar.
          (mostrarSetores || mostrarEquipes) && 'border-b border-border pb-2',
        )}>
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <label
            htmlFor="filtro-so-os-meus"
            className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
          >
            Só os meus números
          </label>
          <Switch
            id="filtro-so-os-meus"
            checked={soOsMeus}
            onCheckedChange={ligado => onVisao(ligado ? 'individual' : 'setor')}
            aria-label="Ver apenas os seus próprios números"
          />
          {soOsMeus && (
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
              onClick={() => onVisao(`equipe:${eq.id}`)}
              titulo={`Ver dados da equipe ${eq.nome}`}
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
