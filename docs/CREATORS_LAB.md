# Creators Lab — manual de manutenção

Área escondida do Gestão de Acordos, dedicada a Kauan e Cleber.
Tudo vive em `src/pages/CreatorsLab/`, mais dois arquivos fora dela.

---

## Como se chega lá

**Cinco cliques rápidos no logo**, em até 3 segundos. Passou disso, o contador
zera. Um clique não abre; cinco cliques lentos também não.

O logo reage progressivamente: nada, nada, leve aumento, falha curta,
interferência forte. No quinto, navega para `/creators`.

| Onde | Arquivo |
|---|---|
| A regra de tempo | `src/hooks/useEasterEggCriadores.ts` |
| O gatilho no logo | `src/components/Layout.tsx` (procure `easterEgg`) |
| A animação de falha | `src/index.css`, classes `creators-logo-*` |

> ⚠️ O hook **precisa** ser chamado no corpo de `Layout`, nunca dentro de
> `SidebarContent`. Aquele componente é declarado dentro do `Layout` e usado
> como `<SidebarContent />` — a identidade da função muda a cada render, o React
> remonta tudo, e o contador nunca passaria de 1.

Depois da primeira descoberta, `localStorage` guarda
`creatorsLab:descoberto` e o logo ganha um `✦` discreto.

---

## Onde editar o conteúdo

**Um arquivo só: `creators.config.ts`.** Nenhum componente tem texto pessoal
dentro dele.

| O que | Onde |
|---|---|
| Nome, função, bio, foto | `CRIADORES[].nome / papel / sobre / foto` |
| Habilidades (barras) | `CRIADORES[].habilidades` — `nivel` de 0 a 100 |
| Curiosidades | `CRIADORES[].curiosidades` |
| Filmes, jogos, música | `CRIADORES[].categorias[].itens` |
| Contatos | `CRIADORES[].contato` |
| Projetos | `PROJETOS` |
| Números do projeto | `PROJETO_REAL` |

### Placeholders

O que ainda não foi informado usa `PENDENTE('descrição')`. A interface mostra
esses campos como lacuna marcada, **nunca inventa texto**.

```ts
papel: PENDENTE('função do Kauan'),   // aparece como ⚠ na tela
papel: 'Desenvolvedor Full Stack',    // aparece normalmente
```

Para preencher: troque a chamada `PENDENTE(...)` pelo texto real.

### Fotos

Coloque em `public/creators/` e aponte:

```ts
foto: '/creators/kauan.jpg',
```

Sem foto, o card mostra as iniciais. Não quebra.

### Adicionar um filme

```ts
{
  id: 'blade-runner',        // único
  titulo: 'Blade Runner 2049',
  simbolo: '🎬',             // usado enquanto não houver imagem
  imagem: '/creators/posters/br2049.jpg',   // opcional
  nota: 9,
  descricao: '...',
  porQue: '...',
  curiosidade: '...',        // opcional
}
```

---

## Theme Engine

Dois temas: **Cyberpunk** e **Arcade**. Toda diferença entre eles vive em
`theme/themes.ts` — cor, fonte, raio, sombra, duração, textura, cursor e o
**vocabulário** (a mesma seção se chama `DATABASE` num e `CHARACTER SELECT` no
outro).

> Se você encontrar `tema === 'cyberpunk'` dentro de um componente, faltou um
> token. Acrescente o token em vez de espalhar a condicional.

As cores viram variáveis CSS `--creator-*` aplicadas **no elemento raiz do Lab**,
nunca em `:root` — é isso que impede o tema de vazar para o Gestão.

### Criar um terceiro tema

1. Copie um `TokensTema` em `themes.ts`;
2. acrescente em `TEMAS` e `LISTA_TEMAS`;
3. pronto — a seleção de realidade e a barra o encontram sozinhas.

---

## Conquistas

Regras puras em `lib/conquistas.ts`. Para criar uma:

