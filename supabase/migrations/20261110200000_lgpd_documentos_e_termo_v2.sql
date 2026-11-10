-- ============================================================================
-- LGPD: documentos 2.0, Termo de Uso 2.0 e aviso a todos (10/11/2026)
-- ============================================================================
--
-- A auditoria de segurança de 10/11/2026 achou os documentos de maio (1.0)
-- descrevendo um sistema que não existe mais: diziam «só nome e WhatsApp»,
-- «nenhum terceiro além do Supabase», «sem transferência internacional» e
-- «logs por 5 anos». Esta migration reescreve tudo com o que o sistema faz
-- hoje (código e banco de 10/11/2026).
--
-- O que muda:
--
--   1. Os 6 documentos globais de `documentos_lgpd` (Configurações ›
--      Documentações) passam para a versão 2.0.
--   2. Cada empresa que tem Termo de Uso ativo ganha o Termo 2.0, e o 1.0 é
--      desativado. O aceite é por termo (`aceites_termo.termo_id`), então
--      TODO MUNDO vê o modal e aceita de novo no próximo acesso. Os aceites da
--      1.0 continuam guardados (prova). A empresa do Comercial recebe o texto
--      do Comercial; as demais, o da cobrança. Empresa sem termo (RH) continua
--      sem termo.
--   3. Uma notificação no sino para cada pessoa ativa avisando da mudança.
--      Atenção: `fn_notificacoes_faxina` apaga notificação de dias anteriores,
--      então ela some na madrugada; o que garante a leitura é o modal.
--
-- Pendências declaradas nos próprios textos (decisão do Cleber, 10/11/2026):
-- BookPlay e PaguePlay têm CNPJs diferentes, que não estão no sistema; o
-- Encarregado (DPO) ainda não foi designado. Quando houver, editar pela tela
-- de Documentações (vira 2.1) e publicar um Termo 2.1.
--
-- Reexecutável: o Termo 2.0 só é criado onde ainda não existe, e a
-- notificação só sai uma vez por pessoa.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Os documentos internos ───────────────────────────────────────────────

UPDATE public.documentos_lgpd SET versao = '2.0', titulo = 'Política de Privacidade', conteudo = $DOC$POLÍTICA DE PRIVACIDADE — Gestão de Acordos
Versão 2.0 | Vigência: 10 de novembro de 2026 | Substitui a versão 1.0 (maio de 2026)

1. QUEM SOMOS E QUEM É RESPONSÁVEL PELOS DADOS

O Gestão de Acordos é o sistema interno usado pelas equipes de cobrança, atendimento e vendas das empresas BookPlay (unidade de Birigui) e PaguePlay (unidade de Marília). São duas empresas, cada uma com CNPJ próprio.

- Dados dos funcionários e usuários do sistema: a controladora é a empresa com a qual a pessoa mantém vínculo (BookPlay ou PaguePlay).
- Dados de devedores tratados em cobranças feitas em nome de instituições credoras (por exemplo, os Conselhos Regionais de Enfermagem na carteira Cofen): a instituição credora é a controladora, e a BookPlay ou a PaguePlay atua como operadora, seguindo o contrato de prestação de serviço.
- Dados de clientes e indicações do Comercial: a controladora é a BookPlay.

Encarregado pelo tratamento de dados (DPO): ainda não designado. Até a designação, solicitações de titulares e comunicações sobre dados pessoais são recebidas pela administração do sistema, pelos canais de atendimento da empresa.

2. QUAIS DADOS TRATAMOS

2.1 Devedores e clientes das carteiras de cobrança
- Nome; telefone e WhatsApp (até dois de cada); código do cliente (NR) e instituição.
- Dados do acordo: valores, parcelas, vencimentos, forma e situação de pagamento, histórico de alterações.
- Recebimentos importados dos relatórios do sistema de cobrança da empresa (Mundial).
- Nome do avalista, quando houver.
- CPF de devedor e de avalista: aparece apenas mascarado nas mensagens de campanha (ex.: xxx.xxx.789-00). O sistema bloqueia o CPF nos campos de cadastro e apaga automaticamente, em até 10 minutos, o CPF digitado no chat e nas solicitações.
- Mensagens de cobrança montadas pelo sistema e enviadas pelo operador via WhatsApp.

2.2 Profissionais atendidos pela Ouvidoria (carteira Cofen)
- Nome, conselho e UF, código do cliente, WhatsApp e e-mail informados no atendimento, assunto, descrição, situação financeira, providências e anexos enviados.

