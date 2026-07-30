import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart2, User, Users, ChevronLeft, ChevronRight, Building2, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import {
  isPerfilAdminOuLider, isPerfilAdmin, isPerfilDiretoria,
  getEstadoFromAcordo, ROUTE_PATHS,
} from '@/lib/index';
import { supabase } from '@/lib/supabase';
import { useAnalitico } from '@/hooks/useAnalitico';
import { AnaliticoOperador } from '@/pages/Dashboard/Analitico/AnaliticoOperador';
import { AnaliticoLider } from '@/pages/Dashboard/Analitico/AnaliticoLider';
import {
  ModalTabularAnalitico,
  type DadosTabulacaoAnalitico,
  type RespostaTabulacaoAnalitico,
} from '@/pages/Dashboard/Analitico/ModalTabularAnalitico';
import { AbaDiario } from './Diario';
import { ValidacaoRelatorioSetor } from './ValidacaoRelatorioSetor';

export default function PaginaAnalitico() {
  // ── Todos os hooks ANTES de qualquer return condicional ──────────────────
  const { perfil }       = useAuth();
  const { empresa }      = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant           = useTenant();
  const navigate         = useNavigate();

  const isElite     = perfil?.perfil === 'elite';
  const isLiderMais = isPerfilAdminOuLider(perfil?.perfil ?? '') || isPerfilDiretoria(perfil?.perfil ?? '');
  const isOperador  = !isLiderMais;

  // Isolamento por setor: líder/elite/gerência enxergam APENAS o próprio setor.
  // Só diretoria e admin/super_admin veem todos os setores (e podem filtrar).
  const veTodosSetores = isPerfilAdmin(perfil?.perfil ?? '') || isPerfilDiretoria(perfil?.perfil ?? '');
  const setorProprio   = perfil?.setor_id ?? null;
  // Validação de relatório (Fase 1): só administrador/super_admin, nunca diretoria.
  const isAdminReal     = isPerfilAdmin(perfil?.perfil ?? '');

  const [visaoElite,    setVisaoElite]    = useState<'individual' | 'geral'>('geral');
  const [filtroSetorId, setFiltroSetorId] = useState<string | null>(null);
  const [setores,       setSetores]       = useState<{ id: string; nome: string }[]>([]);
  // `?aba=diario` abre direto no Recebimento diário. É o destino da notificação
  // de importação do diário — sem isto ela largava o usuário na aba errada.
  const [searchParams] = useSearchParams();
  const [abaPrincipal,  setAbaPrincipal]  = useState<'analitico' | 'diario'>(
    () => (searchParams.get('aba') === 'diario' ? 'diario' : 'analitico'),
  );

  // Clicar em outra notificação de diário já estando na página só troca a query;
  // o estado inicial não roda de novo, então a aba precisa acompanhar.
  const abaDaUrl = searchParams.get('aba');
  useEffect(() => {
    if (abaDaUrl === 'diario')    setAbaPrincipal('diario');
    if (abaDaUrl === 'analitico') setAbaPrincipal('analitico');
  }, [abaDaUrl]);

  const [mesFiltro, setMesFiltro] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // PP: janela que completa parcelamento/estado antes de abrir o Novo Acordo
  const [tabularPendente, setTabularPendente] = useState<{
    dados: DadosTabulacaoAnalitico;
    profissionalId: string | null;
    estadoConhecido: string | null;
  } | null>(null);

  const mostrarVisaoGeral      = (isLiderMais && !isElite) || (isElite && visaoElite === 'geral');
  const mostrarVisaoIndividual = isOperador || (isElite && visaoElite === 'individual');

  // Somente operadores e elite-individual carregam seus próprios dados upfront
  const { dados: dadosProprios, loading: loadingProprios, novosCount, refetch: refetchProprios } = useAnalitico({
    mes: mesFiltro,
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
      .then(({ data }) => setSetores((data as { id: string; nome: string }[]) ?? []));
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
    const { dados, profissionalId, estadoConhecido } = tabularPendente;
    const estadoFinal = r.estado || estadoConhecido || '';

    // Salva a UF respondida no cadastro do código (próximas tabulações já vêm completas)
    if (r.estado && !estadoConhecido) {
      if (profissionalId) {
        await supabase.from('profissionais').update({ estado_uf: r.estado }).eq('id', profissionalId);
      } else {
        await supabase.from('profissionais').insert({
          empresa_id: empresa!.id,
          codigo:     dados.instituicao.trim(),
          nome:       dados.nomeCliente || dados.instituicao.trim(),
          estado_uf:  r.estado,
        });
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

  function mesAnterior() {
    const [y, m] = mesFiltro.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setMesFiltro(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  }

  function mesProximo() {
    const [y, m] = mesFiltro.split('-').map(Number);
    const next = new Date(y, m, 1);
    setMesFiltro(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  function mesAtual() {
    const d = new Date();
    setMesFiltro(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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

        {/* Toggle elite */}
        {isElite && (
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
            <button
              onClick={() => setVisaoElite('individual')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                visaoElite === 'individual'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <User className="w-3.5 h-3.5" /> Minha visão
            </button>
            <button
              onClick={() => setVisaoElite('geral')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                visaoElite === 'geral'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Users className="w-3.5 h-3.5" /> Visão geral
            </button>
          </div>
        )}
      </div>

      {/* Abas internas: Analítico × Recebimento diário */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'analitico', label: 'Analítico',          Icon: BarChart2 },
          { key: 'diario',    label: 'Recebimento diário', Icon: HandCoins },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setAbaPrincipal(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              abaPrincipal === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Seletor de mês + filtro de setor (somente aba Analítico) */}
      {abaPrincipal === 'analitico' && (
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Mês:</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={mesAnterior}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-semibold min-w-[130px] text-center">
              {new Date(mesFiltro + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={mesProximo}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={mesAtual}>
              Mês atual
            </Button>
          </div>
        </div>

        {/* Filtro de setor — só diretoria/admin podem alternar entre setores;
            líder/gerência ficam travados no próprio setor */}
        {isLiderMais && veTodosSetores && setores.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-medium shrink-0">Setor:</span>
            <select
              value={filtroSetorId ?? ''}
              onChange={e => setFiltroSetorId(e.target.value || null)}
              className="h-7 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todos os setores</option>
              {setores.map(s => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
            {filtroSetorId && (
              <button
                onClick={() => setFiltroSetorId(null)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Limpar
              </button>
            )}
          </div>
        )}
        {isLiderMais && !veTodosSetores && setorProprio && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 border border-border px-3 py-1.5 rounded-lg">
            <Building2 className="w-3.5 h-3.5" />
            {setores.find(s => s.id === setorProprio)?.nome ?? 'Meu setor'}
          </span>
        )}
      </div>
      )}

      {/* Validação do relatório (Fase 1) — só administrador/super_admin */}
      {abaPrincipal === 'analitico' && isAdminReal && (
        <ValidacaoRelatorioSetor
          empresaId={empresa.id}
          setorId={veTodosSetores ? filtroSetorId : setorProprio}
          setorNome={setores.find(s => s.id === (veTodosSetores ? filtroSetorId : setorProprio))?.nome ?? ''}
          mes={mesFiltro}
        />
      )}

      {/* Conteúdo por cargo — aba Analítico */}
      {abaPrincipal === 'analitico' && mostrarVisaoIndividual && (
        <AnaliticoOperador
          dados={dadosProprios}
          loading={loadingProprios}
          operadorId={perfil.id}
          operadorNome={perfil.nome}
          empresaId={empresa.id}
          mes={mesFiltro}
          liderId={liderId}
          onAbrirNovoAcordo={onAbrirNovoAcordo}
          onVerAcordo={onVerAcordo}
          onRefetch={refetchOperador}
        />
      )}

      {abaPrincipal === 'analitico' && mostrarVisaoGeral && (
        <AnaliticoLider
          empresaId={empresa.id}
          mes={mesFiltro}
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

      {/* Conteúdo por cargo — aba Recebimento diário */}
      {abaPrincipal === 'diario' && (
        <AbaDiario
          empresaId={empresa.id}
          operadorId={perfil.id}
          visaoGeral={mostrarVisaoGeral}
          temPermissaoImportar={temPermissao('importar_diario')}
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
