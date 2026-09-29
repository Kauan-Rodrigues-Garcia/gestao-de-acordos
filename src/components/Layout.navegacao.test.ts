/**
 * Layout.navegacao.test.ts
 *
 * Contrato entre o MENU e as ROTAS.
 *
 * Bug de 15/08/2026: desligar «Aba Analítico» nas Permissões bloqueava a rota e
 * o item continuava aparecendo no menu lateral. A causa foi estrutural — nem
 * todo item vivia no `NAV_ITEMS`. `Analítico` e `Campanha Fácil` eram
 * renderizados à mão logo abaixo do laço, com condição só de slug e cargo, e
 * por isso escapavam do filtro de permissão.
 *
 * Estes testes leem os arquivos e comparam. Um item de menu novo escrito
 * fora da lista, ou uma rota com `requiredPermissao` sem item correspondente,
 * quebra a CI.
 *
 * A lista saiu do `Layout.tsx` para `lib/menuLateral.ts` (24/08/2026), quando o
 * editor de ordem passou a desenhar o menu de outro cargo e precisou da mesma
 * régua. O contrato é o mesmo; mudou só o arquivo onde ele mora.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const LAYOUT = fs.readFileSync(path.join(RAIZ, 'components/Layout.tsx'), 'utf8');
const MENU   = fs.readFileSync(path.join(RAIZ, 'lib/menuLateral.ts'), 'utf8');
const APP    = fs.readFileSync(path.join(RAIZ, 'App.tsx'), 'utf8');

/**
 * As permissões declaradas no NAV_ITEMS (e no botão fixo «Novo acordo», que
 * mora logo abaixo dele): a chave única de cada item e as listas «basta uma»
 * das telas que o Mapa de Abas juntou.
 */
function chavesDoMenu(): string[] {
  const bloco = MENU.slice(
    MENU.indexOf('export const NAV_ITEMS'),
    MENU.indexOf('export interface ContextoMenu'),
  );
  const unicas = [...bloco.matchAll(/permissaoKey:\s*'([a-z_]+)'/g)].map(m => m[1]);
  const listas = [...bloco.matchAll(/permissoes:\s*\[([^\]]*)\]/g)]
    .flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]));
  return [...unicas, ...listas];
}

/** As permissões exigidas pelas rotas em App.tsx — uma só, ou «basta uma». */
function chavesDasRotas(): string[] {
  const unicas = [...APP.matchAll(/requiredPermissao="([a-z_]+)"/g)].map(m => m[1]);
  const listas = [...APP.matchAll(/algumaPermissao=\{\[([^\]]*)\]\}/g)]
    .flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]));
  return [...unicas, ...listas];
}

describe('menu × rotas', () => {
  it('toda rota com permissão tem item de menu com a MESMA chave', () => {
    const menu = new Set(chavesDoMenu());
    // Ficam de fora as rotas que se abrem de DENTRO de uma tela, e não por um
    // item de menu: `editar_acordos` (a partir de um acordo da lista) e
    // `importar_excel` (o botão «Importar planilha» de Acordos, desde o Mapa
    // de Abas). As duas telas conferem a mesma chave no botão que leva lá.
    const PELA_TELA = new Set(['editar_acordos', 'importar_excel']);
    const semItem = [...new Set(chavesDasRotas())]
      .filter(k => !PELA_TELA.has(k))
      .filter(k => !menu.has(k));

    expect(
      semItem,
      'Estas rotas bloqueiam o acesso, mas o item continua visível no menu — '
      + 'o usuário clica e é jogado de volta ao dashboard:\n  ' + semItem.join('\n  '),
    ).toEqual([]);
  });

  it('nenhum NavLink é escrito fora do NAV_ITEMS', () => {
    // O laço `navItems.map` gera um NavLink; os demais no arquivo são o menu
    // de perfil e o rodapé, que ficam fora da <nav> e não são navegação de
    // seção. Qualquer NavLink apontando para ROUTE_PATHS fora da lista é o
    // defeito que este teste existe para pegar.
    const corpo = LAYOUT.slice(LAYOUT.indexOf('export default function Layout'));
    // O laço é por seção desde o Mapa de Abas (29/09/2026).
    const dentroDoLaco = corpo.indexOf('secoesMenu.map');
    expect(dentroDoLaco).toBeGreaterThan(-1);
    const nav = corpo.slice(dentroDoLaco, corpo.indexOf('</nav>'));

    const linksSoltos = [...nav.matchAll(/to=\{ROUTE_PATHS\.([A-Z_]+)\}/g)].map(m => m[1]);

    expect(
      linksSoltos,
      'NavLink escrito à mão dentro da <nav>. Acrescente ao NAV_ITEMS com o '
      + '`permissaoKey` certo — senão ele escapa do filtro de permissão:\n  '
      + linksSoltos.join('\n  '),
    ).toEqual([]);
  });

  /*
   * Bug de 21/09/2026: o menu declarou Tickets em cobrança E comercial na Fase
   * 9, e a rota ficou só em cobrança. O vendedor via a aba, clicava e voltava
   * para o Dashboard — o mesmo defeito do teste de cima, pelo eixo do produto.
   */
  it('rota e item de menu declaram os MESMOS produtos', () => {
    // O nome da constante basta: as duas pontas usam os mesmos quatro nomes.
    const doMenu = new Map(
      [...MENU.matchAll(/to:\s*ROUTE_PATHS\.([A-Z_]+),\s*produtos:\s*([A-Z_]+)/g)]
        .map(m => [m[1], m[2]] as const),
    );
    const divergentes: string[] = [];
    for (const trecho of APP.split('<Route ').slice(1)) {
      const rota = /^path=\{ROUTE_PATHS\.([A-Z_]+)\}/.exec(trecho)?.[1];
      const produtos = /produtos=\{([A-Z_]+)\}/.exec(trecho)?.[1];
      if (!rota || !produtos || !doMenu.has(rota)) continue;
      if (doMenu.get(rota) !== produtos) {
        divergentes.push(`${rota}: menu ${doMenu.get(rota)} × rota ${produtos}`);
      }
    }
    expect(
      divergentes,
      'O item aparece num produto onde a rota não abre (ou o contrário):\n  '
      + divergentes.join('\n  '),
    ).toEqual([]);
  });

  it('as abas que o usuário reconhece estão todas na lista', () => {
    const menu = chavesDoMenu();
    // `ver_lixeira` e `importar_excel` saíram do menu da cobrança: a Lixeira é
    // a aba Excluídos e Importar Excel é um botão, ambos dentro de Acordos. A
    // Lixeira continua no menu do Comercial, que é outra tabela.
    for (const chave of [
      'ver_acordos', 'ver_analitico', 'ver_painel_lider', 'ver_painel_diretoria',
      'ver_campanha_facil', 'ver_solicitacoes_whatsapp',
      'ver_configuracoes', 'criar_acordos', 'ver_pix_automatico', 'ver_logs',
    ]) {
      expect(menu, `${chave} sumiu do NAV_ITEMS`).toContain(chave);
    }
  });
});
