/**
 * Quais equipes a pessoa lidera — a pergunta da tela da equipe no celular.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §1.
 *
 * É a regra do Painel do Líder INVERTIDA: `idsDosLideresPorEquipe` diz quem
 * lidera cada equipe (o explícito manda, o cadastro é reserva), e aqui se
 * pergunta em quais equipes o id aparece. Uma regra só — o card do Painel e a
 * tela do celular não podem discordar de quem lidera o quê.
 *
 * ## Elite
 *
 * O Painel entrega à regra só os perfis `lider` (`entrada.lideres`). O elite é
 * operador que também lidera, e o `perfis.equipe_id` dele é a equipe onde ele
 * TRABALHA — usar a reserva faria todo elite «liderar» a própria equipe de
 * operador. Por isso, para quem não está em `entrada.lideres`, vale só o
 * vínculo explícito de `equipe_lideres`. Quem decide é a fonte, não o cargo.
 */
import {
  idsDosLideresPorEquipe, type EntradaLideres,
} from '@/pages/Dashboard/Analitico/lideresDaEquipe';

export function equipesQueLidero(
  pessoa: { id: string },
  entrada: EntradaLideres,
): string[] {
  if (entrada.lideres.some(l => l.id === pessoa.id)) {
    return Object.entries(idsDosLideresPorEquipe(entrada))
      .filter(([, ids]) => ids.includes(pessoa.id))
      .map(([equipeId]) => equipeId);
  }
  const saida: string[] = [];
  for (const e of entrada.explicitos) {
    if (e.lider_id === pessoa.id && e.equipe_id && !saida.includes(e.equipe_id)) {
      saida.push(e.equipe_id);
    }
  }
  return saida;
}

/**
 * As equipes da visão «Equipe» no celular: as que a pessoa lidera MAIS a
 * equipe de que ela FAZ PARTE (principal + clones que contam).
 *
 * Pedido de 30/09/2026: o elite não precisa estar em `equipe_lideres` para ter
 * a visão da equipe — basta pertencer a ela. O líder segue pela regra do
 * Painel (`equipesQueLidero`); quem recebe em nome próprio ganha também a
 * própria equipe. Quem pode abrir a visão continua sendo a chave
 * `ver_painel_lider`, na rota.
 */
export function equipesDaVisao(
  pessoa: { id: string },
  entrada: EntradaLideres,
  composicao: {
    operadorEquipeMap: Record<string, { equipe_id: string | null }>;
    equipesExtrasPorOperador: Record<string, string[]>;
  },
): string[] {
  const saida = equipesQueLidero(pessoa, entrada);
  const principal = composicao.operadorEquipeMap[pessoa.id]?.equipe_id ?? null;
  for (const id of [principal, ...(composicao.equipesExtrasPorOperador[pessoa.id] ?? [])]) {
    if (id && !saida.includes(id)) saida.push(id);
  }
  return saida;
}
