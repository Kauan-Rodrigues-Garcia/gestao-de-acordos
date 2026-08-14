# Pendências de polimento

> Registro consolidado em 2026-08-14. Este arquivo é a fila de trabalho para as
> próximas sessões; itens concluídos devem ser removidos daqui ou movidos para a
> documentação definitiva.

## P0 — providências operacionais

- [ ] Revogar e gerar outro GitHub Personal Access Token caso o token exposto
  durante esta sessão ainda esteja ativo.
- [ ] Definir a identidade permanente dos deploys antes de tornar o repositório
  privado novamente. No plano Hobby da Vercel, commits de um autor sem acesso ao
  projeto podem bloquear o deploy de repositórios privados. Documentar quem faz
  os pushes e qual conta GitHub está conectada ao projeto Vercel.

## P1 — completar a reprodução do Supabase

A baseline oficial atual cobre o schema `public`, mas ainda é preciso versionar
os objetos personalizados que vivem nos schemas gerenciados pelo Supabase.

- [ ] Extrair do remoto e validar a definição atual do trigger
  `trg_novo_usuario` em `auth.users`.
- [ ] Extrair do remoto e validar as políticas de `storage.objects`:
  `comemoracoes_midia_leitura`, `comemoracoes_midia_envio` e
  `comemoracoes_midia_remocao`.
- [ ] Criar migrations complementares oficiais para Auth e Storage.
- [ ] Testar as migrations em um projeto Supabase limpo, incluindo cadastro de
  usuário e leitura, envio e remoção de mídias.

Resultado esperado: um projeto novo deve reproduzir o comportamento do ambiente
remoto sem depender das migrations históricas arquivadas.

## P1 — ambiguidade dos campos de acordo

O diagnóstico completo está em [DIVIDA-TECNICA.md](./DIVIDA-TECNICA.md). Hoje
`nr_cliente` e `instituicao` têm significados diferentes por empresa.

- [ ] Curto prazo: fazer `fn_nr_campo_chave` decidir primeiro por
  `empresas.slug`, mantendo a inferência pelo formato apenas como contingência.
- [ ] Médio prazo: adicionar constraints por empresa para exigir o campo que é
  chave em cada tenant, depois de sanear os registros antigos.
- [ ] Longo prazo: avaliar a migração para `codigo_acordo` como chave explícita e
  manter `instituicao` apenas como categoria da Book Play.

## P1 — auditoria de segurança e desempenho

- [ ] Executar novamente os advisors do Supabase e classificar cada alerta.
- [ ] Revisar RLS, grants, funções `SECURITY DEFINER`, views e exposição de RPCs.
- [ ] Revisar índices e consultas mais usadas, confirmando os planos de execução
  antes de criar índices novos.

A baseline preserva o estado atual do banco; ela não elimina automaticamente
dívidas de segurança ou desempenho já existentes.

## P2 — dependências e ferramentas

- [ ] Investigar as 6 vulnerabilidades relatadas por `npm ci` (4 moderadas e 2
  altas), identificando dependências diretas e transitivas.
- [ ] Atualizar dependências em lotes pequenos, com testes; não usar
  `npm audit fix --force` sem avaliar mudanças incompatíveis.
- [ ] Ajustar a configuração para o futuro carregador nativo do Vite, removendo
  a dependência de `__dirname` na configuração.
- [ ] Migrar `optimizeDeps.esbuildOptions`, marcado como obsoleto, para
  `optimizeDeps.rolldownOptions` quando compatível com a versão adotada.

## P2 — qualidade e testes

- [ ] Reduzir gradualmente os avisos de lint existentes, mantendo zero erros.
- [ ] Aumentar a cobertura além da base atual de aproximadamente 32,52% de
  statements e 34,02% de linhas, elevando os thresholds junto com a cobertura.
- [ ] Ampliar os testes de integração/E2E para transferência de usuários,
  vínculos direto/extra, login/cadastro e leitura de imagens nos dois tenants.

## P3 — operação

- [ ] Criar um ambiente de staging ou procedimento equivalente para mudanças de
  banco de maior risco.
- [ ] Documentar e testar restauração de backup antes das próximas mudanças
  estruturais de schema.
- [ ] Registrar o fluxo de deploy e a responsabilidade das contas GitHub,
  Vercel e Supabase para evitar bloqueios por autoria ou propriedade.

## Base já consolidada

- As migrations antigas foram preservadas em `supabase/legacy_migrations/` e a
  baseline oficial de `public` está em
  `supabase/migrations/20260813225412_remote_schema_baseline.sql`.
- A transferência entre empresas e as regras dos vínculos direto/extra foram
  corrigidas e cobertas por testes.
- A limpeza dos registros de teste e das contas órfãs identificadas no P1 foi
  concluída.
- A suíte consolidada passou com 138 arquivos e 2.303 testes; lint, typecheck,
  cobertura, build e CI estavam verdes ao fechar esta rodada.
