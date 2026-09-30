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
 * O Painel entrega à regra só os perfis `lider`. O elite é operador que também
 * lidera, e o `perfis.equipe_id` dele é a equipe onde ele TRABALHA — usar a
 * reserva faria todo elite «liderar» a própria equipe de operador. Por isso,
 * para o elite, vale só o vínculo explícito de `equipe_lideres`.
 */
import {
  idsDosLideresPorEquipe, type EntradaLideres,
} from '@/pages/Dashboard/Analitico/lideresDaEquipe';

export function equipesQueLidero(
  pessoa: { id: string; perfil: string | null | undefined },
  entrada: EntradaLideres,
): string[] {
  if (pessoa.perfil === 'lider') {
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