2.3 Outras pessoas
- Base de profissionais (mailing): nome e telefone.
- Indicações: nome e telefone de quem foi indicado.
- Comercial: nome e UF de clientes e potenciais clientes; contatos das franquias.

2.4 Funcionários e usuários do sistema
- Cadastro: nome, login (o mesmo do sistema Mundial, usado para vincular os relatórios), e-mail interno de acesso, foto (opcional), cargo, empresa, setor, equipe e situação (ativo, afastado, desligado).
- Trabalho: acordos registrados, metas, produção e recebimentos atribuídos, premiações e comissões, jornada (registros de NR), feedbacks.
- Ausências e afastamentos: tipo (férias, atestado, INSS, licença, falta, suspensão e outros), período e observação. O tipo «atestado», «INSS» ou «licença» pode revelar, indiretamente, informação de saúde: o sistema NÃO registra diagnóstico nem CID, e a observação não deve trazer esse tipo de informação.
- Uso e segurança: registros de acesso e de ações (com endereço IP e navegador), cidade aproximada do IP, tempo de uso por tela, presença online, aceites de termos (com IP e navegador).
- Comunicação interna: mensagens e anexos do chat, notificações, inscrição para avisos no celular.
- Participação em atividades internas: comemorações, desafios, jogos, votações e pesquisas.
- Senha: guardada apenas em formato irreversível (hash); ninguém da empresa consegue lê-la.

3. PARA QUE USAMOS

a) Registrar, acompanhar e cobrar acordos de pagamento e conciliar recebimentos;
b) Comunicar devedores sobre vencimentos, acordos e pagamentos;
c) Atender manifestações da Ouvidoria;
d) Gerir equipes, metas, produção, premiações, jornada e ausências;
e) Garantir a segurança do sistema, auditar ações e investigar incidentes;
f) Promover comunicação e engajamento interno.

4. BASES LEGAIS (LGPD, ARTS. 7º E 11)

- Proteção do crédito (art. 7º, X) e exercício regular de direitos (art. 7º, VI): cobrança e acordos.
- Execução de contrato (art. 7º, V): acordos com devedores e contrato de trabalho dos funcionários.
- Cumprimento de obrigação legal (art. 7º, II): registros trabalhistas, ausências e afastamentos.
- Legítimo interesse (art. 7º, IX): segurança, auditoria, gestão de desempenho e comunicação interna.
- Dado relacionado à saúde (ausências por atestado, INSS e licenças): cumprimento de obrigação legal ou regulatória (art. 11, II, «a»).

5. COM QUEM OS DADOS SÃO COMPARTILHADOS

Os dados não são vendidos nem cedidos. Eles passam pelos fornecedores que fazem o sistema funcionar:

- Supabase: banco de dados, autenticação, arquivos e mensagens em tempo real.
- Vercel: hospedagem do site e das funções de servidor (criação de usuário, redefinição de senha, consultas internas).
- WhatsApp (Meta) e ChatPlay: as mensagens aos devedores são enviadas pelo operador nesses aplicativos; o sistema apenas abre a conversa com o número.
- ipwho.is: recebe o IP de acesso dos funcionários para mostrar a cidade aproximada nos registros de segurança.
- Serviços de aviso do navegador (Google, Apple, Mozilla): entregam os avisos do celular. O conteúdo vai criptografado de ponta a ponta; eles recebem apenas o endereço do aparelho.
- Sentry, quando ativado: relatórios técnicos de erro, configurados para não enviar dados pessoais e para remover CPF.
- GIPHY, YouTube, Google Fonts e MET Norway (previsão do tempo): recebem termos de busca, a cidade da unidade ou o acesso do navegador às fontes, sem dados de devedores.
- Instituições credoras: recebem as informações da cobrança feita em nome delas, conforme o contrato.

O sistema não usa inteligência artificial externa para ler dados de devedores. A leitura de acordo por imagem é feita no próprio navegador, sem enviar a imagem a terceiros.

6. TRANSFERÊNCIA INTERNACIONAL

Vercel, Supabase, Sentry, ipwho.is e os serviços de aviso do navegador são empresas sediadas fora do Brasil, e parte do tratamento pode ocorrer no exterior. A transferência se apoia no art. 33 da LGPD e nas garantias contratuais de proteção de dados desses fornecedores.

7. QUANTO TEMPO GUARDAMOS

As regras completas estão na Política de Retenção e Descarte. Em resumo: dados de cobrança enquanto houver relação de cobrança e pelo prazo de prescrição; registros de segurança por 2 anos; uso de telas por 180 dias; CPF digitado no chat por até 10 minutos.

