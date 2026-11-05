import { useMarca } from '@/hooks/useMarca';
import { useState, useEffect, useRef } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FormaSaudacao } from '@/components/FormaSaudacao';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useLugarNoMes } from '@/hooks/useLugarNoMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ROUTE_PATHS } from '@/lib/index';
import { useMesGlobal } from '@/providers/MesProvider';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { useSetoresEquipes } from '@/hooks/useSetoresEquipes';
import { useLideroEquipe } from '@/hooks/useLideroEquipe';
import { FiltroEscopo } from './FiltroEscopo';
import { type VisaoFiltro, saudacao } from './helpers';

export default function Dashboard() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const marca = useMarca();

  /*
   * O mês é o do sistema (`MesProvider`), não desta tela: escolher agosto no
   * Dashboard e clicar em Acordos tem que continuar em agosto.
   *
   * Fica ANTES das listas de setor/equipe porque elas dependem dele: desde
   * 03/09/2026 o filtro oferece as equipes DAQUELE mês, e não as de hoje.
   */
  const { mes: mesFiltro } = useMesGlobal();

  // Meu setor e minhas equipes NO MÊS olhado: no mês fechado, os do retrato —
  // quem mudou de lugar vê o mês onde estava (decisão do Cleber, 31/10/2026).
  const lugar = useLugarNoMes(mesFiltro);
  const { principal: equipePrincipal, todas: minhasEquipes } = lugar;

  // Só as LISTAS de setor/equipe. Antes isto vinha de `useAnalytics()`, que
  // varre todos os acordos do mês — e o `AnalyticsPanel` logo abaixo monta o
  // mesmo hook, então a tela fazia a varredura duas vezes. Pior: esta instância
  // rodava sem mês, presa ao corrente, enquanto o painel usa o mês do seletor.
  const {
    setores: setoresList, setorFiltro, setSetorFiltro, equipesDoSetor, niveis,
    podeTodasEquipes,
  } = useSetoresEquipes(mesFiltro);
  // Os quatro testes por cargo que moravam aqui (`isAdmin`, `isLiderOuElite`,
  // `isElite`, `isLider`) decidiam quem via cada filtro. Quem decide agora sao
  // os niveis da aba, resolvidos em `useSetoresEquipes` e lidos por
  // <FiltroEscopo />.

  /*
   * A equipe do cadastro — o destino do degrau «Minha equipe» da régua.
   *
   * `equipe_id` não está no tipo `Perfil` mas vem no `select('*')` do
   * `useAuth`; é a mesma leitura que `useSetoresEquipes` faz para montar «as
   * minhas equipes», e a mesma que o bloco de Direto/Extra faz mais abaixo.
   * Uma pessoa tem uma equipe: clone é empréstimo para outro setor, não uma
   * segunda casa.
   *
   * Declarado AQUI, e não junto do resto dos filtros: o efeito logo abaixo o lê
   * na lista de dependências, que é avaliada durante o render.
   */
  // Líder: a equipe que ele lidera (o cadastro dele é vazio). Quem lidera
  // várias abre na primeira delas. Ver `useLugarNoMes`.
  const equipeDoPerfil = equipePrincipal ?? minhasEquipes[0] ?? null;

  /*
   * Eu respondo por um GRUPO, ou só por mim?
   *
   * Três fontes, e nenhuma delas é o cargo: lidero alguma equipe
   * (`equipe_lideres`), enxergo todos os setores, ou não tenho meta individual.
   * Quem cai numa delas tem a meta do time, e não uma própria — e por isso
   * «Minha visão» é o pior lugar para essa pessoa começar: mostra o pouco que
   * passou pelas mãos dela, e não o que ela veio ver.
   *
   * A terceira é a da gerência: responde pelo setor, não lidera equipe, e o
   * painel pode limitá-la ao próprio setor. Com só as duas primeiras, ela
   * seguia abrindo em «Minha visão». Ver `useLideroEquipe`.
   */
  const {
    lidero, temMetaIndividual, carregando: carregandoLideranca,
  } = useLideroEquipe();
  const respondoPorGrupo =
    lidero || niveis.includes('todos_setores') || !temMetaIndividual;

  /*
   * Onde o Dashboard ABRE: no degrau mais BAIXO que a pessoa alcança.
   *
   * Era sempre 'setor', depois passou a depender do cargo — `contaNoRecebimento`
   * abria no próprio para quem produz recebimento e no setor para quem
   * supervisiona. Duas regras diferentes para a mesma pergunta, e a do cargo
   * discordava do painel: quem configurasse `dashboard_escopo_individual` para
   * um cargo «de supervisão» via a chave ligada e a tela abrindo em outro
   * lugar.
   *
   * Com a régua «Minha visão → Minha equipe → Meu setor» (09/09/2026) a regra
   * fica uma só e sai do próprio desenho: a tela abre no primeiro degrau da
   * escada que a pessoa pode pisar. Quem tem individual abre em Minha visão —
   * o padrão pedido; quem não tem cai para Minha equipe, e só então para Meu
   * setor. Sempre o mais estreito, nunca o mais amplo: abrir no total do setor
   * quem só queria o próprio número é ruído; o contrário é um clique.
   *
   * Não é decisão de acesso. É por onde a tela começa — a régua acima continua
   * oferecendo todos os degraus que o painel liberou.
   */
  const [visaoFiltro, setVisaoFiltro] = useState<VisaoFiltro>('individual');

  /*
   * A tela não pode ABRIR fora do que o painel liberou.
   *
   * O padrão acima é «por onde começar», e ele partia do cargo. Isso deixava um
   * beco sem saída no caso que o painel veio justamente permitir: liberar
   * `dashboard_escopo_setor` para o operador SEM `dashboard_escopo_individual`.
   * A tela abria em «individual» — que aquele cargo já não tem —, e o
   * `<FiltroEscopo />` sumia por não ter duas opções a oferecer. Resultado: a
   * chave ligada no painel, e a pessoa presa nos próprios números, sem um
   * controle na tela para sair. Foi a queixa de 02/09/2026.
   *
   * A correção é uma só regra: individual sem o nível de individual cai no mais
   * amplo que a pessoa TEM. Quem tem o nível continua abrindo nele — não é uma
   * decisão de acesso, é só por onde a tela começa.
   *
   * A descida segue a ordem da régua, de baixo para cima: sem `individual`,
   * tenta «Minha equipe»; sem equipe, «Meu setor». A versão anterior tentava o
   * setor ANTES da equipe, o que dava pelo estado inicial o recorte mais amplo
   * a quem a régua oferece o mais estreito — e mandava para «setor» quem tinha
   * equipe própria, sem motivo.
   *
   * A equipe do cadastro vem primeiro; a primeira da lista é o último recurso,
   * para quem tem alcance de equipe sem equipe própria.
   *
   * ## A abertura é decidida UMA vez — para quem tem «Minha visão» na régua
   *
   * O efeito abaixo roda de novo toda vez que `visaoFiltro` volta a
   * 'individual', e é exatamente o que acontece quando quem responde por um
   * grupo clica em «Minha visão». Sem esta marca, o clique era desfeito no mesmo
   * instante e a pessoa voltava para «Meu setor»: o degrau estava na régua e não
   * levava a lugar nenhum.
   *
   * Para quem NÃO tem o nível individual a marca não vale. Ali 'individual' não
   * é escolha — é o estado inicial que o painel não permite —, e a descida da
   * queixa de 02/09 continua acontecendo sempre.
   */
  const aberturaDecidida = useRef(false);

  useEffect(() => {
    if (niveis.length === 0) return;               // aba fechada: outro guard trata
    if (visaoFiltro !== 'individual') return;
    const temIndividual = niveis.includes('individual');
    if (temIndividual && aberturaDecidida.current) return;
    /*
     * Esperar a resposta sobre liderança.
     *
     * Sem esta linha a tela abriria em «Minha visão», receberia o `lidero` um
     * instante depois e saltaria sozinha para outro degrau. O salto é pior
     * que a espera: quem estava lendo o número vê ele trocar embaixo do dedo.
     */
    if (carregandoLideranca) return;

    /*
     * Quem responde por um grupo abre no degrau mais AMPLO que alcança.
     *
     * O contrário da regra de quem produz, e de propósito. Um líder não tem
     * meta individual — a dele é a do time —, então «Minha visão» lhe mostra
     * ou nada, ou um número muito abaixo do que ele responde. Foi a queixa de
     * 10/09/2026.
     *
     * Setor antes de equipe aqui: há líder com seis equipes espalhadas por
     * quatro setores, e para ele «Minha equipe» — que é a UMA equipe do
     * cadastro — seria um recorte mais estreito que o próprio alcance.
     *
     * O degrau «Minha visão» continua na régua. Isto é por onde a tela ABRE,
     * não o que ela permite: um clique devolve o número próprio a quem quiser.
     */
    if (respondoPorGrupo) {
      if (niveis.includes('setor') || niveis.includes('todos_setores')) {
        aberturaDecidida.current = true;
        setVisaoFiltro('setor');
        return;
      }
      if (niveis.includes('equipe')) {
        const alvo = equipeDoPerfil ?? equipesDoSetor[0]?.id ?? null;
        // Sem alvo, a lista de equipes pode ainda estar chegando: não marca, e
        // o efeito tenta de novo quando ela chegar.
        if (!alvo) return;
        aberturaDecidida.current = true;
        setVisaoFiltro(`equipe:${alvo}`);
        return;
      }
      // Só tem `individual`: é o único degrau que existe, e ele fica.
      aberturaDecidida.current = true;
      return;
    }

    if (temIndividual) {
      aberturaDecidida.current = true;
      return;
    }
    if (niveis.includes('equipe')) {
      const alvo = equipeDoPerfil ?? equipesDoSetor[0]?.id ?? null;
      if (alvo) {
        setVisaoFiltro(`equipe:${alvo}`);
        return;
      }
    }
    if (niveis.includes('setor') || niveis.includes('todos_setores')) {
      setVisaoFiltro('setor');
    }
  }, [niveis, visaoFiltro, equipesDoSetor, equipeDoPerfil,
      respondoPorGrupo, carregandoLideranca]);
  const soOsMeus = visaoFiltro === 'individual';
  const operadorFiltroAtivo = soOsMeus ? (perfil?.id ?? null) : null;

  /*
   * Com «só os meus» ligado, setor e equipe param de valer.
   *
   * O `<FiltroEscopo />` esconde as duas linhas nesse estado, mas esconder não
   * é o mesmo que desligar: `setorFiltro` é estado desta tela e sobrevive ao
   * interruptor. Sem zerar aqui, escolher «Play 5», ligar o individual e ser de
   * outro setor cruzava «só eu» com «setor Play 5» — dois recortes que não se
   * encontram, e o painel devolvia vazio como se a pessoa não tivesse produzido
   * nada no mês.
   *
   * Zerado só na LEITURA: o `setorFiltro` guardado continua lá, então desligar
   * o interruptor devolve o setor que estava escolhido em vez de jogar a pessoa
   * de volta em «todos os setores».
   */
  const setorFiltroAtivo = soOsMeus ? null : setorFiltro;
  const equipeFiltroAtivo = !soOsMeus && visaoFiltro.startsWith('equipe:')
    ? visaoFiltro.replace('equipe:', '')
    : null;

  // Mês fechado: o Direto/Extra que valia NAQUELE mês (retrato) — o painel de indicadores separa por ele.
  const { isAtivoParaUsuario } = useDiretoExtraConfig(mesFiltro);
  const usuarioTemLogicaDiretoExtra = isAtivoParaUsuario(
    perfil?.id ?? '',
    lugar.setorId,
    equipePrincipal,
  );

  const diaSemana    = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const nome = perfil?.nome?.split(' ')[0] || 'Usuário';

  /*
   * Links de antes de 05/11/2026: para a regra Cofen, abrir um acordo era vir
   * para cá (a mesa morava aqui). Agora a mesa é a aba Acordos para as duas
   * regras — quem chega com um desses pedidos é levado para lá, com o resto da
   * busca (o código que o Analítico cola, por exemplo).
   */
  const [searchParams] = useSearchParams();
  const pedidoDeAcordo = ['acordo', 'verAcordo', 'novoInline', 'highlight'].some(p => searchParams.has(p));
  if (pedidoDeAcordo) return <Navigate to={`${ROUTE_PATHS.ACORDOS}?${searchParams.toString()}`} replace />;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {/* O 👋 virou o sólido do CreatorsLab, com as cores do tema e da
              empresa. Ver `FormaSaudacao` para o porquê das cores saírem de
              `--primary` em vez de constante. */}
          <h1 className="flex items-center gap-1.5 text-2xl font-bold text-foreground">
            <span>{saudacao()}, {nome}!</span>
            <FormaSaudacao />
          </h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{diaSemana}, {dataFormatada}</p>
          {empresa && (
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {marca?.nome ?? empresa.nome}
            </p>
          )}
          {/*
           * Aqui ficavam a barra da meta do mês, a posição no ranking e o
           * quartil (o componente `MetaProgressoHeader`). Removidos em
           * 16/08/2026 a pedido: a saudação é a porta de entrada e essas três
           * barras empurravam o resto da tela para baixo, repetindo o que o
           * Painel de Metas já mostra com mais espaço e melhor recorte.
           */}
        </div>
      </div>

      {/* Analytics + setor filter */}
      <div className="mb-6 space-y-2" data-tour="metricas">
        <FiltroEscopo
          niveis={niveis}
          setores={setoresList}
          setorFiltro={setorFiltro}
          onSetor={setSetorFiltro}
          equipes={equipesDoSetor}
          podeTodasEquipes={podeTodasEquipes}
          visao={visaoFiltro}
          onVisao={setVisaoFiltro}
          setorDoPerfil={lugar.setorId}
          equipeDoPerfil={equipeDoPerfil}
        />
        <AnalyticsPanel
          setorFiltro={setorFiltroAtivo}
          equipeFiltroExterno={equipeFiltroAtivo}
          operadorFiltroExterno={operadorFiltroAtivo}
          temLogicaDiretoExtra={usuarioTemLogicaDiretoExtra}
        />
      </div>

      {/* A mesa de acordos é a aba Acordos — para as duas regras desde 05/11/2026. */}
      <div className="flex items-center justify-end text-xs">
        <Button asChild variant="link" size="sm" className="text-xs h-auto p-0">
          <Link to={ROUTE_PATHS.ACORDOS}>Ver todos os acordos ↗</Link>
        </Button>
      </div>
    </div>
  );
}
