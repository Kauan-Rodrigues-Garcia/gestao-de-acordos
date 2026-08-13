# Banco e migrations

O schema remoto de referência é o projeto Supabase `vfrvvoetidtsqbbhdkmj`
(PostgreSQL 17). O arquivo `config.toml` foi gerado pela CLI 2.114.0 e mantém a
exposição automática de tabelas desativada; toda tabela/RPC nova deve receber
`GRANT` explícito e RLS quando aplicável.

## Estado do histórico legado

O diretório contém 177 scripts anteriores à adoção da CLI oficial. Desses, 174
não usam a versão de 14 dígitos exigida pela CLI e alguns compartilham o mesmo
prefixo. Produção também não possuía `supabase_migrations.schema_migrations`.
Portanto, **não execute `db push --include-all` nesse histórico**: isso tentaria
reaplicar scripts já presentes em produção e não constitui um baseline válido.

Os scripts históricos são imutáveis. A análise encontrou objetos existentes em
produção sem uma criação reproduzível no legado (`setores`, `lixeira_acordos`,
`profiles` e `profissionais`), mas eles não devem ser enxertados em migrations
já aplicadas. O baseline definitivo deverá incorporá-los a partir do snapshot
remoto. `database.types.ts` foi regenerado do schema remoto e inclui a
migration-alvo ainda pendente de publicação.

## Fluxo obrigatório daqui para a frente

1. Instale Docker Desktop e use a CLI fixada nos exemplos:
   `npx supabase@2.114.0 start`.
2. Até concluir o baseline, preserve a convenção do projeto
   `YYYYMMDD[a-z]_nome.sql`; depois da consolidação, migre todo o histórico de
   uma vez para versões oficiais geradas por `migration new`.
3. Rode `npx supabase@2.114.0 db reset` antes do commit.
4. Gere os tipos novamente após aplicar a migration.
5. Publique uma migration por vez e confira os advisors de segurança e
   performance.

## Baseline definitivo do legado

Para transformar os scripts antigos em um baseline único será necessário um
acesso de CLI ao banco (Personal Access Token + senha do Postgres), que não é
exposto pelo conector usado nesta análise. Faça em uma janela coordenada:

1. gere e teste um backup;
2. em um diretório temporário com `migrations/` vazio, execute `supabase link`
   e `supabase db pull` para produzir o snapshot oficial do schema remoto;
3. valide o snapshot com `db reset` em um banco local limpo;
4. arquive os 177 scripts legados somente depois dessa validação;
5. use `migration repair --status applied` apenas quando o snapshot local e o
   schema remoto tiverem sido comparados e forem equivalentes.

Até essa reconciliação, aplique a migration nova pelo conector/CI e não tente
marcar em massa o legado como executado.

## Rollout da migration de segurança de 2026-08-13

A migration altera as assinaturas de `fn_converter_para_extra` e
`fn_vincular_extra_ao_direto`. Para evitar indisponibilidade, publique nesta
ordem:

1. Vercel primeiro: a versão nova tenta a assinatura protegida e, somente para
   o erro `PGRST202` (assinatura ainda inexistente), usa temporariamente a RPC
   legada. O endpoint de visão cai no OCR local enquanto a função de cota ainda
   não existir.
2. Supabase depois: aplique
   `20260813e_harden_privileged_rpcs_and_vision_rate_limit.sql`. Ela remove
   as assinaturas legadas, ativa as validações de identidade/empresa/regra e
   cria o controle persistente de cota.
3. Force a recarga do schema PostgREST caso `PGRST202` persista, execute os
   fluxos Direto/Extra e leitura por imagem, e confira os advisors.

O fallback nunca é usado para erros de autorização, RLS ou regra de negócio e
não faz escritas privilegiadas diretamente nas tabelas.