8. COMO PROTEGEMOS

- Acesso individual por login e senha própria, com troca obrigatória da senha provisória e regra mínima (6 caracteres, letra e número, sem sequências óbvias).
- Permissões por cargo e por setor, aplicadas no banco de dados (segurança por linha em todas as tabelas).
- Comunicação criptografada (HTTPS).
- Chaves de servidor nunca enviadas ao navegador; código-fonte em repositório privado.
- Registros de ações com autor, data, IP e navegador; o acesso «entrar como» é restrito à administração e registrado.
- Bloqueio, máscara e expurgo automático de CPF.

9. DIREITOS DO TITULAR (ART. 18)

Confirmação e acesso aos dados; correção; anonimização, bloqueio ou eliminação do que for desnecessário ou excessivo; portabilidade; informação sobre compartilhamentos; revisão de decisões automatizadas; e oposição a tratamento irregular. Os pedidos são respondidos em até 15 dias. Quando a cobrança é feita em nome de uma instituição credora, o pedido do devedor é encaminhado também a ela, que é a controladora.

10. ALTERAÇÕES

Esta política é revista ao menos uma vez por ano e sempre que o sistema mudar o tratamento de dados. A versão vigente fica disponível em Configurações › Documentações.$DOC$
 WHERE tipo = 'politica_privacidade' AND empresa_id IS NULL;

UPDATE public.documentos_lgpd SET versao = '2.0', titulo = 'ROPA — Registro de Operações de Tratamento de Dados', conteudo = $DOC$REGISTRO DE OPERAÇÕES DE TRATAMENTO DE DADOS (ROPA)
Art. 37 da Lei nº 13.709/2018 (LGPD) | Versão 2.0 | 10 de novembro de 2026

