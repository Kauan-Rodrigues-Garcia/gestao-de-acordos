/**
 * AdminUsuarios — a gerência sem setor precisa ter como ganhar um.
 * ─────────────────────────────────────────────────────────────────────────
 * ## O caso que originou isto (setembro/2026, PaguePlay)
 *
 * Fábio Lopes de Aquino era `diretoria`. O gatilho `a_trg_perfis_escopo_empresa`
 * zerou o `setor_id` dele, como deve: diretoria pertence à empresa, não a um
 * setor. Uma semana depois o cargo virou `gerencia` — que pertence a um setor.
 * O gatilho só zera; nunca devolve. Sobrou uma gerência com `setor_id` nulo.
 *
 * Nada acusou erro. `fn_analitico_resumo_por_operador` só monta a lista de
 * operadores do setor quando `v_setor_id IS NOT NULL`, e `= ANY('{}')` é sempre
 * falso: a RPC passou a devolver ZERO linhas. Desempenho Equipes, Quartis e o
 * ranking do Analítico ficaram zerados com cara de dado real — o mesmo "zero que
 * parece dado" que `escopoDeSetor` existe para evitar.
 *
 * E não havia conserto pela tela: na edição o campo Setor é somente-leitura,
 * porque trocar de setor é TRANSFERÊNCIA (apaga tabulação, libera NR, tira de
 * equipe). Só que transferência pressupõe um setor de origem — e não havia.
 *
 * A regra que estes testes trancam: sair de NULO para um setor não é mudar de
 * setor, é ganhar o primeiro. Nenhuma consequência de transferência se aplica,
 * então nesse caso — e só nesse — o campo abre e passa a ser obrigatório.
 *
 * Inspeção estática, como em `AdminConfiguracoes.banco-dados-gate.test.ts`:
 * renderizar AdminUsuarios inteiro exigiria supabase, auth, as abas de Setores e
 * o cliente isolado de signup.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(__dirname, '../AdminUsuarios.tsx');
const src = readFileSync(FILE, 'utf-8');

/*
 * A REGRA mora em dois arquivos desde 06/09/2026, e cada asserção segue
 * inteira — só passou a mirar onde a coisa está.
 *
 *   AdminUsuarios.tsx ... decide (`setorVazioParaPreencher`) e grava
 *                         (`salvarCamposBasicos`, `salvar`, `fetchDados`)
 *   DialogUsuario.tsx ... desenha o campo, e é onde a ORDEM dos ramos importa
 *
 * A janela virou componente quando ganhou seções e uma chave de permissão por
 * campo; deixá-la de 330 linhas dentro de uma página de 1.700 era o que estava
 * ficando insustentável.
 */
const JANELA = readFileSync(
  resolve(__dirname, '../../components/admin/DialogUsuario.tsx'), 'utf-8',
);

describe('AdminUsuarios — preencher o setor de quem ficou sem', () => {
  it('declara `setorVazioParaPreencher` com as três condições', () => {
    // As três importam:
    //   `!!editando`          — na criação o campo já é editável por outro ramo;
    //   `!cargoEscopoEmpresa` — a cúpula fica sem setor de propósito;
    //   `!editando.setor_id`  — quem já tem setor continua indo por Transferir.
    expect(src).toMatch(
      /const\s+setorVazioParaPreencher\s*=\s*!!editando\s*&&\s*!cargoEscopoEmpresa\s*&&\s*!editando\.setor_id/,
    );
  });

  it('o ramo do Select vem ANTES do ramo somente-leitura da edição', () => {
    // Ordem é a regra inteira: o ternário resolve no primeiro ramo verdadeiro, e
    // `editando ?` é verdadeiro também neste caso. Invertido, o campo voltaria a
    // ser somente-leitura e a pessoa continuaria presa.
    const iVazio  = JANELA.indexOf('setorVazioParaPreencher ? (');
    const iLeitura = JANELA.indexOf(') : editando ? (');
    expect(iVazio).toBeGreaterThan(-1);
    expect(iLeitura).toBeGreaterThan(-1);
    expect(iVazio).toBeLessThan(iLeitura);
  });

  it('o campo do setor não é fechado pela permissão de editar campos', () => {
    // Guarda nova, da mesma familia: as chaves por campo (`usuarios_editar_*`)
    // chegaram em 06/09/2026 e trancam nome, login, foto e cargo. O setor NAO
    // pode entrar nessa lista — ele ja tem regra propria, e amarra-lo a uma
    // chave de campo devolveria a pessoa ao estado preso que este arquivo
    // inteiro existe para evitar.
    const trecho = JANELA.slice(
      JANELA.indexOf('setorVazioParaPreencher ? ('),
      JANELA.indexOf(') : editando ? ('),
    );
    expect(trecho).not.toMatch(/pode\.(nome|login|foto|cargo)/);
  });

  it('`salvarCamposBasicos` só manda `setor_id` neste caso', () => {
    // O `update` de campos básicos não pode carregar setor de carona: isso é o
    // que o separa de uma transferência.
    expect(src).toMatch(
      /if\s*\(\s*setorVazioParaPreencher\s*&&\s*form\.setor_id\s*\)\s*\{\s*updatePayload\.setor_id\s*=\s*form\.setor_id;/,
    );
    // E não existe nenhum OUTRO caminho que escreva setor_id no payload.
    const escritas = src.match(/updatePayload\.setor_id\s*=/g) ?? [];
    expect(escritas).toHaveLength(1);
  });

  it('`salvar()` recusa deixar o vazio de pé quando há setor para escolher', () => {
    expect(src).toMatch(
      /if\s*\(\s*setorVazioParaPreencher\s*&&\s*!form\.setor_id\s*&&\s*setoresDoForm\.length\s*>\s*0\s*\)/,
    );
    // `setoresDoForm.length > 0` é a válvula: numa empresa sem setor cadastrado
    // a exigência travaria até a correção de um nome mal digitado.
  });

  it('o preenchimento automático de setor não alcança a edição', () => {
    // Sem o `!editando`, `fetchDados` escolheria sozinha o primeiro setor da
    // lista e o admin salvaria um vínculo que não decidiu — o mesmo defeito que
    // dava setor à cúpula, invertido.
    expect(src).toMatch(
      /if\s*\(\s*!editando\s*&&\s*setoresData\.length\s*>\s*0\s*&&\s*!form\.setor_id\s*&&\s*!ehEscopoEmpresa\(form\.perfil\)\s*\)/,
    );
  });
});
