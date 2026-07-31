/**
 * regras-mensagem.test.ts — trava do relatório cadastral.
 *
 * O que se perde se isto quebrar: a campanha sai com o texto do desconto e um
 * espaço em branco onde deveria estar o número, direto para o cliente.
 */
import { describe, it, expect } from 'vitest';
import { idsDeMensagensBloqueadas, mensagemUsaValores } from './regras-mensagem';
import { CampaignCore } from './lib/campaign-core';

const COM_VALOR = 'Olá {{primeiro_nome}}, quitação via Pix: {{quitacao}}';
const SEM_VALOR = 'Olá {{primeiro_nome}}, procure a *{{empresa}}*, protocolo {{protocolo}}.';

describe('mensagemUsaValores', () => {
  it('reconhece cada variável financeira', () => {
    for (const v of [
      'parcela_desconto', 'quitacao', 'valor_com_juros',
      'juncao', 'anual', 'cartao_quitacao', 'cartao_anual',
    ]) {
      expect(mensagemUsaValores(`texto {{${v}}} fim`)).toBe(true);
    }
  });

  it('nome, empresa e protocolo não são valores', () => {
    expect(mensagemUsaValores(SEM_VALOR)).toBe(false);
  });

  it('percentuais sozinhos não contam', () => {
    // `pct_quitacao` é o número do desconto (30%), que não depende do valor
    // devido — a mensagem que só cita a porcentagem continua válida.
    expect(mensagemUsaValores('Desconto de {{pct_quitacao}} para você')).toBe(false);
  });

  it('texto vazio não usa valores', () => {
    expect(mensagemUsaValores('')).toBe(false);
  });
});

describe('idsDeMensagensBloqueadas', () => {
  const lista = [
    { id: 'com',   corpo: COM_VALOR },
    { id: 'sem',   corpo: SEM_VALOR },
    { id: 'outra', corpo: 'Bom dia, {{primeiro_nome}}!' },
  ];

  it('relatório cadastral bloqueia só as que usam valores', () => {
    const bloqueadas = idsDeMensagensBloqueadas(lista, true);
    expect(bloqueadas.has('com')).toBe(true);
    expect(bloqueadas.has('sem')).toBe(false);
    expect(bloqueadas.has('outra')).toBe(false);
  });

  it('relatório com valores não bloqueia nada', () => {
    expect(idsDeMensagensBloqueadas(lista, false).size).toBe(0);
  });

  it('lista vazia não estoura', () => {
    expect(idsDeMensagensBloqueadas([], true).size).toBe(0);
  });

  it('olha o corpo EM VIGOR, não o original', () => {
    // Quem edita um modelo padrão e mete {{quitacao}} nele tem de ser barrado
    // igual: o hook passa o corpo editado, não o de fábrica.
    const editada = [{ id: 'padrao', corpo: `${SEM_VALOR} Quitação: {{quitacao}}` }];
    expect(idsDeMensagensBloqueadas(editada, true).has('padrao')).toBe(true);
  });

  it('bate com os modelos de fábrica que citam valores', () => {
    // Amarra a regra à biblioteca real: se alguém adicionar um modelo com
    // valores, ele entra no bloqueio sem ninguém precisar lembrar disso.
    const defaults = CampaignCore.TEMPLATES.map((t) => ({ id: t.id, corpo: t.body }));
    const bloqueadas = idsDeMensagensBloqueadas(defaults, true);
    expect(bloqueadas.size).toBeGreaterThan(0);
    expect(bloqueadas.size).toBeLessThan(defaults.length);
    for (const t of defaults) {
      expect(bloqueadas.has(t.id)).toBe(mensagemUsaValores(t.corpo));
    }
  });
});
