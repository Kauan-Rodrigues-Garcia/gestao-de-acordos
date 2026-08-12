/**
 * src/lib/__tests__/logs-catalogo.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O catálogo é o vocabulário da tela de Logs. Estes testes cobrem as três
 * garantias que a tela depende:
 *
 *   1. Nenhuma ação aparece crua. Ação que não está no catálogo — código futuro,
 *      linha antiga de um dialeto esquecido — tem de sair humanizada. Log
 *      ilegível é log que ninguém lê, que foi o defeito da versão 1.0.
 *   2. Valor de campo sai formatado no padrão brasileiro, e data pura não anda
 *      um dia para trás.
 *   3. O diff respeita a ordem que o banco mandou e marca o que nasceu e o que
 *      foi removido.
 */
import { describe, it, expect } from 'vitest';
import {
  descreverAcao,
  inferirCategoria,
  categoriaMeta,
  severidadeMeta,
  origemLabel,
  campoLabel,
  alvoLabel,
  formatarValorLog,
  montarDiferencas,
  CATEGORIAS,
  CATEGORIA_META,
} from '@/lib/logs-catalogo';

describe('descreverAcao', () => {
  it('usa o nome do catálogo quando a ação é conhecida', () => {
    expect(descreverAcao('acordo_status_alterado')).toBe('Status do acordo alterado');
    expect(descreverAcao('login_recusado')).toBe('Login recusado');
    expect(descreverAcao('permissoes_alteradas')).toBe('Permissões de cargo alteradas');
  });

  it('humaniza ação FORA do catálogo pela convenção <alvo>_<verbo>', () => {
    // Este é o caso que importa: a migration cria triggers para 29 tabelas e
    // pode ganhar mais depois. Sem esta regra, cada tabela nova apareceria com o
    // nome cru até alguém lembrar de editar o catálogo.
    expect(descreverAcao('pix_lixeira_criado')).toBe('Pix na lixeira criado');
    expect(descreverAcao('documento_lgpd_excluido')).toBe('Documento LGPD excluído');
    expect(descreverAcao('tabela_futura_alterado')).toBe('tabela futura alterado');
  });

  it('não devolve vazio nem para ação irreconhecível', () => {
    expect(descreverAcao('coisa_estranha_qualquer')).toBe('Coisa estranha qualquer');
    expect(descreverAcao(null)).toBe('Evento sem nome');
    expect(descreverAcao('')).toBe('Evento sem nome');
  });
});

describe('inferirCategoria', () => {
  it('deduz a categoria pelo prefixo da ação', () => {
    expect(inferirCategoria('login')).toBe('autenticacao');
    expect(inferirCategoria('logout')).toBe('autenticacao');
    expect(inferirCategoria('impersonar_inicio')).toBe('seguranca');
    expect(inferirCategoria('senha_redefinida')).toBe('seguranca');
    expect(inferirCategoria('acordo_criado')).toBe('acordo');
    expect(inferirCategoria('pix_registro_pago')).toBe('financeiro');
    expect(inferirCategoria('importacao_concluida')).toBe('importacao');
    expect(inferirCategoria('meta_alterado')).toBe('meta');
  });

  it('cai em "sistema" quando não reconhece', () => {
    expect(inferirCategoria('evento_desconhecido')).toBe('sistema');
    expect(inferirCategoria(null)).toBe('sistema');
  });
});

describe('metadados', () => {
  it('toda categoria declarada tem metadados completos', () => {
    // Uma categoria sem `hex` deixaria a barra do gráfico invisível, e sem `cor`
    // o selo sai sem contraste. Falhar aqui é mais barato que descobrir na tela.
    for (const c of CATEGORIAS) {
      const meta = CATEGORIA_META[c];
      expect(meta, `categoria ${c} sem metadados`).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icone.length).toBeGreaterThan(0);
      expect(meta.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.cor.length).toBeGreaterThan(0);
    }
  });

  it('categoria e severidade desconhecidas caem no padrão em vez de estourar', () => {
    expect(categoriaMeta('inexistente').label).toBe(CATEGORIA_META.sistema.label);
    expect(categoriaMeta(null).label).toBe(CATEGORIA_META.sistema.label);
    expect(severidadeMeta('inexistente').label).toBe('Informação');
    expect(severidadeMeta(undefined).label).toBe('Informação');
  });

  it('severidade tem peso crescente de info para crítico', () => {
    expect(severidadeMeta('critico').peso).toBeGreaterThan(severidadeMeta('aviso').peso);
    expect(severidadeMeta('aviso').peso).toBeGreaterThan(severidadeMeta('info').peso);
  });

  it('traduz origem e devolve o valor cru quando não conhece', () => {
    expect(origemLabel('trigger')).toBe('Banco de dados');
    expect(origemLabel('anon')).toBe('Sem sessão');
    expect(origemLabel(null)).toBe('Tela');
    expect(origemLabel('futuro')).toBe('futuro');
  });

  it('traduz campo e alvo, com fallback legível', () => {
    expect(campoLabel('nr_cliente')).toBe('NR');
    expect(campoLabel('perfil')).toBe('Cargo');
    expect(campoLabel('coluna_nova_qualquer')).toBe('coluna nova qualquer');
    expect(alvoLabel('cargo_permissoes')).toBe('Permissões do cargo');
    expect(alvoLabel('alvo_novo')).toBe('alvo novo');
    expect(alvoLabel(null)).toBe('—');
  });
});

