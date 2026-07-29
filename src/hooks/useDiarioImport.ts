/**
 * useDiarioImport — fluxo de importação do relatório de recebimento diário.
 * Espelha useAnaliticoImport: parse → preview (com vínculo manual) → confirmar.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
// Helpers puros vêm de diarioComum; `parseRelatorioDiario` (que carrega xlsx,
// ~484 KB) é importado dinamicamente no handler — só quando o usuário escolhe
// de fato um arquivo. Sem isso o chunk do xlsx entraria no bundle da aba
// Analítico, que apenas exibe dados.
import {
  diaReferencia,
  dayKeyDiario,
  type LinhaDiario,
} from '@/services/diario/diarioComum';
import {
  resolverOperadores,
  importarLoteDiario,
  revincularOrfaosDiario,
  notificarImportacaoDiario,
  type NovoPorOperador,
  type OperadorResolvidoMap,
  type OperadorMatchDetalhe,
  type PerfilResumido,
  type ResultadoImportacaoDiario,
} from '@/services/diario/diario.service';
import {
  loteEhMensal,
  mensalJaImportadoHoje,
  marcarMensalImportadoHoje,
  MSG_BLOQUEIO_MENSAL,
} from '@/services/diario/diarioMensalGuard';

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

/** Soma pagamentos/valores por operador de duas listas (inseridos + revinculados). */
function mesclarNovosPorOperador(
  ...listas: NovoPorOperador[][]
): NovoPorOperador[] {
  const map = new Map<string, NovoPorOperador>();
  for (const lista of listas) {
    for (const n of lista) {
      const atual = map.get(n.operadorId) ?? {
        operadorId: n.operadorId, novosPagamentos: 0, totalNovo: 0,
      };
      atual.novosPagamentos += n.novosPagamentos;
      atual.totalNovo       += n.totalNovo;
      map.set(n.operadorId, atual);
    }
  }
  return [...map.values()];
}

export function useDiarioImport() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { isPaguePlay } = useTenant();

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

    // xlsx entra aqui, sob demanda (ver comentário do import no topo).
    const { parseRelatorioDiario } = await import('@/services/diario/diarioParser');

    // PP: linhas sem operador entram como "(sem vínculo)" — somam no setor
    const { linhas, erros, descartadasSemOperador } = await parseRelatorioDiario(file, {
      permitirSemOperador: isPaguePlay,
    });

    if (!linhas.length) {
      setErroGeral(
        erros.length
          ? erros.join('\n')
          : 'Nenhuma linha com operador encontrada no arquivo.',
      );
      setEstado('error');
      return;
    }

    // PP: o PRIMEIRO relatório do dia precisa ser o mensal (multi-dia).
    // Relatório de 1 dia só libera depois do mensal de hoje; "Limpar dia" /
    // "Limpar tudo" derrubam a marca e o bloqueio volta.
    if (isPaguePlay && !loteEhMensal(linhas) && !mensalJaImportadoHoje(empresa.id)) {
      setErroGeral(MSG_BLOQUEIO_MENSAL);
      setEstado('error');
      return;
    }

    // Linhas "(sem vínculo)" (operador vazio) ficam fora da resolução de
    // operadores — não são órfãs para vincular manualmente
    const usuarios = [...new Set(linhas.map(l => l.operador_usuario))].filter(u => u !== '');
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
  }, [empresa?.id, isPaguePlay]);

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

    // Revincula linhas órfãs de operadores criados após uma importação anterior.
    // Sem isto, reimportar o mesmo relatório não atribui os pagamentos ao novo
    // usuário (linhas já existem, dedupe as ignora, operador_id continua null).
    const revinc = await revincularOrfaosDiario(empresa.id, preview.dia, mapFinal);

    setResultado(res);

    // Notifica operadores vinculados que receberam algo — tanto os inseridos
    // nesta importação quanto os revinculados agora (operador recém-criado).
    const notificacoes = mesclarNovosPorOperador(res.novosPorOperador, revinc.novosPorOperador);
    await notificarImportacaoDiario(empresa.id, preview.dia, notificacoes);

    // PP: mensal importado hoje → libera relatórios de 1 dia até amanhã
    if (isPaguePlay && loteEhMensal(preview.linhas)) {
      marcarMensalImportadoHoje(empresa.id);
    }

    setEstado('done');
  }, [preview, vinculosManuais, empresa?.id, perfil?.id, isPaguePlay]);

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
