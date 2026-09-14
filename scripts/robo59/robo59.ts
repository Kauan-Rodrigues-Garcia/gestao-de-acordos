/**
 * robo59.ts — sobe o relatório 59 sozinho, de hora em hora.
 *
 * ## O que ele faz, em ordem
 *
 *   1. lê o arquivo da pasta configurada;
 *   2. interpreta com o parser DO PRÓPRIO SISTEMA;
 *   3. compara o hash com o do lote vigente — se o ERP reescreveu o arquivo
 *      sem mudar nada, para aqui;
 *   4. entra com a conta do robô;
 *   5. chama `importarMestre59`, a mesma função que a tela chama.
 *
 * O passo 5 dispara, dentro do banco, tudo o que já existe: a sincronização do
 * analítico em todos os setores do 59 e a notificação para a empresa inteira.
 * O robô não sabe nada disso, e é assim que tem de ser — ele sobe o arquivo, o
 * banco decide o resto.
 *
 * ## Por que ele não reimplementa nada
 *
 * O parser, o mapeamento das 28 colunas e a ordem abrir → inserir → promover
 * são importados de `src/`. Reescrever qualquer um deles aqui criaria uma
 * segunda interpretação do mesmo arquivo, e duas interpretações divergem num
 * dia qualquer, em silêncio. É a mesma razão de `fn_mestre_setor_resolvido`
 * existir num lugar só.
 *
 * ## O passo 3 não é otimização
 *
 * O ERP reescreve o 59 de hora em hora mesmo quando nada mudou. Sem a
 * comparação de hash seriam 24 lotes por dia, cada um substituindo o anterior,
 * e 22 mil linhas subindo à toa a cada vez. A comparação é feita contra o
 * BANCO, não contra um arquivo local: só o banco sabe se alguém importou pela
 * tela no meio do caminho.
 *
 * ## Saída
 *
 * Tudo vai para a saída padrão com carimbo de hora, e o Agendador de Tarefas
 * grava num arquivo. O código de saída é 0 quando importou, 0 quando não havia
 * o que importar, e 1 quando falhou — é o que o Agendador usa para mostrar
 * «última execução com erro» sem ninguém precisar abrir o log.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';

import { parseMestre59 } from '../../src/services/mestre/mestre59Parser';
import { importarMestre59, hashDoConteudo } from '../../src/services/mestre/mestre.service';
import { rpcSemTipo } from '../../src/lib/supabaseSemTipo';
import { obrigatorio } from './env';
import { entrar, sair } from './supabaseNode';

const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
/* A regra de `no-console` existe para o app, onde `console.log` vira lixo no
   navegador de quem usa. Aqui a saída padrão É a interface: o Agendador de
   Tarefas a redireciona para `robo59.log`, e é lá que alguém vai olhar quando
   algo falhar de madrugada. */
// eslint-disable-next-line no-console
const diga = (msg: string) => console.log(`[${agora()}] ${msg}`);
const erre = (msg: string) => console.error(`[${agora()}] ERRO: ${msg}`);

/** Quantas horas o arquivo pode ter sem virar suspeita. */
const HORAS_ATE_SUSPEITAR = Number(process.env.ROBO_HORAS_ATE_SUSPEITAR ?? 3);

async function principal(): Promise<number> {
  const caminho   = obrigatorio('ROBO_ARQUIVO');
  const empresaId = obrigatorio('ROBO_EMPRESA_ID');

  if (!existsSync(caminho)) {
    erre(`O arquivo não está lá: ${caminho}`);
    return 1;
  }

  /*
   * Arquivo parado é sintoma, não erro.
   *
   * Se o ERP parar de exportar, o robô continuaria subindo o mesmo arquivo
   * velho para sempre — e o hash igual faria tudo parecer normal. O aviso é o
   * que transforma «nada mudou» em «alguma coisa parou».
   */
  const idadeHoras = (Date.now() - statSync(caminho).mtimeMs) / 3_600_000;
  if (idadeHoras > HORAS_ATE_SUSPEITAR) {
    diga(`AVISO: o arquivo não é reescrito há ${idadeHoras.toFixed(1)}h. `
       + 'O ERP pode ter parado de exportar.');
  }

  // O navegador lê com `arq.text()`, que decodifica UTF-8. Mesma coisa aqui —
  // ler como latin1 transformaria «CARTÃO» em «CARTÃO» e sujaria a coluna.
  const conteudo = readFileSync(caminho, 'utf8');
  const r = parseMestre59(conteudo);

  if (r.colunasFaltando.length > 0) {
    erre(`Não parece o relatório 59: faltam ${r.colunasFaltando.join(', ')}.`);
    return 1;
  }
  if (r.mes === null) {
    erre(r.erros[0] ?? 'Não foi possível determinar o mês do arquivo.');
    return 1;
  }
  if (r.linhas.length === 0) {
    erre('O arquivo não tem nenhuma linha válida.');
    return 1;
  }

  const hash = await hashDoConteudo(conteudo);
  diga(`Arquivo lido: ${r.linhas.length} linha(s), mês ${r.mes}, `
     + `R$ ${r.totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  if (r.descartadas > 0) diga(`${r.descartadas} linha(s) descartada(s) pelo parser.`);

  await entrar();
  diga('Autenticado como robô.');

  try {
    const { data: hashVigente, error: errHash } = await rpcSemTipo<string>(
      'fn_mestre_hash_do_lote_vigente',
      { p_empresa_id: empresaId, p_mes: r.mes },
    );
    /* Falha ao consultar não pode virar «importa assim mesmo» nem «desiste»:
       importar de novo é barato e correto; o que não pode é ficar cego. */
    if (errHash) diga(`Não deu para conferir o hash vigente (${errHash.message}); seguindo.`);
    else if (hashVigente === hash) {
      diga('O arquivo é idêntico ao que já está vigente. Nada a fazer.');
      return 0;
    }

    diga('Enviando…');
    const res = await importarMestre59({
      empresaId,
      mes: r.mes,
      arquivoNome: basename(caminho),
      conteudo,
      linhas: r.linhas,
      onProgresso: p => {
        if (p.fase === 'enviando' && p.enviadas % 7500 === 0) {
          diga(`  ${p.enviadas}/${p.total} linhas`);
        }
      },
    });

    diga(`Importado: lote ${res.lote_id}, ${res.linhas} linha(s), `
       + `R$ ${Number(res.total_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
       + (res.substituiu ? ' (substituiu o lote anterior)' : ' (primeiro lote do mês)'));
    if (res.grupos_novos > 0)   diga(`  ${res.grupos_novos} carteira(s) nova(s) — precisam de vínculo.`);
    if (res.grupos_sumiram > 0) diga(`  ${res.grupos_sumiram} carteira(s) sumiu/sumiram deste lote.`);
    if (res.equipes_novas > 0)  diga(`  ${res.equipes_novas} subgrupo(s) novo(s).`);
    return 0;
  } finally {
    await sair();
  }
}

principal()
  .then(codigo => process.exit(codigo))
  .catch((e: unknown) => {
    erre(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
