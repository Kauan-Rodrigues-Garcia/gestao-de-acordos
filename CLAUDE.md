# CLAUDE.md

Instruções de projeto para agentes de IA (Claude Code e afins). Leia antes de agir.

## Regra do banco de dados — obrigatória, sem exceção

O banco Supabase deste projeto (`vfrvvoetidtsqbbhdkmj`) é **produção**. É o mesmo
banco que o app usa. Não existe staging, não existe cópia de segurança automática
que você possa acionar, e não existe desfazer.

**Não execute nada contra o banco — nem escrita, nem leitura — sem que a pessoa
no comando tenha pedido e autorizado explicitamente aquela operação.**

Isso vale para:

- Todas as tools MCP do Supabase (`execute_sql`, `apply_migration`,
  `list_tables`, `query_logs`, `get_advisors`, `deploy_edge_function`,
  `create_branch`, e qualquer outra).
- Supabase CLI (`supabase db push`, `db reset`, `migration repair`, ...).
- `psql`, scripts, seeds, ou qualquer código que abra conexão com o banco.

Consulta (`SELECT`) também entra na regra. Ler não é neutro aqui: o banco tem
dados de pessoas reais, e o pedido de leitura precisa vir de quem manda.

### Em caso de dúvida

Se não estiver claro que a operação foi autorizada — pergunte e espere
confirmação antes. Silêncio, contexto anterior, ou "parece que era isso que ele
queria" não são autorização. Autorização é a pessoa dizendo, naquele momento, que
pode rodar aquilo.

Autorização dada para uma operação não se estende à próxima. Cada consulta e cada
alteração precisa do seu próprio "pode".

### Ao propor uma operação

Mostre o SQL exato que pretende rodar, diga o que ele altera e quantas linhas deve
atingir, e espere o "pode". Não rode primeiro para depois relatar.

### Escrita está aberta no MCP

O `.mcp.json` está com `read_only=false`. Isso significa que `execute_sql`
executa `DROP`, `DELETE`, `UPDATE` e `ALTER` de verdade, direto em produção. A
trava técnica foi retirada de propósito — a trava que sobrou é esta regra aqui.

## Migrations

O histórico em `supabase_migrations.schema_migrations` está **defasado** em
relação ao schema real: migrations foram aplicadas pelo SQL editor do dashboard,
que não registra a versão. `list_migrations` mostra menos do que existe no banco.

Não conclua que uma migration está pendente só porque não aparece ali — confira o
objeto no schema (`to_regclass`, `pg_proc`). E não rode `supabase db push` sem
reconciliar o registro antes (`supabase migration repair --status applied`), ou
ele vai reaplicar dezenas de arquivos.
