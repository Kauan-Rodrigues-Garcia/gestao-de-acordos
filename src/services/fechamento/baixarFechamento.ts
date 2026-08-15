/**
 * baixarFechamento.ts — monta o relatório e entrega o arquivo ao navegador.
 *
 * A cola entre `fechamento.service` (dados) e `fechamentoHtml` (página). Fica
 * separada dos dois para que nenhum deles precise de `document`: o serviço roda
 * em teste sem DOM, e o gerador de HTML é função pura.
 *
 * O download registra log de auditoria. Não é burocracia: o arquivo sai do
 * sistema e passa a circular por e-mail e WhatsApp com nome, valor e meta de
 * cada operador. Saber quem baixou o quê e quando é o mínimo para responder por
 * esse dado depois.
 */

import { registrarLog } from '@/services/logs.service';
import { montarFechamento, type ParametrosFechamento } from './fechamento.service';
import { montarHtmlFechamento, nomeArquivoFechamento } from './fechamentoHtml';
import type { DadosFechamento } from './tipos';

export interface ResultadoDownload {
  ok: boolean;
  nomeArquivo?: string;
  dados?: DadosFechamento;
  erro?: string;
}

/** Dispara o download de um Blob com o nome dado. */
function entregarArquivo(conteudo: string, nome: string): void {
  const blob = new Blob([conteudo], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sem o revoke, cada download deixa o arquivo inteiro preso na memória da aba
  // até o refresh. O atraso dá tempo de o navegador iniciar a gravação.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function baixarRelatorioFechamento(
  params: ParametrosFechamento & { empresaId: string },
): Promise<ResultadoDownload> {
  try {
    const dados = await montarFechamento(params);
    const html  = montarHtmlFechamento(dados);
    const nome  = nomeArquivoFechamento(dados);

    entregarArquivo(html, nome);

    void registrarLog({
      acao: 'fechamento_mes_baixado',
      categoria: 'financeiro',
      descricao:
        `Baixou o relatório de fechamento de ${dados.alvo.mesRotulo} `
        + `(${dados.alvo.nivel})`,
      empresaId: params.empresaId,
      alvoTipo: 'relatorio_fechamento',
      alvoRotulo: `${dados.alvo.mesRotulo} — ${dados.alvo.setorNome ?? dados.alvo.operadorNome ?? dados.alvo.empresaNome}`,
      detalhes: {
        mes: dados.alvo.mes,
        nivel: dados.alvo.nivel,
        setor: dados.alvo.setorNome,
        operadores_no_relatorio: dados.operadores.length,
        total_recebido: dados.resumo.totalBruto,
        arquivo: nome,
      },
    });

    return { ok: true, nomeArquivo: nome, dados };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
