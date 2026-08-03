/**
 * observabilidade.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O que o Sentry pode e o que NÃO pode levar embora.
 *
 * A diretoria fixou em 28/07/2026 que nenhum CPF de cliente fica no sistema.
 * Mandar um para um serviço externo é pior que gravá-lo no banco: sai do nosso
 * controle e não dá para apagar depois. Estes testes existem para que o dia em
 * que alguém mexer no `beforeSend` seja o dia em que a suíte reclama.
 *
 * O segundo requisito é o oposto: o relatório precisa continuar ÚTIL. Mascarar
 * todo número transformaria a mensagem de erro em papel em branco, então
 * código de acordo, valor e telefone têm que sobreviver intactos.
 *
 * ## Nota de método
 *
 * O DSN entra por parâmetro. A primeira versão deste arquivo trocava a variável
 * de ambiente com `vi.stubEnv` e recarregava o módulo com `vi.resetModules()` —
 * e derrubou um teste de OUTRO arquivo, o `AcordoNovoInline`, quando os dois
 * caíam no mesmo worker: passava isolado e falhava na suíte inteira. Injetar o
 * valor não tem esse efeito colateral, e de quebra deixou a função mais simples.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { initSpy, setTagSpy, setUserSpy } = vi.hoisted(() => ({
  initSpy:    vi.fn(),
  setTagSpy:  vi.fn(),
  setUserSpy: vi.fn(),
}));

vi.mock('@sentry/react', () => ({
  init:    (...a: unknown[]) => initSpy(...a),
  setTag:  (...a: unknown[]) => setTagSpy(...a),
  setUser: (...a: unknown[]) => setUserSpy(...a),
}));

vi.mock('@/lib/tenant', () => ({
  getConfiguredTenantSlug: () => 'pagueplay',
}));

import {
  iniciarSentry, sentryAtivo, identificarUsuario, limparUsuario, RELEASE,
} from './observabilidade';

const DSN = 'https://chave@exemplo.ingest.sentry.io/1';

/** CPFs com dígito verificador válido — o mascaramento confere. */
const CPF_A = '529.982.247-25';
const CPF_A_LIMPO = '52998224725';
const CPF_B = '11144477735';

/** Opções passadas ao `Sentry.init` na última chamada. */
function opcoesDoInit() {
  return initSpy.mock.calls.at(-1)?.[0] as {
    dsn: string;
    release: string;
    tracesSampleRate: number;
    sendDefaultPii: boolean;
    beforeSend: (e: unknown) => unknown;
    beforeBreadcrumb: (b: unknown) => unknown;
  };
}

/** Liga o Sentry e devolve as opções — o que a maioria dos casos precisa. */
function ligado() {
  iniciarSentry(DSN);
  return opcoesDoInit();
}

beforeEach(() => {
  initSpy.mockReset();
  setTagSpy.mockReset();
  setUserSpy.mockReset();
  // Desliga entre os casos: `iniciarSentry` sem DSN zera o estado do módulo.
  iniciarSentry('');
});

// ── Ligar e não ligar ───────────────────────────────────────────────────────

describe('iniciarSentry', () => {
  it('sem DSN não inicializa nada — nenhuma telemetria sai da máquina', () => {
    iniciarSentry('');
    expect(initSpy).not.toHaveBeenCalled();
    expect(sentryAtivo()).toBe(false);
  });

  it('DSN só com espaço em branco também não liga', () => {
    iniciarSentry('   ');
    expect(initSpy).not.toHaveBeenCalled();
    expect(sentryAtivo()).toBe(false);
  });

  it('com DSN inicializa e marca como ativo', () => {
    ligado();
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(sentryAtivo()).toBe(true);
    expect(opcoesDoInit().dsn).toBe(DSN);
  });

  it('manda o release, senão não dá para saber qual build quebrou', () => {
    expect(ligado().release).toBe(RELEASE);
    expect(RELEASE).toBeTruthy();
  });

  it('tracing desligado e PII automática desligada', () => {
    // Tracing consome cota do plano e não responde nenhuma pergunta que a
    // gente tenha hoje. PII automática anexaria IP e cabeçalhos sozinha.
    const opcoes = ligado();
    expect(opcoes.tracesSampleRate).toBe(0);
    expect(opcoes.sendDefaultPii).toBe(false);
  });

  it('etiqueta o tenant — são duas empresas em deploys separados', () => {
    ligado();
    expect(setTagSpy).toHaveBeenCalledWith('tenant', 'pagueplay');
  });
});

