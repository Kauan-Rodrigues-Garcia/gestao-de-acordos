/**
 * AbaAnalitico — raiz da aba "Analítico" no Dashboard (PaguePlay exclusivo)
 *
 * Roteia por cargo:
 *   operador          → AnaliticoOperador (próprios acordos)
 *   elite             → pode alternar entre visão individual e geral
 *   lider/gerência/admin → AnaliticoLider (geral + importar)
 */

import { useState, useCallback } from 'react';
import { BarChart3, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { isPerfilAdminOuLider } from '@/lib/index';
import { useAnalitico } from '@/hooks/useAnalitico';
import { AnaliticoOperador } from './AnaliticoOperador';
import { AnaliticoLider } from './AnaliticoLider';

interface AbaAnaliticoProps {
  mes: string;  // 'yyyy-MM'
  onAbrirNovoAcordo: (dados: {
    instituicao: string;
    nomeCliente: string;
    forma: 'boleto_pix' | 'cartao';
    valor: number;
  }) => void;
  onVerAcordo: (acordoId: string) => void;
}

export function AbaAnalitico({ mes, onAbrirNovoAcordo, onVerAcordo }: AbaAnaliticoProps) {
  const { perfil }          = useAuth();
  const { empresa }         = useEmpresa();
  const { temPermissao }    = useCargoPermissoes();

  const isElite     = perfil?.perfil === 'elite';
  const isLiderMais = isPerfilAdminOuLider(perfil?.perfil ?? '');
  const isOperador  = !isLiderMais;

  // Elite pode alternar entre visão individual e geral
  const [visaoElite, setVisaoElite] = useState<'individual' | 'geral'>('geral');

  // Lider não-elite sempre usa visão geral; elite usa o toggle
  const mostrarVisaoGeral = (isLiderMais && !isElite) || (isElite && visaoElite === 'geral');
  const mostrarVisaoIndividual = isOperador || (isElite && visaoElite === 'individual');

  // Operador filtrado pelo líder
  const [filtroOperadorId, setFiltroOperadorId] = useState<string | null>(null);

  // Dados do operador (visão individual: próprios registros)
  const { dados: dadosProprios, loading: loadingProprios, novosCount, refetch: refetchProprios } = useAnalitico({
    mes,
    operadorFiltro: perfil?.id ?? undefined,
  });

  // Dados gerais (líder/admin/elite-geral: todos os registros com operador)
  const { dados: dadosGerais, loading: loadingGerais, refetch: refetchGerais } = useAnalitico({
    mes,
    operadorFiltro: filtroOperadorId ?? undefined,
  });

  // Órfãos: linhas sem operador (lider+ apenas)
  const { dados: orfaos, loading: loadingOrfaos, refetch: refetchOrfaos } = useAnalitico({
    mes,
    apenasOrfaos: true,
  });

  const refetchTudo = useCallback(() => {
    void refetchProprios();
    void refetchGerais();
    void refetchOrfaos();
  }, [refetchProprios, refetchGerais, refetchOrfaos]);

  if (!empresa?.id || !perfil?.id) return null;

  const liderId = perfil?.lider_id ?? null;

  return (
    <div className="space-y-4">
      {/* Header da aba */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Analítico</h2>
            <p className="text-xs text-muted-foreground">
              Recebimentos do ERP ·{' '}
              {new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              {novosCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  {novosCount} novo{novosCount !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Toggle elite: individual ↔ geral */}
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

      {/* ── Roteamento por cargo ─── */}

      {/* Operador puro ou Elite em visão individual */}
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

      {/* Líder não-elite (sempre geral) ou Elite em visão geral */}
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