Controladoras: BookPlay (Birigui) e PaguePlay (Marília), cada uma com CNPJ próprio. Nas cobranças feitas em nome de instituições credoras, a credora é controladora e a empresa é operadora.
Encarregado (DPO): ainda não designado.
Sistema: Gestão de Acordos (Supabase: banco, autenticação, arquivos e tempo real; Vercel: site e funções de servidor).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 1 — Acordos e cobrança
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : devedores e avalistas
Dados              : nome, telefone/WhatsApp, código (NR), instituição, valores, parcelas, vencimentos, forma e situação de pagamento, nome do avalista
Finalidade         : registrar, acompanhar e cobrar acordos
Base legal         : proteção do crédito (art. 7º, X); exercício regular de direitos (VI); execução de contrato (V)
Onde               : acordos, historico_acordos, pix_automatico_*, lixeira_acordos, nr_registros
Retenção           : enquanto houver relação de cobrança + prazo de prescrição (5 anos)
Compartilhamento   : instituição credora; Supabase e Vercel (operadores)
Segurança          : permissões por cargo e setor no banco, histórico de alterações

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 2 — Recebimentos e conciliação
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : devedores
Dados              : código do cliente, valores, datas e formas de pagamento importados dos relatórios do sistema Mundial (58, 59, 945, 994) e da conciliação
Finalidade         : apurar recebimentos, metas e premiações
Base legal         : proteção do crédito (art. 7º, X); legítimo interesse (IX)
Onde               : analitico_recebimentos, diario_recebimentos, mestre_recebimentos, pp_relatorio_*
Retenção           : mesma da operação 1
Compartilhamento   : Supabase (operador)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 3 — Campanhas e mensagens de WhatsApp
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : devedores e avalistas
Dados              : nome, contrato, telefone/WhatsApp, valores, CPF mascarado (xxx.xxx.789-00) no texto da mensagem
Finalidade         : comunicar vencimentos, acordos e propostas
Base legal         : proteção do crédito (art. 7º, X); legítimo interesse (IX)
Onde               : campanha_facil_*, modelos_mensagem, solicitacoes_whatsapp*
Retenção           : contatos expiram com o lote da campanha; registros de disparo, 2 dias
Compartilhamento   : WhatsApp (Meta) e ChatPlay, no envio feito pelo operador

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 4 — Ouvidoria (carteira Cofen)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : profissionais de enfermagem
Dados              : nome, conselho/UF, código, WhatsApp, e-mail, assunto, descrição, situação financeira, anexos
Finalidade         : registrar e responder manifestações
Base legal         : execução de contrato com o credor (art. 7º, V); legítimo interesse (IX)
Onde               : ouvidoria_*; arquivos no balde privado «ouvidoria»
Retenção           : conforme o contrato com o credor
Compartilhamento   : instituição credora; Supabase (operador)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 5 — Mailing, indicações e Comercial
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : profissionais da base, pessoas indicadas, clientes e potenciais clientes
Dados              : nome, telefone, UF
Finalidade         : prospecção e atendimento
Base legal         : legítimo interesse (art. 7º, IX)
Onde               : profissionais, indicacoes, vendas*
Retenção           : enquanto útil à finalidade; eliminação a pedido do titular
Compartilhamento   : Supabase (operador)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 6 — Gestão de pessoas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : funcionários
Dados              : nome, login, e-mail interno, foto, cargo, setor, equipe, situação, metas, produção, premiações, comissões, jornada, feedbacks, ausências e afastamentos (tipo, período, observação)
Finalidade         : gestão do trabalho, metas, premiações e ausências
Base legal         : execução do contrato de trabalho (art. 7º, V); obrigação legal (II); dado relacionado à saúde por obrigação legal (art. 11, II, «a»)
Onde               : perfis, equipes*, metas*, rh_*, ausencias, jornada_*, composicao_mes*, fechamento_*
Retenção           : durante o vínculo + prazo das obrigações trabalhistas (até 5 anos)
Compartilhamento   : Supabase e Vercel (operadores)
Observação         : o sistema não registra diagnóstico nem CID

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 7 — Segurança, acesso e auditoria
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : funcionários
Dados              : login, ações realizadas, IP, navegador, cidade aproximada do IP, tempo de uso por tela, presença online, aceites de termos
Finalidade         : segurança, auditoria e investigação de incidentes
Base legal         : legítimo interesse (art. 7º, IX); obrigação legal (II)
Onde               : logs_sistema, uso_telas, uso_sessoes, ip_localizacoes, aceites_termo, presenca_online
Retenção           : logs 2 anos (automático); uso de telas 180 dias (automático); aceites durante o vínculo + 5 anos
Compartilhamento   : ipwho.is (IP, exterior); Supabase e Vercel

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERAÇÃO 8 — Comunicação interna e engajamento
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Titulares          : funcionários
Dados              : mensagens e anexos do chat, notificações, avisos no celular, comemorações, desafios, jogos, votações e pesquisas
Finalidade         : comunicação e engajamento
Base legal         : legítimo interesse (art. 7º, IX)
Onde               : chat_*, notificacoes, push_*, comemoracao*, desafios*, corrida*, votacao_*, pesquisa_*
Retenção           : notificações até o fim do dia; fila de avisos 7 dias; CPF no chat até 10 minutos; chat sem prazo automático
Compartilhamento   : serviços de aviso do navegador (conteúdo criptografado); Supabase

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSFERÊNCIA INTERNACIONAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vercel, Supabase, Sentry (quando ativo), ipwho.is e serviços de aviso do navegador são sediados no exterior. Base: art. 33 da LGPD e garantias contratuais dos fornecedores.

DADOS QUE O SISTEMA NÃO TRATA
CPF completo (só mascarado), RG, endereço, dados bancários, biometria, diagnóstico ou CID, dados de crianças.

Responsável por este registro: administração do sistema, até a designação do Encarregado.$DOC$
 WHERE tipo = 'ropa' AND empresa_id IS NULL;

UPDATE public.documentos_lgpd SET versao = '2.0', titulo = 'Aviso de Privacidade Interno — Usuários do Sistema', conteudo = $DOC$AVISO DE PRIVACIDADE INTERNO
Para: todas as pessoas que usam o Gestão de Acordos
Versão 2.0 | 10 de novembro de 2026

1. O QUE O SISTEMA GUARDA SOBRE VOCÊ

- Cadastro: nome, login (o mesmo do sistema Mundial), e-mail interno de acesso, foto (se você enviar), cargo, setor, equipe e situação.
- Trabalho: acordos que você registra, metas, produção, recebimentos atribuídos, premiações, comissões, jornada e feedbacks.
- Ausências e afastamentos lançados pela gestão ou pelo RH (tipo e período). Não registramos diagnóstico nem CID.
- Segurança: cada ação feita no sistema fica registrada com data, IP, navegador e cidade aproximada; também medimos o tempo de uso por tela e se você está online.
- Comunicação: mensagens e arquivos do chat, notificações e, se você ativar, os avisos no celular.

2. POR QUE

Para organizar o trabalho, calcular metas e premiações, cumprir obrigações trabalhistas e manter o sistema seguro. Esses registros também protegem você: mostram quem fez cada coisa.

