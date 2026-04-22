# Política de Segurança

## Reporte de vulnerabilidades

Se você descobrir uma falha de segurança neste projeto, **não abra issue pública**.
Envie um e-mail para **kauan.rodrigues@users.noreply.github.com** com o título
`[SECURITY] Gestão de Acordos — <resumo>` descrevendo:

1. O que você observou e como reproduzir (passos, payload de exemplo).
2. O impacto esperado (leitura não autorizada, RCE, DoS, exfiltração, etc.).
3. Versão afetada (commit SHA ou data do build).

Vamos responder em até 72 horas úteis.

## Status de dependências

A suíte é auditada a cada push via `npm audit` no CI (quando habilitado) e
periodicamente via `npm audit --omit=dev` no bloco de manutenção.

### Vulnerabilidades conhecidas e aceites

| Pacote | Severidade | Tipo | Decisão | Plano |
|---|---|---|---|---|
| `esbuild` (via `vite`) | moderate | **devDep** | Aceito | Upgrade para `vite@8` quando o ecossistema estabilizar (semver major — requer validação do build pipeline) |
| `vite` | moderate | **devDep** | Aceito | Idem acima |
| `lovable-tagger` | moderate | **devDep** | Aceito | Plugin exclusivamente de desenvolvimento (lovable.dev) — não chega ao bundle de produção |

Todas as 3 vulnerabilidades listadas estão em **devDependencies** e NÃO são distribuídas no bundle final servido aos usuários.

### Histórico de remediações

| Data | Pacote | Ação | Antes | Depois |
|---|---|---|---|---|
| 2026-04-22 | `xlsx` (SheetJS) | **Swap para `@e965/xlsx` (fork mantido, Apache-2.0)** — o `xlsx` no npm tem prototype pollution (`GHSA-4r6h-8v6p-xvw6`, high) + ReDoS (`GHSA-5pgg-2g8v-p4x9`), **sem fix upstream** no registro público (SheetJS só publica na CDN deles) | 1 high + 3 moderate | 0 |
| 2026-04-22 | `axios` e transitivas | `npm audit fix` | 2 high + 6 moderate | 0 |

## Boas práticas já aplicadas

- **Tenant isolation**: o hook `useAuth` valida o `slug` da empresa do usuário contra `VITE_TENANT_SLUG` em toda sessão e bloqueia login cruzado entre tenants. Testado em `src/hooks/__tests__/useAuth.test.tsx`.
- **RLS (Row-Level Security)** no Supabase em todas as tabelas que contêm dados de cliente.
- **Tokens nunca expostos no código** — chaves públicas via `VITE_SUPABASE_*`, service_role nunca no front.
- **Console.log removido do bundle de produção** — 2026-04-22 sweep converteu 19 ocorrências para `console.info`.
- **Console.log de debug não é distribuído em produção** pelos terms de uso do Vite em build mode.

## Escopo desta política

Esta política cobre:
- O código-fonte neste repositório.
- O bundle publicado em produção.

NÃO cobre:
- Infraestrutura Supabase do cliente (responsabilidade do operador).
- Contas individuais de usuário (escopo do fluxo de autenticação Supabase).
