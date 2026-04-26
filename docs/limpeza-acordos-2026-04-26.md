# Limpeza total de acordos — 2026-04-26

> ⚠️ **ATENÇÃO: ação destrutiva e irreversível.** Leia toda a seção antes de executar.

Pedido: apagar **todos** os acordos cadastrados em todos os setores (Bookplay + PaguePlay) para iniciar testes num ambiente limpo.

## Opção recomendada — via SQL Editor do Supabase

1. Abra o painel Supabase do projeto.
2. Menu lateral → **SQL Editor** → **New query**.
3. Cole e execute o bloco abaixo.

```sql
-- Confirma contagem antes
SELECT
  (SELECT count(*) FROM acordos)          AS acordos_total,
  (SELECT count(*) FROM lixeira_acordos)  AS lixeira_total;

-- Apaga TUDO de acordos (ativos). Se quiser esvaziar também a lixeira, descomente a linha abaixo.
BEGIN;
  DELETE FROM acordos;
  -- DELETE FROM lixeira_acordos;   -- descomente para zerar também o histórico de exclusões
COMMIT;

-- Confirma contagem depois (deve retornar 0)
SELECT count(*) FROM acordos;
```

- Se houver triggers de auditoria que gravam em outras tabelas, eles continuam funcionando.
- `DELETE` respeita RLS; execute logado como dono do projeto (role `postgres` no SQL Editor), não via anon/service-role do app.
- **Não use `TRUNCATE acordos RESTART IDENTITY CASCADE;`** — nossa PK é `uuid`, então `RESTART IDENTITY` é desnecessário e `CASCADE` pode remover dados em tabelas dependentes não-intencionais.

## Opção só para uma empresa

```sql
-- Apenas Bookplay (exemplo)
DELETE FROM acordos WHERE empresa_id = (SELECT id FROM empresas WHERE slug = 'bookplay');

-- Apenas PaguePlay
DELETE FROM acordos WHERE empresa_id = (SELECT id FROM empresas WHERE slug = 'pagueplay');
```

## Rollback

Depois de executar `COMMIT;` **não existe rollback** — os dados não estão mais em `acordos` nem em `lixeira_acordos` (se essa também foi limpa). O único caminho seria restaurar do **Point-in-Time Recovery** do Supabase (plano Pro/Team).

Sugestão: antes de rodar, tire um dump rápido da tabela:

```sql
CREATE TABLE acordos_backup_20260426 AS TABLE acordos;
```

Assim se precisar reverter basta `INSERT INTO acordos SELECT * FROM acordos_backup_20260426;` e depois `DROP TABLE acordos_backup_20260426;`.
