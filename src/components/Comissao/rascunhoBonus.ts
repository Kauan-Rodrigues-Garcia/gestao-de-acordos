/**
 * rascunhoBonus.ts — o formulário do bônus entre o que se digita e o que se grava.
 *
 * As mesmas recusas de `fn_comissao_bonus_salvar`, ditas antes do clique: sem
 * pessoa, sem a meta, sem o valor, período fora do mês. O banco continua sendo
 * quem garante; aqui é para o botão não oferecer o que vai voltar com erro.
 *
 * Sem React; os casos estão em `rascunhoBonus.test.ts`.
 */
import { PP_HO_PERCENTUAL } from '@/lib/index';
import { ultimoDiaDoMes, type BonusComissao, type TipoBonus } from '@/services/comissao/bonus';
import type { PayloadBonus } from '@/services/comissao/comissao.service';
import { lerReais, reaisParaCampo } from './formato';

export interface RascunhoBonus {
  id: string | null;
  pessoas: string[];
  tipo: TipoBonus;
  metaOrdem: string;
  /** Em bruto. */
  valorAlvo: string;
  /** A mesma meta em H.O. — só a PaguePlay mostra. */
  valorAlvoHO: string;
  inicio: string;
  fim: string;
  valorBonus: string;
  descricao: string;
}

/** O rascunho de um bônus gravado — ou o novo, com as pessoas já escolhidas. */
export function rascunhoDoBonus(b: BonusComissao | null, pessoas: string[]): RascunhoBonus {
  const alvo = b?.valorAlvo ?? null;
  return {
    id: b?.id ?? null,
    pessoas: b ? b.usuarioIds : pessoas,
    tipo: b?.tipo ?? 'meta',
    metaOrdem: b?.metaOrdem ? String(b.metaOrdem) : '',
    valorAlvo: reaisParaCampo(alvo),
    valorAlvoHO: reaisParaCampo(alvo !== null ? alvo * PP_HO_PERCENTUAL : null),
    inicio: b?.periodoInicio ?? '',
    fim: b?.periodoFim ?? '',
    valorBonus: reaisParaCampo(b?.valorBonus ?? null),
    descricao: b?.descricao ?? '',
  };
}

/** O que falta para salvar. `null` = pode salvar. */
export function problemaDoRascunho(r: RascunhoBonus, ano: number, mes: number): string | null {
  if (r.pessoas.length === 0) return 'Escolha ao menos uma pessoa.';
  if (r.tipo === 'meta' && !r.metaOrdem) return 'Escolha a meta que libera o bônus.';
  if (r.tipo !== 'meta' && lerReais(r.valorAlvo) === null) return 'Informe o valor a atingir.';
  if (r.tipo === 'especial') {
    if (!r.inicio || !r.fim) return 'Informe o início e o fim do período.';
    if (r.fim < r.inicio) return 'O fim do período vem antes do início.';
    const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
    if (r.inicio < primeiro || r.fim > ultimoDiaDoMes(ano, mes)) return 'O período precisa estar dentro do mês.';
  }
  if (lerReais(r.valorBonus) === null) return 'Informe o valor do bônus.';
  return null;
}

/** O que vai para `fn_comissao_bonus_salvar`: só os campos do tipo escolhido. */
export function payloadDoBonus(
  r: RascunhoBonus,
  alvo: { empresaId: string; setorId: string; ano: number; mes: number },
): PayloadBonus {
  return {
    id: r.id,
    ...alvo,
    tipo: r.tipo,
    metaOrdem: r.tipo === 'meta' ? Number(r.metaOrdem) : null,
    valorAlvo: r.tipo === 'meta' ? null : lerReais(r.valorAlvo),
    periodoInicio: r.tipo === 'especial' ? r.inicio : null,
    periodoFim: r.tipo === 'especial' ? r.fim : null,
    valorBonus: lerReais(r.valorBonus) ?? 0,
    descricao: r.descricao.trim() || null,
    usuarios: r.pessoas,
  };
}
