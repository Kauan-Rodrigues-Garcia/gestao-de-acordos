import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart2, User, Users, Building2, Layers3, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { getEstadoFromAcordo, getTodayISO, ROUTE_PATHS } from '@/lib/index';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { supabase } from '@/lib/supabase';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useAnalitico } from '@/hooks/useAnalitico';
import { AnaliticoOperador } from '@/pages/Dashboard/Analitico/AnaliticoOperador';
import { AnaliticoLider } from '@/pages/Dashboard/Analitico/AnaliticoLider';
import {
  ModalTabularAnalitico,
  type DadosTabulacaoAnalitico,
  type RespostaTabulacaoAnalitico,
} from '@/pages/Dashboard/Analitico/ModalTabularAnalitico';
import { AbaColchao } from './Colchao';
import { AbaDesafios } from './Desafios';
import { useSetoresDoDesafio } from '@/hooks/useDesafios';
import { useMesGlobal } from '@/providers/MesProvider';
import { ValidacaoRelatorioSetor } from './ValidacaoRelatorioSetor';
import { SeletorRecorte } from './SeletorRecorte';
import { mesDoRecorte, recorteDaQuery, type Recorte } from './recorte';

/** O `Select` do shadcn recusa `value=""`; o "todos" precisa de um valor. */
const TODOS_SETORES = '__todos__';

type AbaPrincipal = 'analitico' | 'colchao' | 'desafios';

