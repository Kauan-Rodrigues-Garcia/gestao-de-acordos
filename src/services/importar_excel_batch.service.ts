/**
 * Processamento em lote da importação de Excel.
 *
 * Recebe a lista de registros já classificados + metadados do operador
 * e empresa, e aplica para cada NR a persistência correspondente à
 * categoria (novo/disponivel/extra/direto/duplicado-autorizado).
 *
 * Espelha os Casos A/B/C já implementados em `AcordoNovoInline` mas em
 * modo não-interativo (batch). Reutiliza os serviços existentes:
 *   - `enviarParaLixeira` (lixeira_acordos.service) — Caso C
 *   - `criarNotificacao` (notificacoes.service)    — A/B/C
 *   - `supabase.from('acordos')` / ('nr_registros') / ('logs_sistema')
 *
 * NÃO importa NRs 'duplicado' sem autorização — eles permanecem bloqueados
 * e são devolvidos em `bloqueados` para o caller exibir.
 */

import { supabase } from '@/lib/supabase';
import type { Acordo } from '@/lib/supabase';
import { criarNotificacao } from './notificacoes.service';
import { enviarParaLixeira } from './lixeira.service';
import type { ClassificacaoNR } from './classificar_nrs_import.service';

/** Registro pronto para ser inserido (payload básico de `acordos`). */
export interface PayloadAcordoImport {
  /** Linha original na planilha (para casar com a classificação). */
  linhaOriginal:  number;
  /** Campos do acordo — omitimos `tipo_vinculo` e `vinculo_*` porque são
   *  definidos pelo fluxo de classificação (extra/direto). */
  registro:       Record<string, unknown>;
  /** NR (valor do campo-chave: nr_cliente ou instituicao). */
  nr:             string;
  /** Nome do cliente (para mensagens de notificação). */
  nomeCliente:    string;
}

export interface ProcessarBatchParams {
  payloads:          PayloadAcordoImport[];
  classificacao:     ClassificacaoNR[];
  /** Conjunto de linhas cuja autorização de líder foi concedida pelo usuário. */
  linhasAutorizadas: Set<number>;
  /** Dados do líder que autorizou (presente se houver qualquer linha autorizada). */
  autorizador?: {
    uid:    string;
    nome:   string;
    perfil: string;
  } | null;
  /** Operador que está importando. */
  operadorAtual: { id: string; nome: string };
  empresaId:     string;
  /** Label do campo NR ('NR' ou 'Inscrição') para as mensagens. */
  labelNr:       string;
  /** É PaguePlay? Serve para montar a mensagem de notificação. */
  isPaguePlay:   boolean;
  /** Tamanho de batch para o insert padrão. */
  batchSize?:    number;
}

export interface ResultadoBatchImport {
  /** Qtd de registros efetivamente inseridos no banco. */
  inseridos: number;
  /** Registros bloqueados por ausência de autorização. */
  bloqueados: Array<{ linhaOriginal: number; nr: string; motivo: string }>;
  /** Mensagens de erro (por lote ou por operação crítica). */
  erros: string[];
}

/**
 * Executa a persistência seguindo a classificação.
 *
 * Ordem de processamento:
 *   1. Processa individualmente os NRs 'extra', 'direto' e 'duplicado
 *      autorizado' (esses não podem ir em lote simples porque precisam de
 *      updates/deletes auxiliares).
 *   2. Processa em lote (batches de BATCH) os NRs 'novo'/'disponivel' e
 *      aqueles do próprio operador (que são pulados) — insert direto.
 */
