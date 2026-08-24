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

/** As permissões declaradas no NAV_ITEMS. */
function chavesDoMenu(): string[] {
  const bloco = MENU.slice(
    MENU.indexOf('export const NAV_ITEMS'),
    MENU.indexOf('export interface ContextoMenu'),
  );
  return [...bloco.matchAll(/permissaoKey:\s*'([a-z_]+)'/g)].map(m => m[1]);
}

/** As permissões exigidas pelas rotas em App.tsx. */
function chavesDasRotas(): string[] {
  return [...APP.matchAll(/requiredPermissao="([a-z_]+)"/g)].map(m => m[1]);
}

describe('menu × rotas', () => {
  it('toda rota com permissão tem item de menu com a MESMA chave', () => {
    const menu = new Set(chavesDoMenu());
    // `editar_acordos` fica de fora: a rota de edição é aberta a partir de um
    // acordo da lista, não por um item de menu próprio.
    const semItem = [...new Set(chavesDasRotas())]
      .filter(k => k !== 'editar_acordos')
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
    const dentroDoLaco = corpo.indexOf('navItems.map');
    const nav = corpo.slice(dentroDoLaco, corpo.indexOf('</nav>'));

    const linksSoltos = [...nav.matchAll(/to=\{ROUTE_PATHS\.([A-Z_]+)\}/g)].map(m => m[1]);

    expect(
      linksSoltos,
      'NavLink escrito à mão dentro da <nav>. Acrescente ao NAV_ITEMS com o '
      + '`permissaoKey` certo — senão ele escapa do filtro de permissão:\n  '
      + linksSoltos.join('\n  '),
    ).toEqual([]);
  });

  it('as abas que o usuário reconhece estão todas na lista', () => {
    const menu = chavesDoMenu();
    for (const chave of [
      'ver_acordos', 'ver_analitico', 'ver_painel_lider', 'ver_painel_diretoria',
      'ver_ouvidoria', 'ver_campanha_facil', 'ver_solicitacoes_whatsapp',
      'ver_lixeira', 'ver_configuracoes', 'importar_excel',
    ]) {
      expect(menu, `${chave} sumiu do NAV_ITEMS`).toContain(chave);
    }
  });
});
