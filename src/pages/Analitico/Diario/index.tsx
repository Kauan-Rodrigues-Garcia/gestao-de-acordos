/**
 * AbaDiario — raiz da aba interna "Recebimento diário" (página Analítico).
 *
 * Controla o dia exibido (padrão: último dia com dados importados) e roteia
 * por cargo: líder+ (visão geral com importação) × operador (lista própria).
 * O operador não tem acesso a dados de outros operadores (RLS + visão própria).
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTodayISO } from '@/lib/index';
import { buscarUltimoDia, buscarResumoMesDiario } from '@/services/diario/diario.service';
import { DiarioLider } from './DiarioLider';
import { DiarioOperador } from './DiarioOperador';

interface AbaDiarioProps {
  empresaId: string;
  operadorId: string;
  /** true → visão líder (geral); false → visão operador (própria) */
  visaoGeral: boolean;
  temPermissaoImportar: boolean;
}

function somarDias(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AbaDiario({
  empresaId, operadorId, visaoGeral, temPermissaoImportar,
}: AbaDiarioProps) {
  const [dia, setDia]           = useState<string | null>(null);
  const [totalMes, setTotalMes] = useState<number | null>(null);

  // Dia inicial: último dia com dados (RLS limita à visão do usuário); senão hoje
  useEffect(() => {
    let ativo = true;
    buscarUltimoDia(empresaId).then(({ dia: ultimo }) => {
      if (ativo) setDia(ultimo ?? getTodayISO());
    });
    return () => { ativo = false; };
  }, [empresaId]);

  // Total do mês (só faz sentido na visão líder)
  const carregarTotalMes = useCallback((diaBase: string | null) => {
    if (!visaoGeral || !diaBase) return;
    const mes = diaBase.slice(0, 7);
    buscarResumoMesDiario(empresaId, mes).then(({ data }) => {
      setTotalMes(data?.total_recebido ?? 0);
    });
  }, [empresaId, visaoGeral]);

  useEffect(() => {
    carregarTotalMes(dia);
  }, [dia, carregarTotalMes]);

  const handleDadosImportados = useCallback((diaImportado: string) => {
    setDia(diaImportado);
    carregarTotalMes(diaImportado);
  }, [carregarTotalMes]);

  const hoje = getTodayISO();

  return (
    <div className="space-y-4">
      {/* Seletor de dia */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Dia:</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7"
            disabled={!dia}
            onClick={() => dia && setDia(somarDias(dia, -1))}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <input
            type="date"
            value={dia ?? ''}
            onChange={e => e.target.value && setDia(e.target.value)}
            className="h-7 px-2 text-xs font-semibold border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
          />
          <Button variant="outline" size="icon" className="h-7 w-7"
            disabled={!dia || dia >= hoje}
            onClick={() => dia && setDia(somarDias(dia, 1))}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => setDia(hoje)}>
            Hoje
          </Button>
        </div>
      </div>

      {dia === null ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      ) : visaoGeral ? (
        <DiarioLider
          empresaId={empresaId}
          dia={dia}
          temPermissaoImportar={temPermissaoImportar}
          totalMes={totalMes}
          onDadosImportados={handleDadosImportados}
        />
      ) : (
        <DiarioOperador dia={dia} operadorId={operadorId} />
      )}
    </div>
  );
}
