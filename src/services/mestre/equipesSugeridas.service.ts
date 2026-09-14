/**
 * equipesSugeridas.service.ts — que equipe é cada subgrupo do 59.
 *
 * ## Por que casar por nome não funciona
 *
 * O 59 traz `subgrupo_equipe` com o nome que o ERP usa, e o sistema tem as
 * equipes com o nome que a liderança usa. Eles se parecem, mas não são iguais —
 * e às vezes não se parecem em nada. Medido em setembro/2026, sobre os 34
 * subgrupos sem vínculo:
 *
 *   casam por nome exato, dentro do setor ....  3
 *   casam por «contém» ......................  4
 *
 * E os que casam por nome trazem armadilha junto: `EQUIPE DANIELE` tem **dois**
 * candidatos (`DIGITAL (DANIELE)` e `MANUAL (DANIELE)`), e escolher um dos dois
 * no escuro é pior que não escolher.
 *
 * ## O sinal certo são as pessoas
 *
 * Quem recebeu naquele subgrupo já tem equipe no sistema. Olhando de quem é o
 * dinheiro, os mesmos 34 viram **18 sugestões fortes** — R$ 745.618,13 de
 * R$ 934.860,88. E ele acerta onde o nome não tinha chance:
 *
 *   EQUIPE DOUGLAS  → HIBRIDO ............ 100%
 *   ELLEN 2°TURNO   → SEGUNDO TURNO ...... 100%
 *   EQUIPE DANIELE  → MANUAL (DANIELE) ... 100%  (desfaz a ambiguidade)
 *   EQUIPE LUAN E GABRIELLY → Luan/ Gaby .. 99,2%
 *
 * A equipe de cada pessoa vem de `composicao_mes`, que é o retrato congelado
 * daquele mês — quem mudou de equipe depois não reescreve a sugestão de um mês
 * já fechado.
 *
 * ## Sugestão não é vínculo
 *
 * Nada é gravado por conta própria. `fn_mestre_equipes_sugeridas` só lê; quem
 * grava é `vincularEquipe`, depois de alguém confirmar. Vínculo errado feito em
 * silêncio é pior que subgrupo sem vínculo: o sem vínculo aparece na tela
 * pedindo atenção, e o errado some no meio dos certos.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export interface EquipeSugerida {
  codGrupo: string;
  subgrupo: string;
  carteira: string;
  setorId: string | null;
  setorNome: string | null;
  valor: number;
  linhas: number;
  pessoas: number;
  equipeId: string;
  equipeNome: string;
  equipeSetorId: string | null;
  equipeSetorNome: string | null;
  /** 0 a 1. Quanto do dinheiro do subgrupo é de gente daquela equipe. */
  concentracao: number;
  pessoasNaEquipe: number;
  /** A equipe sugerida é do mesmo setor da carteira? */
  mesmoSetor: boolean;
}

/**
 * Quando uma sugestão pode vir marcada por padrão.
 *
 * Três condições, e as três precisam valer:
 *
 * - **mesmo setor** — equipe de outro setor costuma ser uma pessoa emprestada,
 *   não a equipe daquele subgrupo. Em setembro são justamente os casos de
 *   R$ 200 a R$ 600, com uma pessoa só;
 * - **duas pessoas ou mais** — com uma pessoa, a «concentração de 100%» é só o
 *   fato de existir uma pessoa;
 * - **concentração alta** — abaixo disso o subgrupo tem gente de equipes
 *   diferentes, e aí a resposta certa é olhar, não aceitar.
 *
 * O resto aparece na lista, desmarcado. Continua sendo decisão de quem confirma.
 */
export const CONCENTRACAO_SEGURA = 0.9;

export function sugestaoConfiavel(s: EquipeSugerida): boolean {
  return s.mesmoSetor && s.pessoasNaEquipe >= 2 && s.concentracao >= CONCENTRACAO_SEGURA;
}

export async function buscarEquipesSugeridas(
  empresaId: string,
  mes: string,
  minimo = 0.8,
): Promise<EquipeSugerida[]> {
  const { data, error } = await rpcSemTipo<{
    cod_grupo_filtro: string; nome_subgrupo: string; carteira: string;
    setor_id: string | null; setor_nome: string | null;
    valor: unknown; linhas: unknown; pessoas: unknown;
    equipe_id: string; equipe_nome: string;
    equipe_setor_id: string | null; equipe_setor_nome: string | null;
    concentracao: unknown; pessoas_na_equipe: unknown; mesmo_setor: boolean;
  }[]>('fn_mestre_equipes_sugeridas', {
    p_empresa_id: empresaId, p_mes: mes, p_minimo: minimo,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map(s => ({
    codGrupo:        s.cod_grupo_filtro,
    subgrupo:        s.nome_subgrupo,
    carteira:        s.carteira,
    setorId:         s.setor_id,
    setorNome:       s.setor_nome,
    valor:           n(s.valor),
    linhas:          n(s.linhas),
    pessoas:         n(s.pessoas),
    equipeId:        s.equipe_id,
    equipeNome:      s.equipe_nome,
    equipeSetorId:   s.equipe_setor_id,
    equipeSetorNome: s.equipe_setor_nome,
    concentracao:    n(s.concentracao),
    pessoasNaEquipe: n(s.pessoas_na_equipe),
    mesmoSetor:      s.mesmo_setor,
  }));
}