3. QUEM VÊ

Cada pessoa vê o que o cargo e o setor permitem. A liderança vê a própria equipe; a gerência, o setor; a administração, a empresa. A administração pode entrar no sistema como outra pessoa para dar suporte, e cada entrada fica registrada. Ninguém consegue ver a sua senha.

4. O QUE VOCÊ PROMETE AO USAR O SISTEMA

a) Usar os dados de devedores, clientes e colegas só para o seu trabalho;
b) Não copiar, fotografar, exportar ou compartilhar listas fora das funções do sistema;
c) Não usar números de WhatsApp do sistema para contato pessoal;
d) Não compartilhar seu login e senha, nem usar a mesma senha de outros sistemas;
e) Não digitar CPF completo, diagnóstico ou dado de saúde em observações e no chat;
f) Avisar a liderança ou a administração na hora sobre qualquer suspeita de acesso indevido, perda de celular ou computador com o sistema aberto.

5. SIGILO

O dever de sigilo continua depois do fim do vínculo com a empresa. O uso indevido pode gerar medidas disciplinares, inclusive rescisão por justa causa, responsabilidade civil (art. 42 da LGPD) e penal.

6. SEUS DIREITOS

Você pode pedir acesso, correção e informações sobre os seus dados, e se opor a tratamentos irregulares. Procure a administração do sistema ou o RH; o Encarregado (DPO) ainda não foi designado.$DOC$
 WHERE tipo = 'aviso_privacidade_interno' AND empresa_id IS NULL;

UPDATE public.documentos_lgpd SET versao = '2.0', titulo = 'Política de Retenção e Descarte de Dados', conteudo = $DOC$POLÍTICA DE RETENÇÃO E DESCARTE DE DADOS
Gestão de Acordos | Versão 2.0 | 10 de novembro de 2026

1. OBJETIVO

Definir por quanto tempo cada dado fica no sistema e como é descartado (arts. 15 e 16 da LGPD). A coluna «Como» diz se o descarte já é automático ou se depende de ação da administração.

2. PRAZOS

Dado                                      | Prazo                                              | Como
------------------------------------------|----------------------------------------------------|---------------------------
Acordos, histórico, recebimentos          | relação de cobrança + 5 anos (prescrição)          | manual (rotina a implantar)
Contatos de campanha                      | até o lote expirar                                 | automático
Registros de disparo de campanha          | 2 dias                                             | automático
Pix automático desaprovado                | 2 dias úteis                                       | automático
CPF digitado no chat e nas solicitações   | até 10 minutos                                     | automático
Registros de segurança (logs)             | 2 anos (730 dias)                                  | automático, mensal
Uso de telas e sessões                    | 180 dias                                           | automático, diário
Notificações                              | até o fim do dia                                   | automático
Fila de avisos no celular                 | 7 dias                                             | automático
Senha provisória de reset                 | até a troca ou 7 dias                              | automático
Pedidos de autorização                    | 30 dias                                            | automático
Localização aproximada de IP              | renovada a cada 30 dias                            | automático
Perfis de funcionários                    | vínculo + até 5 anos (obrigações trabalhistas)     | desligado é arquivado na virada do mês; eliminação manual
Ausências, jornada, premiações            | vínculo + até 5 anos                               | manual
Aceites de termos                         | vínculo + 5 anos (prova do aceite)                 | manual
Chat interno                              | sem prazo definido                                 | manual
Ouvidoria                                 | conforme o contrato com o credor                   | manual
Mailing, indicações, Comercial            | enquanto útil à finalidade                         | manual, ou a pedido do titular
Cópias de segurança de tabelas            | só durante a correção que as motivou               | manual

3. COMO DESCARTAMOS

3.1 Anonimização (preferencial): nome e contatos são trocados por «ANONIMIZADO», preservando números para relatórios.
3.2 Eliminação: quando não houver obrigação de guardar, ou a pedido do titular (art. 18, VI), o registro é apagado.
3.3 Arquivos: são apagados pela própria tela ou pela API de arquivos (o banco não permite apagar arquivo por comando SQL).

4. PENDÊNCIAS CONHECIDAS

- Rotina automática de anonimização dos acordos com mais de 5 anos desde a última movimentação.
- Prazo para o chat interno.
- Revisão das tabelas de cópia de segurança antigas que ainda guardam dados pessoais.

5. PEDIDOS DE TITULARES

