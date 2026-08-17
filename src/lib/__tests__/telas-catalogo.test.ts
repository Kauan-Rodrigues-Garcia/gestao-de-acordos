/**
 * telas-catalogo.test.ts
 *
 * O identificador de tela vira CHAVE PRIMÁRIA em `uso_telas`. Um erro aqui não
 * dá erro em lugar nenhum — dá uma tabela com milhares de "telas" de uma visita
 * cada, e um painel que não responde nada.
 */
import { describe, it, expect } from 'vitest';
import { telaDaRota, telaComAba, telaRaiz, rotuloDaTela, TELA_LABEL } from '../telas-catalogo';

const UUID = '8f3e1c2a-4b5d-4e6f-9a8b-7c6d5e4f3a2b';

describe('parâmetro de rota nunca vira nome de tela', () => {
  /**
   * O defeito que este arquivo existe para impedir: guardar a URL crua criaria
   * uma linha por acordo aberto, e o ranking de telas viraria lixo.
   */
  it('uuid no fim vira /detalhe, não uma tela por registro', () => {
    expect(telaDaRota(`/acordos/${UUID}`)).toBe('acordos/detalhe');
    expect(telaDaRota('/acordos/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('acordos/detalhe');
  });

  it('dois acordos diferentes dão a MESMA tela', () => {
    const a = telaDaRota(`/acordos/${UUID}`);
    const b = telaDaRota('/acordos/11111111-2222-3333-4444-555555555555');
    expect(a).toBe(b);
  });

  it('número também é parâmetro', () => {
    expect(telaDaRota('/acordos/42')).toBe('acordos/detalhe');
  });

  it('uuid no meio some e o nome vem do segmento seguinte', () => {
    expect(telaDaRota(`/acordos/${UUID}/editar`)).toBe('acordos/editar');
    expect(telaDaRota(`/lider/operador/${UUID}`)).toBe('lider/operador');
  });

  /** Detalhe e lista são telas diferentes e não podem colidir. */
  it('detalhe não empata com a lista', () => {
    expect(telaDaRota('/acordos')).toBe('acordos');
    expect(telaDaRota(`/acordos/${UUID}`)).not.toBe('acordos');
  });
});

describe('rotas comuns', () => {
  it.each([
    ['/',                      'dashboard'],
    ['/lider',                 'lider'],
    ['/analitico',             'analitico'],
    ['/admin/usuarios',        'admin/usuarios'],
    ['/admin/configuracoes',   'admin/configuracoes'],
    ['/acordos/novo',          'acordos/novo'],
    ['/acordos/importar',      'acordos/importar'],
    ['/solicitacoes-whatsapp', 'solicitacoes-whatsapp'],
  ])('%s → %s', (rota, esperado) => {
    expect(telaDaRota(rota)).toBe(esperado);
  });

  it('ignora query string e hash', () => {
    expect(telaDaRota('/admin/configuracoes?tab=logs')).toBe('admin/configuracoes');
    expect(telaDaRota('/lider#topo')).toBe('lider');
  });

  it('normaliza caixa e barra sobrando', () => {
    expect(telaDaRota('/Lider/')).toBe('lider');
    expect(telaDaRota('//lider//')).toBe('lider');
  });
});

describe('o que não se mede', () => {
  it('login e registro ficam de fora — não há sessão para atribuir', () => {
    expect(telaDaRota('/login')).toBeNull();
    expect(telaDaRota('/registro')).toBeNull();
  });

  it('rota só de parâmetro não vira tela', () => {
    expect(telaDaRota(`/${UUID}`)).toBeNull();
  });

  it('entrada vazia não quebra', () => {
    expect(telaDaRota('')).toBe('dashboard');
  });
});

describe('sub-abas', () => {
  /**
   * A pergunta que originou o painel: "quais líderes abrem o Desempenho
   * Equipes". A URL não muda ao trocar de aba, então sem isto não há resposta.
   */
  it('a aba entra depois de dois-pontos', () => {
    expect(telaComAba('lider', 'desempenho')).toBe('lider:desempenho');
  });

  it('aba ausente ou vazia devolve a tela pura, sem dois-pontos solto', () => {
    expect(telaComAba('lider')).toBe('lider');
    expect(telaComAba('lider', '')).toBe('lider');
    expect(telaComAba('lider', '   ')).toBe('lider');
    expect(telaComAba('lider', null)).toBe('lider');
  });

  it('normaliza a caixa da aba', () => {
    expect(telaComAba('lider', 'Desempenho')).toBe('lider:desempenho');
  });

  it('telaRaiz devolve o módulo', () => {
    expect(telaRaiz('lider:desempenho')).toBe('lider');
    expect(telaRaiz('lider')).toBe('lider');
    expect(telaRaiz('admin/configuracoes:logs')).toBe('admin/configuracoes');
  });
});

describe('rótulos', () => {
  it('tela conhecida tem nome humano', () => {
    expect(rotuloDaTela('lider:desempenho')).toBe('Painel do Líder · Desempenho Equipes');
  });

  it('tela nova cai no próprio identificador em vez de sumir', () => {
    expect(rotuloDaTela('modulo/novo')).toBe('modulo/novo');
  });

  /**
   * O catálogo é escrito à mão e a rota é código: um `ROUTE_PATHS` novo sem
   * rótulo aparece no painel como identificador cru. Aceitável — mas as telas
   * que o painel existe para medir precisam estar lá.
   */
  it('as telas do Painel do Líder estão catalogadas', () => {
    for (const t of ['lider', 'lider:time', 'lider:desempenho', 'lider:quartis', 'lider:grafico']) {
      expect(TELA_LABEL[t], `falta rótulo para ${t}`).toBeTruthy();
    }
  });
});
