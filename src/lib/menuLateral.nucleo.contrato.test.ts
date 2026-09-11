/**
 * O recorte por setor está nos DOIS lugares, e eles não podem divergir.
 *
 * `NAV_ITEMS` esconde o item do menu; `App.tsx` fecha a rota. Esconder sem
 * fechar é o buraco que este eixo veio tapar — até 10/09/2026 bastava digitar
 * `/acordos` na barra de endereço para alguém do Núcleo abrir a operação de
 * cobrança inteira, com `ver_acordos` herdado da semeadura do cargo `operador`.
 *
 * Fechar sem esconder é o defeito simétrico, e mais irritante no uso: o item
 * aparece, a pessoa clica, e o app a joga de volta na porta de entrada sem
 * explicar por quê.
 *
 * ## Por que ler o arquivo em vez de importar
 *
 * As rotas moram em JSX dentro de `App.tsx`, e não numa estrutura de dados que
 * dê para importar. Extraí-las para uma lista só de dados seria a solução
 * bonita e reescreveria o roteador inteiro — trabalho que ninguém pediu, num
 * arquivo que toda a aplicação atravessa.
 *
 * O teste lê o texto e procura a REGRA, não a formatação. Mesmo recurso de
 * `numerosBanco.sql.test.ts`, que confere garantias que vivem no Postgres.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NAV_ITEMS } from './menuLateral';

const APP = fs.readFileSync(
  path.resolve(__dirname, '../App.tsx'), 'utf8',
);

/**
 * O trecho de `App.tsx` que declara a rota deste caminho.
 *
 * Vai do `path={...}` até o `</Route>` ou o `/>` que fecha o elemento — o que
 * vier antes. Sem esse limite, a busca por `nucleo="fora"` acharia a marca da
 * rota SEGUINTE e todo o arquivo passaria.
 */
function blocoDaRota(caminho: string): string {
  const alvo = caminho.startsWith('/')
    ? `path="${caminho}"`
    : `path={ROUTE_PATHS.${caminho}}`;

  const i = APP.indexOf(alvo);
  expect(i, `rota ${caminho} não encontrada em App.tsx`).toBeGreaterThan(-1);

  const resto = APP.slice(i);
  const fim = resto.indexOf('} />');
  expect(fim, `rota ${caminho} sem fechamento`).toBeGreaterThan(0);
  return resto.slice(0, fim);
}

/**
 * O caminho de um item de menu, como `App.tsx` o escreve.
 *
 * `NavItem.to` guarda o valor RESOLVIDO (`/acordos`), e o roteador guarda a
 * constante (`ROUTE_PATHS.ACORDOS`). O mapa faz a ponte para os itens cujo `to`
 * foi escrito à mão na lista do menu.
 */
const CONSTANTE_DA_ROTA: Readonly<Record<string, string>> = {
  '/acordos':          'ACORDOS',
  '/acordos/novo':     'ACORDO_NOVO',
  '/acordos/importar': 'IMPORTAR_EXCEL',
  '/admin/lixeira':    'ADMIN_LIXEIRA',
  '/admin/metas':      'ADMIN_METAS',
  '/lider':            'PAINEL_LIDER',
  '/diretoria':        'PAINEL_DIRETORIA',
  '/analitico':        'ANALITICO',
  '/campanha-facil':   'CAMPANHA_FACIL',
  '/controle-numeros': 'CONTROLE_NUMEROS',
  '/meus-chips':       'MEUS_CHIPS',
};

const MARCADOS = NAV_ITEMS.filter(i => i.nucleo !== undefined);

describe('o recorte por setor: o menu e a rota dizem a mesma coisa', () => {
  it('há abas marcadas — senão este teste passaria sem provar nada', () => {
    expect(MARCADOS.length).toBeGreaterThan(5);
  });

  it.each(MARCADOS.map(i => [i.label, i.to, i.nucleo] as const))(
    '%s: o menu diz `%s → %s` e a rota repete',
    (_label, to, marca) => {
      const constante = CONSTANTE_DA_ROTA[to];
      expect(constante, `falta mapear ${to} em CONTANTE_DA_ROTA`).toBeTruthy();
      expect(blocoDaRota(constante)).toContain(`nucleo="${marca}"`);
    },
  );

  it('a rota de Acordos, a mais citada no pedido, está de fato fechada', () => {
    // Redundante com o `it.each` acima, e proposital: é a rota que motivou a
    // mudança, e um refactor que esvaziasse `MARCADOS` faria aquele laço passar
    // sem executar nada.
    expect(blocoDaRota('ACORDOS')).toContain('nucleo="fora"');
  });

  it('Controle de Números é a única rota `so`', () => {
    const soDoNucleo = MARCADOS.filter(i => i.nucleo === 'so').map(i => i.label);
    expect(soDoNucleo).toEqual(['Controle de Números']);
  });

  it('item SEM marca tem rota sem marca — a divergência no sentido oposto', () => {
    // Tirar a marca do menu e esquecer a da rota deixa a aba aparecendo e a porta
    // fechada: o clique leva de volta à entrada sem dizer por quê. Foi o risco
    // da mudança de Meus Chips para os dois lados (11/09/2026).
    const semMarca = NAV_ITEMS.filter(i => i.nucleo === undefined && CONSTANTE_DA_ROTA[i.to]);
    expect(semMarca.map(i => i.label)).toContain('Meus Chips');
    for (const item of semMarca) {
      expect(blocoDaRota(CONSTANTE_DA_ROTA[item.to]), `${item.label} sem marca no menu`)
        .not.toContain('nucleo=');
    }
  });

  it('as sub-rotas de acordo, que não têm item de menu, também estão fechadas', () => {
    // `/acordos/:id` e `/acordos/:id/editar` são alcançadas por link e por URL
    // colada, e nunca aparecem na barra lateral. Sem elas na lista, o Núcleo
    // continuaria abrindo a tela de um acordo pelo endereço direto.
    for (const rota of ['ACORDO_DETALHE', 'ACORDO_EDITAR', 'PAINEL_LIDER_OPERADOR']) {
      expect(blocoDaRota(rota), `${rota} deveria estar fechada ao Núcleo`)
        .toContain('nucleo="fora"');
    }
  });
});
