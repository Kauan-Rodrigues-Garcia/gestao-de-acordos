/**
 * src/services/conflitoNr.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A decisão de "o que fazer quando o NR já é de outro operador", num lugar só.
 *
 * A escada existia copiada em `AcordoNovoInline` e `AcordoForm` — ~60 linhas
 * cada, com os mesmos cinco desvios na mesma ordem. Elas já divergiram uma vez
 * (o próprio código registra isso em comentário), e a edição nunca ganhou a
 * escada: mostrava um toast de "não é possível duplicar" e parava ali, mesmo
 * quando o dono tinha a lógica Direto/Extra ativa e o caminho era liberado.
 *
 * Aqui a decisão é uma função PURA (`decidirConflitoNr`) — dá para cobrir os
 * seis desfechos com teste sem tocar em Supabase. A coleta dos fatos que ela
 * consome fica em `coletarFatosConflitoNr`, também compartilhada, para que as
 * telas não divirjam nem na pergunta que fazem ao banco.
 *
 * A ordem dos desvios é a de docs/REGRAS-DE-NEGOCIO.md §7.3 e não é arbitrária:
 * "dono desligado" vem ANTES de Direto/Extra porque é a diferença entre mudar
 * de dono e criar vínculo com quem não trabalha mais aqui.
 */
import { supabase } from '@/lib/supabase';
import { operadorEstaDesligado } from '@/services/desligamento.service';
import { fetchIsDiretoExtraAtivo } from '@/services/direto_extra.service';
import type { NrConflito } from '@/services/nr_registros.service';

// ─── Fatos ──────────────────────────────────────────────────────────────────

export interface FatosConflitoNr {
  /** O conflito cru vindo de `verificarNrRegistro` / cache local. */
  conflito:       NrConflito;
  /** Quem está tabulando agora. */
  meuOperadorId:  string;
  /** A lógica Direto/Extra está ativa para MIM? */
  euTemLogica:    boolean;
  /** A lógica Direto/Extra está ativa para o DONO do NR? */
  donoTemLogica:  boolean;
  /** O dono do NR foi desligado da empresa? */
  donoDesligado:  boolean;
  /** O acordo do dono já tem um EXTRA pendurado nele? */
  jaTemExtra:     boolean;
  /** Id do acordo EXTRA atual, quando `jaTemExtra`. */
  extraAtualId:     string | null;
  extraAtualOpId:   string | null;
  extraAtualOpNome: string | null;
  /** Setor do dono, só para a mensagem do aviso. */
  donoSetorNome:  string | null;
}

// ─── Decisão ────────────────────────────────────────────────────────────────

export type DecisaoConflitoNr =
  /** O NR já é meu: não é conflito, é parcela nova do meu próprio acordo. */
  | { caso: 'proprio_acordo';     acordoId: string }
  /** Dono saiu da empresa: assumo como DIRETO, sem autorização. */
  | { caso: 'dono_desligado';     acordoId: string; operadorId: string; operadorNome: string }
  /** Já existe um EXTRA no acordo do dono: trocar exige autorização de líder. */
  | { caso: 'troca_extra';        acordoId: string; operadorId: string; operadorNome: string;
                                  extraAtualId: string | null; extraAtualOpId: string | null;
                                  extraAtualOpNome: string | null }
  /** CASO A — eu tenho a lógica, o dono não: eu entro como EXTRA. */
  | { caso: 'eu_viro_extra';      acordoId: string; operadorId: string; operadorNome: string }
  /** CASO B — o dono tem a lógica, eu não: aviso e, ao confirmar, ele cai para EXTRA. */
  | { caso: 'aviso_direto_extra'; acordoId: string; operadorId: string; operadorNome: string;
                                  operadorSetor: string | null }
  /** CASO C/D — ambos ou nenhum têm a lógica: autorização completa de líder. */
  | { caso: 'autorizacao_lider';  acordoId: string; operadorId: string; operadorNome: string };

/**
 * Decide o desfecho de um conflito de NR. Pura de propósito: nenhuma consulta,
 * nenhum toast, nenhum estado de React — só a regra.
 */
