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
  atualizarResumoMensal,
  type OperadorResolvidoMap,
  type OperadorMatchDetalhe,
  type PerfilResumido,
  type ResultadoImportacao,
} from '@/services/analitico/analitico.service';

export type EstadoImport = 'idle' | 'parsing' | 'preview' | 'confirming' | 'done' | 'error';

export interface PreviewImport {
  linhasTotais:     number;
  linhasNovas:      number;
  duplicadasEst:    number;
  operadoresNaoEncontrados: string[];
  errosParse:       string[];
  linhas:           LinhaRelatorio[];
  operadoresMap:    OperadorResolvidoMap;
  matches:          Record<string, OperadorMatchDetalhe | null>;
  todosPerfis:      PerfilResumido[];
  loteId:           string;
  mes:              string;
}

export function useAnaliticoImport() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [estado,      setEstado]    = useState<EstadoImport>('idle');
  const [preview,     setPreview]   = useState<PreviewImport | null>(null);
  const [resultado,   setResultado] = useState<ResultadoImportacao | null>(null);
  const [erroGeral,   setErroGeral] = useState<string | null>(null);

  // Vínculos manuais definidos pelo usuário no preview: username_arquivo → perfil_id
  const [vinculosManuais, setVinculosManuais] = useState<Record<string, string>>({});

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresa?.id) return;
    setEstado('parsing');
    setErroGeral(null);
    setVinculosManuais({});

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

    const usuarios = [...new Set(linhas.map(l => l.operador_usuario))];
    const { map, matches, todosPerfis } = await resolverOperadores(empresa.id, usuarios);
    const naoEncontrados = usuarios.filter(u => map[u] === null);

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
      linhasNovas:      linhas.length,
      duplicadasEst:    0,
      operadoresNaoEncontrados: naoEncontrados,
      errosParse:       erros,
      linhas,
      operadoresMap:    map,
      matches,
      todosPerfis,
      loteId:           crypto.randomUUID(),
      mes,
    });
    setEstado('preview');
  }, [empresa?.id]);

  const definirVinculo = useCallback((usuarioArquivo: string, perfilId: string | null) => {
    setVinculosManuais(prev => {
      const next = { ...prev };
      if (perfilId) {
        next[usuarioArquivo] = perfilId;
      } else {
        delete next[usuarioArquivo];
      }
      return next;
    });
  }, []);

  const confirmarImportacao = useCallback(async () => {
    if (!preview || !empresa?.id || !perfil?.id) return;
    setEstado('confirming');

    // Mescla mapa automático + vínculos manuais definidos pelo líder
    const mapFinal: OperadorResolvidoMap = { ...preview.operadoresMap };
    for (const [usuario, perfilId] of Object.entries(vinculosManuais)) {
      mapFinal[usuario] = perfilId;
    }

    const res = await importarLoteAnalitico(
      empresa.id,
      perfil.id,
      preview.loteId,
      preview.linhas,
      mapFinal,
    );

    setResultado(res);

    // Salva snapshot de totais imediatamente após inserção (antes de qualquer deleção)
    await atualizarResumoMensal(empresa.id, preview.mes);

    await notificarImportacaoAnalitico(
      empresa.id,
      preview.mes,
      perfil.nome ?? 'Líder',
    );

    setEstado('done');
  }, [preview, vinculosManuais, empresa?.id, perfil?.id, perfil?.nome]);

  const cancelar = useCallback(() => {
    setEstado('idle');
    setPreview(null);
    setResultado(null);
    setErroGeral(null);
    setVinculosManuais({});
  }, []);

  return {
    estado,
    preview,
    resultado,
    erroGeral,
    vinculosManuais,
    carregarArquivo,
    confirmarImportacao,
    definirVinculo,
    cancelar,
  };
}