// ── O filtro de CPF ─────────────────────────────────────────────────────────

describe('beforeSend — CPF não sai daqui', () => {
  it('mascara CPF na mensagem da exceção', () => {
    const { beforeSend } = ligado();
    const limpo = beforeSend({
      message: `Falha ao salvar acordo do cliente ${CPF_A}`,
    }) as { message: string };
    expect(limpo.message).not.toContain('529');
    expect(limpo.message).toContain('[CPF REMOVIDO]');
  });

  it('acha CPF no fundo do evento, não só no topo', () => {
    const { beforeSend } = ligado();
    const limpo = beforeSend({
      exception: { values: [{ value: `codigo=${CPF_A_LIMPO}` }] },
      extra: { corpo: { campos: [`obs: ${CPF_B}`] } },
    }) as { exception: { values: { value: string }[] }; extra: { corpo: { campos: string[] } } };

    expect(limpo.exception.values[0].value).toBe('codigo=[CPF REMOVIDO]');
    expect(limpo.extra.corpo.campos[0]).toBe('obs: [CPF REMOVIDO]');
  });

  it('não estraga o resto do relatório — número que não é CPF passa inteiro', () => {
    // Se isto virasse "[CPF REMOVIDO]" três vezes, o erro ficaria ilegível.
    const { beforeSend } = ligado();
    const limpo = beforeSend({
      message: 'acordo 8472913 valor R$ 1.250,00 telefone 11987654321 em 2026-08-03',
    }) as { message: string };
    expect(limpo.message).toContain('8472913');
    expect(limpo.message).toContain('1.250,00');
    expect(limpo.message).toContain('2026-08-03');
  });

  it('mantém tipos que não são texto', () => {
    const { beforeSend } = ligado();
    const limpo = beforeSend({
      timestamp: 1754200000, ok: false, vazio: null, level: 'error',
    }) as Record<string, unknown>;
    expect(limpo).toEqual({ timestamp: 1754200000, ok: false, vazio: null, level: 'error' });
  });

  it('objeto profundo demais não trava a saída do erro', () => {
    const { beforeSend } = ligado();
    let fundo: Record<string, unknown> = { texto: CPF_A };
    for (let i = 0; i < 40; i++) fundo = { nivel: fundo };
    expect(() => beforeSend(fundo)).not.toThrow();
  });

  it('breadcrumb passa pelo mesmo filtro', () => {
    const { beforeBreadcrumb } = ligado();
    const limpo = beforeBreadcrumb({
      category: 'ui.click', message: `abriu acordo de ${CPF_A}`,
    }) as { message: string };
    expect(limpo.message).toContain('[CPF REMOVIDO]');
  });
});

// ── Identidade ──────────────────────────────────────────────────────────────

describe('identidade do usuário', () => {
  it('manda id, usuário e cargo — e nada além disso', () => {
    ligado();
    setTagSpy.mockClear();

    identificarUsuario({ id: 'u-1', usuario: 'msilva', cargo: 'lider' });

    expect(setUserSpy).toHaveBeenCalledWith({ id: 'u-1', username: 'msilva' });
    expect(setTagSpy).toHaveBeenCalledWith('cargo', 'lider');
    // Nome e e-mail não são necessários para achar a pessoa e não saem daqui.
    const enviado = setUserSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(enviado).sort()).toEqual(['id', 'username']);
  });

  it('sem cargo, a etiqueta ainda existe para dar para filtrar', () => {
    ligado();
    identificarUsuario({ id: 'u-1', usuario: null, cargo: null });
    expect(setUserSpy).toHaveBeenCalledWith({ id: 'u-1', username: undefined });
    expect(setTagSpy).toHaveBeenCalledWith('cargo', 'sem-cargo');
  });

  it('logout tira o crachá — o próximo erro não sai no nome de quem saiu', () => {
    ligado();
    limparUsuario();
    expect(setUserSpy).toHaveBeenCalledWith(null);
  });

  it('sem Sentry ligado, identificar e limpar não fazem nada', () => {
    iniciarSentry('');
    identificarUsuario({ id: 'u-1', usuario: 'msilva', cargo: 'lider' });
    limparUsuario();
    expect(setUserSpy).not.toHaveBeenCalled();
    expect(setTagSpy).not.toHaveBeenCalled();
  });
});
