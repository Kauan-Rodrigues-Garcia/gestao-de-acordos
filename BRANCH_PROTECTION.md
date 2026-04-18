# Configuração de Branch Protection

Este documento descreve as regras de proteção de branches a serem configuradas
no GitHub em **Settings → Branches → Branch protection rules**.

---

## Branch `main` (produção)

Configure as seguintes proteções em:
`Settings → Branches → Add rule → Branch name pattern: main`

| Regra | Valor recomendado |
|-------|------------------|
| **Require a pull request before merging** | ✅ Ativado |
| → Required approvals | `1` |
| → Dismiss stale pull request approvals when new commits are pushed | ✅ |
| **Require status checks to pass before merging** | ✅ Ativado |
| → Required checks | `Lint & Build` (workflow `ci.yml`) |
| → Require branches to be up to date before merging | ✅ |
| **Require conversation resolution before merging** | ✅ Ativado |
| **Do not allow bypassing the above settings** | ✅ Ativado |
| **Restrict who can push to matching branches** | Opcional (owners/admins) |

---

## Branch `develop` (integração)

Configure as seguintes proteções em:
`Settings → Branches → Add rule → Branch name pattern: develop`

| Regra | Valor recomendado |
|-------|------------------|
| **Require a pull request before merging** | ✅ Ativado |
| → Required approvals | `1` |
| **Require status checks to pass before merging** | ✅ Ativado |
| → Required checks | `PR Quality Gate` (workflow `pr-check.yml`) |

---

## Fluxo de Desenvolvimento Recomendado

```
feature/minha-feature
        │
        │  Pull Request → develop
        ▼
    develop   ←── branch de integração e testes
        │
        │  Pull Request → main (após validação)
        ▼
      main    ←── branch de produção (protegida)
```

### Nomenclatura de branches

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Feature | `feature/<descricao>` | `feature/painel-diretoria` |
| Correção | `fix/<descricao>` | `fix/rls-acordos-delete` |
| Hotfix | `hotfix/<descricao>` | `hotfix/login-timeout` |
| Chore | `chore/<descricao>` | `chore/update-deps` |
| Docs | `docs/<descricao>` | `docs/novos-perfis` |

---

## Secrets do GitHub

Para que os workflows de CI funcionem, configure os seguintes secrets em
`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Descrição |
|--------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon Key pública do Supabase |

> As chaves `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` **não devem**
> ser adicionadas como secrets do GitHub — elas ficam nos Secrets do Supabase.
