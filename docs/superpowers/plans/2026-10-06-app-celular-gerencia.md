# Plano — App do celular: abrir no app, Cofen em H.O., três visões e a gerência

Desenho: `docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md`.
Cada etapa termina com typecheck, lint e a suíte inteira verdes, e um commit.
Migrations: o Cleber roda no SQL Editor; eu confiro e registro.

## Parte 1 — Correções e desempenho

1. **`lib/mobile/preferencia.ts`**
   - `ehCelular`: app instalado (`display-mode: standalone` / `navigator.standalone`)
     sempre; no navegador, toque grosso e menor lado da TELA ≤ 768.
   - «Versão completa» em `sessionStorage`; a chave antiga de `localStorage` é
     apagada na primeira leitura.
   - Gerência entra na tela mínima; `destinoMobile`: lider → `/m/equipe`,
     gerencia → `/m/setor`, quem recebe → `/m`.
   - Testes puros.
2. **Desvio em qualquer rota** (`App.tsx`): um guarda único que, no celular e sem
   «Versão completa», manda quem pode usar o app ao destino dele a partir de
   qualquer rota que não seja `/m…`, `/login` ou `/tv`. Com sessão e perfil
   carregando, esqueleto do app; perfil que falhou, tela «Sem conexão · Tentar de
   novo». Testes do guarda.
3. **`SugestaoModoLeve`** não monta no celular (rota do app ou app instalado).
4. **Desempenho**: build com análise; medir o que `/m` carrega; tirar do caminho
   do app provedores e efeitos que ele não usa. Números antes/depois no commit.

## Parte 2 — Unidade Cofen, três visões e a tela da gerência

5. **Unidade Cofen** (`lib/mobile/unidadeApp.ts` + interruptor H.O. | Bruto):
   abre em H.O., lembrado no aparelho, só para Cofen. Aplicar em `/m` e
   `/m/equipe` em tudo que tem valor (recebido, meta, faixas, quartis, gráfico,
   Hoje, lista de pagamentos — `total_ho` por linha).
6. **Migration A** (`fn_recebido_por_setor`, `fn_app_resumo_visoes`):
   - `fn_recebido_por_setor(p_empresas, p_mes, p_ini, p_fim)` — extraída do total
     de setor do desafio (normal pelo carimbo; alternativo pela gente, só no setor
     da pessoa);
   - `fn_app_resumo_visoes(p_mes)` — SECURITY DEFINER, só a equipe e o setor de
     quem chama: mês, hoje, meta; setor Cofen pela conciliação; sem nomes.
7. **Troca Eu · Equipe · Setor** por cargo, nas três telas; Resumo do operador
   lendo a função nova.
8. **`/m/setor`** (`pages/Mobile/setor/`): `useTelaSetor` (fontes do Painel Líder,
   equipes do setor, acumulado do setor; Cofen pela conciliação), abas Setor,
   Quartis (cartão Q1–Q4 do setor + por equipe), Gráfico (setor + «Equipes»
   recolhível), Hoje (seletor Setor/equipes). Rota com `ver_painel_lider`.
   Testes da montagem do setor (normal, alternativo, Cofen).
9. **Gerência em `/m/equipe`**: o seletor lista as equipes do setor.

## Parte 3 — Avisos da gerência

10. **Migration B**: `push_marcos_setor`, `push_resumo_setor`,
    `fn_push_destinatarios_setor`, marco do setor na rodada de metas, gerente como
    destinatário dos marcos de equipe e pessoa do setor, resumo do setor
    (`fn_push_resumo_setores`, cron `10 * * * *`), quatro chaves em
    `push_preferencias` (ligadas para gerência), aviso de pagamento Cofen em H.O.
11. **`enviar-push`**: textos novos (agrupando várias pessoas em um aviso), H.O.
    sem bruto no Cofen, ação `resumo_setores`; testes de `texto.ts`;
    republicar `index.ts` + `texto.ts`.
12. **Interruptores da gerência** no app (`/m/setor`, aba Setor).
