/**
 * useLugarNoMes — «onde eu estava NAQUELE mês?».
 *
 * Decisão do Cleber (31/10/2026): quem abre um mês fechado vê o setor e a
 * equipe onde estava naquele mês, com os números de lá — mesmo que hoje esteja
 * em outro lugar. Até aqui toda tela respondia «meu setor» com `perfil.setor_id`
 * e «minha equipe» com `useEquipesDoPerfil`, que são o cadastro de HOJE: quem
 * saiu do Play 1 para o Play 2 abria outubro e via o Play 2 de outubro.
 *
 * O NÍVEL (equipe / setor / empresa) continua o de hoje — é permissão. Muda o
 * LUGAR: no mês fechado ele vem do retrato, pela RPC `fn_meu_lugar_no_mes`, a
 * mesma regra com que o banco recorta as RPCs do mês (20261031220000).
 *
 * Mês corrente, mês sem retrato, ou a pessoa fora da foto: o lugar de hoje, sem
 * consulta nenhuma — o comportamento de sempre.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useEquipesDoPerfil } from '@/hooks/useEquipesDoPerfil';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { lerComCache } from '@/lib/cacheCurto';
import { mesFechado } from '@/lib/fechamentoMes';
import { normalizarMes } from '@/lib/mesReferencia';
import type { EquipesDoPerfil } from '@/services/equipes/equipeDoLider';
import type { RegraDoSetor } from '@/lib/regraDoSetor';
import { buscarSetoresDoMes, mesTemConfigGuardada } from '@/services/fechamento/configDoMes';

export interface LugarNoMes extends EquipesDoPerfil {
  /** O setor do rótulo (`perfis.setor_id` no mês). */
  setorId: string | null;
  /** Todos os setores onde a pessoa estava: o dela, das equipes que lidera e onde é clone. */
  setores: string[];
  /** A resposta veio do retrato do mês fechado. */
  doRetrato: boolean;
  /** Mês fechado ainda consultando: até chegar, vale o lugar de hoje. */
  carregando: boolean;
}

/** Resposta crua de `fn_meu_lugar_no_mes`. */
export interface RespostaLugarNoMes {
  do_retrato: boolean;
  setor_id: string | null;
  setores: string[] | null;
  equipes: string[] | null;
  equipes_lideradas: string[] | null;
  equipe_principal: string | null;
}

/**
 * O lugar a partir da resposta do banco, na mesma forma de `equipesDoPerfil`:
 * `principal` é a única equipe quando há uma; havendo várias, a de membro;
 * líder de várias fica sem principal. Exportada para os testes.
 */
export function lugarDaResposta(r: RespostaLugarNoMes): Omit<LugarNoMes, 'carregando'> {
  const todas = r.equipes ?? [];
  const lideradas = r.equipes_lideradas ?? [];
  const membro = r.equipe_principal && !lideradas.includes(r.equipe_principal)
    ? r.equipe_principal
    : null;
  return {
    setorId: r.setor_id ?? null,
    setores: r.setores ?? [],
    todas,
    lideradas,
    principal: todas.length === 1 ? todas[0] : membro,
    doRetrato: true,
  };
}

export function useLugarNoMes(mesBruto: string | null | undefined): LugarNoMes {
  const mes = mesBruto ? normalizarMes(mesBruto) : null;
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const hoje = useEquipesDoPerfil();
  const fechado = !!mes && mesFechado(mes);
  const empresaId = empresa?.id ?? null;

  const perfilId = perfil?.id ?? null;
  const setorHoje = perfil?.setor_id ?? null;
  const chave = fechado && empresaId && perfilId ? `${empresaId}|${perfilId}|${mes}` : null;

  // Sem react-query de propósito: o hook entra em telas e testes que não têm
  // o provedor. O retrato de mês fechado não muda — o cache curto basta.
  const [resposta, setResposta] = useState<{ chave: string; r: RespostaLugarNoMes | null } | null>(null);
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    void lerComCache(`lugar-no-mes:${chave}`, VALIDADE_MS, async () => {
      const { data, error } = await rpcSemTipo<RespostaLugarNoMes>('fn_meu_lugar_no_mes', {
        p_empresa_id: empresaId, p_mes: mes,
      });
      return error ? null : (data ?? null);
    }, { guardarSe: v => v !== null }).then(r => { if (vivo) setResposta({ chave, r }); });
    return () => { vivo = false; };
  }, [chave, empresaId, mes]);

  const r = chave && resposta?.chave === chave ? resposta.r : null;
  const carregando = !!chave && resposta?.chave !== chave;
  return useMemo<LugarNoMes>(() => {
    if (r && r.do_retrato) return { ...lugarDaResposta(r), carregando: false };
    return {
      ...hoje,
      setorId: setorHoje,
      setores: setorHoje ? [setorHoje] : [],
      doRetrato: false,
      carregando,
    };
  }, [r, hoje, setorHoje, carregando]);
}

const VALIDADE_MS = 30 * 60 * 1000;

/**
 * A regra (Cofen / Nosso produto) que o setor tinha NO MÊS. `null` = mês aberto
 * ou não guardado: quem chama usa a regra de hoje (`useTenant().isPaguePlay`,
 * que já responde pela regra do setor da pessoa).
 *
 * Regra de negócio diferente é carteira diferente (CLAUDE.md, 04/10/2026): no
 * mês fechado vale a regra do setor onde a pessoa ESTAVA, não a de onde está.
 */
export function useRegraDoSetorNoMes(
  mesBruto: string | null | undefined, setorId: string | null | undefined,
): RegraDoSetor | null {
  const mes = mesBruto ? normalizarMes(mesBruto) : null;
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;
  const ativo = !!mes && !!setorId && !!empresaId && mesTemConfigGuardada(mes);
  const [setores, setSetores] = useState<{ chave: string; m: Awaited<ReturnType<typeof buscarSetoresDoMes>> } | null>(null);
  const chave = ativo ? `${empresaId}|${mes}` : null;
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    // `buscarSetoresDoMes` já guarda no cache curto.
    void buscarSetoresDoMes(empresaId, mes).then(m => { if (vivo) setSetores({ chave, m }); });
    return () => { vivo = false; };
  }, [chave, empresaId, mes]);
  if (!chave || !setorId || setores?.chave !== chave || !setores.m) return null;
  return setores.m.get(setorId)?.regra ?? null;
}
