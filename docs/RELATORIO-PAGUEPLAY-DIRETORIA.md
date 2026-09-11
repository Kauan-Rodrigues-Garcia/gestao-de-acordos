# Relatórios PaguePlay no Painel Diretoria

Migração `20260911222903_relatorio_pagueplay_diretoria.sql` aplicada em 11/09/2026, após aprovação do usuário, no projeto `vfrvvoetidtsqbbhdkmj`. Nenhum pagamento dos exemplos foi mantido no ambiente da empresa.

## Uso e valores

A aba **Relatórios PaguePlay**, em `/diretoria`, fica disponível na empresa PaguePlay para quem tem acesso ao painel e ao escopo de todos os setores. Pagamento e conciliação possuem históricos e tabelas separados. A mudança de modalidade não reutiliza os dados da outra.

O parser lê `Valor Recebido`, `Pague Play`, `Coren` e `Cofen` diretamente das respectivas colunas, em centavos inteiros. Nunca reconstrói valores usando percentuais. Os percentuais mostrados no HTML são apenas a participação efetiva de cada valor no total; podem variar por COREN, dia e acumulado. Tarifa, retenção e diferenças entre a soma das divisões e o bruto não são redistribuídas: prevalecem as colunas do ERP.

`Id.Baixa` identifica cada pagamento dentro de uma modalidade. Parcelas do mesmo acordo com identificadores diferentes são preservadas. Reimportações idênticas são ignoradas. Um identificador já salvo com qualquer dado relevante diferente bloqueia a importação inteira, com mensagem para conferir e, se necessário, excluir e recarregar o mês. A importação não apaga pagamentos ausentes do novo arquivo. Correções e estornos que alterem um registro existente exigem a recuperação explícita do período.

CPF, nome de cliente, operador e demais informações pessoais do arquivo não são armazenados por esta aba. Não há sincronização com o recebimento diário existente.

## Datas e cobertura

- `Data` define o período exportado, a cobertura, a exclusão mensal e o acumulado COREN × mês, como no HTML original.
- `Dt.Pagamento` define o resultado diário e o detalhamento mensal por forma de pagamento, também preservando a distinção do original.
- A primeira atualização que inclui hoje exige ontem e hoje juntos. O controle é salvo no banco por empresa, modalidade e dia, no fuso `America/Sao_Paulo`; recarregar a página ou trocar de usuário não reinicia esse controle.
- Após concluir essa primeira atualização, outras importações do mesmo dia podem conter só hoje. Uma falha de importação não libera a regra.
- Cargas históricas que terminam antes de hoje são permitidas para preencher ou recuperar o histórico e não dispensam a primeira atualização diária.
- O relatório não contém uma prova confiável de todo o intervalo exportado. A tela sugere a primeira e a última `Data` das linhas e exige confirmar o intervalo completo usado no ERP. Isso permite registrar dias sem movimento. Não se infere completude apenas pela existência de um pagamento.
- Hoje fica em andamento; um dia só fica completo ao ser incluído em uma importação posterior àquela data. Dias não cobertos ficam identificados no histórico. Não há bloqueio de meses.

A exclusão mensal usa `Data`; a exclusão geral afeta somente a modalidade selecionada. Ambas pedem confirmação, invalidam importações abertas dessa modalidade e reiniciam a exigência diária. Para recuperar os dados, é necessário reimportar o período apagado.

## Integridade e acesso

Os arquivos são lidos em Web Worker. Valores ausentes, datas inválidas, UF inválida, identificador ausente e duplicatas divergentes causam erro, sem descartar silenciosamente pagamentos. O rodapé é excluído dos pagamentos e seus totais são conferidos contra as linhas. Algumas exportações omitem totais no rodapé; nesse caso a interface informa quais conferências não puderam ser feitas, sem inventar zero.

O envio ocorre em blocos de até 1.500 registros para uma área privada temporária. O banco verifica quantidade e somas antes de incorporar o lote numa única transação. Um lote incompleto não aparece no relatório. Locks por empresa/modalidade serializam importação e exclusão. A chave primária evita duplicação, inclusive com reenvio após falha de rede. O resumo retorna um único objeto agregado, sem truncamento no limite de 1.000 linhas da Data API.

