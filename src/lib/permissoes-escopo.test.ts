/**
 * permissoes-escopo.test.ts
 *
 * O contrato central da estrutura por aba: **uma aba nunca fala pela outra.**
 *
 * O defeito que estes testes existem para impedir é o descrito no pedido de
 * reestruturação — configurar escopo numa aba e ver o alcance mudar em outra.
 * Antes disso, `ver_acordos_gerais` sozinho decidia Acordos, Dashboard e
 * Lixeira ao mesmo tempo.
 *
 * Cenários cobertos:
 *   1. Aba desligada zera os níveis, mesmo com todos ligados
 *   2. Níveis independentes: buracos no meio são respeitados
 *   3. Escopo efetivo é o mais amplo liberado, não o último ligado
 *   4. Uma aba não vaza para outra
 *   5. Comparação de amplitude e limitação ao teto
 */

import { describe, it, expect } from 'vitest';
import {
  NIVEIS_ESCOPO, ABAS_COM_ESCOPO, chaveEscopo, niveisLiberados,
  escopoEfetivo, alcancaPeloMenos, limitarAoTeto,
} from './permissoes-escopo';

/** Constrói um `temPermissao` a partir de uma lista de chaves ligadas. */
function comChaves(...ligadas: string[]) {
  const set = new Set(ligadas);
  return (chave: string) => set.has(chave);
}

describe('chaveEscopo', () => {
  it('monta a chave no formato do catálogo', () => {
    expect(chaveEscopo('lixeira', 'todos_setores')).toBe('lixeira_escopo_todos_setores');
    expect(chaveEscopo('lixeira', 'individual')).toBe('lixeira_escopo_individual');
  });
});

describe('dependência aba-mãe', () => {
  it('aba desligada zera os níveis mesmo com todos ligados', () => {
    const tem = comChaves(
      ...NIVEIS_ESCOPO.map(n => chaveEscopo('lixeira', n)),
      // repare: 'ver_lixeira' NÃO está aqui
    );
    expect(niveisLiberados('lixeira', tem)).toEqual([]);
    expect(escopoEfetivo('lixeira', tem)).toBeNull();
  });

  it('religar a aba devolve a configuração que já existia', () => {
    // A dependência é resolvida na leitura, então as chaves filhas continuam
    // gravadas enquanto a mãe está desligada.
    const chavesFilhas = [chaveEscopo('lixeira', 'individual'), chaveEscopo('lixeira', 'setor')];
    expect(niveisLiberados('lixeira', comChaves(...chavesFilhas))).toEqual([]);
    expect(niveisLiberados('lixeira', comChaves('ver_lixeira', ...chavesFilhas)))
      .toEqual(['individual', 'setor']);
  });
});

describe('níveis independentes', () => {
  it('respeita buraco no meio: individual + setor, sem equipe', () => {
    const tem = comChaves(
      'ver_lixeira',
      chaveEscopo('lixeira', 'individual'),
      chaveEscopo('lixeira', 'setor'),
    );
    expect(niveisLiberados('lixeira', tem)).toEqual(['individual', 'setor']);
  });

  it('devolve sempre do mais estreito ao mais amplo', () => {
    const tem = comChaves('ver_lixeira', ...NIVEIS_ESCOPO.map(n => chaveEscopo('lixeira', n)));
    expect(niveisLiberados('lixeira', tem))
      .toEqual(['individual', 'equipe', 'setor', 'todos_setores']);
  });

  it('nenhum nível ligado, com a aba ligada, nao devolve escopo', () => {
    expect(escopoEfetivo('lixeira', comChaves('ver_lixeira'))).toBeNull();
  });
});

describe('escopo efetivo', () => {
  it('e o mais amplo liberado, nao o ultimo ligado', () => {
    const tem = comChaves(
      'ver_lixeira',
      chaveEscopo('lixeira', 'setor'),
      chaveEscopo('lixeira', 'individual'),
    );
    expect(escopoEfetivo('lixeira', tem)).toBe('setor');
  });

  it('so individual devolve individual', () => {
    const tem = comChaves('ver_lixeira', chaveEscopo('lixeira', 'individual'));
    expect(escopoEfetivo('lixeira', tem)).toBe('individual');
  });
});

