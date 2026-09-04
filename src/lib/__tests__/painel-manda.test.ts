/**
 * painel-manda.test.ts — o painel de permissões é a autoridade única.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ## A regra
 *
 * Ditada pelo Cleber em 23/08/2026:
 *
 *   «Eu quero ter o poder absoluto dessa aba de permissões. Não quero nenhum
 *    tipo de regra que bloqueie uma decisão minha. Eu quero definir o teto.»
 *
 * Ligar uma chave no painel tem de abrir a coisa. Desligar tem de fechá-la, sem
 * caminho alternativo. Isso só é verdade enquanto **nenhuma decisão de acesso
 * perguntar o cargo**.
 *
 * ## Por que uma guarda, e não só a conversão
 *
 * A conversão já foi feita no banco: `20260823010000` matou o teto por cargo,
 * `20260823020000` criou `fn_user_tem`/`fn_user_escopo`, e `030000`–`060000`
 * converteram ~76 policies em 40 tabelas.
 *
 * E mesmo assim a queixa voltou. Porque o cargo continuou sendo consultado no
 * FRONTEND — e uma tela que decide por cargo produz exatamente o mesmo sintoma
 * de uma policy que decide por cargo: «eu libero e não acontece nada».
 *
 * Sem esta guarda, a próxima pessoa (ou IA) reintroduz `isPerfilLider(cargo)`
 * numa tela nova, ninguém percebe, e daqui a um mês a queixa volta pela décima
 * primeira vez. **A conversão sozinha não é solução; é um estado que decai.**
 *
 * ## Como ela funciona
 *
 * Varre `src/` procurando decisão por cargo. Todo arquivo que ainda tem uma
 * precisa estar em `EXCECOES`, com contagem exata e motivo escrito.
 *
 * A contagem é exata de propósito: um arquivo já listado não vira porta de
 * entrada para casos novos. Acrescentar uma linha de cargo em `useAnalytics.ts`
 * reprova, mesmo o arquivo já estando na lista.
 *
 * ## Como mexer nesta lista
 *
 * Converteu um caso? **Baixe o número.** O teste reprova se a contagem não
 * bater — inclusive para menos, porque um número desatualizado esconde quanta
 * dívida sobrou.
 *
 * Precisa acrescentar? Só com motivo escrito, e o motivo precisa ser uma das
 * três famílias legítimas abaixo. «É mais fácil assim» não é motivo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');

/**
 * O que conta como «decidir por cargo».
 *
 * Os helpers (`isPerfilLider` e família) e a comparação literal com um nome de
 * cargo. `podeAutorizarTabulacao` entra porque é a mesma coisa com outro nome:
 * uma lista de cargos fechada, em `lib/index.ts`, decidindo quem pode agir.
 */
