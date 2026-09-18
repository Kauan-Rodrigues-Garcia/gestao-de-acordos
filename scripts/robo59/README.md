# Robô do 59 — importação automática de hora em hora

Sobe o relatório 59 sozinho, a partir da pasta onde o ERP o deixa. Roda no PC
do trabalho, disparado pelo Agendador de Tarefas do Windows.

---

## O que ele faz

1. Lê o arquivo da pasta configurada.
2. Interpreta com **o parser do próprio sistema** — não uma cópia.
3. Compara o conteúdo com o do lote que está vigente. Igual, para aqui.
4. Entra com a conta do robô.
5. Chama `importarMestre59` — a **mesma função** que a tela chama.

O passo 5 dispara, dentro do banco, tudo o que já existe: a sincronização do
analítico em todos os setores do 59 e a notificação para a empresa inteira. O
robô não sabe nada disso, e é assim que tem de ser — ele sobe o arquivo, o banco
decide o resto.

### Por que Node, e não um `.bat` ou PowerShell

Porque o robô usa o parser do sistema. Reescrever a leitura do CSV em outra
linguagem criaria uma segunda interpretação do mesmo arquivo, e duas
interpretações divergem num dia qualquer — em silêncio, que é o pior jeito.

### Por que ele confere o hash

O ERP reescreve o arquivo de hora em hora mesmo quando nada mudou. Sem a
comparação seriam 24 lotes por dia, cada um substituindo o anterior, com 22 mil
linhas subindo à toa.

A comparação é contra o **banco**, não contra um arquivo local: só o banco sabe
se alguém importou pela tela no meio do caminho.

---

## Instalação no PC do trabalho

### 1. Node

Baixe o Node 18 ou mais novo em <https://nodejs.org> (a versão LTS). Instalação
padrão, «next, next, finish».

Confira abrindo o Prompt de Comando:

```
node --version
```

### 2. A pasta do robô

Copie esta pasta (`scripts/robo59`) inteira para `C:\robo59`. Ela já vem com o
`robo59.mjs` pronto — não precisa rodar build nem instalar dependência. Os
`.ts` que vão junto não atrapalham.

Falta só o `.env`, que **não está no GitHub** porque tem senha. Crie em
`C:\robo59\.env` (passo 4).

Confira no Prompt de Comando, dentro de `C:\robo59`, com `dir /a`: tem de
aparecer `robo59.mjs` e `.env` — exatamente com esses nomes. Download costuma
renomear para `.env.txt` ou `robo59 (1).mjs`.

### 3. A conta do robô

**Não use uma conta de pessoa, e não use super_admin.** Crie uma conta só para
isto:

1. Cadastre um usuário novo (ex.: `robo.59@suaempresa.com`), cargo `operador`.
2. Em Configurações › Permissões, ligue para esse usuário a chave
   **«Importar relatório mestre automaticamente»** (`mestre_importar_automatico`).

Essa chave é **explícita**: ela não vem por herança de nenhum cargo, nem do
acesso total do administrador. Alguém precisa ligá-la nominalmente, e é
exatamente isso que a torna segura de deixar num PC compartilhado — quem pegar
a senha consegue importar o 59, e nada mais.

### 4. O `.env`

Copie `.env.example` para `.env` e preencha. Cada variável está explicada no
próprio arquivo. Duas coisas que costumam pegar:

- **O nome muda todo mês.** Escreva `{AAAAMM}` no lugar do ano e mês
  (`rel_59_{AAAAMM}.csv`). O robô procura o do mês corrente e, na virada,
  enquanto o novo não existe, o do mês anterior. Se o conteúdo do arquivo for
  de outro mês que não o do nome, ele recusa.
- **Login é o nome de usuário**, o mesmo da tela de entrada. Não precisa saber
  o e-mail da conta.

### 5. Teste antes de agendar

No Prompt de Comando, dentro de `C:\robo59`:

```
node robo59.mjs
```

Deve escrever algo como:

```
[14/09/2026, 11:17:35] Arquivo lido: 21855 linha(s), mês 2026-09, R$ 5.094.321,63
[14/09/2026, 11:17:36] Autenticado como robô.
[14/09/2026, 11:17:36] Enviando…
[14/09/2026, 11:17:41] Importado: lote 618911d8…, 21855 linha(s), R$ 5.094.321,63 (substituiu o lote anterior)
```