describe('uma aba nao fala pela outra', () => {
  it('chave de outra aba nao libera nada aqui', () => {
    // O caso do pedido: escopo amplo no Pix nao pode mexer na Lixeira.
    const tem = comChaves(
      'ver_lixeira',
      chaveEscopo('lixeira', 'individual'),
      'pix_escopo_todos_setores',
      'acordos_escopo_todos_setores',
      'dashboard_escopo_todos_setores',
    );
    expect(escopoEfetivo('lixeira', tem)).toBe('individual');
  });

  it('as chaves globais antigas nao concedem escopo nenhum', () => {
    // ver_acordos_gerais e ver_todos_setores deixam de mandar aqui. Enquanto
    // elas existirem no catalogo, este teste garante que nao voltaram a decidir.
    const tem = comChaves('ver_lixeira', 'ver_acordos_gerais', 'ver_todos_setores');
    expect(niveisLiberados('lixeira', tem)).toEqual([]);
    expect(escopoEfetivo('lixeira', tem)).toBeNull();
  });

  it('toda aba registrada usa o proprio prefixo', () => {
    for (const [nome, meta] of Object.entries(ABAS_COM_ESCOPO)) {
      for (const nivel of meta.niveis) {
        expect(chaveEscopo(meta.prefixo, nivel)).toContain(meta.prefixo);
      }
      if (meta.chaveAba !== null) expect(meta.chaveAba).not.toContain('escopo');
      expect(nome.length).toBeGreaterThan(0);
    }
  });
});

describe('Dashboard com interruptor próprio', () => {
  /*
   * O Dashboard agora é configurável como qualquer aba. A rota `/` mostra um
   * estado sem acesso quando a chave está desligada, sem esconder o menu.
   */
  it('resolve escopo mesmo sem nenhuma chave de aba ligada', () => {
    const tem = comChaves('ver_dashboard', chaveEscopo('dashboard', 'setor'));
    expect(escopoEfetivo('dashboard', tem)).toBe('setor');
  });

  it('sem nivel nenhum continua sem escopo', () => {
    expect(escopoEfetivo('dashboard', comChaves())).toBeNull();
  });

  it('e continua nao ouvindo as chaves de outras abas', () => {
    const tem = comChaves(
      chaveEscopo('dashboard', 'individual'),
      'ver_dashboard',
      chaveEscopo('lixeira', 'todos_setores'),
      chaveEscopo('painel_lider', 'todos_setores'),
    );
    expect(escopoEfetivo('dashboard', tem)).toBe('individual');
  });
});

describe('Analitico: tres niveis, sem equipe', () => {
  /*
   * A aba tem tres alcances desde sempre — proprios numeros, setor, todos os
   * setores — e `equipe` nunca foi um deles. O seletor de equipe do
   * Recebimento Diario recorta DENTRO do setor que a pessoa ja enxerga: e
   * filtro, nao permissao. Estes testes travam essa distincao.
   */
  it('nao registra o nivel de equipe', () => {
    expect(ABAS_COM_ESCOPO.analitico.niveis).toEqual(['individual', 'setor', 'todos_setores']);
  });

  it('uma chave de equipe inventada nao concede nada', () => {
    const tem = comChaves('ver_analitico', 'analitico_escopo_equipe');
    expect(niveisLiberados('analitico', tem)).toEqual([]);
    expect(escopoEfetivo('analitico', tem)).toBeNull();
  });

  it('o caso do elite: dois niveis, e o mais amplo vale por padrao', () => {
    // E o que faz o alternador "Minha visao" x "Visao geral" aparecer — por
    // ter dois niveis, nao por ser elite.
    const tem = comChaves(
      'ver_analitico',
      chaveEscopo('analitico', 'individual'),
      chaveEscopo('analitico', 'setor'),
    );
    expect(niveisLiberados('analitico', tem)).toEqual(['individual', 'setor']);
    expect(escopoEfetivo('analitico', tem)).toBe('setor');
  });

  it('o caso do operador: um nivel so, sem alternador', () => {
    const tem = comChaves('ver_analitico', chaveEscopo('analitico', 'individual'));
    expect(niveisLiberados('analitico', tem)).toEqual(['individual']);
  });

  it('a aba desligada zera tudo, inclusive para a cupula', () => {
    // `bookplay/ouvidoria` guarda os niveis do cargo com `ver_analitico` em
    // false: a dependencia e resolvida aqui, na leitura, e religar a aba
    // devolve a configuracao inteira.
    const tem = comChaves(
      chaveEscopo('analitico', 'individual'),
      chaveEscopo('analitico', 'setor'),
      chaveEscopo('analitico', 'todos_setores'),
    );
    expect(niveisLiberados('analitico', tem)).toEqual([]);
    expect(niveisLiberados('analitico', comChaves('ver_analitico', ...[
      chaveEscopo('analitico', 'individual'),
      chaveEscopo('analitico', 'setor'),
      chaveEscopo('analitico', 'todos_setores'),
    ]))).toEqual(['individual', 'setor', 'todos_setores']);
  });

  it('as chaves globais aposentadas nao decidem mais nada aqui', () => {
    // `ver_analiticos_global` saiu do catalogo nesta fase; `ver_todos_setores`
    // ainda existe para Acordos. Nenhuma das duas fala pelo Analitico.
    const tem = comChaves('ver_analitico', 'ver_analiticos_global', 'ver_todos_setores');
    expect(escopoEfetivo('analitico', tem)).toBeNull();
  });

  it('o Dashboard nao empresta alcance para o Analitico', () => {
    const tem = comChaves(
      'ver_analitico',
      chaveEscopo('analitico', 'individual'),
      chaveEscopo('dashboard', 'todos_setores'),
    );
    expect(escopoEfetivo('analitico', tem)).toBe('individual');
  });
});