export function decidirConflitoNr(fatos: FatosConflitoNr): DecisaoConflitoNr {
  const { conflito, meuOperadorId, euTemLogica, donoTemLogica, donoDesligado, jaTemExtra } = fatos;
  const base = {
    acordoId:     conflito.acordoId,
    operadorId:   conflito.operadorId,
    operadorNome: conflito.operadorNome,
  };

  // 1. O NR é meu — não há conflito de titularidade a resolver.
  if (conflito.operadorId === meuOperadorId) {
    return { caso: 'proprio_acordo', acordoId: conflito.acordoId };
  }

  // 2. Dono desligado, ANTES de Direto/Extra: acordo de quem saiu muda de dono,
  //    não vira vínculo.
  if (donoDesligado) return { caso: 'dono_desligado', ...base };

  // 3. O acordo do dono já tem um EXTRA: substituir o titular do vínculo é
  //    tirar o lugar de um terceiro, e isso passa por líder.
  if (jaTemExtra) {
    return {
      caso: 'troca_extra',
      ...base,
      extraAtualId:     fatos.extraAtualId,
      extraAtualOpId:   fatos.extraAtualOpId,
      extraAtualOpNome: fatos.extraAtualOpNome,
    };
  }

  // 4. CASO A — eu tenho a lógica e o dono não.
  if (euTemLogica && !donoTemLogica) return { caso: 'eu_viro_extra', ...base };

  // 5. CASO B — o dono tem a lógica e eu não.
  if (!euTemLogica && donoTemLogica) {
    return { caso: 'aviso_direto_extra', ...base, operadorSetor: fatos.donoSetorNome };
  }

  // 6. CASO C/D — ambos têm, ou nenhum tem.
  return { caso: 'autorizacao_lider', ...base };
}

// ─── Coleta ─────────────────────────────────────────────────────────────────

/**
 * Reúne os fatos que `decidirConflitoNr` consome.
 *
 * `euTemLogica` chega de fora porque as telas já resolvem isso pelo cache do
 * `useDiretoExtraConfig` (com realtime); refazer a pergunta aqui só somaria
 * uma ida ao banco por tabulação. Do DONO a resposta vem por RPC: o perfil
 * dele pode estar fora do alcance da RLS de quem está tabulando.
 */
export async function coletarFatosConflitoNr(params: {
  conflito:      NrConflito;
  empresaId:     string;
  meuOperadorId: string;
  euTemLogica:   boolean;
  campoChave:    'nr_cliente' | 'instituicao';
  valorChave:    string;
}): Promise<FatosConflitoNr> {
  const { conflito, empresaId, meuOperadorId, euTemLogica, campoChave, valorChave } = params;

  // O NR é meu: nenhum dos fatos abaixo muda a decisão, e cada um deles é uma
  // ida ao banco. Sai cedo.
  if (conflito.operadorId === meuOperadorId) {
    return {
      conflito, meuOperadorId, euTemLogica,
      donoTemLogica: false, donoDesligado: false, jaTemExtra: false,
      extraAtualId: null, extraAtualOpId: null, extraAtualOpNome: null,
      donoSetorNome: null,
    };
  }

  const donoDesligado = await operadorEstaDesligado(conflito.operadorId);
  if (donoDesligado) {
    return {
      conflito, meuOperadorId, euTemLogica,
      donoTemLogica: false, donoDesligado: true, jaTemExtra: false,
      extraAtualId: null, extraAtualOpId: null, extraAtualOpNome: null,
      donoSetorNome: null,
    };
  }

  const { data: acordoDireto } = await supabase
    .from('acordos')
    .select('id, tipo_vinculo, vinculo_operador_id, vinculo_operador_nome')
    .eq('id', conflito.acordoId)
    .maybeSingle();

  const jaTemExtra = Boolean(acordoDireto?.vinculo_operador_id);

  let extraAtualId:     string | null = null;
  let extraAtualOpId:   string | null = null;
  let extraAtualOpNome: string | null = null;

  if (jaTemExtra) {
    const { data: acordoExtraAtual } = await supabase
      .from('acordos')
      .select('id, operador_id, vinculo_operador_nome')
      .eq('empresa_id', empresaId)
      .eq(campoChave, valorChave)
      .eq('tipo_vinculo', 'extra')
      .maybeSingle();

    extraAtualId     = acordoExtraAtual?.id ?? null;
    extraAtualOpId   = acordoExtraAtual?.operador_id ?? acordoDireto?.vinculo_operador_id ?? null;
    extraAtualOpNome = acordoDireto?.vinculo_operador_nome ?? null;

    return {
      conflito, meuOperadorId, euTemLogica,
      donoTemLogica: false, donoDesligado: false, jaTemExtra: true,
      extraAtualId, extraAtualOpId, extraAtualOpNome,
      donoSetorNome: null,
    };
  }

  // Só aqui Direto/Extra importa — os desvios acima já teriam decidido.
  const donoTemLogica = await fetchIsDiretoExtraAtivo({
    userId: conflito.operadorId, empresaId,
  });

  // Setor do dono é enfeite da mensagem do aviso: se a RLS esconder o perfil,
  // o aviso sai sem o setor em vez de o fluxo inteiro cair.
  let donoSetorNome: string | null = null;
  {
    const { data } = await supabase
      .from('perfis').select('setores(nome)').eq('id', conflito.operadorId).maybeSingle();
    const setores = (data as { setores?: { nome?: string } | null } | null)?.setores;
    donoSetorNome = setores?.nome ?? null;
  }

  return {
    conflito, meuOperadorId, euTemLogica,
    donoTemLogica, donoDesligado: false, jaTemExtra: false,
    extraAtualId, extraAtualOpId, extraAtualOpNome,
    donoSetorNome,
  };
}
