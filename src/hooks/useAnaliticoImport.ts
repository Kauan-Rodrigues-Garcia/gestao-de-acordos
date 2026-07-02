import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  parseRelatorioExcel,
  type LinhaRelatorio,
} from '@/services/analitico/analiticoParser';
import { toast } from 'sonner';
import {
  resolverOperadores,
  importarLoteAnalitico,
  revincularOrfaosAnalitico,
  notificarImportacaoAnalitico,
  atualizarResumoMensal,
  sincronizarCartoesPagos,
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

    // Revincula linhas órfãs de operadores criados após uma importação anterior.
    // Sem isto, reimportar o mesmo relatório não atribui os dados ao novo usuário
    // (as linhas já existem e a dedupe as ignora, mantendo operador_id = null).
    const revinc = await revincularOrfaosAnalitico(empresa.id, mapFinal);
    if (revinc.revinculados > 0) {
      toast.success(
        `${revinc.revinculados} recebimento${revinc.revinculados !== 1 ? 's' : ''} ` +
        `vinculado${revinc.revinculados !== 1 ? 's' : ''} a operador${revinc.operadoresAfetados.length !== 1 ? 'es' : ''} recém-criado${revinc.operadoresAfetados.length !== 1 ? 's' : ''}.`,
        { duration: 6000 },
      );
    }

    setResultado(res);

    // Salva snapshot de totais imediatamente após inserção + revínculo
    // (o revínculo altera a contagem de operadores distintos do mês)
    await atualizarResumoMensal(empresa.id, preview.mes);

    // Sincroniza acordos de cartão com mesmo operador: marca como pago + atualiza valor/data
    const { atualizados } = await sincronizarCartoesPagos(empresa.id, preview.mes);
    if (atualizados > 0) {
      toast.success(
        `${atualizados} acordo${atualizados !== 1 ? 's' : ''} de cartão ${atualizados !== 1 ? 'foram marcados' : 'foi marcado'} como pago automaticamente.`,
        { duration: 6000 },
      );
    }

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
