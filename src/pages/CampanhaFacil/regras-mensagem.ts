/**
 * regras-mensagem.ts — quais mensagens servem ao relatório importado.
 *
 * Separado do hook para ter teste: a regra é curta, mas errá-la deixa a campanha
 * sair com "R$ " vazio no lugar dos valores, e isso só aparece depois que as
 * mensagens já foram para o cliente.
 */
import { CampaignCore } from './lib/campaign-core';

/** Modelo com o corpo em vigor (o editado pelo usuário, quando existe). */
export interface TemplateComCorpo {
  id:    string;
  corpo: string;
}

/**
 * Ids das mensagens que NÃO podem ser usadas com o relatório carregado.
 *
 * Só o relatório cadastral restringe: ele vem sem nenhuma coluna de valor, e
 * toda mensagem que cita parcela, quitação, junção, plano anual ou cartão
 * dependeria de números que o arquivo não tem. Relatório com valores não
 * bloqueia nada — conjunto vazio.
 */
export function idsDeMensagensBloqueadas(
  templates: readonly TemplateComCorpo[],
  relatorioSemValores: boolean,
): Set<string> {
  if (!relatorioSemValores) return new Set<string>();
  return new Set(
    templates
      .filter((t) => CampaignCore.templateRequiresFinancialData(t.corpo))
      .map((t) => t.id),
  );
}

/** A mensagem usa algum valor financeiro? */
export function mensagemUsaValores(corpo: string): boolean {
  return CampaignCore.templateRequiresFinancialData(corpo);
}