Ao receber um pedido de eliminação: verificar se há obrigação legal de guarda e se a cobrança é feita em nome de um credor (que deve ser consultado); não havendo impedimento, anonimizar ou eliminar em até 15 dias; responder ao titular e registrar o atendimento.

6. REVISÃO

Anual, ou sempre que o sistema mudar o tratamento de dados.$DOC$
 WHERE tipo = 'politica_retencao_descarte' AND empresa_id IS NULL;

UPDATE public.documentos_lgpd SET versao = '2.0', titulo = 'Plano de Resposta a Incidentes de Segurança', conteudo = $DOC$PLANO DE RESPOSTA A INCIDENTES DE SEGURANÇA
Gestão de Acordos | Versão 2.0 | 10 de novembro de 2026

1. O QUE É INCIDENTE

Qualquer evento que possa resultar em acesso não autorizado, vazamento, perda, alteração ou destruição de dados pessoais. Exemplos: senha descoberta ou compartilhada, login de lugar estranho, chave de servidor exposta, código-fonte publicado, celular perdido com o sistema aberto, planilha de devedores enviada fora da empresa.

2. GRAVIDADE

ALTA  — dados expostos a pessoas de fora (vazamento de base, chave de servidor exposta, invasão).
MÉDIA — acesso interno indevido (uso de login alheio, acesso fora do setor).
BAIXA — tentativa barrada ou exposição contida sem acesso confirmado.

3. PRIMEIRAS AÇÕES (ALTA E MÉDIA)

1. Conter: bloquear as contas envolvidas e encerrar as sessões; trocar as senhas afetadas.
2. Se houver chave exposta: gerar chaves novas no Supabase (Settings › API) e atualizar nas variáveis de ambiente da Vercel, nos dois projetos; trocar a chave do robô do relatório 59 e as chaves VAPID, se for o caso.
3. Se o código-fonte foi exposto: confirmar que o repositório está privado e tratar como vazadas as senhas ou dados que estejam em scripts.
4. Preservar provas: não apagar registros; exportar os logs do período (logs_sistema guarda IP e navegador por 2 anos).
5. Avaliar: quais dados, quantos titulares, desde quando, se houve acesso de fato.

4. AVISOS INTERNOS

- Imediatamente: super administradores do sistema.
- Em até 2 horas: diretoria da empresa afetada (BookPlay e/ou PaguePlay).
- Em até 24 horas: avaliação inicial pronta; se envolver devedores de uma carteira de credor, avisar o credor conforme o contrato.

5. COMUNICAÇÃO À ANPD E AOS TITULARES

Quando o incidente puder causar risco ou dano relevante aos titulares, comunicar a ANPD e os titulares em até 3 dias úteis a partir do conhecimento (Resolução CD/ANPD nº 15/2024), pelo canal do gov.br/anpd, informando: natureza dos dados, número de titulares, medidas técnicas de proteção, riscos, medidas tomadas e contato. Quando a cobrança é feita em nome de um credor, a comunicação é coordenada com ele, que é o controlador.

Modelo ao titular:
«Prezado(a) [nome], identificamos em [data] um incidente de segurança que pode ter envolvido os seus dados [quais dados]. Já tomamos as seguintes medidas: [medidas]. Recomendamos: [orientação]. Dúvidas: [canal].»

6. REGISTRO

Todo incidente, de qualquer gravidade, é registrado e guardado por 5 anos: data e hora da detecção, descrição, dados e titulares afetados, medidas, comunicações feitas e lições aprendidas.

7. HISTÓRICO

10/11/2026 — Auditoria de segurança: repositório de código estava público com scripts que continham a senha inicial comum das contas. Medidas: repositório tornado privado; troca obrigatória da senha inicial com prazo até 13/11/2026, após o qual a senha é anulada; regra mínima de senha; scripts sem senha fixa. Não foi identificado acesso indevido até a data.$DOC$
 WHERE tipo = 'plano_resposta_incidentes' AND empresa_id IS NULL;

UPDATE public.documentos_lgpd SET versao = '2.0', titulo = 'Termo de Responsabilidade do Usuário', conteudo = $DOC$TERMO DE RESPONSABILIDADE DO USUÁRIO
Gestão de Acordos | Versão 2.0 | 10 de novembro de 2026

Ao aceitar o Termo de Uso e usar o Gestão de Acordos, declaro que:

1. Usarei os dados pessoais de devedores, avalistas, clientes, profissionais e colegas apenas para as tarefas do meu cargo.

2. Não copiarei, fotografarei, exportarei, imprimirei nem compartilharei dados do sistema fora das funções oficiais, nem usarei os números de WhatsApp para contato pessoal.

