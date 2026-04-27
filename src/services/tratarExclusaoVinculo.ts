/**
 * tratarExclusaoVinculo.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Quando um acordo com vínculo Direto/Extra é excluído, o OUTRO lado do
 * par precisa ser ajustado — senão ele fica órfão com referências a um
 * operador inexistente, tags inconsistentes e lista deduplicada quebrada.
 *
 * Regras (2026-04-21):
 *
 *   • Excluído o DIRETO:
 *       → o lado EXTRA é PROMOVIDO a DIRETO (vinculo_operador_* → null,
 *         tipo_vinculo = 'direto'). O operador do extra recebe notificação.
 *         O registro em nr_registros é transferido para esse operador.
 *
 *   • Excluído o EXTRA:
 *       → o lado DIRETO perde a referência ao extra (vinculo_operador_* →
 *         null). O operador do direto recebe notificação. Nada muda em
 *         nr_registros (o Direto já era titular).
 *
 *   • Caso não haja par: função no-op — o chamador segue normalmente.
 *
 * Esta função DEVE ser chamada ANTES de deletar o acordo principal, pois
 * usa a informação dele (empresa_id, instituicao/nr_cliente, operador_id)
 * para localizar o par.
 */
import { supabase, type Acordo } from '@/lib/supabase';
import { criarNotificacao } from '@/services/notificacoes.service';
import { transferirNr } from '@/services/nr_registros.service';

type Params = {
  acordo: Acordo;
  isPaguePlay: boolean;
  /** Nome do operador que está efetuando a exclusão (para a notificação). */
  operadorExecutorNome?: string | null;
};

export async function tratarExclusaoVinculo({
  acordo,
  isPaguePlay,
  operadorExecutorNome,
}: Params): Promise<void> {
  // 0. Saída rápida: acordos sem empresa_id não têm como parear.
  if (!acordo.empresa_id) return;

  const campoChave: 'instituicao' | 'nr_cliente' = isPaguePlay ? 'instituicao' : 'nr_cliente';
  const valorChave = (acordo[campoChave] as string | null | undefined) ?? '';
  if (!valorChave.trim()) return;

  const tipoAtual = (acordo.tipo_vinculo ?? 'direto') as 'direto' | 'extra';

  // 1. Localizar o outro lado do par.
  //    • Se este é DIRETO → procuro EXTRA com a mesma chave + empresa.
  //    • Se este é EXTRA  → procuro DIRETO com a mesma chave + empresa.
  const outroTipo: 'direto' | 'extra' = tipoAtual === 'direto' ? 'extra' : 'direto';

  const { data: parData, error: errBusca } = await supabase
    .from('acordos')
    .select('id, operador_id, vinculo_operador_id, vinculo_operador_nome, tipo_vinculo, empresa_id')
    .eq('empresa_id', acordo.empresa_id)
    .eq(campoChave, valorChave.trim())
    .eq('tipo_vinculo', outroTipo)
    .neq('id', acordo.id)
    .maybeSingle();

  if (errBusca) {
    console.warn('[tratarExclusaoVinculo] erro ao buscar par:', errBusca.message);
    return;
  }
  if (!parData) return; // sem par: no-op

  // 2. Ações conforme quem está sendo excluído.
  if (tipoAtual === 'direto') {
    // Excluiu o DIRETO → promover o EXTRA a DIRETO.
    const { error: errUp } = await supabase
      .from('acordos')
      .update({
        tipo_vinculo:          'direto',
        vinculo_operador_id:   null,
        vinculo_operador_nome: null,
      })
      .eq('id', parData.id);

    if (errUp) {
      console.warn('[tratarExclusaoVinculo] falha ao promover extra→direto:', errUp.message);
      return;
    }

    // Transferir titularidade em nr_registros para o operador do ex-extra.
    try {
      // Precisamos do nome do operador — buscamos rápido se não tiver.
      let nomeOp = '';
      if (parData.operador_id) {
        const { data: perf } = await supabase
          .from('perfis')
          .select('nome')
          .eq('id', parData.operador_id)
          .maybeSingle();
        nomeOp = (perf as { nome?: string } | null)?.nome ?? '';
      }
      await transferirNr({
        empresaId:        acordo.empresa_id,
        nrValue:          valorChave.trim(),
        campo:            campoChave,
        novoOperadorId:   parData.operador_id,
        novoOperadorNome: nomeOp,
        novoAcordoId:     parData.id,
      });
    } catch (e) {
      console.warn('[tratarExclusaoVinculo] falha ao transferirNr após delete do direto', e);
    }

    // Notificar o dono do ex-extra.
    try {
      await criarNotificacao({
        usuario_id: parData.operador_id,
        empresa_id: acordo.empresa_id,
        titulo:     'Seu acordo EXTRA virou DIRETO',
        mensagem:
          `O acordo ${isPaguePlay ? `da inscrição ${valorChave}` : `do NR ${valorChave}`} ` +
          `foi excluído pelo operador ${operadorExecutorNome ?? 'responsável'}. ` +
          `Como você tinha o vínculo EXTRA, seu acordo foi promovido a DIRETO ` +
          `e as tags de vínculo foram removidas.`,
      });
    } catch (e) {
      console.warn('[tratarExclusaoVinculo] falha ao notificar ex-extra', e);
    }
    return;
  }

  // tipoAtual === 'extra' → DIRETO perde a referência ao extra.
  const { error: errUp } = await supabase
    .from('acordos')
    .update({
      vinculo_operador_id:   null,
      vinculo_operador_nome: null,
    })
    .eq('id', parData.id);

  if (errUp) {
    console.warn('[tratarExclusaoVinculo] falha ao limpar vínculo do direto:', errUp.message);
    return;
  }

  try {
    await criarNotificacao({
      usuario_id: parData.operador_id,
      empresa_id: acordo.empresa_id,
      titulo:     'Vínculo EXTRA removido',
      mensagem:
        `O acordo EXTRA ${isPaguePlay ? `da inscrição ${valorChave}` : `do NR ${valorChave}`} ` +
        `foi excluído pelo operador ${operadorExecutorNome ?? 'responsável'}. ` +
        `Seu acordo DIRETO continua ativo, mas agora sem a informação de vínculo EXTRA.`,
    });
  } catch (e) {
    console.warn('[tratarExclusaoVinculo] falha ao notificar direto', e);
  }
}

export default tratarExclusaoVinculo;
