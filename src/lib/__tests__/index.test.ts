/**
 * src/lib/__tests__/index.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa as funções puras exportadas por src/lib/index.ts:
 * formatters, parsers, helpers de perfil, getTodayISO, PaguePlay helpers,
 * extractores de observações e helpers de interpolação.
 *
 * Meta: >=95% lines.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ROUTE_PATHS,
  STATUS_LABELS,
  STATUS_COLORS,
  TIPO_LABELS,
  TIPO_COLORS,
  PERFIL_LABELS,
  PERFIL_COLORS,
  PERFIL_NIVEL,
  PERFIS_LIDER,
  PERFIS_ADMIN,
  PERFIS_DIRETORIA,
  PERFIS_VISAO_SETOR,
  PERFIS_VISAO_EMPRESA_RESTRITA,
  isPerfilLider,
  isPerfilAdmin,
  isPerfilDiretoria,
  isPerfilAdminOuLider,
  TODAS_EMPRESAS_SELECT_VALUE,
  getTodayISO,
  formatCurrency,
  formatDate,
  formatPhone,
  gerarLinkWhatsapp,
  interpolarMensagem,
  parseCurrencyInput,
  isAtrasado,
  isPaguePlay,
  TIPO_OPTIONS_PAGUEPLAY,
  PARCELAS_MAX_PAGUEPLAY,
  PARCELAS_MAX_DEFAULT,
  ESTADOS_BRASIL,
  STATUS_LABELS_PAGUEPLAY,
  TIPO_LABELS_PAGUEPLAY,
  PP_HO_PERCENTUAL,
  PP_COREN_PERCENTUAL,
  PP_COFEN_PERCENTUAL,
  calcHO,
  calcCoren,
  calcCofen,
  getStatusLabels,
  getTipoLabels,
  getTipoOptions,
  getMaxParcelas,
  INSTITUICOES_OPTIONS,
  extractEstado,
  extractLinkAcordo,
  buildObservacoesComEstado,
} from '@/lib/index';

describe('lib/index constantes', () => {
  it('expõe ROUTE_PATHS completos e imutáveis', () => {
    expect(ROUTE_PATHS.LOGIN).toBe('/login');
    expect(ROUTE_PATHS.DASHBOARD).toBe('/');
    expect(ROUTE_PATHS.ACORDOS).toBe('/acordos');
    expect(ROUTE_PATHS.ACORDO_NOVO).toBe('/acordos/novo');
    expect(ROUTE_PATHS.ADMIN_USUARIOS).toBe('/admin/usuarios');
    expect(ROUTE_PATHS.PAINEL_DIRETORIA).toBe('/diretoria');
  });

  it('tem labels e cores para todos os status', () => {
    ['verificar_pendente', 'pago', 'nao_pago'].forEach((s) => {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_COLORS[s]).toBeTruthy();
    });
  });

  it('tem labels e cores para todos os tipos', () => {
    ['boleto', 'cartao_recorrente', 'pix_automatico', 'cartao', 'pix'].forEach((t) => {
      expect(TIPO_LABELS[t]).toBeTruthy();
      expect(TIPO_COLORS[t]).toBeTruthy();
    });
  });

  it('tem labels e cores para todos os perfis', () => {
    ['operador', 'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin'].forEach((p) => {
      expect(PERFIL_LABELS[p]).toBeTruthy();
      expect(PERFIL_COLORS[p]).toBeTruthy();
      expect(PERFIL_NIVEL[p]).toBeGreaterThan(0);
    });
    // Hierarquia crescente
    expect(PERFIL_NIVEL.super_admin).toBeGreaterThan(PERFIL_NIVEL.administrador);
    expect(PERFIL_NIVEL.administrador).toBeGreaterThan(PERFIL_NIVEL.diretoria);
    expect(PERFIL_NIVEL.operador).toBe(1);
  });

  it('TODAS_EMPRESAS_SELECT_VALUE é "all"', () => {
    expect(TODAS_EMPRESAS_SELECT_VALUE).toBe('all');
  });

  it('constantes PaguePlay estão consistentes', () => {
    expect(PARCELAS_MAX_PAGUEPLAY).toBe(12);
    expect(PARCELAS_MAX_DEFAULT).toBe(60);
    expect(TIPO_OPTIONS_PAGUEPLAY).toEqual(['boleto', 'cartao']);
    expect(ESTADOS_BRASIL).toHaveLength(27);
    expect(INSTITUICOES_OPTIONS.length).toBeGreaterThan(0);
    expect(STATUS_LABELS_PAGUEPLAY.verificar_pendente).toBe('Pendente');
    expect(TIPO_LABELS_PAGUEPLAY.boleto).toBe('Boleto / PIX');
    expect(TIPO_LABELS_PAGUEPLAY.pix).toBe('Boleto / PIX'); // compat
    expect(TIPO_LABELS_PAGUEPLAY.cartao).toBe('Cartão de Crédito');
  });

  it('percentuais PaguePlay somam 1.0 (aprox.)', () => {
    const total = PP_HO_PERCENTUAL + PP_COREN_PERCENTUAL + PP_COFEN_PERCENTUAL;
    expect(total).toBeCloseTo(1.0, 4);
  });

  it('arrays de perfis contêm os valores esperados', () => {
    expect(PERFIS_LIDER).toContain('lider');
    expect(PERFIS_LIDER).toContain('elite');
    expect(PERFIS_LIDER).toContain('gerencia');
    expect(PERFIS_ADMIN).toContain('administrador');
    expect(PERFIS_ADMIN).toContain('super_admin');
    expect(PERFIS_DIRETORIA).toEqual(['diretoria']);
    expect(PERFIS_VISAO_SETOR).toContain('operador');
    expect(PERFIS_VISAO_EMPRESA_RESTRITA).toContain('gerencia');
  });
});

describe('helpers de perfil', () => {
  it('isPerfilLider detecta lider/elite/gerencia', () => {
    expect(isPerfilLider('lider')).toBe(true);
    expect(isPerfilLider('elite')).toBe(true);
    expect(isPerfilLider('gerencia')).toBe(true);
    expect(isPerfilLider('operador')).toBe(false);
    expect(isPerfilLider('administrador')).toBe(false);
    expect(isPerfilLider('')).toBe(false);
  });

  it('isPerfilAdmin detecta administrador/super_admin', () => {
    expect(isPerfilAdmin('administrador')).toBe(true);
    expect(isPerfilAdmin('super_admin')).toBe(true);
    expect(isPerfilAdmin('lider')).toBe(false);
    expect(isPerfilAdmin('diretoria')).toBe(false);
  });

  it('isPerfilDiretoria detecta apenas diretoria', () => {
    expect(isPerfilDiretoria('diretoria')).toBe(true);
    expect(isPerfilDiretoria('administrador')).toBe(false);
    expect(isPerfilDiretoria('gerencia')).toBe(false);
  });

  it('isPerfilAdminOuLider combina admin|lider', () => {
    expect(isPerfilAdminOuLider('administrador')).toBe(true);
    expect(isPerfilAdminOuLider('super_admin')).toBe(true);
    expect(isPerfilAdminOuLider('lider')).toBe(true);
    expect(isPerfilAdminOuLider('elite')).toBe(true);
    expect(isPerfilAdminOuLider('operador')).toBe(false);
    expect(isPerfilAdminOuLider('diretoria')).toBe(false);
  });
});

describe('getTodayISO', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('retorna string ISO YYYY-MM-DD', () => {
    const iso = getTodayISO();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usa timezone BRT mesmo se UTC estiver no dia seguinte', () => {
    // Em UTC é dia 02, em BRT (UTC-3) ainda é dia 01
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-02T02:30:00Z'));
    expect(getTodayISO()).toBe('2025-01-01');
  });

  it('coincide com data local em horário diurno', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z')); // 12:00 BRT
    expect(getTodayISO()).toBe('2025-06-15');
  });
});

describe('formatCurrency', () => {
  it('formata números em BRL', () => {
    expect(formatCurrency(1000)).toMatch(/R\$\s?1\.000,00/);
    expect(formatCurrency(0)).toMatch(/R\$\s?0,00/);
    expect(formatCurrency(1234.56)).toMatch(/R\$\s?1\.234,56/);
  });

  it('aceita string simples (só vírgula decimal) e converte', () => {
    expect(formatCurrency('150,75')).toMatch(/R\$\s?150,75/);
  });

  it('para string com separador de milhar (ambíguo), zera (limitação documentada)', () => {
    // 'R$ 1.000,00' → replace('[^\d,.-]') → '1.000,00' → replace(',', '.') → '1.000.00' → Number = NaN → 0
    // Comportamento atual da função; se for importante, substituir por safeNum/parseBRL.
    expect(formatCurrency('R$ 1.000,00')).toMatch(/R\$\s?0,00/);
  });

  it('trata null/undefined/lixo como 0', () => {
    expect(formatCurrency(null)).toMatch(/R\$\s?0,00/);
    expect(formatCurrency(undefined)).toMatch(/R\$\s?0,00/);
    expect(formatCurrency('abc')).toMatch(/R\$\s?0,00/);
  });

  it('lida com valores negativos', () => {
    expect(formatCurrency(-50)).toMatch(/-R\$\s?50,00|R\$\s?-50,00/);
  });
});

describe('formatDate', () => {
  it('formata YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(formatDate('2025-04-22')).toBe('22/04/2025');
  });

  it('aceita ISO completo com T', () => {
    expect(formatDate('2025-04-22T15:30:00Z')).toBe('22/04/2025');
  });

  it('retorna "-" quando vazio', () => {
    expect(formatDate('')).toBe('-');
  });
});

describe('formatPhone', () => {
  it('formata número com 11 dígitos (celular)', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
  });

  it('formata número com 10 dígitos (fixo)', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
  });

  it('retorna original se não bate 10/11', () => {
    expect(formatPhone('123')).toBe('123');
  });

  it('aceita com caracteres não numéricos', () => {
    expect(formatPhone('(11) 98765-4321')).toBe('(11) 98765-4321');
  });

  it('retorna string vazia quando vazio', () => {
    expect(formatPhone('')).toBe('');
  });
});

describe('gerarLinkWhatsapp', () => {
  it('monta URL com prefixo 55 e encode da mensagem', () => {
    const url = gerarLinkWhatsapp('11987654321', 'Olá, tudo bem?');
    expect(url).toBe('https://wa.me/5511987654321?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  });

  it('remove não-dígitos do número', () => {
    const url = gerarLinkWhatsapp('(11) 98765-4321', 'oi');
    expect(url).toContain('/5511987654321');
  });
});

describe('interpolarMensagem', () => {
  it('substitui todas as variáveis do template', () => {
    const msg = interpolarMensagem(
      'Olá {{nome_cliente}}, NR {{nr_cliente}}, valor {{valor}}, vence {{vencimento}}',
      { nome_cliente: 'João', nr_cliente: '12345', valor: 1500, vencimento: '2025-04-22' }
    );
    expect(msg).toContain('João');
    expect(msg).toContain('12345');
    expect(msg).toMatch(/R\$\s?1\.500,00/);
    expect(msg).toContain('22/04/2025');
  });

  it('substitui múltiplas ocorrências da mesma variável', () => {
    const msg = interpolarMensagem('{{nome_cliente}} e {{nome_cliente}}', {
      nome_cliente: 'Ana', nr_cliente: '', valor: 0, vencimento: '2025-01-01',
    });
    expect(msg).toBe('Ana e Ana');
  });
});

describe('parseCurrencyInput', () => {
  it('converte string simples com vírgula decimal', () => {
    expect(parseCurrencyInput('150,75')).toBe(150.75);
    expect(parseCurrencyInput('R$ 500,00')).toBe(500);
  });

  it('retorna 0 para lixo', () => {
    expect(parseCurrencyInput('abc')).toBe(0);
    expect(parseCurrencyInput('')).toBe(0);
  });

  it('zera em strings com separador de milhar (limitação; usar parseBRL em money.ts)', () => {
    // '1.234,56' → '1.234,56' → '1.234.56' → Number = NaN → 0
    expect(parseCurrencyInput('1.234,56')).toBe(0);
  });
});

describe('isAtrasado', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('retorna false se status é pago ou nao_pago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-04-22T15:00:00Z'));
    expect(isAtrasado('2020-01-01', 'pago')).toBe(false);
    expect(isAtrasado('2020-01-01', 'nao_pago')).toBe(false);
  });

  it('retorna true se vencimento < hoje e pendente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z'));
    expect(isAtrasado('2025-06-14', 'verificar_pendente')).toBe(true);
  });

  it('retorna false se vencimento = hoje', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z'));
    expect(isAtrasado('2025-06-15', 'verificar_pendente')).toBe(false);
  });

  it('retorna false se vencimento > hoje', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T15:00:00Z'));
    expect(isAtrasado('2025-12-31', 'verificar_pendente')).toBe(false);
  });
});

describe('isPaguePlay', () => {
  it('reconhece slug "pagueplay"', () => {
    expect(isPaguePlay('pagueplay')).toBe(true);
  });

  it('não reconhece outros slugs', () => {
    expect(isPaguePlay('bookplay')).toBe(false);
    expect(isPaguePlay('')).toBe(false);
    expect(isPaguePlay('PaguePlay')).toBe(false); // case-sensitive
  });
});

describe('calc HO/Coren/Cofen', () => {
  it('calcHO = 24,96%', () => {
    expect(calcHO(1000)).toBeCloseTo(249.6, 5);
  });

  it('calcCoren = 56,28%', () => {
    expect(calcCoren(1000)).toBeCloseTo(562.8, 5);
  });

  it('calcCofen = 18,76%', () => {
    expect(calcCofen(1000)).toBeCloseTo(187.6, 5);
  });

  it('HO + Coren + Cofen ≈ valor bruto', () => {
    const bruto = 5000;
    const total = calcHO(bruto) + calcCoren(bruto) + calcCofen(bruto);
    expect(total).toBeCloseTo(bruto, 2);
  });

  it('aceita zero', () => {
    expect(calcHO(0)).toBe(0);
    expect(calcCoren(0)).toBe(0);
    expect(calcCofen(0)).toBe(0);
  });
});

describe('getters por slug (PaguePlay vs outros)', () => {
  it('getStatusLabels retorna labels PaguePlay para pagueplay', () => {
    expect(getStatusLabels('pagueplay')).toEqual(STATUS_LABELS_PAGUEPLAY);
    expect(getStatusLabels('pagueplay').verificar_pendente).toBe('Pendente');
  });

  it('getStatusLabels retorna labels genéricos para outros', () => {
    expect(getStatusLabels('bookplay')).toEqual(STATUS_LABELS);
    expect(getStatusLabels('bookplay').verificar_pendente).toBe('Verificar');
  });

  it('getTipoLabels retorna por slug', () => {
    expect(getTipoLabels('pagueplay')).toEqual(TIPO_LABELS_PAGUEPLAY);
    expect(getTipoLabels('outro')).toEqual(TIPO_LABELS);
  });

  it('getTipoOptions retorna por slug', () => {
    expect(getTipoOptions('pagueplay')).toEqual(['boleto', 'cartao']);
    expect(getTipoOptions('bookplay')).toEqual(expect.arrayContaining(['boleto', 'pix', 'cartao']));
  });

  it('getMaxParcelas retorna por slug', () => {
    expect(getMaxParcelas('pagueplay')).toBe(12);
    expect(getMaxParcelas('bookplay')).toBe(60);
  });
});

describe('extractores de observações PaguePlay', () => {
  it('extractEstado lê prefixo [ESTADO:XX]', () => {
    expect(extractEstado('[ESTADO:SP]\nAlgum link')).toBe('SP');
    expect(extractEstado('[ESTADO:RJ]')).toBe('RJ');
  });

  it('extractEstado retorna "" quando sem prefixo', () => {
    expect(extractEstado('Apenas texto')).toBe('');
    expect(extractEstado('')).toBe('');
    expect(extractEstado(null)).toBe('');
    expect(extractEstado(undefined)).toBe('');
  });

  it('extractLinkAcordo remove prefixo de estado se presente', () => {
    expect(extractLinkAcordo('[ESTADO:SP]\nhttps://exemplo.com')).toBe('https://exemplo.com');
    expect(extractLinkAcordo('https://sozinho.com')).toBe('https://sozinho.com');
  });

  it('extractLinkAcordo retorna "" para null/undefined/vazio', () => {
    expect(extractLinkAcordo(null)).toBe('');
    expect(extractLinkAcordo(undefined)).toBe('');
    expect(extractLinkAcordo('')).toBe('');
  });

  it('buildObservacoesComEstado concatena estado + link com newline', () => {
    expect(buildObservacoesComEstado('SP', 'https://x.com')).toBe('[ESTADO:SP]\nhttps://x.com');
  });

  it('buildObservacoesComEstado com só estado', () => {
    expect(buildObservacoesComEstado('MG', '')).toBe('[ESTADO:MG]');
  });

  it('buildObservacoesComEstado com só link', () => {
    expect(buildObservacoesComEstado('', 'link')).toBe('link');
  });

  it('buildObservacoesComEstado retorna null se tudo vazio', () => {
    expect(buildObservacoesComEstado('', '')).toBeNull();
    expect(buildObservacoesComEstado('', '   ')).toBeNull();
  });

  it('buildObservacoesComEstado tritmma o link', () => {
    expect(buildObservacoesComEstado('SP', '  link  ')).toBe('[ESTADO:SP]\nlink');
  });
});
