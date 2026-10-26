/**
 * useImportacao945 — o fluxo único de importação do relatório 945.
 *
 * Serve as duas telas que recebem o 945: o recorte Dia do Analítico e o Painel
 * Diretoria › Relatório de pagamento. As duas gravam as mesmas duas tabelas
 * (ver `fn_relatorio_945`); muda só a `origem`, que fica no lote.
 *
 *   arquivo → leitura em worker (reconhece 58/945, confere rodapé, junta estorno)
 *           → conferência no banco (cobertura, o que falta, o que sobra)
 *           → prévia (vínculo de operador, opções de limpeza)
 *           → gravação → aviso aos operadores
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolverOperadores, notificarImportacaoDiario } from '@/services/diario/diario.service';
import type {
  OperadorMatchDetalhe, OperadorResolvidoMap, PerfilResumido, ResultadoResolucao,
} from '@/services/analitico/analitico.service';
import { registrarLog } from '@/services/logs.service';
import type { RelatorioLido } from '@/services/relatorioPaguePlay/modelo';
import {
  carregarCobertura, conferirArquivo, importar945, type Origem945,
} from '@/services/relatorio945/service';
import {
  faltaInicio, instrucaoDeExportacao, dataBR,
  type Cobertura, type Conferencia, type ResultadoImportacao945,
} from '@/services/relatorio945/modelo';

export type Etapa945 = 'idle' | 'lendo' | 'previa' | 'gravando' | 'concluido' | 'erro';

export interface Previa945 {
  arquivo: string;
  relatorio: RelatorioLido;
  conferencia: Conferencia;
  operadoresMap: OperadorResolvidoMap;
  matches: Record<string, OperadorMatchDetalhe | null>;
  todosPerfis: PerfilResumido[];
  naoEncontrados: string[];
}

const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível ler o arquivo.';

export function useImportacao945(empresaId: string | null | undefined, origem: Origem945) {
  const [etapa, setEtapa] = useState<Etapa945>('idle');
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa945 | null>(null);
  const [inicio, setInicio] = useState('');
  const [conferindo, setConferindo] = useState(false);
  const [vinculos, setVinculos] = useState<Record<string, string>>({});
  const [removerSemId, setRemoverSemId] = useState(true);
  const [removerAusentes, setRemoverAusentes] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<ResultadoImportacao945 | null>(null);
  const [cobertura, setCobertura] = useState<Cobertura | null>(null);
  const [erroCobertura, setErroCobertura] = useState<string | null>(null);
  const pedido = useRef(0);

  const recarregarCobertura = useCallback(async () => {
    if (!empresaId) return;
    try { setCobertura(await carregarCobertura(empresaId)); setErroCobertura(null); }
    catch (e) { setErroCobertura(mensagem(e)); }
  }, [empresaId]);
  useEffect(() => { void recarregarCobertura(); }, [recarregarCobertura]);

  const cancelar = useCallback(() => {
    pedido.current++;
    setEtapa('idle'); setErro(null); setPrevia(null); setVinculos({}); setResultado(null);
    setRemoverSemId(true); setRemoverAusentes(false); setProgresso(0);
  }, []);

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresaId) return;
    const id = ++pedido.current;
    setEtapa('lendo'); setErro(null); setPrevia(null); setVinculos({}); setResultado(null);
    try {
      // xlsx só entra aqui, sob demanda, e fora da thread da tela.
      const { lerEmWorker } = await import('@/services/relatorioPaguePlay/lerEmWorker');
      const relatorio = await lerEmWorker(file);
      const usuarios = [...new Set(Object.values(relatorio.diario).map(d => d.operador))].filter(Boolean);
      const nenhum: ResultadoResolucao = { map: {}, matches: {}, todosPerfis: [] };
      const [resolucao, conferencia] = await Promise.all([
        usuarios.length ? resolverOperadores(empresaId, usuarios) : Promise.resolve(nenhum),
        conferirArquivo(empresaId, relatorio.inicio, relatorio.fim, relatorio.linhas.map(l => l.id_baixa)),
      ]);
      if (id !== pedido.current) return;
      setPrevia({
        arquivo: file.name, relatorio, conferencia,
        operadoresMap: resolucao.map, matches: resolucao.matches, todosPerfis: resolucao.todosPerfis,
        naoEncontrados: usuarios.filter(u => !resolucao.map[u]),
      });
      setInicio(relatorio.inicio);
      setCobertura(conferencia);
      setRemoverSemId(true); setRemoverAusentes(false);
      setEtapa('previa');
    } catch (e) {
      if (id !== pedido.current) return;
      setErro(mensagem(e)); setEtapa('erro');
    }
  }, [empresaId]);

  /** Início declarado (dias sem movimento no começo): só pode recuar. */
  const definirInicio = useCallback(async (novo: string) => {
    if (!previa || !empresaId || !novo || novo > previa.relatorio.inicio) return;
    setInicio(novo);
    setConferindo(true);
    try {
      const conferencia = await conferirArquivo(empresaId, novo, previa.relatorio.fim, previa.relatorio.linhas.map(l => l.id_baixa));
      setPrevia(p => p && { ...p, conferencia });
    } catch (e) { setErro(mensagem(e)); }
    finally { setConferindo(false); }
  }, [previa, empresaId]);

  const definirVinculo = useCallback((usuario: string, perfilId: string | null) => {
    setVinculos(v => {
      const prox = { ...v };
      if (perfilId) prox[usuario] = perfilId; else delete prox[usuario];
      return prox;
    });
  }, []);

  /** O que impede gravar, já em português. Null = pode gravar. */
  const bloqueio = useMemo(() => {
    if (!previa) return null;
    const { relatorio, conferencia } = previa;
    if (relatorio.modalidade === 'conciliacao') {
      return 'Este arquivo é o 945 de CONCILIAÇÃO. Aqui entra o 945 de pagamento; a conciliação se importa no Painel Diretoria › Relatório de pagamento › Conciliação.';
    }
    if (origem === 'diario' && !relatorio.temOperador) {
      return 'O arquivo não tem a coluna Operador, e sem ela o recebimento diário não sabe de quem é cada baixa. Exporte o relatório 945 completo.';
    }
    if (relatorio.fim > conferencia.hoje) return `O arquivo tem baixas com data futura (${dataBR(relatorio.fim)}). Confira a exportação.`;
    if (faltaInicio(inicio, relatorio.fim, conferencia.inicio_exigido)) {
      return `Faltam dias no arquivo. ${instrucaoDeExportacao(conferencia)} Este começa em ${dataBR(inicio)}.`;
    }
    return null;
  }, [previa, inicio, origem]);

  const confirmar = useCallback(async () => {
    if (!previa || !empresaId || bloqueio) return;
    setEtapa('gravando'); setProgresso(0); setErro(null);
    const operadores: Record<string, string | null> = { ...previa.operadoresMap, ...vinculos };
    try {
      const r = await importar945({
        empresa: empresaId, origem, arquivo: previa.arquivo, relatorio: previa.relatorio,
        inicio, fim: previa.relatorio.fim, operadores,
        removerSemId: removerSemId && previa.conferencia.sem_id_diario.length > 0,
        removerAusentes,
        progresso: setProgresso,
      });
      setResultado(r);
      setEtapa('concluido');
      if (r.diario?.novos_por_operador.length) {
        void notificarImportacaoDiario(empresaId, previa.relatorio.fim, r.diario.novos_por_operador);
      }
      // O banco guarda o lote; aqui fica o resumo legível na trilha de auditoria.
      void registrarLog({
        acao: 'importacao_concluida', categoria: 'importacao', severidade: 'info',
        descricao: `Importou o relatório 945 de ${dataBR(inicio)} a ${dataBR(previa.relatorio.fim)}: `
          + `${r.inseridos} baixa(s) nova(s) e ${r.atualizados} atualizada(s) no Relatório de pagamento`
          + (r.diario ? `; no recebimento diário, ${r.diario.inseridos} nova(s), ${r.diario.atualizados} atualizada(s)`
            + (r.diario.removidos_sem_id ? `, ${r.diario.removidos_sem_id} sem Id.Baixa removida(s)` : '') : ''),
        empresaId, tabela: 'diario_recebimentos', alvoTipo: 'importacao_945',
        alvoRotulo: `${dataBR(inicio)} a ${dataBR(previa.relatorio.fim)}`, origem: 'importacao',
        detalhes: { origem, arquivo: previa.arquivo, corte: previa.relatorio.corte, resultado: r },
      });
      void recarregarCobertura();
    } catch (e) {
      setErro(mensagem(e)); setEtapa('previa');
    }
  }, [previa, empresaId, bloqueio, vinculos, origem, inicio, removerSemId, removerAusentes, recarregarCobertura]);

  return {
    etapa, erro, previa, inicio, conferindo, vinculos, bloqueio, progresso, resultado,
    cobertura, erroCobertura, removerSemId, removerAusentes,
    carregarArquivo, definirInicio, definirVinculo, setRemoverSemId, setRemoverAusentes,
    confirmar, cancelar, recarregarCobertura,
  };
}

export type Importacao945 = ReturnType<typeof useImportacao945>;
