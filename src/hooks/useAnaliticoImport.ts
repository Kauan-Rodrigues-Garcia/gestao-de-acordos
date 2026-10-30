import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
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
  importarLote994,
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
  assinaturaDe,
  buscarAssinatura,
  compararAssinatura,
  registrarAssinatura,
  type MudancaDeColunas,
  type TipoRelatorio,
} from '@/services/relatorio/assinaturaColunas';
import {
  chaveDaLinha,
  diaISO,
  preverRemocao,
  preverRemocao994,
  arquivoComecaNoInicioDoMes,
  type RemocaoPrevista,
} from '@/services/analitico/remocaoPrevista';
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
  /**
   * Colchão fora da meta: lido do arquivo e descartado — não entra no
   * Analítico. Desde 21/10/2026 também não é gravado em lugar nenhum (a aba
   * Colchão foi para o arquivo morto); fica aqui para o aviso da prévia.
   */
  linhasColchao:    LinhaColchao[];
  /** Colchão excepcionalmente aceito no Analítico de 01 a 14/08/2026. */
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
  /**
   * O cabeçalho mudou em relação ao que o ERP vinha mandando?
   *
   * `null` quando não mudou, ou quando é a primeira importação deste tipo.
   * Não bloqueia a importação — quem manda decide se o formato novo é legítimo.
   * Ver `assinaturaColunas.ts`.
   */
  mudancaDeColunas: MudancaDeColunas | null;
  /** O cabeçalho lido, normalizado. Registrado quando a importação é confirmada. */
  assinatura: string[];
  /** Qual relatório é: o 58 ou o 994 da Retenção do Jornada. */
  relatorio: RelatorioDoImport;
  /** Só no 994: o que a prévia precisa dizer (ver `ResultadoParse994`). */
  resumo994?: {
    /** O total do arquivo por pessoa — o número do ERP. */
    totalPorOperador:   Record<string, SomaLinhas>;
    /** Pagamento com data futura, lançado na data do acordo. */
    naDataDoAcordo:     SomaLinhas;
    /** Linha sem Nr. Doc., gravada com o Cód. Acordo. */
    peloCodigoDoAcordo: SomaLinhas;
    /** Linhas de outros subgrupos, que vêm pelo 58/59. */
    outraEquipe:        SomaLinhas;
  };
}

interface SomaLinhas { linhas: number; valor: number }

