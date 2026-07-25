import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { supabase } from '@/lib/supabase';
import {
  parseRelatorioExcel,
  type LinhaRelatorio,
} from '@/services/analitico/analiticoParser';
import { parseRelatorioBookplay } from '@/services/bookplay/bookplayRecebimentoParser';
import {
  diaReferencia, dayKeyDiario, type LinhaDiario,
} from '@/services/diario/diarioParser';
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
  operadoresMap:    OperadorResolvidoMap;
  matches:          Record<string, OperadorMatchDetalhe | null>;
  todosPerfis:      PerfilResumido[];
  loteId:           string;
  mes:              string;
  /** BookPlay: linhas do MESMO relatório para a aba Recebimento diário */
  linhasDiario?:    LinhaDiario[];
  /** BookPlay: dia de referência (moda) para o recebimento diário */
  dia?:             string;
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
  const tenant      = useTenant();

  const [estado,      setEstado]    = useState<EstadoImport>('idle');
  const [preview,     setPreview]   = useState<PreviewImport | null>(null);
  const [resultado,   setResultado] = useState<ResultadoImportacao | null>(null);
  const [erroGeral,   setErroGeral] = useState<string | null>(null);

  // Vínculos manuais definidos pelo usuário no preview: username_arquivo → perfil_id
  const [vinculosManuais, setVinculosManuais] = useState<Record<string, string>>({});

  // ── Setor da importação (BookPlay) ────────────────────────────────────────
  // Os órfãos (sem operador) pertencem ao setor de quem importa. Líder já tem
  // setor no perfil; admin/diretoria (sem setor) escolhem no modal.
  const setorAutomatico = perfil?.setor_id ?? null;
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);

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

  // Usa o setor ESCOLHIDO quando o importador não tem setor (admin) OU quando o
  // setor dele é alternativo; caso normal, usa o setor do próprio perfil.
  const usarSetorEscolhido = !setorAutomatico || setorProprioAlternativo;
  const setorImportacao = usarSetorEscolhido ? setorEscolhido : setorAutomatico;
  /** true quando o modal precisa exibir o seletor de setor (BookPlay). */
  const precisaEscolherSetor = !tenant.isPaguePlay && usarSetorEscolhido;

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresa?.id) return;
    setEstado('parsing');
    setErroGeral(null);
    setVinculosManuais({});

    // ── BookPlay: um único relatório alimenta Analítico + Recebimento diário ──
    if (!tenant.isPaguePlay) {
      const { analitico, diario, erros: errosBP } = await parseRelatorioBookplay(file);
      if (!analitico.length) {
        setErroGeral(errosBP.length ? errosBP.join('\n') : 'Nenhuma linha válida encontrada no arquivo.');
        setEstado('error');
        return;
      }
      const usuariosBP = [...new Set(analitico.map(l => l.operador_usuario))];
      const { map, matches, todosPerfis } = await resolverOperadores(empresa.id, usuariosBP);
      const naoEncontradosBP = usuariosBP.filter(u => map[u] === null);

      const mesesBP = analitico.map(l => {
        const d = l.data_pagamento;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      });
      const mesCountBP = mesesBP.reduce<Record<string, number>>((acc, m) => { acc[m] = (acc[m] ?? 0) + 1; return acc; }, {});
      const mesBP = Object.entries(mesCountBP).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

      setPreview({
        linhasTotais:     analitico.length,
        linhasNovas:      analitico.length,
        duplicadasEst:    0,
        operadoresNaoEncontrados: naoEncontradosBP,
        errosParse:       errosBP,
        linhas:           analitico,
        linhasDiario:     diario,
        dia:              diaReferencia(diario) ?? dayKeyDiario(new Date()),
        operadoresMap:    map,
        matches,
        todosPerfis,
        loteId:           crypto.randomUUID(),
        mes:              mesBP,
      });
      setEstado('preview');
      return;
    }

    // ── PaguePlay: fluxo original (relatório analítico dedicado) ──
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

    const res = await importarLoteAnalitico(
      empresa.id,
      perfil.id,
      preview.loteId,
      preview.linhas,
      mapFinal,
      // BookPlay: setor da importação (dá dono aos órfãos). PP não usa.
      tenant.isPaguePlay ? null : setorImportacao,
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

    if (res.atualizados > 0) {
      toast.success(
        `${res.atualizados} recebimento${res.atualizados !== 1 ? 's' : ''} ` +
        `${res.atualizados !== 1 ? 'tiveram os valores atualizados' : 'teve o valor atualizado'} ` +
        `(NRs que receberam novas parcelas desde a última importação).`,
        { duration: 6000 },
      );
    }

    // Salva snapshot de totais imediatamente após inserção + revínculo
    // (o revínculo altera a contagem de operadores distintos do mês)
    await atualizarResumoMensal(empresa.id, preview.mes);

    if (!tenant.isPaguePlay && preview.linhasDiario && preview.dia) {
      // ── BookPlay: o MESMO relatório também alimenta o Recebimento diário ──
      const resDiario = await importarLoteDiario(
        empresa.id, perfil.id, preview.loteId, preview.dia, preview.linhasDiario, mapFinal,
      );
      const revDiario = await revincularOrfaosDiario(empresa.id, preview.dia, mapFinal);
      const notifsDiario = mesclarNovosPorOperador(resDiario.novosPorOperador, revDiario.novosPorOperador);
      await notificarImportacaoDiario(empresa.id, preview.dia, notifsDiario);
    } else {
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
    await notificarImportacaoAnalitico(
      empresa.id,
      preview.mes,
      perfil.nome ?? 'Líder',
      {
        setorId:     setorImportacao,
        operadorIds: [...new Set(Object.values(mapFinal).filter((v): v is string => !!v))],
      },
    );

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
