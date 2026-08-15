import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { veTodosOsSetores } from '@/services/analitico/escopoAnalitico';
import { useTenant } from '@/lib/tenant-config';
import { supabase } from '@/lib/supabase';
// Tipos e helpers puros vêm dos módulos *Comum. Os parsers (que carregam xlsx,
// ~484 KB) são importados dinamicamente nos handlers — só quando o usuário
// escolhe de fato um arquivo. Sem isso o chunk do xlsx entraria no bundle da
// aba Analítico, que apenas exibe dados.
import type { LinhaColchao, LinhaRelatorio } from '@/services/analitico/analiticoComum';
import {
  diaReferencia, dayKeyDiario, type LinhaDiario,
} from '@/services/diario/diarioComum';
import { toast } from 'sonner';
import {
  resolverOperadores,
  importarLoteAnalitico,
  revincularOrfaosAnalitico,
  notificarImportacaoAnalitico,
  atualizarResumoMensal,
  congelarComposicaoDoMes,
  sincronizarCartoesPagos,
  type OperadorResolvidoMap,
  type OperadorMatchDetalhe,
  type PerfilResumido,
  type ResultadoImportacao,
} from '@/services/analitico/analitico.service';
import {
  importarLoteColchao,
  revincularOrfaosColchao,
} from '@/services/analitico/colchao.service';
import {
  importarLoteDiario,
  revincularOrfaosDiario,
  notificarImportacaoDiario,
  type NovoPorOperador,
} from '@/services/diario/diario.service';

export type EstadoImport = 'idle' | 'parsing' | 'preview' | 'confirming' | 'done' | 'error';

export interface PreviewImport {
  linhasTotais:     number;
  linhasNovas:      number;
  duplicadasEst:    number;
  operadoresNaoEncontrados: string[];
  errosParse:       string[];
  linhas:           LinhaRelatorio[];
  /** Colchão fora da meta, preservado linha a linha para a aba própria. */
  linhasColchao:    LinhaColchao[];
  /** Colchão excepcionalmente aceito no Analítico até 12/08/2026. */
  colchaoNaMeta:    { linhas: number; valor: number };
  operadoresMap:    OperadorResolvidoMap;
  matches:          Record<string, OperadorMatchDetalhe | null>;
  todosPerfis:      PerfilResumido[];
  loteId:           string;
  mes:              string;
  /** BookPlay: linhas do MESMO relatório para a aba Recebimento diário */
  linhasDiario?:    LinhaDiario[];
  /** BookPlay: dia de referência (moda) para o recebimento diário */
  dia?:             string;
  /** Linhas da equipe de Retenção descartadas do relatório do Receptivo. */
  retencaoRemovidas: number;
}

export interface ResultadoImportacaoCompleta extends ResultadoImportacao {
  colchaoInseridos: number;
  colchaoDuplicados: number;
}

/** Soma pagamentos/valores por operador de duas listas (inseridos + revinculados). */
function mesclarNovosPorOperador(...listas: NovoPorOperador[][]): NovoPorOperador[] {
  const map = new Map<string, NovoPorOperador>();
  for (const lista of listas) {
    for (const n of lista) {
      const atual = map.get(n.operadorId) ?? { operadorId: n.operadorId, novosPagamentos: 0, totalNovo: 0 };
      atual.novosPagamentos += n.novosPagamentos;
      atual.totalNovo       += n.totalNovo;
      map.set(n.operadorId, atual);
    }
  }
  return [...map.values()];
}

