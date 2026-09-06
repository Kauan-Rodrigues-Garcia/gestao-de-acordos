/**
 * A transferência mora na lista de pessoas — e a chave que a libera age.
 * ─────────────────────────────────────────────────────────────────────────
 * ## O defeito que originou isto (setembro/2026)
 *
 * `usuarios_transferir` liga por padrão para líder, elite, gerência e
 * diretoria. `ver_setores` liga só para gerência e diretoria. E a única porta
 * da transferência era a aba Setores.
 *
 * Resultado: líder e elite tinham a permissão LIGADA e nenhum lugar onde
 * exercê-la. Uma chave alcançável no painel, inerte na tela — a mesma família
 * de defeito que o catálogo passou a evitar com `depende`. Ninguém descobria
 * porque não havia erro para ver: a aba simplesmente não aparecia.
 *
 * A transferência mudou de endereço em 06/09/2026: virou ação de linha na
 * lista de pessoas, dentro da aba Usuários, junto com a seleção múltipla e o
 * histórico com o desfazer.
 *
 * ## O segundo defeito, que a mesma mudança fechou
 *
 * As abas Usuários e Setores listavam a MESMA gente pelos mesmos setores, cada
 * uma lendo `perfis` por conta própria e cada uma reimplementando a resolução
 * de clone cross-setor — trinta linhas idênticas em dois arquivos. Duas cópias
 * da mesma regra divergem; é questão de tempo. A resolução virou
 * `useClonesCross`, e a lista de pessoas saiu de Setores.
 *
 * Inspeção estática, como em `AdminUsuarios.setor-vazio.test.ts`: renderizar
 * estas telas exigiria supabase, auth e as abas internas inteiras.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSOES_POR_CHAVE } from '@/lib/permissoes-catalogo';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');

const usuarios = ler('../AdminUsuarios.tsx');
const setores  = ler('../AdminSetoresAba.tsx');

describe('a chave de transferir tem onde agir', () => {
  it('`usuarios_transferir` depende da aba onde ela agora mora', () => {
    // Sem isto o painel volta a oferecer uma chave que não faz nada para quem
    // não tem a aba Usuários — que é o defeito inteiro, só que do outro lado.
    const chave = PERMISSOES_POR_CHAVE.usuarios_transferir;
    expect(chave.depende?.chaves).toContain('usuarios_sub_usuarios');
  });

  it('o desfazer depende de haver o que desfazer', () => {
    // O histórico fica ao lado do botão que transfere; sem transferir a lista
    // de transferências recentes não tem por que existir.
    expect(PERMISSOES_POR_CHAVE.usuarios_desfazer_transferencia.depende?.chaves)
      .toContain('usuarios_transferir');
  });

  it('NÃO depende de `ver_setores` — era isso que a matava', () => {
    // A dependência errada seria tão ruim quanto nenhuma: prenderia de novo a
    // transferência à aba que líder e elite não abrem.
    expect(PERMISSOES_POR_CHAVE.usuarios_transferir.depende?.chaves)
      .not.toContain('ver_setores');
  });
});

describe('a lista de pessoas existe em UM lugar', () => {
  it('a aba Usuários é quem abre a transferência', () => {
    expect(usuarios).toContain('DialogTransferencia');
    expect(usuarios).toMatch(/setTransferindo\(\[u\]\)/);
    // Seleção múltipla: transferir em lote veio junto, e é o que a barra usa.
    expect(usuarios).toContain('perfisSelecionados');
  });

  it('a aba Setores não transfere mais ninguém', () => {
    expect(setores).not.toContain('executarTransferencia');
    expect(setores).not.toContain('DialogTransferencia');
    // A CHAMADA, não a palavra: o cabeçalho do arquivo cita a chave para
    // explicar por que a transferência mudou de aba, e essa prosa deve ficar.
    expect(setores).not.toMatch(/temPermissao\(\s*'usuarios_transferir'\s*\)/);
    expect(usuarios).toMatch(/temPermissao\(\s*'usuarios_transferir'\s*\)/);
  });

  it('a aba Setores não lista mais as pessoas de cada setor', () => {
    // Ela ainda CONTA — o contador é atalho para a aba Usuários filtrada —,
    // mas contar não é listar: a consulta pesada de perfis saiu junto.
    expect(setores).not.toMatch(/perfisPorSetor/);
    expect(setores).not.toMatch(/LIMITE_USUARIOS/);
    // O que sobrou lê só o vínculo, e não nome/cargo/foto/login de todo mundo.
    expect(setores).toMatch(/select\('id, setor_id, arquivado'\)/);
  });

  it('o contador de Setores leva para a lista, em vez de virar uma segunda', () => {
    expect(setores).toContain("setSearchParams({ tab: 'usuarios', setor: setorId }");
    // E o outro lado do atalho: a aba Usuários lê o recorte da URL.
    expect(usuarios).toContain("searchParams.get('setor')");
  });
});

describe('a resolução de clone cross-setor não está escrita duas vezes', () => {
  it('as duas abas leem o mesmo hook', () => {
    expect(usuarios).toContain('useClonesCross');
    expect(setores).toContain('useClonesCross');
  });

  it('nenhuma das duas resolve clone por conta própria', () => {
    // `equipe_operadores_clones` só deve ser consultada dentro do hook. Uma
    // segunda consulta numa das telas é a duplicação voltando.
    for (const [nome, src] of [['AdminUsuarios', usuarios], ['AdminSetoresAba', setores]] as const) {
      expect(src, `${nome} voltou a resolver clone sozinha`)
        .not.toContain('equipe_operadores_clones');
    }
  });
});

describe('a busca por nome existe', () => {
  it('a lista principal deixou de exigir que se ache a pessoa rolando', () => {
    // Havia filtro de setor e de empresa e NENHUMA busca: achar alguém entre
    // cento e tantas pessoas era escolher o setor certo e rolar.
    expect(usuarios).toContain('casaComBusca');
    expect(usuarios).toMatch(/nome, login ou e-mail/);
  });

  it('buscar abre os setores recolhidos', () => {
    // Esconder um resultado atrás de um grupo fechado é o oposto de buscar.
    expect(usuarios).toContain('buscaAtiva={!!buscaNormalizada}');
  });
});
