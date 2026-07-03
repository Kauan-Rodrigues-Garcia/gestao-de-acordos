/**
 * AbaDiario — raiz da aba interna "Recebimento diário" (página Analítico).
 *
 * Controla o dia exibido (padrão: o dia de hoje) e roteia
 * por cargo: líder+ (visão geral com importação) × operador (lista própria).
 * O operador não tem acesso a dados de outros operadores (RLS + visão própria).
 */

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTodayISO } from '@/lib/index';
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
  // Dia inicial: sempre o dia de hoje ao abrir a aba
  const [dia, setDia] = useState<string>(() => getTodayISO());

  const handleDadosImportados = useCallback((diaImportado: string) => {
    setDia(diaImportado);
  }, []);

  const hoje = getTodayISO();

  return (
    <div className="space-y-4">
      {/* Seletor de dia */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Dia:</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7"
            onClick={() => setDia(somarDias(dia, -1))}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <input
            type="date"
            value={dia}
            onChange={e => e.target.value && setDia(e.target.value)}
            className="h-7 px-2 text-xs font-semibold border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
          />
          <Button variant="outline" size="icon" className="h-7 w-7"
            disabled={dia >= hoje}
            onClick={() => setDia(somarDias(dia, 1))}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() => setDia(hoje)}>
            Hoje
          </Button>
        </div>
      </div>

      {visaoGeral ? (
        <DiarioLider
          empresaId={empresaId}
          dia={dia}
          temPermissaoImportar={temPermissaoImportar}
          onDadosImportados={handleDadosImportados}
        />
      ) : (
        <DiarioOperador dia={dia} operadorId={operadorId} />
      )}
    </div>
  );
}
