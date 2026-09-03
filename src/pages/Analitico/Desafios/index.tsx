/**
 * AbaDesafios — a aba de gincanas dentro do Analítico, versão 2.0.
 *
 * ## As três telas, e uma só aba
 *
 *   catálogo → detalhe da campanha → configuração
 *
 * Nenhuma delas é uma rota nova. A aba troca o que desenha, e voltar devolve o
 * catálogo com a rolagem onde estava. É a mesma decisão do Desempenho do Dia
 * feita ao contrário: aquilo é consultado NO MEIO de outra tarefa e por isso
 * flutua; isto É a tarefa, e por isso ocupa a tela.
 *
 * ## O que mudou em relação à versão 1
 *
 * Antes a aba abria dentro da campanha ativa — o que funcionava com uma
 * campanha no ar e desmoronava com cinco: o resto virava uma lista de linhas
 * no rodapé. Agora ela abre no catálogo, um card por campanha, e entrar é um
 * clique.
 *
 * A configuração deixou de ser janela flutuante pelo mesmo motivo: com setores
 * de duas empresas, cargos, exclusões nominais e prêmio por colocação, um
 * diálogo de 600 px seria um formulário rolando dentro de uma página rolando.
 *
 * ## Quem enxerga o quê
 *
 * Esta tela não decide. As quatro chaves `desafios_escopo_*` são lidas pela
 * RLS (`fn_desafio_no_meu_alcance`, migration 20260903500000), e o que chega
 * em `useDesafios` já vem recortado. O que a tela faz com elas é explicar o
 * recorte para quem está olhando — uma lista curta sem explicação se lê como
 * defeito.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { fetchEmpresasLiberadas } from '@/services/empresas.service';
import { useDesafios, useResultadoDesafio, useSetoresDoDesafio } from '@/hooks/useDesafios';
import { estiloDaCampanha } from './tema';
import type { Desafio } from '@/services/desafios/types';
import { CatalogoDesafios } from './CatalogoDesafios';
import { DesafioHero } from './DesafioHero';
import { IndicadoresDesafio } from './IndicadoresDesafio';
import { MeuDesafio } from './MeuDesafio';
import { MetaConquistada } from './MetaConquistada';
import { PaginaDesafio } from './PaginaDesafio';
import { PodioDesafio } from './PodioDesafio';
import { RankingDesafio } from './RankingDesafio';
import { RankingEquipes } from './RankingEquipes';
import { SetoresDoDesafio, type SetorSimples } from './SetoresDoDesafio';

export interface AbaDesafiosProps {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  /**
   * Setor escolhido na régua do Analítico, para quem tem `todos_setores`.
   * `null` = a campanha inteira, como configurada.
   */
  filtroSetorId?: string | null;
  /** Perfil de liderança: as equipes vêm antes da corrida pessoal. */
  priorizarEquipes?: boolean;
  /**
   * Setor do cadastro de quem está olhando.
   *
   * Só é lido quando a campanha diz `escopoDisputa = 'setor'`, e como plano B:
   * o setor bom é o que o servidor resolveu na lista de participantes.
   */
  setorProprio?: string | null;
  /**
   * `desafios_configurar` — configura qualquer campanha, inclusive as da
   * empresa inteira. Decide o botão; quem decide a gravação é a RLS.
   */
  podeConfigurar?: boolean;
  /**
   * `desafios_configurar_setor` — líder e gerente montam a campanha do próprio
   * setor. O seletor de setor some e a campanha nasce presa ao setor deles.
   */
  podeConfigurarSetor?: boolean;
  /**
   * `administrar_sistema` — decide o painel de setores. O super_admin passa
   * pela própria política do banco, com ou sem a chave.
   */
  podeAdministrar?: boolean;
  /** Setores da empresa, já na ordem escolhida na aba Setores. */
  setores?: SetorSimples[];
}

/** O que a aba está desenhando agora. */
type Vista =
  | { modo: 'catalogo' }
  | { modo: 'detalhe'; desafio: Desafio }
  | { modo: 'config'; desafio: Desafio | null };