export default function PaginaAnalitico() {
  // ── Todos os hooks ANTES de qualquer return condicional ──────────────────
  const { perfil }       = useAuth();
  const { empresa }      = useEmpresa();
  // `carregandoPermissoes` existe só para os avisos de "nada liberado": sem
  // ele, todo mundo veria a mensagem piscar antes do mapa chegar.
  const { temPermissao, loading: carregandoPermissoes } = useCargoPermissoes();
  const tenant           = useTenant();
  const navigate         = useNavigate();

  /*
   * Alcance DESTA aba, e de nenhuma outra.
   *
   * Antes saía de três lugares que discordavam de desenho: as listas de cargo
   * escritas aqui (`isLiderMais` para a visão de setor, `isPerfilAdmin ||
   * isPerfilDiretoria` para o filtro de setor) e a função `veTodosOsSetores`,
   * usada pela importação e pelo Recebimento Diário, que olhava cargo E
   * permissão. Hoje os três concordam por coincidência: nenhum cargo tem
   * `ver_analiticos_global` sem ser cúpula. Bastava alguém ligar essa chave
   * num líder para a régua da aba e a janela de importação passarem a
   * responder coisas diferentes sobre a mesma pessoa, na mesma tela.
   *
   * Agora há uma fonte só, e ela é configurável.
   */
  const niveis            = niveisLiberados('analitico', temPermissao);
  const podeVerIndividual = niveis.includes('individual');
  const podeVerSetor      = niveis.includes('setor');
  const veTodosSetores    = niveis.includes('todos_setores');
  const setorProprio      = perfil?.setor_id ?? null;
  // Validação de relatório. Nasceu como `isPerfilAdmin` — administrador e
  // super_admin, nunca diretoria —, e agora é chave: validar assina que o
  // número está certo, e quem assina é decisão de quem responde pelo dado.
  const podeValidarRelatorio = temPermissao('analitico_validar_relatorio');

  // O alternador de visão só faz sentido para quem tem os DOIS níveis — hoje,
  // o elite. Antes a condição era `perfil === 'elite'` escrita à mão.
  const [visao,         setVisao]         = useState<'individual' | 'geral'>('geral');
  const [filtroSetorId, setFiltroSetorId] = useState<string | null>(null);
  const [setores,       setSetores]       = useState<{ id: string; nome: string }[]>([]);
  const [searchParams] = useSearchParams();
  const [abaPrincipal,  setAbaPrincipal]  = useState<AbaPrincipal>(
    () => {
      const aba = searchParams.get('aba');
      if (aba === 'colchao' || aba === 'desafios') return aba;
      return 'analitico';
    },
  );

  /*
   * A aba Desafios tem DUAS travas, e elas respondem perguntas diferentes: a
   * chave `analitico_sub_desafios` decide por CARGO, e `desafios_setores`
   * decide por SETOR. Um operador do Play 1 e um do Digital têm o mesmo cargo,
   * e a campanha pode ser de um só.
   *
   * Enquanto o mapa não chega, `carregando` segura a decisão: sem isso a aba
   * apareceria e sumiria meio segundo depois, em toda visita.
   */
  const setoresDoDesafio = useSetoresDoDesafio(temPermissao('analitico_sub_desafios'), perfil?.id);
  const desafiosNoMeuSetor = !setoresDoDesafio.carregando
    && setoresDoDesafio.participa(perfil?.setor_id ?? null);

  /*
   * As abas internas, cada uma com a própria chave. Desligar uma não pode
   * mexer nas outras — é o §2 do pedido, aplicado dentro da aba.
   *
   * `extra` é a condição que NÃO é permissão: existir para esta operação, ou
   * haver algo para mostrar. Colchão é conceito da BookPlay — a PaguePlay não
   * separa recebimento fora da meta —, então a aba não existe lá. O
   * interruptor `analitico_sub_colchao` continua no painel de Permissões das
   * duas operações; na PaguePlay ele não tem efeito.
   */
  const abasPrincipais = useMemo(() => ([
    { key: 'analitico', label: 'Analítico', Icon: BarChart2, permissao: 'analitico_sub_analitico', extra: true },
    // A aba "Recebimento diário" virou o recorte Dia da lente, logo abaixo. A
    // chave `analitico_sub_recebimento_diario` continua existindo e continua
    // querendo dizer a mesma coisa — ela agora libera o recorte, não uma aba.
    { key: 'colchao',   label: 'Colchão',   Icon: Layers3,   permissao: 'analitico_sub_colchao', extra: !tenant.isPaguePlay },
    { key: 'desafios',  label: 'Desafios',  Icon: Trophy,    permissao: 'analitico_sub_desafios', extra: desafiosNoMeuSetor },
  ] as const).filter(a => a.extra && temPermissao(a.permissao)),
  [temPermissao, desafiosNoMeuSetor, tenant.isPaguePlay]);

  /*
   * A aba que a tela realmente mostra.
   *
   * Sem isto, desligar uma aba interna tiraria o BOTÃO da régua e deixaria o
   * CONTEÚDO dela no ar sempre que ela fosse a aba de entrada — pelo padrão
   * `'analitico'` ou pelo `?aba=` da notificação de importação. Esconder o
   * botão e servir o conteúdo é o oposto do que a permissão promete.
   *
   * Derivado, não um `useEffect`: nada a sincronizar, nada a piscar.
   */
  const abaVisivel = abasPrincipais.some(a => a.key === abaPrincipal)
    ? abaPrincipal
    : (abasPrincipais[0]?.key ?? null);

  /*
   * A régua, já tipada.
   *
   * O tipo vem daqui e NÃO de `<AbasSegmentadas<AbaPrincipal>>`: o
   * `lovable-tagger`, que só roda em dev, injeta atributos logo depois do nome
   * do componente e não entende genérico em JSX — vira
   * `<AbasSegmentadas data-lov-id="…"<AbaPrincipal>` e o SWC recusa. O
   * typecheck e o build passam; só o servidor de dev quebra.
   */
  const abasDaRegua: AbaSegmentada<AbaPrincipal>[] = abasPrincipais.map(
    ({ key, label, Icon }) => ({ key, label, Icon }),
  );

  /*
   * O mês do sistema inteiro (`MesProvider`). Era um estado local montado com
   * `new Date()` — dois defeitos num só: sumia ao trocar de página e usava o
   * fuso da MÁQUINA, então das 21h do dia 31 em diante a tela já virava o mês
   * antes da empresa.
   */
  const { mes: mesFiltro, setMes: setMesFiltro } = useMesGlobal();

  /*
   * O recorte — a "lente" desta tela.
   *
   * Ele nasce da URL ou do mês do provider. `?aba=diario` é o link das
   * notificações de importação do diário já enviadas: ele não pode quebrar, e
   * `recorteDaQuery` o traduz para o recorte de dia.
   */
  const [recorte, setRecorteInterno] = useState<Recorte>(
    () => recorteDaQuery(searchParams, getTodayISO()) ?? { modo: 'mes', mes: mesFiltro },
  );

  /*
   * Trocar de recorte devolve o mês ao provider. Sem isto, olhar agosto aqui e
   * ir para o Painel Líder voltaria para setembro.
   */
  const setRecorte = useCallback((r: Recorte) => {
    setRecorteInterno(r);
    const m = mesDoRecorte(r);
    if (m !== mesFiltro) setMesFiltro(m);
  }, [mesFiltro, setMesFiltro]);

  const mesDaLente = mesDoRecorte(recorte);

  // Clicar noutra notificação já estando na página só troca a query; o estado
  // inicial não roda de novo, então aba e recorte precisam acompanhar.
  const abaDaUrl = searchParams.get('aba');
  useEffect(() => {
    if (abaDaUrl === 'diario') {
      setAbaPrincipal('analitico');
      const r = recorteDaQuery(searchParams, getTodayISO());
      if (r) setRecorte(r);
      return;
    }
    if (abaDaUrl === 'analitico') setAbaPrincipal('analitico');
    if (abaDaUrl === 'colchao')   setAbaPrincipal('colchao');
    if (abaDaUrl === 'desafios')  setAbaPrincipal('desafios');
  }, [abaDaUrl, searchParams, setRecorte]);

  // PP: janela que completa parcelamento/estado antes de abrir o Novo Acordo
  const [tabularPendente, setTabularPendente] = useState<{
    dados: DadosTabulacaoAnalitico;
    profissionalId: string | null;
    estadoConhecido: string | null;
  } | null>(null);

  /*
   * Quem tem um nível só não escolhe nada: o único que ele tem é o que vale, e
   * o estado `visao` fica inerte. Escrito assim de propósito — enquanto as
   * permissões carregam nenhum nível está liberado, e a tela não renderiza a
   * visão errada para corrigi-la um instante depois.
   */
  const podeAlternarVisao      = podeVerIndividual && podeVerSetor;
  const mostrarVisaoGeral      = podeVerSetor && (visao === 'geral' || !podeVerIndividual);
  const mostrarVisaoIndividual = podeVerIndividual && (visao === 'individual' || !podeVerSetor);

  // Somente operadores e elite-individual carregam seus próprios dados upfront
  const { dados: dadosProprios, loading: loadingProprios, novosCount, refetch: refetchProprios } = useAnalitico({
    mes: mesDaLente,
    operadorFiltro: perfil?.id ?? undefined,
  });

  const refetchOperador = useCallback(() => {
    void refetchProprios();
  }, [refetchProprios]);

  useEffect(() => {
    if (!empresa?.id) return;
    supabase
      .from('setores')
      .select('id, nome')
      .eq('empresa_id', empresa.id)
      .order('nome')
      // Ordem escolhida na aba Setores (o `order('nome')` vira o desempate).
      .then(({ data }) => setSetores(
        aplicarOrdemSetores((data as { id: string; nome: string }[]) ?? [], empresa.id),
      ));
  }, [empresa?.id]);

  // ── Guards (após todos os hooks) ─────────────────────────────────────────
  // Disponível para PaguePlay e BookPlay (ambas usam a aba Analítico).
  if (tenant.slug !== 'pagueplay' && tenant.slug !== 'bookplay') {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Esta seção não está disponível para esta empresa.
      </div>
    );
  }

  if (!empresa?.id || !perfil?.id) return null;

  const liderId = perfil?.lider_id ?? null;

  function onAbrirNovoAcordo(dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
    dataPagamento?: string;
  }) {
    if (!tenant.isPaguePlay) {
      // BookPlay: o "código" do relatório é o NR; pré-preenche o rascunho BP
      // e abre a aba Novo Acordo (que renderiza o mesmo AcordoNovoInline).
      const storageKey = `acordo-inline-draft::${empresa!.id}::${perfil!.id}::bp`;
      const draft: Record<string, string> = {
        nrCliente:   dados.instituicao,
        nomeCliente: dados.nomeCliente,
        tipo:        dados.forma === 'cartao' ? 'cartao' : 'boleto',
        valorStr:    dados.valor.toFixed(2).replace('.', ','),
      };
      if (dados.dataPagamento) draft['vencimento'] = dados.dataPagamento;
      try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* noop */ }
      navigate(ROUTE_PATHS.ACORDO_NOVO);
      return;
    }
    // PaguePlay: o relatório não traz o parcelamento (boleto/Pix vem com o
    // valor DA PARCELA) e pode faltar o estado. Verifica o profissional e,
    // se necessário, abre a janela de perguntas antes de montar o rascunho.
    void (async () => {
      const codigo = dados.instituicao.trim();
      // 1) Cadastro de profissionais (limit(1) — maybeSingle erra com duplicatas)
      const { data: profs } = await supabase
        .from('profissionais')
        .select('id, estado_uf')
        .eq('empresa_id', empresa!.id)
        .eq('codigo', codigo)
        .limit(1);
      const prof = profs?.[0] ?? null;
      let estadoConhecido = (prof?.estado_uf ?? '').trim() || null;

      // 2) Fallback: estado registrado em acordos anteriores deste código
      //    (coluna estado_uf ou o prefixo [ESTADO:XX] em observações)
      if (!estadoConhecido) {
        const { data: acs } = await supabase
          .from('acordos')
          .select('estado_uf, observacoes')
          .eq('empresa_id', empresa!.id)
          .eq('instituicao', codigo)
          .order('criado_em', { ascending: false })
          .limit(5);
        for (const a of (acs ?? []) as { estado_uf?: string | null; observacoes?: string | null }[]) {
          const uf = (getEstadoFromAcordo(a) ?? '').trim();
          if (uf) { estadoConhecido = uf; break; }
        }
      }

      // Cartão com estado conhecido: nada a perguntar — vai direto, já pago.
      if (dados.forma === 'cartao' && estadoConhecido) {
        montarDraftPP(dados, {
          totalParcelas: 1, parcelaAtual: 1, quarentaPct: false,
          estado: estadoConhecido, valorTotal: dados.valor,
        });
        return;
      }
      setTabularPendente({ dados, profissionalId: prof?.id ?? null, estadoConhecido });
    })();
  }

  /** Monta o rascunho PP (já pago, vencimento na data do analítico) e navega. */
  function montarDraftPP(dados: DadosTabulacaoAnalitico, r: RespostaTabulacaoAnalitico) {
    const storageKey = `acordo-inline-draft::${empresa!.id}::${perfil!.id}::pp`;
    const draft: Record<string, string> = {
      instituicao:     dados.instituicao,
      nomeCliente:     dados.nomeCliente,
      tipo:            dados.forma === 'cartao' ? 'cartao' : 'boleto_pix',
      valorStr:        r.valorTotal.toFixed(2).replace('.', ','),
      parcelasStr:     String(r.totalParcelas),
      parcelaAtualStr: String(r.parcelaAtual),
      quarentaPct:     r.quarentaPct ? '1' : '0',
      status:          'pago',
      analitico:       '1',
    };
    if (r.estado) draft['estadoSel'] = r.estado;
    if (dados.dataPagamento) draft['vencimento'] = dados.dataPagamento;
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* noop */ }
    navigate(ROUTE_PATHS.DASHBOARD + '?novoInline=1');
  }

  async function confirmarTabularAnalitico(r: RespostaTabulacaoAnalitico) {
    if (!tabularPendente) return;
    // `profissionalId` não é mais lido aqui: a RPC resolve sozinha se o cadastro
    // existe, e resolver no banco evita a corrida entre dois operadores.
    const { dados, estadoConhecido } = tabularPendente;
    const estadoFinal = r.estado || estadoConhecido || '';

    // Salva a UF respondida no cadastro do código (próximas tabulações já vêm
    // completas). Vai por RPC porque `profissionais` não aceita escrita direta:
    // é o cadastro canônico do cliente e uma policy de UPDATE aberta deixaria
    // qualquer operador reescrever nome e telefone. A função grava só a UF, e
    // só quando está faltando — migration 20260731b.
    if (r.estado && !estadoConhecido) {
      const { error } = await supabase.rpc('fn_profissional_registrar_uf', {
        p_empresa_id: empresa!.id,
        p_codigo:     dados.instituicao.trim(),
        p_estado_uf:  r.estado,
        p_nome:       dados.nomeCliente || dados.instituicao.trim(),
      });
      // Antes o retorno era ignorado: a RLS recusava, a tela seguia como se
      // tivesse salvo, e a UF digitada era perdida em silêncio — a tabulação
      // seguinte do mesmo cliente perguntava de novo.
      if (error) {
        logger.warn('[Analitico] falha ao salvar a UF do cliente:', error.message);
        toast.warning('Não foi possível salvar o estado no cadastro do cliente. A tabulação segue normalmente.');
      }
    }

    setTabularPendente(null);
    montarDraftPP(dados, { ...r, estado: estadoFinal });
  }

  function onVerAcordo(acordoId: string, codigo?: string) {
    if (!tenant.isPaguePlay) {
      // BookPlay: leva à lista de Acordos filtrando pelo NR
      navigate(ROUTE_PATHS.ACORDOS + (codigo ? '?busca=' + encodeURIComponent(codigo) : ''));
      return;
    }
    const qs = new URLSearchParams({ verAcordo: acordoId });
    if (codigo) qs.set('busca', codigo);
    navigate(ROUTE_PATHS.DASHBOARD + '?' + qs.toString());
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analítico</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Recebimentos do ERP · {tenant.isPaguePlay ? 'PaguePlay' : 'BookPlay'}
              {novosCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  {novosCount} novo{novosCount !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Alternador de visão — para quem tem os dois níveis (hoje, o elite) */}
        {podeAlternarVisao && (
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
            <button
              onClick={() => setVisao('individual')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                visao === 'individual'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <User className="w-3.5 h-3.5" /> Minha visão
            </button>
            <button
              onClick={() => setVisao('geral')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                visao === 'geral'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Users className="w-3.5 h-3.5" /> Visão geral
            </button>
          </div>
        )}
      </div>

      {/* Abas internas: Analítico × Colchão × Desafios */}
      <AbasSegmentadas
        abas={abasDaRegua}
        ativa={abaVisivel}
        onTrocar={(k: AbaPrincipal) => setAbaPrincipal(k)}
        rotulo="Seção do Analítico"
      />

      {/* Nenhuma aba interna liberada: dizer isso é melhor do que uma página
          em branco, que se lê como defeito. */}
      {abaVisivel === null && !carregandoPermissoes && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          Nenhuma aba do Analítico está liberada para o seu cargo.
        </div>
      )}

      {/* A lente + filtro de setor */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* A lente não vale para Desafios: o recorte de lá é o PERÍODO da
            campanha, que pode atravessar a virada do mês. O filtro de setor
            logo abaixo continua valendo — ele é o recorte de quem olha. */}
        {abaVisivel !== 'desafios' && (
          <SeletorRecorte
            recorte={recorte}
            onMudar={setRecorte}
            podeVerDia={temPermissao('analitico_sub_recebimento_diario')}
          />
        )}

        {/* Filtro de setor — para quem tem o nível `todos_setores` nesta aba.
            Quem não tem fica no próprio setor e vê a etiqueta abaixo. */}
        {podeVerSetor && veTodosSetores && setores.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select
              value={filtroSetorId ?? TODOS_SETORES}
              onValueChange={v => setFiltroSetorId(v === TODOS_SETORES ? null : v)}
            >
              <SelectTrigger className="h-8 w-44 rounded-lg text-xs">
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                {/* O `Select` do shadcn recusa `value=""` — daí o sentinela. */}
                <SelectItem value={TODOS_SETORES}>Todos os setores</SelectItem>
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {podeVerSetor && !veTodosSetores && setorProprio && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 border border-border px-3 py-1.5 rounded-lg">
            <Building2 className="w-3.5 h-3.5" />
            {setores.find(s => s.id === setorProprio)?.nome ?? 'Meu setor'}
          </span>
        )}
      </div>

      {/* Validação do relatório (Fase 1) — só administrador/super_admin */}
      {abaVisivel === 'analitico' && podeValidarRelatorio && (
        <ValidacaoRelatorioSetor
          empresaId={empresa.id}
          setorId={veTodosSetores ? filtroSetorId : setorProprio}
          setorNome={setores.find(s => s.id === (veTodosSetores ? filtroSetorId : setorProprio))?.nome ?? ''}
          mes={mesDaLente}
        />
      )}

      {/* Conteúdo por cargo — aba Analítico */}
      {abaVisivel === 'analitico' && mostrarVisaoIndividual && (
        <AnaliticoOperador
          dados={dadosProprios}
          loading={loadingProprios}
          operadorId={perfil.id}
          operadorNome={perfil.nome}
          empresaId={empresa.id}
          recorte={recorte}
          liderId={liderId}
          podeVerRanking={temPermissao('analitico_sub_ranking')}
          onAbrirNovoAcordo={onAbrirNovoAcordo}
          onVerAcordo={onVerAcordo}
          onRefetch={refetchOperador}
        />
      )}

      {abaVisivel === 'analitico' && mostrarVisaoGeral && (
        <AnaliticoLider
          empresaId={empresa.id}
          recorte={recorte}
          setorId={veTodosSetores ? filtroSetorId : setorProprio}
          podeVerTodosSetores={veTodosSetores}
          temPermissaoImportar={temPermissao('importar_analitico')}
          operadorId={perfil.id}
          operadorNome={perfil.nome}
          liderId={liderId}
          onAbrirNovoAcordo={onAbrirNovoAcordo}
          onVerAcordo={onVerAcordo}
          onRefetch={refetchOperador}
        />
      )}

      {/* Aba aberta e nenhum alcance liberado. Acontece se alguém desligar os
          três níveis mantendo a aba ligada — a régua aparece e o conteúdo não
          teria o que mostrar. Melhor dizer o motivo do que ficar vazio.

          Desafios fica de fora: o placar da gincana não é recortado pelos
          níveis do Analítico, e sim pela própria chave da aba. */}
      {abaVisivel !== null && abaVisivel !== 'desafios' && !carregandoPermissoes
        && !mostrarVisaoGeral && !mostrarVisaoIndividual && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          Nenhum alcance de dados está liberado para o seu cargo no Analítico.
        </div>
      )}

      {/* Conteúdo isolado — nunca participa dos totais do Analítico */}
      {abaVisivel === 'colchao' && (
        <AbaColchao
          empresaId={empresa.id}
          mes={mesDaLente}
          setorId={mostrarVisaoGeral ? (veTodosSetores ? filtroSetorId : setorProprio) : null}
          operadorId={mostrarVisaoIndividual ? perfil.id : null}
        />
      )}

      {/* Desafios — camada de LEITURA sobre os recebimentos que o Analítico já
          conta. Recebe o filtro de setor de quem o tem; o período é o da
          campanha, não o mês da régua acima. */}
      {abaVisivel === 'desafios' && (
        <AbaDesafios
          empresaId={empresa.id}
          operadorId={perfil.id}
          operadorNome={perfil.nome}
          filtroSetorId={veTodosSetores ? filtroSetorId : null}
          setorProprio={setorProprio}
          priorizarEquipes={mostrarVisaoGeral}
          podeConfigurar={temPermissao('desafios_configurar')}
          podeConfigurarSetor={temPermissao('desafios_configurar_setor')}
          podeAdministrar={temPermissao('administrar_sistema')}
          setores={setores}
        />
      )}

      <ModalTabularAnalitico
        aberto={!!tabularPendente}
        dados={tabularPendente?.dados ?? null}
        estadoConhecido={tabularPendente?.estadoConhecido ?? null}
        onConfirm={confirmarTabularAnalitico}
        onClose={() => setTabularPendente(null)}
      />
    </div>
  );
}