export async function processarImportacaoEmLote(
  params: ProcessarBatchParams,
): Promise<ResultadoBatchImport> {
  const BATCH = params.batchSize ?? 50;
  const resultado: ResultadoBatchImport = {
    inseridos:  0,
    bloqueados: [],
    erros:      [],
  };

  // Indexa classificação por linha.
  const classifPorLinha = new Map<number, ClassificacaoNR>();
  for (const c of params.classificacao) classifPorLinha.set(c.linhaOriginal, c);

  const paraInserirSimples: PayloadAcordoImport[] = [];

  for (const p of params.payloads) {
    const classif = classifPorLinha.get(p.linhaOriginal);
    // Fallback defensivo: se não achou classificação, trata como novo.
    const categoria = classif?.categoria ?? 'novo';

    if (categoria === 'novo' || categoria === 'disponivel') {
      paraInserirSimples.push(p);
      continue;
    }

    if (categoria === 'duplicado') {
      // Duplicado do próprio operador → pula silenciosamente.
      if (classif && classif.donoAtual?.operadorId === params.operadorAtual.id) {
        resultado.bloqueados.push({
          linhaOriginal: p.linhaOriginal,
          nr: p.nr,
          motivo: `${params.labelNr} já pertence ao operador atual`,
        });
        continue;
      }
      if (!classif) {
        paraInserirSimples.push(p);
        continue;
      }
      // Duplicado bloqueado: só processa se autorizado.
      if (!params.linhasAutorizadas.has(p.linhaOriginal) || !params.autorizador) {
        resultado.bloqueados.push({
          linhaOriginal: p.linhaOriginal,
          nr: p.nr,
          motivo: 'Sem autorização de líder',
        });
        continue;
      }
      // Caso C — transferência autorizada por líder.
      const ok = await aplicarCasoC(p, classif, params, resultado.erros);
      if (ok) resultado.inseridos += 1;
      continue;
    }

    if (categoria === 'extra') {
      // Caso A — insere como EXTRA vinculado ao acordo do outro operador.
      const ok = await aplicarCasoA(p, classif!, params, resultado.erros);
      if (ok) resultado.inseridos += 1;
      continue;
    }

    if (categoria === 'direto') {
      // Caso B cruzado — insere como DIRETO e rebaixa o acordo anterior para EXTRA.
      const ok = await aplicarCasoBCruzado(p, classif!, params, resultado.erros);
      if (ok) resultado.inseridos += 1;
      continue;
    }
  }

  // Insert em lote dos 'novo'/'disponivel'.
  for (let i = 0; i < paraInserirSimples.length; i += BATCH) {
    const lote = paraInserirSimples.slice(i, i + BATCH).map(p => p.registro);
    const { error, data } = await supabase.from('acordos').insert(lote).select('id');
    if (error) {
      resultado.erros.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`);
    } else {
      resultado.inseridos += data?.length ?? lote.length;
    }
  }

  return resultado;
}

/** ── CASO A: operador atual tem lógica. Insere como EXTRA. ──────────── */
async function aplicarCasoA(
  p: PayloadAcordoImport,
  classif: ClassificacaoNR,
  params: ProcessarBatchParams,
  erros: string[],
): Promise<boolean> {
  const dono = classif.donoAtual;
  if (!dono) { erros.push(`Linha ${p.linhaOriginal}: dono ausente no Caso A`); return false; }

  const registro = {
    ...p.registro,
    tipo_vinculo:          'extra',
    vinculo_operador_id:   dono.operadorId,
    vinculo_operador_nome: dono.operadorNome,
  };

  const { error: errInsert } = await supabase.from('acordos').insert(registro);
  if (errInsert) {
    erros.push(`Linha ${p.linhaOriginal} (EXTRA): ${errInsert.message}`);
    return false;
  }

  // Referencia o acordo EXTRA no DIRETO do outro operador.
  await supabase
    .from('acordos')
    .update({
      vinculo_operador_id:   params.operadorAtual.id,
      vinculo_operador_nome: params.operadorAtual.nome,
    })
    .eq('id', dono.acordoId);
  await criarNotificacao({
    usuario_id: dono.operadorId,
    titulo:     '📎 Novo acordo EXTRA vinculado ao seu',
    mensagem:
      `O ${params.labelNr} "${p.nr}" (${p.nomeCliente || '—'}) ` +
      `agora possui um acordo EXTRA tabulado via importação por ${params.operadorAtual.nome}. ` +
      `O seu acordo (Direto) continua ativo normalmente.`,
    empresa_id: params.empresaId,
  });

  return true;
}

/** ── CASO B cruzado: operador atual NÃO tem lógica, dono TEM. ────────
 *  Novo acordo entra como DIRETO e o do outro operador é rebaixado a EXTRA. */
async function aplicarCasoBCruzado(
  p: PayloadAcordoImport,
  classif: ClassificacaoNR,
  params: ProcessarBatchParams,
  erros: string[],
): Promise<boolean> {
  const dono = classif.donoAtual;
  if (!dono) { erros.push(`Linha ${p.linhaOriginal}: dono ausente no Caso B`); return false; }

  // 1. Rebaixar o acordo anterior a EXTRA.
  const { error: errRebaixar } = await supabase
    .from('acordos')
    .update({
      tipo_vinculo:          'extra',
      vinculo_operador_id:   params.operadorAtual.id,
      vinculo_operador_nome: params.operadorAtual.nome,
    })
    .eq('id', dono.acordoId);
  if (errRebaixar) {
    erros.push(`Linha ${p.linhaOriginal} (rebaixar): ${errRebaixar.message}`);
    return false;
  }

  // 2. Liberar o NR do operador anterior.
  await supabase.from('nr_registros').delete().eq('acordo_id', dono.acordoId);

  // 3. Inserir novo acordo como DIRETO vinculado ao antigo EXTRA.
  const registroDireto = {
    ...p.registro,
    tipo_vinculo:          'direto',
    vinculo_operador_id:   dono.operadorId,
    vinculo_operador_nome: dono.operadorNome,
  };
  const { error: errInsert } = await supabase.from('acordos').insert(registroDireto);
  if (errInsert) {
    erros.push(`Linha ${p.linhaOriginal} (DIRETO): ${errInsert.message}`);
    return false;
  }

  await criarNotificacao({
    usuario_id: dono.operadorId,
    titulo:     '🔄 Seu acordo foi convertido em EXTRA',
    mensagem:
      `O ${params.labelNr} "${p.nr}" (${p.nomeCliente || '—'}) ` +
      `foi tabulado como DIRETO via importação por ${params.operadorAtual.nome}. ` +
      `Seu acordo continua ativo, porém agora como EXTRA vinculado a ele.`,
    empresa_id: params.empresaId,
  });

  return true;
}

/** ── CASO C: duplicado autorizado por líder. Transferência completa. ── */
async function aplicarCasoC(
  p: PayloadAcordoImport,
  classif: ClassificacaoNR,
  params: ProcessarBatchParams,
  erros: string[],
): Promise<boolean> {
  const dono = classif.donoAtual;
  const autorizador = params.autorizador;
  if (!dono || !autorizador) {
    erros.push(`Linha ${p.linhaOriginal}: faltam dados para autorização`);
    return false;
  }

  // 1. Buscar acordo anterior completo.
  const { data: acordoAntData } = await supabase
    .from('acordos')
    .select(
      'id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao',
    )
    .eq('id', dono.acordoId)
    .maybeSingle();

  // 2. Enviar para a lixeira.
  if (acordoAntData) {
    await enviarParaLixeira({
      acordo:              acordoAntData as Acordo,
      motivo:              'transferencia_nr',
      operadorNome:        dono.operadorNome,
      autorizadoPorId:     autorizador.uid,
      autorizadoPorNome:   autorizador.nome,
      transferidoParaId:   params.operadorAtual.id,
      transferidoParaNome: params.operadorAtual.nome,
    });
  }

  // 3. Deletar acordo anterior (trigger remove nr_registros).
  const { error: errDelete } = await supabase
    .from('acordos')
    .delete()
    .eq('id', dono.acordoId);
  if (errDelete) {
    erros.push(`Linha ${p.linhaOriginal} (DELETE anterior): ${errDelete.message}`);
    return false;
  }

  // 4. Inserir novo acordo.
  const { error: errInsert } = await supabase.from('acordos').insert(p.registro);
  if (errInsert) {
    erros.push(`Linha ${p.linhaOriginal} (INSERT novo): ${errInsert.message}`);
    return false;
  }

  // 5. Log em logs_sistema.
  await supabase.from('logs_sistema').insert({
    usuario_id:  params.operadorAtual.id,
    acao:        'transferencia_nr_import',
    tabela:      'acordos',
    registro_id: dono.acordoId,
    empresa_id:  params.empresaId,
    detalhes: {
      nr:                p.nr,
      nome_cliente:      acordoAntData?.nome_cliente ?? p.nomeCliente,
      valor:             acordoAntData?.valor ?? null,
      vencimento:        acordoAntData?.vencimento ?? null,
      status_anterior:   acordoAntData?.status ?? null,
      aprovado_por:      autorizador.nome,
      aprovado_por_id:   autorizador.uid,
      operador_anterior: dono.operadorId,
      operador_anterior_nome: dono.operadorNome,
      operador_novo:     params.operadorAtual.id,
      operador_novo_nome: params.operadorAtual.nome,
      origem:            'import_excel',
    },
  });

  // 6. Notificar operador anterior.
  await criarNotificacao({
    usuario_id: dono.operadorId,
    titulo:     '⚠️ Seu acordo foi transferido pelo líder (importação)',
    mensagem:
      `O ${params.labelNr} "${p.nr}" (${acordoAntData?.nome_cliente ?? p.nomeCliente}) ` +
      `foi transferido para ${params.operadorAtual.nome} ` +
      `via importação de planilha com autorização de ${autorizador.nome}. ` +
      `Seu acordo foi movido para a lixeira.`,
    empresa_id: params.empresaId,
  });

  return true;
}
