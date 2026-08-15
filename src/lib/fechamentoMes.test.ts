import { describe, it, expect } from 'vitest';
import {
  mesFechado, mesDaData, podeIgnorarFechamento,
  estadoFechamento, estadoFechamentoDaData,
  mensagemFechamento, mensagemFechamentoLiberado,
} from './fechamentoMes';

const HOJE = '2026-08';

describe('mesFechado', () => {
  it('mês anterior está fechado', () => {
    expect(mesFechado('2026-07', HOJE)).toBe(true);
    expect(mesFechado('2025-12', HOJE)).toBe(true);
  });

  it('o mês corrente fica aberto o mês inteiro', () => {
    expect(mesFechado('2026-08', HOJE)).toBe(false);
  });

  it('mês futuro não é "fechado" — é apenas futuro', () => {
    expect(mesFechado('2026-09', HOJE)).toBe(false);
  });

  it('entrada inválida cai no mês corrente e fica aberta', () => {
    expect(mesFechado('', HOJE)).toBe(false);
    expect(mesFechado(null, HOJE)).toBe(false);
    expect(mesFechado('lixo', HOJE)).toBe(false);
  });

  it('a virada de ano é comparada corretamente', () => {
    expect(mesFechado('2025-12', '2026-01')).toBe(true);
    expect(mesFechado('2026-01', '2025-12')).toBe(false);
  });
});

describe('mesDaData', () => {
  it('extrai yyyy-MM de uma data ISO', () => {
    expect(mesDaData('2026-07-15')).toBe('2026-07');
    expect(mesDaData('2026-07-15T10:00:00Z')).toBe('2026-07');
  });

  it('devolve null para vazio ou formato estranho', () => {
    expect(mesDaData(null)).toBeNull();
    expect(mesDaData('')).toBeNull();
    expect(mesDaData('15/07/2026')).toBeNull();
  });
});

describe('podeIgnorarFechamento', () => {
  it('só super_admin passa', () => {
    expect(podeIgnorarFechamento('super_admin')).toBe(true);
  });

  it('administrador NÃO passa — foi decisão explícita', () => {
    expect(podeIgnorarFechamento('administrador')).toBe(false);
  });

  it('os demais cargos ficam bloqueados', () => {
    for (const cargo of ['operador', 'lider', 'elite', 'gerencia', 'diretoria', 'ouvidoria']) {
      expect(podeIgnorarFechamento(cargo)).toBe(false);
    }
  });

  it('tolera caixa e espaços — o cargo vem de coluna de texto', () => {
    expect(podeIgnorarFechamento('  SUPER_ADMIN ')).toBe(true);
    expect(podeIgnorarFechamento(null)).toBe(false);
    expect(podeIgnorarFechamento(undefined)).toBe(false);
  });
});

describe('estadoFechamento', () => {
  it('mês aberto: nada a dizer, para qualquer cargo', () => {
    expect(estadoFechamento({ mes: '2026-08', cargo: 'operador', hoje: HOJE }))
      .toEqual({ fechado: false, liberadoPorCargo: false, bloqueado: false });
    expect(estadoFechamento({ mes: '2026-08', cargo: 'super_admin', hoje: HOJE }))
      .toEqual({ fechado: false, liberadoPorCargo: false, bloqueado: false });
  });

  it('mês fechado bloqueia líder e diretoria', () => {
    for (const cargo of ['lider', 'elite', 'gerencia', 'diretoria', 'administrador']) {
      expect(estadoFechamento({ mes: '2026-07', cargo, hoje: HOJE }))
        .toEqual({ fechado: true, liberadoPorCargo: false, bloqueado: true });
    }
  });

  it('mês fechado com super_admin: fechado, porém liberado', () => {
    expect(estadoFechamento({ mes: '2026-07', cargo: 'super_admin', hoje: HOJE }))
      .toEqual({ fechado: true, liberadoPorCargo: true, bloqueado: false });
  });

  it('a permissão `ignorar_fechamento_mes` libera quem o cargo bloqueava', () => {
    expect(estadoFechamento({
      mes: '2026-07', cargo: 'gerencia', liberadoPorPermissao: true, hoje: HOJE,
    })).toEqual({ fechado: true, liberadoPorCargo: true, bloqueado: false });
  });

  it('a permissão não abre mês que ainda nem fechou', () => {
    // Liberar o cadeado é sobre AUTORIDADE; `fechado` é fato de calendário e não
    // muda para ninguém. Confundir os dois faria a tela avisar "você está
    // editando mês fechado" em agosto, dentro de agosto.
    expect(estadoFechamento({
      mes: '2026-08', cargo: 'gerencia', liberadoPorPermissao: true, hoje: HOJE,
    })).toEqual({ fechado: false, liberadoPorCargo: false, bloqueado: false });
  });

  it('sem a permissão, nada muda para quem não é super_admin', () => {
    for (const cargo of ['operador', 'lider', 'gerencia', 'diretoria', 'administrador']) {
      expect(estadoFechamento({
        mes: '2026-07', cargo, liberadoPorPermissao: false, hoje: HOJE,
      }).bloqueado, `${cargo} deixou de ser bloqueado`).toBe(true);
    }
  });
});

describe('estadoFechamentoDaData', () => {
  it('usa o mês do vencimento do registro', () => {
    expect(estadoFechamentoDaData({ data: '2026-07-31', cargo: 'lider', hoje: HOJE }).bloqueado)
      .toBe(true);
    expect(estadoFechamentoDaData({ data: '2026-08-01', cargo: 'lider', hoje: HOJE }).bloqueado)
      .toBe(false);
  });

  it('encaminha a permissão para a regra do mês', () => {
    // O cadeado por linha da tabela usa esta função. Esquecer de repassar o
    // parâmetro deixaria a permissão valendo no cabeçalho e não nas linhas.
    expect(estadoFechamentoDaData({
      data: '2026-07-31', cargo: 'gerencia', liberadoPorPermissao: true, hoje: HOJE,
    }).bloqueado).toBe(false);
  });

  it('sem data não há cadeado — não dá para fechar o que não tem mês', () => {
    expect(estadoFechamentoDaData({ data: null, cargo: 'lider', hoje: HOJE }).bloqueado)
      .toBe(false);
  });
});

describe('mensagens', () => {
  it('nomeiam o mês e dizem o que ainda dá para fazer', () => {
    const msg = mensagemFechamento('2026-07');
    expect(msg).toContain('Julho 2026');
    expect(msg).toContain('somente leitura');
    expect(msg).toContain('fechamento');
  });

  it('a de quem passa por cima nomeia o mês e diz a consequência', () => {
    const msg = mensagemFechamentoLiberado('2026-07');
    expect(msg).toContain('Julho 2026');
    expect(msg).toContain('já foi apresentado');
    // Não nomeia cargo: desde `ignorar_fechamento_mes`, quem lê isto pode ser
    // gerência, e dizer "você é super admin" faria a pessoa ignorar o aviso.
    expect(msg).not.toContain('super admin');
  });
});
