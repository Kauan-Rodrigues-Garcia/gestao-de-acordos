# Dívida técnica

> Problemas estruturais conhecidos, com o custo que já cobraram e o caminho de
> saída. Diferente de `REGRAS-DE-NEGOCIO.md`, que **descreve** o sistema, este
> documento lista o que está **errado** e precisa mudar.
>
> Ordem: por urgência. Item resolvido sai daqui e a regra nova vai para
> `REGRAS-DE-NEGOCIO.md`.

---

## 1. URGENTE: as colunas nr_cliente e instituicao significam coisas diferentes em cada empresa

🔴 **Status:** aberto · **Registrado em:** 2026-08-10 · **Bugs que já causou:** 2

### O problema em uma frase

A mesma coluna guarda conceitos diferentes dependendo do tenant, e **o banco não
tem como saber qual é qual**.

| Coluna | Book Play | Pague Play |
|---|---|---|
| `nr_cliente` | **NR** — a chave do acordo | era o **CPF**; hoje vazia e sem uso |
| `instituicao` | **nome da instituição** — uma de quatro, categoria | **Código** — a chave do acordo |

O nome de cada coluna descreve o uso da Book Play. Na Pague Play os dois nomes
mentem.

### Como chegou nisso

Não houve decisão de projeto. Foi acúmulo:

| Quando | Commit | O que aconteceu |
|---|---|---|
| antes da PP | `03_add_instituicao.sql` | Coluna criada para a Book Play. Placeholder da época: `"Banco, financeira, empresa..."` |
| 2026-04-03 | `98fa813` | Pague Play entra no sistema **sem nenhuma migration** — só frontend, reetiquetando as colunas existentes: `nr_cliente` → "CPF", `instituicao` → "Inscrição" |
| 2026-05-05 | `2ea06c1` | "Inscrição" vira "Código" |
| 2026-05-09 | `58616fa` | LGPD remove o CPF da interface. A Pague Play perde o identificador dela, que morava em `nr_cliente`. `instituicao` é promovida a chave — o empréstimo vira permanente |
| 2026-07-03 | `8da2afe` | NR volta à Book Play, que retoma `nr_cliente` |

O commit `98fa813` é a origem. Ele adicionou um tenant inteiro por
`isPP ? 'CPF' : 'NR do Cliente'` no rótulo, sem tocar no schema.

### O que já custou

**Bug 1 — CPF vazando pelo campo de NR.** Como `nr_cliente` era CPF na Pague
Play e NR na Book Play, operadores digitavam CPF onde não devia. Custou o pacote
de bloqueio de CPF: `src/lib/cpf.ts`, `src/lib/cpfChat.ts` e cinco migrations
(`20260803a` a `20260803e`).

**Bug 2 — a categoria "BOOKPLAY" travada para a empresa inteira.** A `20260809d`
moveu a trava do NR para o banco e registrou **os dois campos** como chave, nas
duas empresas — porque no banco não existe nada que diga qual coluna é chave
onde. O primeiro operador que salvou virou dono da string `"BOOKPLAY"`, e todo
mundo depois levou

```
NR_JA_REGISTRADO: o Código "BOOKPLAY" já está tabulado por <fulano>.
```

ao cadastrar, ao editar e ao adicionar parcela. Corrigido pela `20260810b`.

### Como está contornado hoje

Três remendos, cada um repetindo a mesma regra num lugar diferente:

| Onde | Como decide |
|---|---|
| Banco | `fn_nr_campo_chave` — infere pelo formato: tem `nr_cliente` → é a chave; senão `instituicao` |
| Frontend | `isPaguePlay ? 'instituicao' : 'nr_cliente'`, repetido em cada tela |
| Rótulos | `tenant-config.ts` / `useTenant()` |

Funciona, mas é inferência. **A regra do banco depende de `nr_cliente` estar
preenchido na Book Play.** Hoje está — o campo é obrigatório na criação
(`AcordoNovoInline/index.tsx`, `'NR é obrigatório'`) e a verificação em
2026-08-10 retornou zero acordos Book Play sem NR. Se algum caminho passar a
gravar acordo Book Play sem NR — importação, script, integração nova —
`fn_nr_campo_chave` volta a eleger `instituicao` e o Bug 2 renasce.

### Caminho de saída

Em ordem de esforço crescente. Qualquer um resolve; o terceiro é o único que
elimina a ambiguidade de vez.

1. **Curto — travar a inferência.** `fn_nr_campo_chave` passa a decidir por
   `empresas.slug`, a mesma fonte que o frontend usa em
   `getTenantCapabilities`, com o formato só como reserva. Uma migration, sem
   mexer em frontend. Fecha o retorno do Bug 2 independentemente do dado.

2. **Médio — `NOT NULL` no que é chave.** Constraint por tenant: acordo Book
   Play exige `nr_cliente`; acordo Pague Play exige `instituicao`. Torna
   impossível o estado que reabre o Bug 2. Exige limpar o histórico antes.

3. **Longo — separar as colunas.** `codigo_acordo` (a chave, nas duas empresas)
   e `instituicao` (só categoria, só Book Play). Os nomes voltam a dizer a
   verdade. Alcance: RLS, triggers, `database.types.ts`, importação de Excel,
   analítico, Pix automático e todo o frontend. Migration de dados em duas
   fases, com as colunas convivendo.

### Enquanto não for resolvido

- **Nunca** trate `instituicao` como identificador em código novo sem checar o
  tenant. Na Book Play ela é categoria, e código que assume o contrário
  reintroduz o Bug 2.
- **Nunca** trate `nr_cliente` como CPF. Na Pague Play a coluna está vazia; na
  Book Play é o NR, que não é dado pessoal.
- Precisa da chave? Use `fn_nr_campo_chave` no banco e
  `isPaguePlay ? 'instituicao' : 'nr_cliente'` no frontend. Não escreva uma
  terceira versão da regra.