describe('Acordos: os quatro niveis, e o que todos_setores significa aqui', () => {
  it('usa a escala inteira', () => {
    expect(ABAS_COM_ESCOPO.acordos.niveis).toEqual(NIVEIS_ESCOPO);
  });

  it('a aba desligada zera tudo', () => {
    const tem = comChaves(...NIVEIS_ESCOPO.map(n => chaveEscopo('acordos', n)));
    expect(niveisLiberados('acordos', tem)).toEqual([]);
  });

  it('o operador tem so o proprio nivel', () => {
    const tem = comChaves('ver_acordos', chaveEscopo('acordos', 'individual'));
    expect(niveisLiberados('acordos', tem)).toEqual(['individual']);
    expect(escopoEfetivo('acordos', tem)).toBe('individual');
  });

  it('o lider tem individual, equipe e setor — mas nao todos os setores', () => {
    const tem = comChaves(
      'ver_acordos',
      chaveEscopo('acordos', 'individual'),
      chaveEscopo('acordos', 'equipe'),
      chaveEscopo('acordos', 'setor'),
    );
    expect(niveisLiberados('acordos', tem)).toEqual(['individual', 'equipe', 'setor']);
    expect(escopoEfetivo('acordos', tem)).toBe('setor');
  });

  it('`ver_acordos_gerais` nao decide mais nada — foi aposentada na fase 5a', () => {
    const tem = comChaves('ver_acordos', 'ver_acordos_gerais', 'ver_todos_setores');
    expect(niveisLiberados('acordos', tem)).toEqual([]);
    expect(escopoEfetivo('acordos', tem)).toBeNull();
  });

  it('nenhuma das outras abas empresta alcance para Acordos', () => {
    const tem = comChaves(
      'ver_acordos',
      chaveEscopo('acordos', 'individual'),
      chaveEscopo('dashboard', 'todos_setores'),
      chaveEscopo('lixeira', 'todos_setores'),
      chaveEscopo('analitico', 'todos_setores'),
    );
    expect(escopoEfetivo('acordos', tem)).toBe('individual');
  });

  it('e Acordos tambem nao empresta alcance para o Dashboard', () => {
    // A simetria importa: as duas abas liam a MESMA chave global ate a fase 5a.
    const tem = comChaves(...NIVEIS_ESCOPO.map(n => chaveEscopo('acordos', n)), 'ver_acordos');
    expect(escopoEfetivo('dashboard', tem)).toBeNull();
  });
});

describe('Pix: nivel largo sem o estreito embaixo seria concessao calada', () => {
  /*
   * O caso real da fase 5b: `diretoria` estava em CARGOS_MULTI_SETOR mas nao
   * em `isPerfilAdminOuLider`, e o filtro de setor do Pix mora DENTRO do bloco
   * de lider — entao ela nunca viu registro de outra pessoa. Derivar
   * `todos_setores` so do multi-setor teria dado a ela a visao de lider
   * inteira, porque `escopoEfetivo` devolve o mais amplo LIBERADO e nao exige
   * que os niveis abaixo estejam ligados.
   */
  it('escopoEfetivo devolve o mais amplo mesmo com buraco embaixo', () => {
    const tem = comChaves('ver_pix_automatico', chaveEscopo('pix', 'todos_setores'));
    expect(escopoEfetivo('pix', tem)).toBe('todos_setores');
    expect(niveisLiberados('pix', tem)).toEqual(['todos_setores']);
  });

  it('a diretoria de hoje: so o proprio', () => {
    const tem = comChaves('ver_pix_automatico', chaveEscopo('pix', 'individual'));
    expect(escopoEfetivo('pix', tem)).toBe('individual');
  });

  it('o lider de hoje: individual, equipe e setor', () => {
    const tem = comChaves(
      'ver_pix_automatico',
      chaveEscopo('pix', 'individual'),
      chaveEscopo('pix', 'equipe'),
      chaveEscopo('pix', 'setor'),
    );
    expect(escopoEfetivo('pix', tem)).toBe('setor');
  });

  it('Acordos e Pix nao falam um pelo outro, mesmo vivendo na mesma tela', () => {
    // O Pix aparece dentro de Acordos, e por isso mesmo foi pedido como aba
    // independente: desligar uma nao pode mexer na outra.
    const tem = comChaves(
      'ver_pix_automatico', 'ver_acordos',
      ...NIVEIS_ESCOPO.map(n => chaveEscopo('acordos', n)),
      chaveEscopo('pix', 'individual'),
    );
    expect(escopoEfetivo('pix', tem)).toBe('individual');
    expect(escopoEfetivo('acordos', tem)).toBe('todos_setores');
  });
});