export function useAnaliticoImport() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant      = useTenant();

  const [estado,      setEstado]    = useState<EstadoImport>('idle');
  const [preview,     setPreview]   = useState<PreviewImport | null>(null);
  const [resultado,   setResultado] = useState<ResultadoImportacaoCompleta | null>(null);
  const [erroGeral,   setErroGeral] = useState<string | null>(null);

  // Vínculos manuais definidos pelo usuário no preview: username_arquivo → perfil_id
  const [vinculosManuais, setVinculosManuais] = useState<Record<string, string>>({});

  // ── Setor da importação ───────────────────────────────────────────────────
  // O relatório é de UM setor. Quem só enxerga o próprio setor não tem o que
  // escolher — é o dele. Quem enxerga mais de um PRECISA dizer de qual setor é
  // o arquivo, senão o carimbo sai errado e o acumulado do setor vai junto.
  const setorAutomatico = perfil?.setor_id ?? null;
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);
  /** Enxerga mais de um setor? Mesma definição da aba Analítico e do dashboard. */
  const veTodosSetores = veTodosOsSetores(perfil?.perfil, temPermissao);

  // Item 9: quando o setor do importador é ALTERNATIVO (ex.: Digital), o
  // relatório na verdade é de outro setor (Play 4/5). Ele deve escolher o setor
  // de ORIGEM e a importação carimba esse setor — como se alguém dele tivesse
  // importado. Setor alternativo não é o dono das linhas.
  const [setorProprioAlternativo, setSetorProprioAlternativo] = useState(false);
  useEffect(() => {
    if (tenant.isPaguePlay || !setorAutomatico) { setSetorProprioAlternativo(false); return; }
    let cancel = false;
    supabase.from('setores').select('alternativo').eq('id', setorAutomatico).maybeSingle()
      .then(({ data }) => {
        if (!cancel) setSetorProprioAlternativo(!!(data as { alternativo?: boolean } | null)?.alternativo);
      });
    return () => { cancel = true; };
  }, [tenant.isPaguePlay, setorAutomatico]);

  /**
   * Quando o importador tem que escolher o setor:
   *   • não tem setor no perfil (admin/diretoria);
   *   • o setor dele é ALTERNATIVO (não tem relatório próprio — o arquivo é de
   *     outro setor, e é esse outro que deve receber o carimbo);
   *   • enxerga mais de um setor. Antes este caso passava batido: um líder com
   *     `ver_todos_setores` importava o relatório do Play 5 e ele era carimbado
   *     no setor DELE, calado.
   *
   * Vale para os dois tenants. A PaguePlay não usava carimbo nenhum (passava
   * `null`), o que jogava os órfãos no setor de quem importou por fallback —
   * agora eles caem no setor que o relatório realmente é.
   */
  const usarSetorEscolhido = !setorAutomatico || setorProprioAlternativo || veTodosSetores;
  const setorImportacao = usarSetorEscolhido ? setorEscolhido : setorAutomatico;
  /** true quando o modal precisa exibir o seletor de setor. */
  const precisaEscolherSetor = usarSetorEscolhido;

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresa?.id) return;
    setEstado('parsing');
    setErroGeral(null);
    setVinculosManuais({});

    // ── BookPlay: um relatório alimenta Analítico + Diário + Colchão ─────────
    if (!tenant.isPaguePlay) {
      // xlsx entra aqui, sob demanda (ver comentário do import no topo).
      const { parseRelatorioBookplay } = await import('@/services/bookplay/bookplayRecebimentoParser');
      const {
        analitico,
        diario,
        colchao,
        colchaoNaMeta,
        retencaoRemovidas,
        erros: errosBP,
      } = await parseRelatorioBookplay(file);
      if (!analitico.length && !colchao.length) {
        setErroGeral(
          retencaoRemovidas > 0 && !errosBP.length
            ? `Nenhuma linha a importar: as ${retencaoRemovidas} linhas do arquivo são da equipe de Retenção, que não conta para o Receptivo.`
            : errosBP.length
              ? errosBP.join('\n')
              : 'Nenhuma linha válida encontrada no arquivo.',
        );
        setEstado('error');
        return;
      }
      const usuariosBP = [...new Set([
        ...analitico.map(l => l.operador_usuario),
        ...colchao.map(l => l.operador_usuario),
      ])];
      const { map, matches, todosPerfis } = await resolverOperadores(empresa.id, usuariosBP);
      const naoEncontradosBP = usuariosBP.filter(u => map[u] === null);

      const mesesBP = [...analitico, ...colchao].map(l => {
        const d = l.data_pagamento;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });
      const mesCountBP = mesesBP.reduce<Record<string, number>>((acc, m) => { acc[m] = (acc[m] ?? 0) + 1; return acc; }, {});
      const mesBP = Object.entries(mesCountBP).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

      setPreview({
        linhasTotais:     analitico.length + colchao.length,
        linhasNovas:      analitico.length + colchao.length,
        duplicadasEst:    0,
        operadoresNaoEncontrados: naoEncontradosBP,
        errosParse:       errosBP,
        linhas:           analitico,
        linhasColchao:    colchao,
        colchaoNaMeta,
        linhasDiario:     diario,
        dia:              diaReferencia(diario) ?? dayKeyDiario(new Date()),
        operadoresMap:    map,
        matches,
        todosPerfis,
        loteId:           crypto.randomUUID(),
        mes:              mesBP,
        retencaoRemovidas,
      });
      setEstado('preview');
      return;
    }

    // ── PaguePlay: fluxo original (relatório analítico dedicado) ──
    // xlsx entra aqui, sob demanda (ver comentário do import no topo).
    const { parseRelatorioExcel } = await import('@/services/analitico/analiticoParser');
    const {
      linhas, linhasColchao, colchaoNaMeta, erros, retencaoRemovidas,
    } = await parseRelatorioExcel(file);

    if (!linhas.length && !linhasColchao.length) {
      setErroGeral(
        // Arquivo só de Retenção: "nenhuma linha válida" mandaria procurar
        // defeito num arquivo que está certo — o filtro é que levou tudo.
        retencaoRemovidas > 0 && !erros.length
          ? `Nenhuma linha a importar: as ${retencaoRemovidas} linhas do arquivo são da equipe de Retenção, que não conta para o Receptivo.`
          : erros.length
            ? erros.join('\n')
            : 'Nenhuma linha válida encontrada no arquivo.',
      );
      setEstado('error');
      return;
    }

    const usuarios = [...new Set([
      ...linhas.map(l => l.operador_usuario),
      ...linhasColchao.map(l => l.operador_usuario),
    ])];
    const { map, matches, todosPerfis } = await resolverOperadores(empresa.id, usuarios);
    const naoEncontrados = usuarios.filter(u => map[u] === null);

    const meses = [...linhas, ...linhasColchao].map(l => {
      const d = l.data_pagamento;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const mesCount = meses.reduce<Record<string, number>>((acc, m) => {
      acc[m] = (acc[m] ?? 0) + 1; return acc;
    }, {});
    const mes = Object.entries(mesCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    setPreview({
      linhasTotais:     linhas.length + linhasColchao.length,
      linhasNovas:      linhas.length + linhasColchao.length,
      duplicadasEst:    0,
      operadoresNaoEncontrados: naoEncontrados,
      errosParse:       erros,
      linhas,
      linhasColchao,
      colchaoNaMeta,
      operadoresMap:    map,
      matches,
      todosPerfis,
      loteId:           crypto.randomUUID(),
      mes,
      retencaoRemovidas,
    });
    setEstado('preview');
  }, [empresa?.id, tenant.isPaguePlay]);

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

    // O Colchão fora da meta vai primeiro para a tabela isolada. Se a migration
    // ainda não estiver disponível, o erro fica visível no resultado e o fluxo
    // normal continua — uma falha de acompanhamento não pode apagar o relatório.
    const resColchao = await importarLoteColchao(
      empresa.id,
      perfil.id,
      preview.loteId,
      preview.linhasColchao,
      mapFinal,
      setorImportacao,
    );

    const res = await importarLoteAnalitico(
      empresa.id,
      perfil.id,
      preview.loteId,
      preview.linhas,
      mapFinal,
      // Setor da importação: dá dono às linhas sem operador (órfãs). Agora
      // vale para os dois tenants — a PaguePlay passava `null` e os órfãos dela
      // acabavam no setor de QUEM IMPORTOU, por fallback, em vez do setor a que
      // o relatório pertence.
      setorImportacao,
      // Na BookPlay, o relatório 58 é o retrato completo do mês. Assim, uma
      // reimportação também remove do mesmo setor/mês linhas antigas que foram
      // filtradas agora (Retenção/Colchão) ou que sumiram da origem. PaguePlay
      // continua incremental porque seus relatórios podem ser parciais.
      { sincronizarAusentesDoSetor: !tenant.isPaguePlay },
    );

    // Revincula linhas órfãs de operadores criados após uma importação anterior.
    // Sem isto, reimportar o mesmo relatório não atribui os dados ao novo usuário
    // (as linhas já existem e a dedupe as ignora, mantendo operador_id = null).
    await revincularOrfaosColchao(empresa.id, mapFinal);
    const revinc = await revincularOrfaosAnalitico(empresa.id, mapFinal);
    if (revinc.revinculados > 0) {
      toast.success(
        `${revinc.revinculados} recebimento${revinc.revinculados !== 1 ? 's' : ''} ` +
        `vinculado${revinc.revinculados !== 1 ? 's' : ''} a operador${revinc.operadoresAfetados.length !== 1 ? 'es' : ''} recém-criado${revinc.operadoresAfetados.length !== 1 ? 's' : ''}.`,
        { duration: 6000 },
      );
    }

    setResultado({
      ...res,
      erros: [...res.erros, ...resColchao.erros],
      colchaoInseridos: resColchao.inseridos,
      colchaoDuplicados: resColchao.duplicados,
    });

    if (res.atualizados > 0) {
      toast.success(
        `${res.atualizados} recebimento${res.atualizados !== 1 ? 's' : ''} ` +
        `${res.atualizados !== 1 ? 'tiveram os valores atualizados' : 'teve o valor atualizado'} ` +
        `(NRs que receberam novas parcelas desde a última importação).`,
        { duration: 6000 },
      );
    }

    // Linhas antigas que estavam sem a coluna "Tipo comissão" e agora têm.
    // Vale um aviso próprio porque é o que move dinheiro de "Sem vínculo
    // definido" para Direto/Extra no painel de metas — quem reimporta
    // justamente para consertar aquele card precisa ver que funcionou.
    const tiposPreenchidos = res.tiposPreenchidos ?? 0;
    if (tiposPreenchidos > 0) {
      toast.success(
        `${tiposPreenchidos} recebimento${tiposPreenchidos !== 1 ? 's' : ''} antigo${tiposPreenchidos !== 1 ? 's' : ''} ` +
        `${tiposPreenchidos !== 1 ? 'ganharam' : 'ganhou'} a classificação Direto/Extra do relatório.`,
        { duration: 6000 },
      );
    }

    // Salva snapshot de totais imediatamente após inserção + revínculo
    // (o revínculo altera a contagem de operadores distintos do mês)
    if (preview.linhas.length > 0) {
      await atualizarResumoMensal(empresa.id, preview.mes);
    }

    // Refaz o retrato da composição daquele mês (migration 20260803c).
    //
    // A regra da diretoria: o retrato de um mês fechado é fato consumado, e a
    // ÚNICA coisa de hoje que pode mexer nele é a reimportação do relatório
    // daquele mês — que é exatamente este ponto. Mover alguém de equipe ou
    // colocar em férias não mexe, e é o defeito que isto corrige.
    if (preview.linhas.length > 0) {
      await congelarComposicaoDoMes(empresa.id, preview.mes);
    }

    if (!tenant.isPaguePlay && preview.linhasDiario && preview.dia) {
      // ── BookPlay: o MESMO relatório também alimenta o Recebimento diário ──
      const resDiario = await importarLoteDiario(
        empresa.id, perfil.id, preview.loteId, preview.dia, preview.linhasDiario, mapFinal,
      );
      const revDiario = await revincularOrfaosDiario(empresa.id, preview.dia, mapFinal);
      const notifsDiario = mesclarNovosPorOperador(resDiario.novosPorOperador, revDiario.novosPorOperador);
      await notificarImportacaoDiario(empresa.id, preview.dia, notifsDiario);
    } else if (preview.linhas.length > 0) {
      // ── PaguePlay: sincroniza acordos de cartão com mesmo operador ──
      const { atualizados } = await sincronizarCartoesPagos(empresa.id, preview.mes);
      if (atualizados > 0) {
        toast.success(
          `${atualizados} acordo${atualizados !== 1 ? 's' : ''} de cartão ${atualizados !== 1 ? 'foram marcados' : 'foi marcado'} como pago automaticamente.`,
          { duration: 6000 },
        );
      }
    }

    // Notificação escopada: só o setor do importador + operadores do lote
    // (linhas de gente de outro setor seguem para o setor delas).
    if (preview.linhas.length > 0) {
      await notificarImportacaoAnalitico(
        empresa.id,
        preview.mes,
        perfil.nome ?? 'Líder',
        {
          setorId:     setorImportacao,
          operadorIds: [...new Set(Object.values(mapFinal).filter((v): v is string => !!v))],
        },
      );
    }
    if (res.removidos > 0) {
      toast.success(
        `${res.removidos} recebimento${res.removidos !== 1 ? 's antigos foram removidos' : ' antigo foi removido'} ` +
        'porque não aparecem mais no relatório mensal.',
        { duration: 6000 },
      );
    }

    setEstado('done');
  }, [preview, vinculosManuais, empresa?.id, perfil?.id, perfil?.nome, setorImportacao, tenant.isPaguePlay]);

  const cancelar = useCallback(() => {
    setEstado('idle');
    setPreview(null);
    setResultado(null);
    setErroGeral(null);
    setVinculosManuais({});
    setSetorEscolhido(null);
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
    // Setor da importação (BookPlay)
    precisaEscolherSetor,
    setorImportacao,
    setSetorEscolhido,
    /** true quando o importador é de um setor alternativo (escolhe o setor de origem). */
    setorProprioAlternativo,
  };
}
