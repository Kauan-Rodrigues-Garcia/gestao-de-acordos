/**
 * useAnaliticoImport — máquina de estados da importação do relatório Excel
 *
 * Estados: idle → parsing → preview → confirming → done | error
 *
 * Fluxo:
 *  1. carregarArquivo(file) → parse local, monta preview com delta
 *  2. confirmarImportacao() → persiste no banco, notifica todos os usuários
 *  3. cancelar() → volta para idle sem gravar nada
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  parseRelatorioExcel,
  type LinhaRelatorio,
} from '@/services/analitico/analiticoParser';
import {
  resolverOperadores,
  importarLoteAnalitico,
  notificarImportacaoAnalitico,
  type OperadorResolvidoMap,
  type ResultadoImportacao,
} from '@/services/analitico/analitico.service';

export type EstadoImport = 'idle' | 'parsing' | 'preview' | 'confirming' | 'done' | 'error';

export interface PreviewImport {
  linhasTotais:     number;
  linhasNovas:      number;      // a confirmar no banco
  duplicadasEst:    number;      // estimativa (diferença)
  operadoresNaoEncontrados: string[];
  errosParse:       string[];
  linhas:           LinhaRelatorio[];
  operadoresMap:    OperadorResolvidoMap;
  loteId:           string;
  mes:              string;       // 'yyyy-MM' do primeiro dia de pagamento
}

export function useAnaliticoImport() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [estado,      setEstado]    = useState<EstadoImport>('idle');
  const [preview,     setPreview]   = useState<PreviewImport | null>(null);
  const [resultado,   setResultado] = useState<ResultadoImportacao | null>(null);
  const [erroGeral,   setErroGeral] = useState<string | null>(null);

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresa?.id) return;
    setEstado('parsing');
    setErroGeral(null);

    const { linhas, erros } = await parseRelatorioExcel(file);

    if (!linhas.length) {
      setErroGeral(
        erros.length
          ? erros.join('\n')
          : 'Nenhuma linha válida encontrada no arquivo.',
      );
      setEstado('error');
      return;
    }

    // Resolver operadores
    const usuarios = [...new Set(linhas.map(l => l.operador_usuario))];
    const operadoresMap = await resolverOperadores(empresa.id, usuarios);
    const naoEncontrados = usuarios.filter(u => operadoresMap[u] === null);

    // Detectar mês predominante
    const meses = linhas.map(l => {
      const d = l.data_pagamento;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const mesCount = meses.reduce<Record<string, number>>((acc, m) => {
      acc[m] = (acc[m] ?? 0) + 1; return acc;
    }, {});
    const mes = Object.entries(mesCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    setPreview({
      linhasTotais:     linhas.length,
      linhasNovas:      linhas.length, // estimativa; banco ajusta com ON CONFLICT
      duplicadasEst:    0,
      operadoresNaoEncontrados: naoEncontrados,
      errosParse:       erros,
      linhas,
      operadoresMap,
      loteId:           crypto.randomUUID(),
      mes,
    });
    setEstado('preview');
  }, [empresa?.id]);

  const confirmarImportacao = useCallback(async () => {
    if (!preview || !empresa?.id || !perfil?.id) return;
    setEstado('confirming');

    const res = await importarLoteAnalitico(
      empresa.id,
      perfil.id,
      preview.loteId,
      preview.linhas,
      preview.operadoresMap,
    );

    setResultado(res);

    // Notificar todos os usuários da empresa
    await notificarImportacaoAnalitico(
      empresa.id,
      preview.mes,
      perfil.nome ?? 'Líder',
    );

    setEstado('done');
  }, [preview, empresa?.id, perfil?.id, perfil?.nome]);

  const cancelar = useCallback(() => {
    setEstado('idle');
    setPreview(null);
    setResultado(null);
    setErroGeral(null);
  }, []);

  return {
    estado,
    preview,
    resultado,
    erroGeral,
    carregarArquivo,
    confirmarImportacao,
    cancelar,
  };
}