Rodando de novo em seguida, sem o ERP ter reescrito o arquivo:

```
[14/09/2026, 11:20:02] O arquivo é idêntico ao que já está vigente. Nada a fazer.
```

**Só agende depois de ver essas duas saídas.**

### 6. O agendamento

Abra o **Agendador de Tarefas** (`taskschd.msc`) › *Criar Tarefa* (não «tarefa
básica» — a básica não tem as opções que importam).

**Geral**
- Nome: `Robô 59`
- ☑ *Executar estando o usuário conectado ou não*
- ☑ *Executar com privilégios mais altos* — só se a pasta do relatório exigir

**Disparadores** › Novo
- *Diariamente*, a cada 1 dia
- ☑ *Repetir a cada* `1 hora`, *durante* `Indefinidamente`

**Ações** › Novo
- Programa: `node`
- Argumentos: `robo59.mjs`
- **Iniciar em: `C:\robo59`** ← não deixe em branco; sem isso o Windows roda a
  partir de `System32` e o robô não acha o `.env`

> **Unidade de rede.** Se o `ROBO_ARQUIVO` começa com uma letra mapeada (`Y:`),
> a tarefa com *«executar estando o usuário conectado ou não»* não enxerga essa
> letra — ela só existe na sessão de quem está logado. Troque pelo caminho
> `\\servidor\pasta` (o `net use` mostra) ou marque *«executar somente quando o
> usuário estiver conectado»*.

**Configurações**
- ☑ *Executar a tarefa assim que possível após uma inicialização agendada ter
  sido perdida* — o PC desligado à noite não perde a manhã
- ☐ *Parar a tarefa se for executada por mais de…* — a importação leva segundos;
  se travar, é problema para olhar, não para matar em silêncio

### 7. O log

O Agendador mostra o código da última execução, mas não a saída. Para guardar o
que o robô escreveu, troque a ação por:

- Programa: `cmd`
- Argumentos: `/c node robo59.mjs >> robo59.log 2>&1`
- Iniciar em: `C:\robo59`

O arquivo `robo59.log` cresce devagar — uma importação escreve 4 linhas.

---

## Como saber que está funcionando

**No sistema.** Painel Diretoria › *Histórico de importações*. Cada execução do
robô aparece na linha do tempo, e abrindo a linha você vê o que entrou e o que
saiu em cada setor.

**No PC.** O `robo59.log`, se você configurou o passo 7.

**Sem olhar nada.** Toda a empresa recebe a notificação «Dados analíticos
atualizados» quando os números mudam. Se o 59 entrou e nada mudou nos setores,
ninguém é avisado — de propósito.

---

## Quando alguma coisa dá errado

O robô sai com código **1** em qualquer falha, e o Agendador marca a execução
como erro. A mensagem sempre diz o que houve:

| mensagem | o que é |
|---|---|
| `Falta ROBO_ARQUIVO` (ou outra) | o `.env` não foi preenchido, ou o Agendador não está com «Iniciar em» |
| `O arquivo não está lá` | o ERP mudou o nome ou a pasta, ou a unidade de rede não está conectada |
| `… traz dados de 2026-08, não de 2026-09` | o conteúdo não é do mês que o nome diz |
| `o usuário «…» não foi encontrado` | o `ROBO_LOGIN` não é o nome de usuário da conta |
| `Não parece o relatório 59: faltam…` | o arquivo é outro, ou o ERP mudou as colunas |
| `Login do robô: …` | senha trocada, ou a conta foi desativada |
| `Apenas super_admin pode importar…` | a permissão `mestre_importar_automatico` não está ligada para a conta |

E um aviso que **não** é erro, mas merece atenção:

```
AVISO: o arquivo não é reescrito há 7.4h. O ERP pode ter parado de exportar.
```

O robô continua funcionando; o que ele está dizendo é que a origem parou. Sem
esse aviso, um ERP travado ficaria invisível — o hash continuaria igual e tudo
pareceria normal.

---

## Rebuild

Quando o parser ou a importação mudarem no sistema, o robô precisa ser
reempacotado, commitado, e o `.mjs` copiado de novo para o PC:

```
npm run robo59:build
git add scripts/robo59/robo59.mjs
```

É o preço de ele usar o código do sistema em vez de uma cópia — e é um preço
bom: enquanto não for reempacotado, ele continua funcionando com a versão
anterior, em vez de quebrar.