As duas tabelas finais têm RLS e somente leitura direta para usuários autenticados autorizados. As escritas passam pela RPC com conferência de identidade, empresa PaguePlay, permissões e dono do lote. O código privilegiado fica no schema `private`; não há permissões anônimas. Nenhuma credencial é enviada ao iframe.

## Fidelidade visual e revisão

`src/pages/PainelDiretoria/RelatorioPaguePlay/original.html` é uma cópia intacta do arquivo fornecido, SHA-256 `73ccf671468c93578d1340399af9c9872447df3a49dbbab05b460ec904760f1e`. A integração adapta o documento em memória, preservando seu CSS, logos, função de captura e os três textos principais. Pagamento usa `forest`; conciliação usa `lightblue`. O CSS do sistema não atravessa o iframe. A biblioteca de captura permanece na versão 1.4.1, agora distribuída com o aplicativo.

As imagens dependem das mesmas fontes Google do original. A área dos prints mantém largura mínima de 1.080 px para não mudar a composição em telas estreitas; a página permite rolagem horizontal. Novos controles de importação e exclusão ficam fora dos prints. Há uma prévia local para revisar arquivos mesmo antes da migração: ela é identificada como não salva e não é somada ao histórico.

### Verificação reproduzível

```sh
npx vitest run src/services/relatorioPaguePlay src/pages/PainelDiretoria/RelatorioPaguePlay/documento.test.ts
npm run typecheck
npm run build
```

Para comparar visualmente as seis exportações com o HTML original e testar os controles no Chrome instalado:

```sh
# Terminal 1
npm run dev
# Terminal 2
npm run test:relatorio-pagueplay:visual
```

O teste visual usa dados sintéticos e respostas de banco simuladas em todas as páginas. As imagens e a página temporária são escritas em `.tmp/`, ignorada pelo Git. Os testes SQL executam a migração em Postgres em memória (PGlite), com funções de autorização simuladas; não acessam o Supabase da empresa. Isso não substitui a verificação pós-aplicação com as permissões reais.

### Resultados desta revisão

- 52 testes específicos aprovados; checagem de tipos e build local aprovados.
- Seis PNGs exportados idênticos aos do HTML original, byte a byte, com os mesmos dados de teste, fontes e navegador: três em cada tema. Controles de prévia, leitura em Worker, regra diária, envio e cancelamento de exclusão verificados no navegador.
- Histórico `HOJE.xlsx` (arquivo antigo na pasta do HTML): 68.589 pagamentos, R$ 17.900.904,69 recebidos, R$ 4.506.612,45 Pague Play, R$ 10.047.998,17 Coren e R$ 3.346.241,93 Cofen. Os três totais presentes no rodapé conferiram; o rodapé não contém o total de Coren. Inserção e reimportação no Postgres em memória conservaram esses quatro totais, com zero novas linhas na segunda importação.
- O arquivo antigo `ONTEM.xlsx` não tem a estrutura obrigatória do 945 atual (`UF Coren`) e foi rejeitado explicitamente. Não se tenta adivinhar valores de outro formato.
- Suíte completa: 5.503 testes aprovados e 1 falha no teste existente `src/services/numeros/__tests__/numerosSituacoesPrazo.sql.test.ts:112`. O teste e a migração de Controle de Números que ele verifica não foram alterados nesta tarefa.
- Lint dos arquivos novos/alterados aprovado. O comando geral também alcança temporários locais preexistentes: encontrou erro de sintaxe em `tmp/conversa-polida.mjs` e avisos em outros arquivos fora desta alteração. Esses arquivos não foram corrigidos nem removidos.

### Aplicação e verificação no banco da empresa

Foram verificadas as duas tabelas com RLS ativa, a negação de execução anônima e de escrita direta, e a leitura das duas modalidades com o papel autenticado de diretoria. Um teste de importação com valores sintéticos conferiu os centavos, a confirmação idempotente e o isolamento entre modalidades dentro de uma transação revertida com ROLLBACK. Os dois históricos permaneceram vazios, prontos para a primeira importação real. O verificador de segurança não apontou ocorrências relacionadas aos novos objetos `pp_relatorio`.

A versão do arquivo local corresponde à registrada no histórico de migrações remoto. Nenhuma outra migração pendente foi aplicada.