1. acrescente o id em `IdConquista`;
2. acrescente o objeto em `CONQUISTAS` (`secreta: true` aparece como `🔒 ???`);
3. acrescente a condição em `conquistasDesbloqueadas()`.

O progresso é gravado em `localStorage` (`creatorsLab:progresso`) e alimentado
por `registrar({...})`, disponível em `useCreators()`.

> Cuidado com a armadilha do "abriu tudo": condições sobre listas precisam
> exigir `total > 0`, senão a conquista cai sozinha quando não há nada para
> abrir. Há teste para isso.

---

## Terminal

`lib/terminal.ts`. **Lista branca de comandos — nada é executado.** Sem `eval`,
sem `Function`, sem shell, sem rede.

Para criar um comando:

1. acrescente o nome em `COMANDOS_VALIDOS`;
2. acrescente um `case` em `interpretar()`;
3. se precisar mexer na tela, devolva um `efeito` — quem executa é
   `sections/SecretTerminal.tsx`.

> Não afrouxe essa regra. É um brinquedo dentro de um sistema que guarda dado de
> cobrança, escondido num lugar onde ninguém procuraria uma porta aberta.

---

## Mini projetos

`components/MiniApps.tsx`. As contas são funções puras exportadas e testadas.

Para adicionar:

1. escreva a função pura e o componente no mesmo arquivo;
2. acrescente o id em `ProjetoArquivo['miniApp']` (`creators.config.ts`);
3. acrescente o projeto em `PROJETOS` com esse `miniApp`;
4. ligue o componente em `sections/ProjectArchive.tsx`.

---

## 3D e partículas

**Não há Three.js.** O 3D é Canvas 2D com projeção escrita à mão em
`lib/projecao3d.ts` — rotação, perspectiva e ordenação por profundidade.

Motivos: não adicionar centenas de kB a um pacote já apontado como pesado;
fallback mais simples (Canvas 2D não depende de driver como WebGL); e, sobretudo,
porque **uma página que demonstra matemática não deveria importar a matemática**.

### Desligar

| O quê | Como |
|---|---|
| Partículas | `sections/`… remova `<CampoParticulas>` de `index.tsx`, ou passe `ativo={false}` |
| Núcleo 3D | remova `<NucleoHolografico>` de `sections/CreatorsHero.tsx` |
| Densidade no celular | a constante `densidade` em `index.tsx` |

Ambos já param sozinhos quando a aba está escondida, e somem com
`prefers-reduced-motion`.

---

## Isolamento

- Todo seletor de `creators-lab.css` começa com `.creators-lab`;
- as variáveis de tema são aplicadas no elemento raiz do Lab, não em `:root`;
- as três classes do logo (`creators-logo-*`) vivem em `index.css` porque quem
  as usa é o `Layout`, que nunca importa o CSS do Lab. O prefixo garante que não
  alcancem mais nada.

---

## Custo para quem nunca entra

A rota é `lazy()`, e partículas entram por `import()` dinâmico depois disso. Na
medição de 16/08/2026 o pacote principal foi de **598,76 kB para 600,25 kB** —
1,5 kB, que é o próprio `lazy`. Quem usa o Gestão e nunca descobre o Easter Egg
não baixa o Lab.

---

## Testes

```
src/pages/CreatorsLab/lib/__tests__/   matematica, projecao3d, conquistas,
                                        terminal, miniApps
src/hooks/__tests__/useEasterEggCriadores.test.ts
```

118 testes. Os que mais importam:

- **cinco cliques lentos NÃO abrem** — evita abertura acidental;
- **o terminal não executa nada** — inclusive `eval`, `require`, `DROP TABLE`;
- **repulsão com distância zero** não vira infinito nem `NaN`;
- **conquista não cai de graça** quando não há conteúdo para explorar;
- **o icosaedro** tem 12 vértices equidistantes e usa φ.