describe('Painel Diretoria: duas abas que dividiam o mesmo hook', () => {
  /*
   * Dashboard e Painel Diretoria eram servidos por `useAnalytics`, que decidia
   * o alcance sozinho — por cargo mais `ver_todos_setores`. Era a ultima
   * pergunta de escopo do sistema que valia para mais de uma aba. Estes testes
   * travam a separacao.
   */
  it('nao registra individual nem equipe: a tela so tem filtro de setor', () => {
    expect(ABAS_COM_ESCOPO.painel_diretoria.niveis).toEqual(['setor', 'todos_setores']);
  });

  it('o caso da gerencia da PaguePlay: abre a aba e ve so o proprio setor', () => {
    const tem = comChaves(
      'ver_dashboard',
      'ver_painel_diretoria',
      chaveEscopo('painel_diretoria', 'setor'),
    );
    expect(escopoEfetivo('painel_diretoria', tem)).toBe('setor');
  });

  it('alcance amplo no Dashboard nao abre o Painel Diretoria', () => {
    const tem = comChaves(
      'ver_dashboard',
      'ver_painel_diretoria',
      chaveEscopo('painel_diretoria', 'setor'),
      chaveEscopo('dashboard', 'todos_setores'),
    );
    expect(escopoEfetivo('painel_diretoria', tem)).toBe('setor');
  });

  it('e o contrario tambem: o Painel Diretoria nao amplia o Dashboard', () => {
    const tem = comChaves(
      'ver_dashboard',
      'ver_painel_diretoria',
      chaveEscopo('painel_diretoria', 'todos_setores'),
      chaveEscopo('dashboard', 'setor'),
    );
    expect(escopoEfetivo('dashboard', tem)).toBe('setor');
  });

  it('sem a chave da aba, o escopo nao vale nada', () => {
    const tem = comChaves(chaveEscopo('painel_diretoria', 'todos_setores'));
    expect(escopoEfetivo('painel_diretoria', tem)).toBeNull();
  });
});

describe('nenhuma chave global de escopo sobrou', () => {
  /*
   * O fecho da reestruturacao: as seis chaves que decidiam alcance para varias
   * abas ao mesmo tempo foram aposentadas entre as fases 3b e 6a. Ligar todas
   * de uma vez nao pode conceder NADA em aba nenhuma.
   */
  const GLOBAIS_MORTAS = [
    'ver_acordos_gerais', 'ver_todos_setores', 'ver_analiticos_global',
    'filtrar_por_setor', 'filtrar_por_equipe', 'ver_acordos_proprios',
  ];

  it('ligadas todas juntas, com todas as abas abertas, nao liberam nivel nenhum', () => {
    const chavesDeAba = Object.values(ABAS_COM_ESCOPO)
      .map(m => m.chaveAba)
      .filter((k): k is string => k !== null);
    const tem = comChaves(...GLOBAIS_MORTAS, ...chavesDeAba);

    for (const aba of Object.keys(ABAS_COM_ESCOPO) as (keyof typeof ABAS_COM_ESCOPO)[]) {
      expect(niveisLiberados(aba, tem), `${aba} ouviu uma chave global`).toEqual([]);
      expect(escopoEfetivo(aba, tem), `${aba} ouviu uma chave global`).toBeNull();
    }
  });
});

describe('amplitude', () => {
  it('compara niveis corretamente', () => {
    expect(alcancaPeloMenos('todos_setores', 'individual')).toBe(true);
    expect(alcancaPeloMenos('setor', 'equipe')).toBe(true);
    expect(alcancaPeloMenos('individual', 'setor')).toBe(false);
    expect(alcancaPeloMenos('setor', 'setor')).toBe(true);
  });

  it('limitarAoTeto nunca deixa passar do teto', () => {
    // A regra que impede concessao silenciosa quando o escopo derivado virar
    // teto de RLS: ver docs/PERMISSOES-POR-ABA-PROJETO.md.
    expect(limitarAoTeto('todos_setores', 'individual')).toBe('individual');
    expect(limitarAoTeto('setor', 'individual')).toBe('individual');
    expect(limitarAoTeto('individual', 'todos_setores')).toBe('individual');
    expect(limitarAoTeto('setor', 'todos_setores')).toBe('setor');
  });
});