/** O 58 (pagamento mensal) ou o 994 (Retenção do Jornada) — ver `PROCEDENCIA_994`. */
export type RelatorioDoImport = '58' | '994';


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
  const [resultado,   setResultado] = useState<ResultadoImportacao | null>(null);
  const [erroGeral,   setErroGeral] = useState<string | null>(null);

  // Vínculos manuais definidos pelo usuário no preview: username_arquivo → perfil_id
  const [vinculosManuais, setVinculosManuais] = useState<Record<string, string>>({});

  /**
   * Qual relatório o botão abriu. Cada um tem o seu parser, e cada parser
   * recusa o arquivo do outro com o caminho certo na mensagem.
   */
  const [relatorio, setRelatorio] = useState<RelatorioDoImport>('58');

  /**
   * O que a sincronização mensal vai APAGAR se este arquivo for confirmado.
   *
   * `null` enquanto não dá para saber: sem setor escolhido, ou na PaguePlay,
   * onde a importação é incremental e não remove nada.
   */
  const [remocaoPrevista, setRemocaoPrevista] = useState<RemocaoPrevista | null>(null);

  // ── Setor da importação ───────────────────────────────────────────────────
  // O relatório é de UM setor. Quem só enxerga o próprio setor não tem o que
  // escolher — é o dele. Quem enxerga mais de um PRECISA dizer de qual setor é
  // o arquivo, senão o carimbo sai errado e o acumulado do setor vai junto.
  const setorAutomatico = perfil?.setor_id ?? null;
  const [setorEscolhido, setSetorEscolhido] = useState<string | null>(null);
  /**
   * Enxerga mais de um setor? Vem do escopo DA ABA ANALÍTICO, e de nenhuma
   * outra — o dashboard tem o dele. Antes saía de `veTodosOsSetores`, que
   * misturava cargo com duas chaves globais e respondia por várias telas ao
   * mesmo tempo.
   */
  const veTodosSetores = escopoEfetivo('analitico', temPermissao) === 'todos_setores';

  // Item 9: quando o setor do importador é ALTERNATIVO (ex.: Digital), o
  // relatório na verdade é de outro setor (Play 4/5). Ele deve escolher o setor
  // de ORIGEM e a importação carimba esse setor — como se alguém dele tivesse
  // importado. Setor alternativo não é o dono das linhas.
  //
  // `null` = ainda não se sabe. Enquanto isso o seletor aparece: antes o valor
  // nascia `false`, e quem confirmasse antes da consulta voltar (ou com ela
  // falhando) carimbava o relatório no PRÓPRIO alternativo, sem ver o seletor.
  // Decide pelo setor, não pela empresa (CLAUDE.md): alternativo da PaguePlay
  // também não tem relatório próprio.
  const [setorProprioAlternativo, setSetorProprioAlternativo] = useState<boolean | null>(null);
  useEffect(() => {
    if (!setorAutomatico) { setSetorProprioAlternativo(false); return; }
    setSetorProprioAlternativo(null);
    let cancel = false;
    supabase.from('setores').select('alternativo').eq('id', setorAutomatico).maybeSingle()
      .then(({ data, error }) => {
        if (cancel) return;
        // Sem resposta, pede o setor: escolher a mais é inofensivo, carimbar o
        // alternativo não.
        setSetorProprioAlternativo(error ? true : !!(data as { alternativo?: boolean } | null)?.alternativo);
      });
    return () => { cancel = true; };
  }, [setorAutomatico]);

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
  const usarSetorEscolhido = !setorAutomatico || setorProprioAlternativo !== false || veTodosSetores;
  const setorImportacao = usarSetorEscolhido ? setorEscolhido : setorAutomatico;
  /** true quando o modal precisa exibir o seletor de setor. */
  const precisaEscolherSetor = usarSetorEscolhido;

  /*
   * O que não veio no arquivo sai do setor/mês?
   *
   * Nosso produto: sempre — o 58 é o retrato do mês. Cofen (26/10/2026): também,
   * desde que o arquivo comece no início do mês. Incremental, ela guardava a
   * linha velha quando o ERP trocava o operador do pagamento, e o dinheiro
   * contava duas vezes (R$ 33.613,83 no Conecta Play em outubro).
   */
  const sincronizaAusentes = !!preview && (
    !tenant.isPaguePlay
    // O 994 é o retrato do mês da Retenção e só remove linha do 994. A folga
    // do início do mês não serve aqui: três pessoas podem não receber nada
    // nos primeiros dias, e a remoção nunca aconteceria.
    || preview.relatorio === '994'
    || arquivoComecaNoInicioDoMes(preview.linhas.map(l => l.data_pagamento), preview.mes)
  );

  /*
   * A remoção é recalculada quando o setor muda, e não só ao ler o arquivo.
   *
   * Quem enxerga mais de um setor escolhe o setor DENTRO do modal, depois do
   * parse. Calcular só uma vez mostraria a previsão do setor errado — ou
   * nenhuma, que é pior: a tela ficaria silenciosa justamente no caso em que a
   * pessoa está prestes a carimbar o arquivo no lugar errado.
   *
   * Só quando a importação vai remover (`sincronizaAusentes`).
   */
  useEffect(() => {
    if (!preview || !empresa?.id || !sincronizaAusentes || !setorImportacao) {
      setRemocaoPrevista(null);
      return;
    }
    let cancelado = false;
    const chaves = preview.linhas.map(l => chaveDaLinha(
      l.operador_usuario, l.codigo, diaISO(l.data_pagamento), l.forma_pagamento,
    ));
    (preview.relatorio === '994'
      ? preverRemocao994(empresa.id, setorImportacao, preview.mes, chaves,
          [...new Set(preview.linhas.map(l => l.operador_usuario))])
      : preverRemocao(empresa.id, setorImportacao, preview.mes, chaves))
      .then(r => { if (!cancelado) setRemocaoPrevista(r); })
      // Falhar a previsão não pode impedir a importação — o aviso é um extra,
      // e ficar sem importar o relatório do dia é pior que importar sem ele.
      .catch(() => { if (!cancelado) setRemocaoPrevista(null); });
    return () => { cancelado = true; };
  }, [preview, empresa?.id, sincronizaAusentes, setorImportacao]);

  /**
   * O cabeçalho mudou desde a última importação aceita?
   *
   * Falha ao consultar NÃO impede a importação: a armadilha é um aviso, e
   * derrubar o fluxo por causa dela trocaria um risco por outro maior — ficar
   * sem importar o relatório do dia é pior que importar sem a conferência.
   */
  const conferirColunas = useCallback(async (
    empresaId: string,
    tipo: TipoRelatorio,
    cabecalho: string[],
  ): Promise<{ assinatura: string[]; mudanca: MudancaDeColunas | null }> => {
    const assinatura = assinaturaDe(cabecalho);
    try {
      const conhecida = await buscarAssinatura(empresaId, tipo);
      return {
        assinatura,
        mudanca: compararAssinatura(conhecida?.colunas, assinatura, conhecida?.importacoes ?? 0),
      };
    } catch {
      return { assinatura, mudanca: null };
    }
  }, []);

  const carregarArquivo = useCallback(async (file: File) => {
    if (!empresa?.id) return;
    setEstado('parsing');
    setErroGeral(null);
    setVinculosManuais({});

    // ── 994: a Retenção do Jornada, só para o Analítico ──────────────────────
    // Não alimenta o Recebimento diário: o diário da BookPlay sai do 58, e o
    // 994 não traz a hora nem a tabulação que ele mostra.
    if (relatorio === '994') {
      const { parseRelatorio994 } = await import('@/services/relatorio994/relatorio994Parser');
      const {
        cabecalho, linhas, totalPorOperador, naDataDoAcordo, peloCodigoDoAcordo, fora, erros,
      } = await parseRelatorio994(file);
      if (!linhas.length) {
        setErroGeral(
          erros.length
            ? erros.join('\n')
            : fora.outraEquipe.linhas > 0
              ? `Nenhuma linha da Retenção a importar: as ${fora.outraEquipe.linhas} linhas são de outras equipes.`
              : 'Nenhuma linha válida encontrada no arquivo.',
        );
        setEstado('error');
        return;
      }
      const usuarios = [...new Set(linhas.map(l => l.operador_usuario))];
      const { map, matches, todosPerfis } = await resolverOperadores(empresa.id, usuarios);
      const meses = linhas.map(l => `${l.data_pagamento.getFullYear()}-${String(l.data_pagamento.getMonth() + 1).padStart(2, '0')}`);
      const contagem = meses.reduce<Record<string, number>>((acc, m) => { acc[m] = (acc[m] ?? 0) + 1; return acc; }, {});
      const colunas = await conferirColunas(empresa.id, 'analitico_994', cabecalho);

      setPreview({
        linhasTotais:     linhas.length,
        linhasNovas:      linhas.length,
        duplicadasEst:    0,
        operadoresNaoEncontrados: usuarios.filter(u => map[u] === null),
        errosParse:       erros,
        linhas,
        linhasColchao:    [],
        colchaoNaMeta:    { linhas: 0, valor: 0 },
        operadoresMap:    map,
        matches,
        todosPerfis,
        loteId:           crypto.randomUUID(),
        mes:              Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
        retencaoRemovidas: 0,
        mudancaDeColunas: colunas.mudanca,
        assinatura:       colunas.assinatura,
        relatorio:        '994',
        resumo994:        { totalPorOperador, naDataDoAcordo, peloCodigoDoAcordo, outraEquipe: fora.outraEquipe },
      });
      setEstado('preview');
      return;
    }

    // ── BookPlay: um relatório alimenta Analítico + Diário + Colchão ─────────
    if (!tenant.isPaguePlay) {
      // xlsx entra aqui, sob demanda (ver comentário do import no topo).
      const { parseRelatorioBookplay } = await import('@/services/bookplay/bookplayRecebimentoParser');
      const {
        cabecalho,
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

      const colunasBP = await conferirColunas(empresa.id, 'analitico_bookplay', cabecalho);

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
        mudancaDeColunas: colunasBP.mudanca,
        assinatura:       colunasBP.assinatura,
        relatorio:        '58',
      });
      setEstado('preview');
      return;
    }

    // ── PaguePlay: fluxo original (relatório analítico dedicado) ──
    // xlsx entra aqui, sob demanda (ver comentário do import no topo).
    const { parseRelatorioExcel } = await import('@/services/analitico/analiticoParser');
    const {
      cabecalho, linhas, linhasColchao, colchaoNaMeta, erros, retencaoRemovidas,
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

    const colunasPP = await conferirColunas(empresa.id, 'analitico_pagueplay', cabecalho);

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
      mudancaDeColunas: colunasPP.mudanca,
      assinatura:       colunasPP.assinatura,
      relatorio:        '58',
    });
    setEstado('preview');
  }, [empresa?.id, tenant.isPaguePlay, conferirColunas, relatorio]);

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

    // 994: o mês de quem veio no arquivo é trocado pelo arquivo inteiro, no
    // banco, numa transação (`importarLote994`). Sem setor não há o que trocar.
    const eh994 = preview.relatorio === '994';
    if (eh994 && !setorImportacao) {
      setErroGeral('Escolha o setor do 994 antes de importar.');
      setEstado('preview');
      return;
    }

    // O Colchão fora da meta não é gravado: a aba que o acompanhava saiu em
    // 21/10/2026. A regra continua — o parser já o tirou de `preview.linhas`.
    const res994 = eh994
      ? await importarLote994(
          empresa.id, perfil.id, preview.loteId, preview.linhas, mapFinal,
          setorImportacao as string, preview.mes,
        )
      : null;
    const res = res994 ?? await importarLoteAnalitico(
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
      // O relatório 58 é o retrato completo do mês: uma reimportação remove do
      // mesmo setor/mês as linhas que sumiram da origem (ou que o ERP passou
      // para outro operador). Na regra Cofen, só quando o arquivo começa no
      // início do mês — ver `sincronizaAusentes`.
      { sincronizarAusentesDoSetor: sincronizaAusentes, procedencia: 'relatorio_58' },
    );

    /*
     * O formato aceito vira o novo normal — mas só aqui, depois de a importação
     * ter acontecido de verdade. Um arquivo que a pessoa olhou no preview e
     * descartou não pode redefinir o que o ERP "costuma mandar".
     *
     * `void` de propósito: registrar a assinatura é conveniência da próxima
     * importação, não parte desta. Se falhar, a próxima compara com o formato
     * anterior e no máximo avisa de novo.
     */
    if (preview.assinatura.length > 0) {
      void registrarAssinatura(
        empresa.id,
        preview.relatorio === '994'
          ? 'analitico_994'
          : tenant.isPaguePlay ? 'analitico_pagueplay' : 'analitico_bookplay',
        preview.assinatura,
      ).catch(() => { /* aviso não pode derrubar importação concluída */ });
    }

    const ignoradasPorOutro = res.ignoradasPorOutroRelatorio ?? 0;
    if (ignoradasPorOutro > 0) {
      toast.info(
        `${ignoradasPorOutro} pagamento${ignoradasPorOutro !== 1 ? 's' : ''} não ${ignoradasPorOutro !== 1 ? 'entraram' : 'entrou'}: `
        + `o mesmo NR no mesmo dia já veio pelo 994 da Retenção e contaria duas vezes.`,
        { duration: 9000 },
      );
    }

    if (res994) {
      const { espelhos, ignoradas, foraDoMes } = res994;
      const avisos: string[] = [];
      if (espelhos > 0) {
        avisos.push(`${espelhos} pagamento${espelhos !== 1 ? 's são' : ' é'} extra de outro setor pelo 59: `
          + 'conta para a Retenção e uma vez só no total da empresa.');
      }
      if (ignoradas > 0) {
        avisos.push(`${ignoradas} linha${ignoradas !== 1 ? 's' : ''} não ${ignoradas !== 1 ? 'entraram' : 'entrou'}: `
          + 'o mesmo pagamento já está em outro setor ou numa correção manual.');
      }
      if (foraDoMes > 0) {
        avisos.push(`${foraDoMes} linha${foraDoMes !== 1 ? 's' : ''} de outro mês não ${foraDoMes !== 1 ? 'entraram' : 'entrou'}.`);
      }
      if (avisos.length) toast.info(avisos.join(' '), { duration: 10000 });
    }

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

    /*
     * O setor é sincronizado pelo 59.
     *
     * Desde 19/10/2026 o 58 grava, nesse setor, só o que o 59 ainda não tem —
     * hoje e ontem, NR+dia novos (`linhasDo58NoMesDo59`). O resto do arquivo é
     * lido, conferido para a remoção dos ausentes, e não regravado. Dizer isso
     * evita a pergunta «importei 4 mil linhas e entraram 30, sumiu o resto?».
     */
    if (res.sincronizadoPelo59) {
      const ignoradas = res.ignoradasPelo59 ?? 0;
      toast.info(
        'Este setor é sincronizado pelo relatório 59. '
        + (ignoradas > 0
          ? `${ignoradas} linha${ignoradas !== 1 ? 's' : ''} já ${ignoradas !== 1 ? 'estão' : 'está'} no 59 e não `
            + `${ignoradas !== 1 ? 'foram regravadas' : 'foi regravada'}; entrou só o que é de hoje e ontem e o 59 ainda não trouxe.`
          : 'Na próxima entrada dele os números são conferidos e ajustados.'),
        { duration: 9000 },
      );
    }

    if (res.atualizados > 0 && !eh994) {
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
    } else if (preview.linhas.length > 0 && preview.relatorio !== '994') {
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
  }, [preview, vinculosManuais, empresa?.id, perfil?.id, perfil?.nome, setorImportacao, tenant.isPaguePlay, sincronizaAusentes]);

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
    /** Qual relatório o modal importa: o botão escolhe antes de abrir. */
    relatorio,
    setRelatorio,
    // Setor da importação (BookPlay)
    precisaEscolherSetor,
    setorImportacao,
    setSetorEscolhido,
    /** true quando o importador é de um setor alternativo (escolhe o setor de origem). */
    setorProprioAlternativo: setorProprioAlternativo === true,
    /** O que a sincronização mensal vai apagar. `null` = nada a prever. */
    remocaoPrevista,
    /** A importação vai remover o que não veio no arquivo (ver acima). */
    sincronizaAusentes,
  };
}