const PADROES = [
  /\bisPerfil(?:Lider|Admin|Diretoria|AdminOuLider)\s*\(/,
  /\bpodeAutorizarTabulacao\s*\(/,
  /(?:perfil|cargo|usuario_cargo)\s*(?:!==|===)\s*'[a-z_]+'/,
  /*
   * `PERFIL_NIVEL[cargo] <= PERFIL_NIVEL.operador` é a mesma decisão com outra
   * roupa: hierarquia de cargo em vez de nome de cargo. Escapou da primeira
   * versão desta varredura e estava viva no Campanha Fácil, onde produzia o
   * defeito completo — ligar `ver_campanha_facil` num operador abria o menu,
   * deixava a rota passar e mostrava uma tela de bloqueio no fim.
   */
  /\bPERFIL_NIVEL\s*\[/,
];

/** Por que este arquivo ainda pode decidir por cargo. */
type Familia =
  /** Chave-mestra do `super_admin` — a única exceção que o painel não reduz. */
  | 'chave-mestra'
  /** A definição dos próprios helpers, ou um filtro de DADO (quem é líder de equipe). */
  | 'definicao-ou-dado'
  /** Dívida: é decisão de acesso e ainda não pergunta ao painel. */
  | 'divida';

interface Excecao {
  /** Quantas linhas com decisão por cargo o arquivo tem HOJE. Exato. */
  linhas: number;
  familia: Familia;
  motivo: string;
}

const EXCECOES: Record<string, Excecao> = {
  // ── Chave-mestra do super_admin ───────────────────────────────────────────
  //
  // A única exceção que o painel não reduz, e ela é deliberada: é a garantia de
  // que ninguém se tranca para fora do sistema editando o próprio painel.
  // Existe para proteger quem configura, nunca para limitá-lo.
  'components/ProtectedRoute.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'super_admin atravessa qualquer rota; sem isso um painel mal configurado tranca o dono do sistema para fora.',
  },
  'hooks/useAuth.tsx': {
    linhas: 2, familia: 'chave-mestra',
    motivo: 'super_admin entra em empresa de outro tenant (impersonação) e não é barrado por situação «desligado».',
  },
  'hooks/useLogs.ts': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'super_admin vê os logs das duas operações; administrador vê só a própria empresa.',
  },
  'components/Chat/comum.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'a etiqueta ADM do chat ROTULA o super_admin, não libera nada — não há acesso a conceder, e uma chave de painel para "mostrar quem é o dono do sistema" seria uma permissão que ninguém deveria poder desligar.',
  },
  'pages/AdminLogs/index.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'idem useLogs: o seletor de empresa da trilha só existe para super_admin.',
  },
  'providers/PresenceProvider.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'presença entre empresas: só super_admin enxerga quem está on-line fora da própria.',
  },
  'components/Layout.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'o editor do menu lateral configura o que os outros cargos veem — quem edita o painel não pode ser configurável por ele.',
  },
  'lib/menuLateral.ts': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'fallback do item sem chave de permissão: só o Dashboard cai nele, e super_admin sempre passa.',
  },
  'pages/PainelDiretoria/index.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo:
      'a aba do relatório 59 é conferência: o mestre roda em paralelo e ainda não alimenta '
      + 'tela nenhuma. Uma chave de painel existe para ser ligada, e ligá-la daria a alguém '
      + 'um total que ainda pode mudar — número visto uma vez vira referência mesmo depois de '
      + 'corrigido. O alcance passa a ser configurável quando o 59 virar fonte de verdade, que '
      + 'é quando existir decisão de produto sobre quem deve ver.',
  },
  'pages/AdminConfiguracoes.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'a aba Multiempresa só existe para super_admin — quem decide são as RPCs e o trigger em perfis.',
  },
  'pages/AdminSetoresAba.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'trocar a empresa em foco no cadastro de setores é privilégio de super_admin.',
  },
  'pages/AdminUsuarios.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'a lista atravessa empresas só para super_admin; o resto da tela já pergunta ao painel.',
  },
  'services/acessoMultiempresa.service.ts': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'super_admin alterna entre as operações sem depender da flag nem da chave de cargo.',
  },
  'App.tsx': {
    linhas: 1, familia: 'chave-mestra',
    motivo: 'ReactQueryDevtools. Ferramenta de desenvolvimento, não dado do produto — não há o que o painel governe aqui.',
  },

  // ── Definição dos helpers, e filtros de DADO ──────────────────────────────
  //
  // «Quem é líder de equipe» é uma pergunta sobre o CADASTRO, não sobre acesso:
  // a resposta não muda o que a pessoa que olha consegue ver.
  'lib/index.ts': {
    linhas: 6, familia: 'definicao-ou-dado',
    motivo: 'é onde os helpers são definidos. Nenhuma tela os consome mais — some quando alguém apagar as funções.',
  },
  'pages/AdminEquipes.tsx': {
    linhas: 2, familia: 'definicao-ou-dado',
    motivo: 'seleciona QUEM pode ser líder de uma equipe. Filtro de cadastro: não decide o que quem olha enxerga.',
  },
  'pages/Tickets/PainelAtendentes.tsx': {
    linhas: 1, familia: 'definicao-ou-dado',
    motivo: 'exclui admin da LISTA de quem pode ser cadastrado como atendente. Filtro de cadastro, não de acesso.',
  },

  /*
   * ── Dívida: ZERO ──────────────────────────────────────────────────────────
   *
   * Em 24/08/2026 eram 39 decisões de acesso por cargo, em 22 arquivos. Todas
   * foram convertidas — o que era `isPerfilLider(cargo)` virou
   * `temPermissao(chave)` ou `niveisLiberados(aba, temPermissao)`.
   *
   * Se alguma voltar, ela cai no primeiro teste («nenhum arquivo novo decide
   * acesso por cargo») e não aqui. Acrescentar uma entrada `familia: 'divida'`
   * é admitir que uma tela voltou a não obedecer ao painel — e isso precisa de
   * uma decisão consciente, não de uma linha a mais numa lista.
   */
};

/** Todo `.ts`/`.tsx` de `src`, menos testes. */
function arquivosFonte(dir: string, saida: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '__tests__') continue;
      arquivosFonte(completo, saida);
    } else if (/\.(ts|tsx)$/.test(item.name) && !item.name.includes('.test.')) {
      saida.push(completo);
    }
  }
  return saida;
}

/**
 * As linhas com decisão por cargo, por arquivo.
 *
 * `split(/\r?\n/)`: o repositório grava CRLF no Windows, e em JavaScript o `.`
 * de uma expressão regular NÃO casa `\r`. Com `split('\n')` cada linha termina
 * em `\r`, o `//.*$` de tirar comentário não casa, e toda linha comentada
 * entraria na contagem — a lista nasceria inflada e o teste passaria a medir
 * comentário. Aconteceu na primeira versão desta varredura.
 */
function ocorrencias(): Map<string, number[]> {
  const achados = new Map<string, number[]>();
  for (const arquivo of arquivosFonte(SRC)) {
    const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
    const hits: number[] = [];
    linhas.forEach((linha, i) => {
      // Linha que começa em `*`, `//` ou `/*` é comentário inteiro.
      if (/^\s*[*/]/.test(linha)) return;
      const codigo = linha.replace(/\/\/.*/, '');
      if (PADROES.some(p => p.test(codigo))) hits.push(i + 1);
    });
    if (hits.length > 0) {
      achados.set(path.relative(SRC, arquivo).split(path.sep).join('/'), hits);
    }
  }
  return achados;
}