3. Manterei sigilo sobre o que acessar, durante e depois do meu vínculo com a empresa.

4. Minha senha é pessoal: não a compartilharei, não usarei a mesma de outros sistemas e a trocarei se suspeitar que alguém a conhece. Não deixarei o sistema aberto em computador ou celular sem supervisão.

5. Não digitarei CPF completo, diagnóstico, CID ou outro dado de saúde em observações e no chat.

6. Avisarei a liderança ou a administração imediatamente sobre qualquer suspeita de acesso indevido, vazamento ou perda de aparelho.

7. Sei que minhas ações no sistema são registradas, com data, IP e navegador, para segurança e auditoria.

8. Estou ciente de que o descumprimento pode gerar medidas disciplinares, inclusive rescisão por justa causa, responsabilidade civil (art. 42 da LGPD) e penal.$DOC$
 WHERE tipo = 'termo_responsabilidade_operador' AND empresa_id IS NULL;

-- ── 2. O Termo de Uso 2.0 ───────────────────────────────────────────────────
--
-- A empresa do Comercial é a que tinha o termo «(Comercial)» ativo.

CREATE TEMP TABLE _termo_alvo ON COMMIT DROP AS
SELECT t.empresa_id, (t.titulo ILIKE '%(Comercial)%') AS comercial
  FROM public.termos_uso t
 WHERE t.ativo
   AND NOT EXISTS (SELECT 1 FROM public.termos_uso n WHERE n.empresa_id = t.empresa_id AND n.versao = '2.0');

UPDATE public.termos_uso t
   SET ativo = FALSE
  FROM _termo_alvo a
 WHERE t.empresa_id = a.empresa_id AND t.ativo;

INSERT INTO public.termos_uso (empresa_id, versao, titulo, conteudo, ativo)
SELECT a.empresa_id, '2.0',
       CASE WHEN a.comercial
            THEN 'Termo de Uso e Privacidade — Gestão de Acordos (Comercial)'
            ELSE 'Termo de Uso e Privacidade — Gestão de Acordos' END,
       $TERMO$TERMO DE USO E PRIVACIDADE — GESTÃO DE ACORDOS
Versão 2.0 | 10 de novembro de 2026

Atualizamos este termo. Ele agora explica também quais dados o sistema guarda sobre você, com quem eles são compartilhados e por quanto tempo. Leia com atenção: para continuar usando o sistema, é preciso aceitar esta versão.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. QUEM É RESPONSÁVEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O Gestão de Acordos é o sistema interno da BookPlay (unidade de Birigui) e da PaguePlay (unidade de Marília), duas empresas com CNPJs próprios. Os seus dados de usuário são tratados pela empresa com a qual você tem vínculo.

{{TERCEIROS}}

O Encarregado de dados (DPO) ainda não foi designado. Até lá, dúvidas e pedidos sobre dados pessoais vão para a administração do sistema ou o RH.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. O QUE O SISTEMA GUARDA SOBRE VOCÊ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Cadastro: nome, login (o mesmo do sistema Mundial), e-mail interno de acesso, foto (se você enviar), cargo, setor, equipe e situação.
- Trabalho: registros que você faz, metas, produção, recebimentos atribuídos, premiações, comissões, jornada e feedbacks.
- Ausências e afastamentos lançados pela gestão ou pelo RH (tipo e período). Não guardamos diagnóstico nem CID.
- Segurança: cada ação fica registrada com data, IP, navegador e cidade aproximada; também medimos o tempo de uso por tela e se você está online.
- Comunicação: mensagens e arquivos do chat, notificações e, se você ativar, avisos no celular.
- Sua senha fica guardada de forma irreversível: ninguém da empresa consegue vê-la.

Usamos esses dados para organizar o trabalho, calcular metas e premiações, cumprir obrigações trabalhistas e manter o sistema seguro (LGPD, art. 7º, II, V e IX; art. 11, II, «a»).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. OS DADOS QUE VOCÊ VAI ACESSAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{ACESSO}}