describe('formatarValorLog', () => {
  it('formata dinheiro em real, inclusive vindo como string do NUMERIC', () => {
    expect(formatarValorLog('valor', 1234.5)).toContain('1.234,50');
    expect(formatarValorLog('valor', '1234.50')).toContain('1.234,50');
    expect(formatarValorLog('meta_valor', 50000)).toContain('50.000,00');
  });

  it('mostra data pura no dia certo, sem deslocar pelo fuso', () => {
    // `new Date('2026-08-12')` é meia-noite UTC = 21h de 11/08 em São Paulo.
    // Formatar por `toLocaleDateString` mostraria 11/08 — um dia a menos no
    // vencimento de um acordo, que é exatamente o tipo de erro que faz alguém
    // desconfiar do log inteiro.
    expect(formatarValorLog('vencimento', '2026-08-12')).toBe('12/08/2026');
    expect(formatarValorLog('data_cadastro', '2026-01-01')).toBe('01/01/2026');
  });

  it('traduz status de acordo e cargo para os nomes do produto', () => {
    expect(formatarValorLog('status', 'verificar_pendente')).toBe('Verificar/Pendente');
    expect(formatarValorLog('status', 'nao_pago')).toBe('Não pago');
    expect(formatarValorLog('perfil', 'super_admin')).toBe('Super Admin');
    expect(formatarValorLog('perfil', 'lider')).toBe('Líder');
  });

  it('resume booleano, vazio, lista e UUID', () => {
    expect(formatarValorLog('ativo', true)).toBe('Sim');
    expect(formatarValorLog('ativo', false)).toBe('Não');
    expect(formatarValorLog('observacoes', null)).toBe('—');
    expect(formatarValorLog('observacoes', '')).toBe('—');
    expect(formatarValorLog('tag_ids', [])).toBe('nenhum');
    expect(formatarValorLog('tag_ids', ['a', 'b'])).toBe('2 item(ns)');
    expect(formatarValorLog('operador_id', '3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3f2504e0…');
  });

  it('mantém texto comum intacto', () => {
    expect(formatarValorLog('nome_cliente', 'João da Silva')).toBe('João da Silva');
    expect(formatarValorLog('observacoes', 'Cliente pediu prazo')).toBe('Cliente pediu prazo');
  });
});

describe('montarDiferencas', () => {
  it('respeita a ordem de `campos` vinda do banco', () => {
    const diff = montarDiferencas(
      { valor: 100, status: 'nao_pago' },
      { valor: 250, status: 'pago' },
      ['status', 'valor'],
    );
    expect(diff.map((d) => d.campo)).toEqual(['status', 'valor']);
    expect(diff[0].antes).toBe('Não pago');
    expect(diff[0].depois).toBe('Pago');
    expect(diff[1].depois).toContain('250,00');
  });

  it('marca campo que nasceu (criação) e campo que foi removido', () => {
    const diff = montarDiferencas(
      { observacoes: 'algo' },
      { vencimento: '2026-08-12' },
      ['observacoes', 'vencimento'],
    );
    const obs = diff.find((d) => d.campo === 'observacoes')!;
    const venc = diff.find((d) => d.campo === 'vencimento')!;
    expect(obs.removido).toBe(true);
    expect(obs.novo).toBe(false);
    expect(venc.novo).toBe(true);
    expect(venc.removido).toBe(false);
  });

  it('sem `campos`, usa as chaves dos dois lados em ordem alfabética', () => {
    const diff = montarDiferencas({ b: 1 }, { a: 2 }, null);
    expect(diff.map((d) => d.campo)).toEqual(['a', 'b']);
  });

  it('devolve lista vazia quando não há payload nenhum', () => {
    expect(montarDiferencas(null, null, null)).toEqual([]);
    expect(montarDiferencas(undefined, undefined, [])).toEqual([]);
  });
});