describe('o painel de permissões é a autoridade única', () => {
  const achados = ocorrencias();

  it('nenhum arquivo novo decide acesso por cargo', () => {
    const novos = [...achados.entries()]
      .filter(([arquivo]) => !(arquivo in EXCECOES))
      .map(([arquivo, linhas]) => `${arquivo}:${linhas.join(',')}`);

    expect(
      novos,
      'Estes arquivos decidem por CARGO e não estão na lista de exceções.\n'
      + 'Ligar a chave no painel não vai ter efeito aqui — que é exatamente a\n'
      + 'queixa que esta guarda existe para impedir.\n\n'
      + 'Pergunte ao painel: `temPermissao(chave)` ou\n'
      + '`niveisLiberados(aba, temPermissao)`. Só acrescente à lista com motivo\n'
      + 'escrito, e só se for chave-mestra do super_admin ou filtro de dado:\n  '
      + novos.join('\n  '),
    ).toEqual([]);
  });

  it('a contagem de cada exceção está exata', () => {
    const divergentes: string[] = [];
    for (const [arquivo, esperado] of Object.entries(EXCECOES)) {
      const reais = achados.get(arquivo)?.length ?? 0;
      if (reais === esperado.linhas) continue;
      divergentes.push(
        reais > esperado.linhas
          ? `${arquivo}: ${reais} ocorrências, a lista diz ${esperado.linhas}. `
            + 'Um arquivo já listado não é porta de entrada para casos novos.'
          : `${arquivo}: ${reais} ocorrências, a lista diz ${esperado.linhas}. `
            + 'Converteu? Baixe o número — lista inflada esconde quanta dívida sobrou.',
      );
    }
    expect(divergentes, divergentes.join('\n  ')).toEqual([]);
  });

  it('toda exceção tem motivo escrito e família declarada', () => {
    for (const [arquivo, e] of Object.entries(EXCECOES)) {
      expect(e.motivo.length, `${arquivo} sem motivo`).toBeGreaterThan(30);
      expect(['chave-mestra', 'definicao-ou-dado', 'divida'])
        .toContain(e.familia);
    }
  });

  /*
   * O placar. Não reprova nada — existe para o número aparecer no relatório da
   * CI, porque dívida que ninguém vê é dívida que ninguém paga.
   */
  it('nenhuma decisão de acesso por cargo sobrou', () => {
    const divida = Object.entries(EXCECOES).filter(([, e]) => e.familia === 'divida');
    const linhas = divida.reduce((s, [, e]) => s + e.linhas, 0);
    /*
     * Zero, e o zero é o ponto.
     *
     * Começou em 39 (24/08/2026), medido logo depois de a conversão do BANCO
     * terminar — era o tamanho exato do que sobrava no frontend. Foram todas
     * convertidas no mesmo dia.
     *
     * Este teste é o que impede a próxima sessão de «só desta vez» acrescentar
     * uma linha de cargo com um motivo plausível. Não há teto folgado onde
     * caiba uma: o único número aceito é 0, e voltar a permitir dívida exige
     * mexer nesta asserção — que é um ato consciente, e não um descuido.
     */
    expect(
      linhas,
      `${linhas} decisão(ões) de acesso por cargo em ${divida.length} arquivo(s). `
      + 'Converta para `temPermissao` / `niveisLiberados` em vez de listar aqui.',
    ).toBe(0);
  });
});

describe('a doutrina antiga não voltou aos documentos', () => {
  /*
   * O cabeçalho de `permissoes-catalogo.ts` dizia, até 24/08/2026, que forçar
   * uma chave num operador «não faz ele enxergar acordo de outra pessoa — e
   * isso é o comportamento correto».
   *
   * Era o oposto do que o dono do projeto pediu, e estava escrito no arquivo
   * que toda IA abre primeiro ao mexer em permissões. Enquanto esteve lá, cada
   * sessão reimplementava o modelo antigo achando que seguia o projeto.
   */
  const CATALOGO = fs.readFileSync(path.join(SRC, 'lib/permissoes-catalogo.ts'), 'utf8');

  it('o catálogo afirma que o painel manda', () => {
    expect(CATALOGO).toMatch(/autoridade única/i);
  });

  it('o catálogo não diz mais que a permissão é só cosmética', () => {
    // A frase exata que causou o estrago, e as variações próximas dela.
    expect(CATALOGO).not.toMatch(/NÃO são barreira de segurança/i);
    expect(CATALOGO).not.toMatch(/quem manda no dado é a RLS/i);
    expect(CATALOGO).not.toMatch(/a permissão nunca amplia/i);
  });

  it('o levantamento antigo está marcado como histórico', () => {
    const analise = fs.readFileSync(
      path.resolve(SRC, '../docs/PERMISSOES-ANALISE-ATUAL.md'), 'utf8');
    // Ele descreve o modelo invertido, e descreve-o como correto. Sem o aviso
    // no topo, continua sendo lido como especificação vigente.
    expect(analise.slice(0, 800)).toMatch(/DOCUMENTO HISTÓRICO/);
  });
});