Você só vê o que o seu cargo e o seu setor permitem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. SUAS OBRIGAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
a) Usar os dados só para o seu trabalho;
b) Não copiar, fotografar, exportar ou compartilhar listas fora das funções do sistema;
c) Não usar os números de WhatsApp do sistema para contato pessoal;
d) Não compartilhar seu login e senha, nem usar a mesma senha de outros sistemas;
e) Não digitar CPF completo, diagnóstico ou dado de saúde em observações e no chat;
f) Avisar a liderança ou a administração na hora sobre qualquer suspeita de acesso indevido ou perda de aparelho;
g) Manter sigilo, inclusive depois de sair da empresa.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. QUEM MAIS PARTICIPA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O sistema funciona com fornecedores de tecnologia: Supabase (banco de dados), Vercel (site), serviços de aviso do celular (Google, Apple, Mozilla, com conteúdo criptografado) e ipwho.is (cidade aproximada do IP de acesso). Alguns ficam fora do Brasil (LGPD, art. 33). As mensagens a clientes saem pelo WhatsApp ou pelo ChatPlay, enviadas por você. Os dados não são vendidos nem cedidos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. POR QUANTO TEMPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Registros de segurança: 2 anos. Uso de telas: 180 dias. Notificações: até o fim do dia. Seu cadastro e seus registros de trabalho: durante o vínculo e pelo prazo das obrigações trabalhistas (até 5 anos).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. SEUS DIREITOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você pode pedir acesso, correção e informações sobre os seus dados, e se opor a tratamentos irregulares (LGPD, art. 18). Respondemos em até 15 dias.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. DESCUMPRIMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O uso indevido pode gerar medidas disciplinares, inclusive rescisão por justa causa, responsabilidade civil (LGPD, art. 42) e penal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. ATUALIZAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sempre que este termo mudar, você será avisado e precisará aceitar a nova versão no próximo acesso.

Ao clicar em «Aceitar e Continuar», você declara que leu e entendeu este termo e que concorda com ele.$TERMO$,
       TRUE
  FROM _termo_alvo a;

-- Os dois trechos que mudam entre a cobrança e o Comercial.
UPDATE public.termos_uso t
   SET conteudo = replace(replace(t.conteudo,
         '{{TERCEIROS}}',
         CASE WHEN a.comercial
              THEN 'Os dados de clientes e indicações do Comercial são tratados pela BookPlay.'
              ELSE 'Nas cobranças feitas em nome de instituições credoras (por exemplo, os Conselhos Regionais de Enfermagem), a instituição credora é a responsável pelos dados dos devedores, e a empresa atua por conta dela.' END),
         '{{ACESSO}}',
         CASE WHEN a.comercial
              THEN 'No trabalho você terá acesso a dados de clientes e potenciais clientes (nome, UF e contatos das franquias) e de pessoas indicadas (nome e telefone).'
              ELSE 'No trabalho você terá acesso a dados de devedores e avalistas: nome, telefone e WhatsApp, código do cliente, instituição, valores, parcelas, vencimentos e pagamentos. O CPF aparece só mascarado (ex.: xxx.xxx.789-00); o sistema bloqueia o CPF completo nos cadastros e o apaga do chat automaticamente. Na Ouvidoria, também dados das manifestações de profissionais.' END)
  FROM _termo_alvo a
 WHERE t.empresa_id = a.empresa_id AND t.versao = '2.0';

-- ── 3. Avisar todo mundo ────────────────────────────────────────────────────

INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id)
SELECT p.id,
       'Termos de uso atualizados',
       'Atualizamos o Termo de Uso e a Política de Privacidade do sistema (versão 2.0): agora eles explicam quais dados guardamos sobre você, com quem são compartilhados e por quanto tempo. No próximo acesso, leia e aceite a nova versão para continuar.',
       p.empresa_id
  FROM public.perfis p
 WHERE p.ativo AND NOT p.arquivado
   AND p.situacao IS DISTINCT FROM 'desligado'
   AND p.robo IS NOT TRUE
   AND NOT EXISTS (SELECT 1 FROM public.perfis_permissoes pp
                    WHERE pp.usuario_id = p.id
                      AND pp.permissoes->>'mestre_importar_automatico' = 'true')
   AND NOT EXISTS (SELECT 1 FROM public.notificacoes n
                    WHERE n.usuario_id = p.id AND n.titulo = 'Termos de uso atualizados');

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documentos_lgpd WHERE empresa_id IS NULL AND versao <> '2.0') THEN
    RAISE EXCEPTION 'Algum documento global não foi para a 2.0.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.termos_uso WHERE versao = '2.0' AND conteudo LIKE '%{{%') THEN
    RAISE EXCEPTION 'Termo 2.0 ficou com marcador sem trocar.';
  END IF;
  IF EXISTS (SELECT empresa_id FROM public.termos_uso WHERE ativo GROUP BY empresa_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Empresa com mais de um termo ativo.';
  END IF;
END
$prova$;

COMMIT;
