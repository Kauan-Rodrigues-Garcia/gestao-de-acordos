/**
 * useDiarioImport — fluxo de importação do relatório de recebimento diário.
 * Espelha useAnaliticoImport: parse → preview (com vínculo manual) → confirmar.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  parseRelatorioDiario,
  diaReferencia,
  dayKeyDiario,
  type LinhaDiario,
} from '@/services/diario/diarioParser';
import {
  resolverOperadores,
  importarLoteDiario,
  notificarImportacaoDiario,
  type OperadorResolvidoMap,
  type OperadorMatchDetalhe,
  type PerfilResumido,
  type ResultadoImportacaoDiario,
} from '@/services/diario/diario.service';

export type EstadoImportDiario = 'idle' | 'parsing' | 'preview' | 'confirming' | 'done' | 'error';

export interface PreviewImportDiario {
  linhasTotais:             number;
  descartadasSemOperador:   number;
  operadoresNaoEncontrados: string[];
  errosParse:               string[];
  linhas:                   LinhaDiario[];
  operadoresMap:            OperadorResolvidoMap;
  matches:                  Record<string, OperadorMatchDetalhe | null>;
  todosPerfis:              PerfilResumido[];
  loteId:                   string;
  dia:                      string;    // 'yyyy-MM-dd'
}

export function useDiarioImport() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();

  const [estado,    setEstado]    = useState<EstadoImportDiario>('idle');
  const [preview,   setPreview]   = useState<PreviewImportDiario | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoDiario | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  // Vínculos manuais definidos pelo usuário no preview: username_arquivo → perfil_id
  const [vinculosManuais, setVinculosManuais] = useState<Record<string, string>>({});

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresa?.id) return;
    setEstado('parsing');
    setErroGeral(null);
    setVinculosManuais({});

    const { linhas, erros, descartadasSemOperador } = await parseRelatorioDiario(file);

    if (!linhas.length) {
      setErroGeral(
        erros.length
          ? erros.join('\n')
          : 'Nenhuma linha com operador encontrada no arquivo.',
      );
      setEstado('error');
      return;
    }

    const usuarios = [...new Set(linhas.map(l => l.operador_usuario))];
    const { map, matches, todosPerfis } = await resolverOperadores(empresa.id, usuarios);
    const naoEncontrados = usuarios.filter(u => map[u] === null);

    setPreview({
      linhasTotais:             linhas.length,
      descartadasSemOperador,
      operadoresNaoEncontrados: naoEncontrados,
      errosParse:               erros,
      linhas,
      operadoresMap:            map,
      matches,
      todosPerfis,
      loteId:                   crypto.randomUUID(),
      dia:                      diaReferencia(linhas) ?? dayKeyDiario(new Date()),
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

    const res = await importarLoteDiario(
      empresa.id,
      perfil.id,
      preview.loteId,
      preview.dia,
      preview.linhas,
      mapFinal,
    );

    setResultado(res);

    // Notifica somente operadores vinculados que receberam algo nesta importação
    await notificarImportacaoDiario(empresa.id, preview.dia, res.novosPorOperador);

    setEstado('done');
  }, [preview, vinculosManuais, empresa?.id, perfil?.id]);

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