function EsqueletoDesafio() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
      </div>
      {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );
}

function EsqueletoCatalogo() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-72 rounded-xl" />)}
    </div>
  );
}

/**
 * Uma frase que explica o recorte de quem está olhando.
 *
 * Sem ela, um operador que vê duas campanhas de doze conclui que o sistema
 * está escondendo coisa. Com ela, sabe qual é a régua — e a quem pedir mais.
 */
function frasedoEscopo(
  vejoTudo: boolean, vejoSetor: boolean, vejoEquipe: boolean,
): string {
  if (vejoTudo)   return 'Você enxerga as campanhas de todos os setores.';
  if (vejoSetor)  return 'Você enxerga as campanhas que alcançam o seu setor.';
  if (vejoEquipe) return 'Você enxerga as campanhas que alcançam a sua equipe.';
  return 'Você enxerga as campanhas em que está disputando.';
}

export function AbaDesafios({
  empresaId, operadorId, operadorNome, filtroSetorId = null, setorProprio = null,
  priorizarEquipes = false, podeConfigurar = false, podeConfigurarSetor = false,
  podeAdministrar = false, setores = [],
}: AbaDesafiosProps) {
  const { temPermissao } = useCargoPermissoes();

  // Quem só alcança o próprio setor vê o mesmo botão; o que muda é o alcance
  // do que ele grava, e disso quem cuida é a RLS.
  const podeAbrirConfiguracao = podeConfigurar || (podeConfigurarSetor && !!setorProprio);
  const restritoAoSetor = !podeConfigurar && podeConfigurarSetor ? setorProprio : null;

  const podeExcluir     = temPermissao('desafios_excluir') || temPermissao('administrar_sistema');
  const podeMultiempresa = temPermissao('desafios_multiempresa');

  // As quatro chaves de alcance. Quem RECORTA é a RLS; aqui elas só explicam.
  const vejoTudo   = temPermissao('desafios_escopo_todos_setores');
  const vejoSetor  = temPermissao('desafios_escopo_setor');
  const vejoEquipe = temPermissao('desafios_escopo_equipe');
  const vejoMeus   = temPermissao('desafios_escopo_individual');

  const { desafios, encerrados, rascunhos, carregando, dbAtiva, erro, recarregar } =
    useDesafios(true);

  const [vista, setVista] = useState<Vista>({ modo: 'catalogo' });

  const ativos = useMemo(
    () => desafios.filter(d => d.status === 'ativo'),
    [desafios],
  );

  /*
   * Os nomes das empresas, só quando alguma campanha cruza operações.
   *
   * O card precisa deles para escrever «Book Play · Pague Play» no rodapé, e
   * essa é a única razão de a lista existir aqui. Buscar sempre pagaria uma
   * consulta em toda visita à aba para escrever uma legenda que, na maioria
   * das operações, nem aparece.
   */
  const temCampanhaCruzada = useMemo(
    () => desafios.some(d => d.empresas.length > 1),
    [desafios],
  );

  const { data: empresasLiberadas } = useQuery({
    queryKey: ['desafios-empresas-nome'],
    enabled:  temCampanhaCruzada,
    queryFn:  fetchEmpresasLiberadas,
    staleTime: 30 * 60 * 1000,
  });

  const nomeDaEmpresa = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const e of empresasLiberadas ?? []) mapa[e.id] = e.nome;
    return mapa;
  }, [empresasLiberadas]);

  /*
   * A campanha aberta.
   *
   * Relida da lista a cada render — e não guardada no estado — para que uma
   * edição, ou um evento de tempo real, apareça na tela aberta sem que ninguém
   * precise voltar ao catálogo e entrar de novo.
   */
  const aberta = useMemo(() => {
    if (vista.modo !== 'detalhe') return null;
    return desafios.find(d => d.id === vista.desafio.id) ?? vista.desafio;
  }, [vista, desafios]);

  const { resultado, carregando: calculando } = useResultadoDesafio(aberta, {
    filtroSetorId, operadorId, setorDeCadastro: setorProprio,
  });

  // O painel de setores só é buscado por quem pode mexer nele — a régua de
  // abas já consulta o mesmo mapa pelo seu lado, e o React Query compartilha.
  const setoresDoDesafio = useSetoresDoDesafio(podeAdministrar, operadorId);

  const tema = useMemo(
    () => estiloDaCampanha(aberta?.visual ?? {
      tema: 'padrao', icone: 'trophy', mostrarFotos: true,
      animarUltrapassagem: true, comemorarMeta: true,
      acento: null, midiaNoCard: true, fixarNoMenu: true,
    }),
    [aberta?.visual],
  );

  const eu = useMemo(
    () => resultado?.individual.find(i => i.pessoa.id === operadorId) ?? null,
    [resultado, operadorId],
  );

  /*
   * Quantas pessoas cada card anuncia.
   *
   * Só a campanha ABERTA tem quadro calculado — buscar o de doze campanhas
   * para pintar doze rodapés seriam doze idas ao banco. O card das outras
   * mostra o nome do modelo, que é informação verdadeira e de graça.
   */
  const participantesPorDesafio = useMemo(() => {
    if (!aberta || !resultado) return {};
    return { [aberta.id]: resultado.totalParticipantes };
  }, [aberta, resultado]);

  const voltarAoCatalogo = useCallback(() => setVista({ modo: 'catalogo' }), []);

  // ── Migration pendente ────────────────────────────────────────────────────
  if (!dbAtiva) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        O módulo de Desafios ainda não foi aplicado no banco desta empresa.
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Não foi possível carregar os desafios: {erro}
      </div>
    );
  }

  // ── Configuração ──────────────────────────────────────────────────────────
  if (vista.modo === 'config') {
    return (
      <PaginaDesafio
        desafio={vista.desafio}
        empresaId={empresaId}
        autorId={operadorId}
        autorNome={operadorNome}
        podeMultiempresa={podeMultiempresa}
        podeExcluir={podeExcluir}
        restritoAoSetor={restritoAoSetor}
        onVoltar={() => {
          // Editar uma campanha volta para ela; criar volta para o catálogo.
          setVista(vista.desafio ? { modo: 'detalhe', desafio: vista.desafio } : { modo: 'catalogo' });
        }}
        onSalvo={() => { void recarregar(); voltarAoCatalogo(); }}
      />
    );
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────
  if (vista.modo === 'catalogo') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {frasedoEscopo(vejoTudo, vejoSetor, vejoEquipe)}
            {!vejoTudo && !vejoSetor && !vejoEquipe && !vejoMeus
              && ' Nenhum alcance de Desafios está liberado para o seu cargo.'}
          </p>
          {podeAbrirConfiguracao && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setVista({ modo: 'config', desafio: null })}
            >
              <Plus className="h-3.5 w-3.5" /> Novo desafio
            </Button>
          )}
        </div>

        {carregando ? (
          <EsqueletoCatalogo />
        ) : (
          <CatalogoDesafios
            ativos={ativos}
            rascunhos={rascunhos}
            encerrados={encerrados}
            participantesPorDesafio={participantesPorDesafio}
            nomeDaEmpresa={nomeDaEmpresa}
            podeCriar={podeAbrirConfiguracao}
            onAbrir={desafio => setVista({ modo: 'detalhe', desafio })}
            onCriar={() => setVista({ modo: 'config', desafio: null })}
          />
        )}

        {podeAdministrar && setores.length > 0 && (
          <SetoresDoDesafio
            setores={setores}
            porSetor={setoresDoDesafio.porSetor}
            dbAtiva={setoresDoDesafio.dbAtiva}
            onDefinir={setoresDoDesafio.definir}
          />
        )}
      </div>
    );
  }

  // ── Detalhe de uma campanha ───────────────────────────────────────────────
  if (!aberta) return <EsqueletoDesafio />;

  const semParticipantes = !!resultado && resultado.totalParticipantes === 0;
  const top3  = resultado?.individual.slice(0, 3) ?? [];
  const resto = resultado?.individual.slice(3)   ?? [];

  const secaoEquipes = aberta.regra.modo.includes('equipe') && resultado
    && resultado.equipes.length > 0 && (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Disputa entre equipes</h3>
      <RankingEquipes
        equipes={resultado.equipes}
        tema={tema}
        mostrarFotos={aberta.visual.mostrarFotos}
        animar={aberta.visual.animarUltrapassagem}
        voceId={operadorId}
      />
    </section>
  );

  const secaoPessoal = eu && aberta.regra.modo.includes('individual') && resultado && (
    <MeuDesafio
      item={eu}
      tema={tema}
      mostrarFotos={aberta.visual.mostrarFotos}
      totalParticipantes={resultado.totalParticipantes}
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={voltarAoCatalogo} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Catálogo
        </Button>
        {podeAbrirConfiguracao && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setVista({ modo: 'config', desafio: aberta })}
          >
            <Settings2 className="h-3.5 w-3.5" /> Configurar
          </Button>
        )}
      </div>

      <DesafioHero
        desafio={aberta}
        totalRecebido={resultado?.totalRecebido ?? 0}
        totalParticipantes={resultado?.totalParticipantes ?? 0}
        totalEquipes={resultado?.totalEquipes ?? 0}
        progressoColetivo={resultado?.progressoColetivo ?? 0}
        carregando={calculando}
      />

      {calculando && !resultado && <EsqueletoDesafio />}

      {resultado && semParticipantes && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum participante neste recorte.
          {filtroSetorId && ' Tente limpar o filtro de setor.'}
        </div>
      )}

      {resultado && !semParticipantes && (
        <>
          <IndicadoresDesafio resultado={resultado} tema={tema} carregando={calculando} />

          {priorizarEquipes && secaoEquipes}
          {!priorizarEquipes && secaoPessoal}

          {aberta.regra.modo.includes('individual') && (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {aberta.regra.premios.length ? 'Quem está levando' : 'Top 3'}
                </h3>
                <PodioDesafio
                  top3={top3}
                  tema={tema}
                  mostrarFotos={aberta.visual.mostrarFotos}
                  animar={aberta.visual.animarUltrapassagem}
                  voceId={operadorId}
                />
              </section>

              {/* A premiação por colocação, casada com quem está nela agora. */}
              {aberta.regra.premios.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Premiação</h3>
                  <ul className="space-y-1">
                    {aberta.regra.premios.map(p => {
                      const dono = resultado.individual.find(i => i.posicao === p.posicao);
                      return (
                        <li
                          key={p.posicao}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs"
                        >
                          <span className="w-8 flex-shrink-0 font-semibold text-muted-foreground">
                            {p.posicao}º
                          </span>
                          <span className="flex-1 truncate text-foreground">
                            {p.icone ? `${p.icone} ` : ''}{p.premio}
                          </span>
                          <span className="max-w-[12rem] truncate text-muted-foreground">
                            {dono?.pessoa.nome ?? 'em aberto'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {resto.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Ranking completo</h3>
                  <RankingDesafio
                    lista={resto}
                    tema={tema}
                    mostrarFotos={aberta.visual.mostrarFotos}
                    animar={aberta.visual.animarUltrapassagem}
                    voceId={operadorId}
                  />
                </section>
              )}
            </>
          )}

          {priorizarEquipes && secaoPessoal}
          {!priorizarEquipes && secaoEquipes}
        </>
      )}

      <MetaConquistada
        nome={eu?.pessoa.nome ?? null}
        valor={eu?.recebido ?? 0}
        bateu={!!eu?.bateuMeta}
        campanha={aberta.nome}
        premio={aberta.premio}
        tema={tema}
        chave={`${aberta.id}::${operadorId}`}
        habilitado={aberta.visual.comemorarMeta}
      />
    </div>
  );
}

export default AbaDesafios;
