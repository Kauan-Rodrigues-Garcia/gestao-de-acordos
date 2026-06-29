import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, User, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { isPerfilAdminOuLider, ROUTE_PATHS } from '@/lib/index';
import { useAnalitico } from '@/hooks/useAnalitico';
import { AnaliticoOperador } from '@/pages/Dashboard/Analitico/AnaliticoOperador';
import { AnaliticoLider } from '@/pages/Dashboard/Analitico/AnaliticoLider';

export default function PaginaAnalitico() {
  // ── Todos os hooks ANTES de qualquer return condicional ──────────────────
  const { perfil }       = useAuth();
  const { empresa }      = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant           = useTenant();
  const navigate         = useNavigate();

  const isElite     = perfil?.perfil === 'elite';
  const isLiderMais = isPerfilAdminOuLider(perfil?.perfil ?? '');
  const isOperador  = !isLiderMais;

  const [visaoElite, setVisaoElite] = useState<'individual' | 'geral'>('geral');
  const [filtroOperadorId, setFiltroOperadorId] = useState<string | null>(null);
  const [mesFiltro, setMesFiltro] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const mostrarVisaoGeral      = (isLiderMais && !isElite) || (isElite && visaoElite === 'geral');
  const mostrarVisaoIndividual = isOperador || (isElite && visaoElite === 'individual');

  const { dados: dadosProprios, loading: loadingProprios, novosCount, refetch: refetchProprios } = useAnalitico({
    mes: mesFiltro,
    operadorFiltro: perfil?.id ?? undefined,
  });

  const { dados: dadosGerais, loading: loadingGerais, refetch: refetchGerais } = useAnalitico({
    mes: mesFiltro,
    operadorFiltro: filtroOperadorId ?? undefined,
  });

  const { dados: orfaos, loading: loadingOrfaos, refetch: refetchOrfaos } = useAnalitico({
    mes: mesFiltro,
    apenasOrfaos: true,
  });

  const refetchTudo = useCallback(() => {
    void refetchProprios();
    void refetchGerais();
    void refetchOrfaos();
  }, [refetchProprios, refetchGerais, refetchOrfaos]);

  // ── Guards (após todos os hooks) ─────────────────────────────────────────
  if (!tenant.isPaguePlay) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Esta seção está disponível apenas para PaguePlay.
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
  }) {
    const storageKey = `acordo-inline-draft::${empresa!.id}::${perfil!.id}::pp`;
    const draft = {
      instituicao: dados.instituicao,
      nomeCliente: dados.nomeCliente,
      tipo:        dados.forma === 'cartao' ? 'cartao' : 'boleto_pix',
      valorStr:    dados.valor.toFixed(2).replace('.', ','),
    };
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* noop */ }
    navigate(ROUTE_PATHS.DASHBOARD + '?novoInline=1');
  }

  function onVerAcordo(acordoId: string) {
    navigate(ROUTE_PATHS.ACORDO_DETALHE.replace(':id', acordoId));
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
              Recebimentos do ERP · PaguePlay
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

      {/* Seletor de mês */}
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

      {/* Conteúdo por cargo */}
      {mostrarVisaoIndividual && (
        <AnaliticoOperador
          dados={dadosProprios}
          loading={loadingProprios}
          operadorId={perfil.id}
          operadorNome={perfil.nome}
          empresaId={empresa.id}
          liderId={liderId}
          onAbrirNovoAcordo={onAbrirNovoAcordo}
          onVerAcordo={onVerAcordo}
          onRefetch={refetchTudo}
        />
      )}

      {mostrarVisaoGeral && (
        <AnaliticoLider
          dados={dadosGerais}
          loading={loadingGerais}
          empresaId={empresa.id}
          orfaos={orfaos}
          loadingOrfaos={loadingOrfaos}
          temPermissaoImportar={temPermissao('importar_analitico')}
          operadorId={perfil.id}
          operadorNome={perfil.nome}
          liderId={liderId}
          filtroOperadorId={filtroOperadorId}
          setFiltroOperadorId={setFiltroOperadorId}
          onAbrirNovoAcordo={onAbrirNovoAcordo}
          onVerAcordo={onVerAcordo}
          onRefetch={refetchTudo}
        />
      )}
    </div>
  );
}
