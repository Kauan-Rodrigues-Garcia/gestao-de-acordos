/**
 * notificacoes-tipo.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A classificação é DERIVADA do título e da rota (ver o cabeçalho do módulo), e
 * a fraqueza declarada desse desenho é a mesma coisa que este arquivo cobre:
 * título novo sem regra cai em `sistema`.
 *
 * Por isso o teste central é o inventário — a lista abaixo é TODO título que o
 * projeto produz hoje, dos cinco triggers em SQL e dos produtores em TypeScript.
 * Produtor novo que ninguém classificou reprova aqui, não em produção.
 */
import { describe, it, expect } from 'vitest';
import {
  tipoDaNotificacao, apresentacaoDaNotificacao, categoriasPresentes,
  grupoDaData, tempoRelativo,
  CATEGORIA_LABEL, CATEGORIA_ICONE, CATEGORIA_COR, DURACAO_POR_URGENCIA,
  type CategoriaNotificacao, type UrgenciaNotificacao,
} from './notificacoes-tipo';

type Caso = [titulo: string, rota: string | null, CategoriaNotificacao, UrgenciaNotificacao];

/**
 * Inventário dos produtores. A origem de cada um está no comentário — quem
 * mexer num título sabe onde ele nasce.
 */
const INVENTARIO: Caso[] = [
  // ── Triggers em SQL ───────────────────────────────────────────────────────
  // 20260731a — fn_wpp_notificar_mensagem
  ['Nova mensagem — MARIA SILVA', '/solicitacoes-whatsapp', 'chat', 'atencao'],
  // 20260731c — fn_wpp_notificar_exclusao
  ['Solicitação excluída — MARIA SILVA', '/solicitacoes-whatsapp', 'atendimento', 'critica'],
  // 20260811b — fn_wpp_marcar_nao_concluidos
  ['Atendimento não concluído — MARIA SILVA', '/solicitacoes-whatsapp', 'atendimento', 'critica'],
  // 20260809a — desaprovação do Pix
  ['Acordo Pix desaprovado — NR 12345', '/acordos?tab=pix', 'pix', 'critica'],
  // 20260811c — fn_pix_registrar_exclusao
  ['Pix automático — registro excluído', '/acordos?tab=pix', 'pix', 'critica'],

  // ── Produtores em TypeScript ──────────────────────────────────────────────
  // tratarExclusaoVinculo.ts / desligamento.service.ts
  ['Seu acordo EXTRA virou DIRETO', null, 'vinculo', 'critica'],
  ['Vínculo EXTRA removido', null, 'vinculo', 'critica'],
  // desligamento.service.ts — o rótulo do NR muda por tenant
  ['NR "12345" reatribuído', null, 'vinculo', 'critica'],
  ['Código "12345" reatribuído', null, 'vinculo', 'critica'],
  // importar_excel_batch.service.ts
  ['📎 Novo acordo EXTRA vinculado ao seu', null, 'vinculo', 'critica'],
  ['Seu acordo foi convertido em EXTRA', null, 'vinculo', 'critica'],
  ['Acordo transferido pelo líder (importação)', null, 'vinculo', 'critica'],
  // AcordoNovoInline / AcordoEditInline
  ['Novo vínculo EXTRA no seu acordo', null, 'vinculo', 'critica'],
  ['Seu vínculo EXTRA foi transferido', null, 'vinculo', 'critica'],
  ['Seu NR "12345" foi transferido', null, 'vinculo', 'critica'],
  // analitico.service.ts
  ['Acordo transferido — Analítico', null, 'vinculo', 'critica'],
  ['Transferência automática — cód. 12345', null, 'vinculo', 'critica'],
  ['Analítico atualizado', '/analitico', 'importacao', 'info'],
  // diario.service.ts
  ['Recebimento diário atualizado', '/analitico?aba=diario', 'importacao', 'info'],
  // ImportarExcel.tsx
  ['Importação de acordos concluída', null, 'importacao', 'info'],
  // useMarcarAtrasados.ts
  ['Acordo movido para Não Pago', null, 'acordo', 'atencao'],
];

describe('inventário de produtores', () => {
  it.each(INVENTARIO)('%s → %s / %s', (titulo, rota, categoria, urgencia) => {
    expect(tipoDaNotificacao({ titulo, rota })).toEqual({ categoria, urgencia });
  });

  it('nenhum título do projeto cai em "sistema"', () => {
    const orfaos = INVENTARIO
      .filter(([titulo, rota]) => tipoDaNotificacao({ titulo, rota }).categoria === 'sistema')
      .map(([titulo]) => titulo);
    expect(orfaos).toEqual([]);
  });
});

describe('ordem das regras', () => {
  // "Pix automático — registro excluído" tem a palavra "excluído", que também
  // casa a regra de acordo. Testar na ordem errada mandaria a notificação do
  // Pix para a categoria de acordo.
  it('Pix vence "excluído"', () => {
    expect(tipoDaNotificacao({ titulo: 'Pix automático — registro excluído', rota: null }).categoria)
      .toBe('pix');
  });

  // O diário mora dentro do analítico e o título dele não contém a palavra.
  it('diário não é confundido com analítico', () => {
    const t = tipoDaNotificacao({ titulo: 'Recebimento diário atualizado', rota: null });
    expect(t.categoria).toBe('importacao');
  });

  it('rota classifica quando o título não diz nada', () => {
    expect(tipoDaNotificacao({ titulo: 'Aviso', rota: '/acordos?tab=pix' }).categoria).toBe('pix');
    expect(tipoDaNotificacao({ titulo: 'Aviso', rota: '/analitico' }).categoria).toBe('importacao');
  });
});

describe('acentuação', () => {
  // Títulos de um ano de projeto: "analítico" e "analitico" convivem.
  it.each([
    ['Analítico atualizado'],
    ['Analitico atualizado'],
  ])('%s cai em importação', titulo => {
    expect(tipoDaNotificacao({ titulo, rota: null }).categoria).toBe('importacao');
  });

  it('não concluído casa com e sem acento', () => {
    expect(tipoDaNotificacao({ titulo: 'Atendimento não concluído', rota: null }).categoria)
      .toBe('atendimento');
    expect(tipoDaNotificacao({ titulo: 'Atendimento nao concluido', rota: null }).categoria)
      .toBe('atendimento');
  });
});

describe('caídas no padrão', () => {
  it('título desconhecido vira sistema/info, e não quebra', () => {
    expect(tipoDaNotificacao({ titulo: 'Coisa nova de 2027', rota: null }))
      .toEqual({ categoria: 'sistema', urgencia: 'info' });
  });

  it('título vazio ou nulo não estoura', () => {
    expect(() => tipoDaNotificacao({ titulo: '', rota: null })).not.toThrow();
    expect(tipoDaNotificacao({ titulo: null as unknown as string, rota: null }).categoria)
      .toBe('sistema');
  });

  // A notificação aponta para um acordo específico: de acordo ela é, mesmo que
  // o título não diga.
  it('acordo_id puxa para acordo quando nada mais casou', () => {
    expect(tipoDaNotificacao({ titulo: 'Coisa nova', rota: null, acordo_id: 'ac-1' }))
      .toEqual({ categoria: 'acordo', urgencia: 'atencao' });
  });
});

describe('categoriasPresentes', () => {
  // É assim que a diferença entre BookPlay e PaguePlay se resolve sozinha: quem
  // nunca recebeu notificação de Pix não vê o chip de Pix.
  it('devolve só o que existe na lista', () => {
    const lista = [
      { titulo: 'Nova mensagem — X', rota: null },
      { titulo: 'Analítico atualizado', rota: null },
    ];
    expect(categoriasPresentes(lista)).toEqual(['chat', 'importacao']);
  });

  it('mantém a ordem fixa do catálogo, não a de chegada', () => {
    const lista = [
      { titulo: 'Analítico atualizado', rota: null },
      { titulo: 'Nova mensagem — X', rota: null },
    ];
    expect(categoriasPresentes(lista)).toEqual(['chat', 'importacao']);
  });

  it('lista vazia devolve nenhuma categoria', () => {
    expect(categoriasPresentes([])).toEqual([]);
  });

  it('não repete categoria', () => {
    const lista = [
      { titulo: 'Nova mensagem — A', rota: null },
      { titulo: 'Nova mensagem — B', rota: null },
    ];
    expect(categoriasPresentes(lista)).toEqual(['chat']);
  });
});

describe('apresentacaoDaNotificacao', () => {
  const mensagemDoChat = {
    titulo: 'Nova mensagem — MARIA VERUZA',
    rota: '/solicitacoes-whatsapp',
    mensagem: 'Bom dia, o cliente pediu retorno hoje',
    autor_nome: 'João Pedro Silva',
  };

  // Até 11/08/2026 o card mostrava "Nova mensagem — MARIA VERUZA" em negrito e
  // a frase em cinza pequeno embaixo — o contrário do que se quer ler.
  it('no chat, quem falou vira o título e a MENSAGEM vira o corpo', () => {
    expect(apresentacaoDaNotificacao(mensagemDoChat)).toEqual({
      titulo:   'João Pedro Silva',
      corpo:    'Bom dia, o cliente pediu retorno hoje',
      contexto: 'MARIA VERUZA',
      usarFotoDoAutor: true,
    });
  });

  // Linhas gravadas antes da coluna `autor_nome` guardavam "João: bom dia".
  it('desmancha o prefixo "Fulano: " das linhas antigas', () => {
    const r = apresentacaoDaNotificacao({
      ...mensagemDoChat,
      mensagem: 'João: Bom dia, o cliente pediu retorno hoje',
    });
    expect(r.corpo).toBe('Bom dia, o cliente pediu retorno hoje');
  });

  it('não desmancha nada quando o texto só PARECE ter prefixo', () => {
    const r = apresentacaoDaNotificacao({
      ...mensagemDoChat,
      mensagem: 'Atenção: o cliente pediu retorno',
    });
    expect(r.corpo).toBe('Atenção: o cliente pediu retorno');
  });

  // Sem autor não há foto para mostrar nem nome para pôr no título: cai no
  // formato comum, que é o que as linhas anteriores à migration têm.
  it('chat sem autor conhecido volta ao formato comum', () => {
    const r = apresentacaoDaNotificacao({
      titulo: 'Nova mensagem — MARIA VERUZA',
      rota: '/solicitacoes-whatsapp',
      mensagem: 'João: bom dia',
      autor_nome: null,
    });
    expect(r.usarFotoDoAutor).toBe(false);
    expect(r.titulo).toBe('Nova mensagem — MARIA VERUZA');
    expect(r.corpo).toBe('João: bom dia');
  });

  it('título de chat sem travessão não perde o corpo', () => {
    const r = apresentacaoDaNotificacao({
      titulo: 'Nova mensagem',
      rota: '/solicitacoes-whatsapp',
      mensagem: 'oi',
      autor_nome: 'Ana',
    });
    expect(r.titulo).toBe('Ana');
    expect(r.corpo).toBe('oi');
    expect(r.contexto).toBeNull();
  });

  // Numa exclusão, a cara de quem apagou importa menos que o ícone dizendo de
  // que assunto se trata.
  it('fora do chat, mantém título e corpo do produtor e não usa foto', () => {
    const r = apresentacaoDaNotificacao({
      titulo: 'Pix automático — registro excluído',
      rota: '/acordos?tab=pix',
      mensagem: 'Bryan excluiu o seu registro do NR 123.',
      autor_nome: 'Bryan Souza',
    });
    expect(r).toEqual({
      titulo:   'Pix automático — registro excluído',
      corpo:    'Bryan excluiu o seu registro do NR 123.',
      contexto: null,
      usarFotoDoAutor: false,
    });
  });

  it('mensagem vazia não estoura', () => {
    expect(() => apresentacaoDaNotificacao({
      titulo: 'Nova mensagem — X', rota: null,
      mensagem: null as unknown as string, autor_nome: 'Ana',
    })).not.toThrow();
  });
});

describe('grupoDaData', () => {
  // Dias de CALENDÁRIO, não diferença em horas: às 00:30, o que chegou às 23:50
  // é "ontem", não "há 40 minutos, portanto hoje".
  const meiaNoiteEMeia = new Date('2026-08-11T00:30:00').getTime();

  it('23:50 de ontem é ontem, mesmo com 40 minutos de diferença', () => {
    expect(grupoDaData(new Date('2026-08-10T23:50:00').toISOString(), meiaNoiteEMeia))
      .toBe('ontem');
  });

  it('mesma data é hoje', () => {
    expect(grupoDaData(new Date('2026-08-11T00:05:00').toISOString(), meiaNoiteEMeia))
      .toBe('hoje');
  });

  it('dentro de 7 dias é semana', () => {
    expect(grupoDaData(new Date('2026-08-06T10:00:00').toISOString(), meiaNoiteEMeia))
      .toBe('semana');
  });

  it('mais de 7 dias é anteriores', () => {
    expect(grupoDaData(new Date('2026-07-20T10:00:00').toISOString(), meiaNoiteEMeia))
      .toBe('anteriores');
  });

  it('data futura (relógio do cliente adiantado) conta como hoje', () => {
    expect(grupoDaData(new Date('2026-08-12T10:00:00').toISOString(), meiaNoiteEMeia))
      .toBe('hoje');
  });

  it('data inválida não estoura', () => {
    expect(grupoDaData('não é data', meiaNoiteEMeia)).toBe('anteriores');
  });
});

describe('tempoRelativo', () => {
  const agora = new Date('2026-08-11T12:00:00Z').getTime();
  const atras = (ms: number) => new Date(agora - ms).toISOString();

  it.each([
    [30_000,            'agora'],
    [12 * 60_000,       '12min'],
    [3 * 3_600_000,     '3h'],
    [2 * 86_400_000,    '2d'],
  ])('%i ms → %s', (ms, esperado) => {
    expect(tempoRelativo(atras(ms), agora)).toBe(esperado);
  });

  it('passada uma semana mostra a data — "8d" não diz nada a ninguém', () => {
    expect(tempoRelativo(atras(30 * 86_400_000), agora)).toMatch(/^\d{2}\/\d{2}$/);
  });

  it('data inválida vira string vazia', () => {
    expect(tempoRelativo('não é data', agora)).toBe('');
  });
});

describe('catálogos', () => {
  const categorias = Object.keys(CATEGORIA_LABEL) as CategoriaNotificacao[];

  // Categoria sem ícone ou sem cor quebra o painel na hora de desenhar.
  it('toda categoria tem rótulo, ícone e cor', () => {
    for (const c of categorias) {
      expect(CATEGORIA_LABEL[c]).toBeTruthy();
      expect(CATEGORIA_ICONE[c]).toBeTruthy();
      expect(CATEGORIA_COR[c]).toBeTruthy();
    }
  });

  it('o card crítico fica mais tempo na tela que o informativo', () => {
    expect(DURACAO_POR_URGENCIA.critica).toBeGreaterThan(DURACAO_POR_URGENCIA.atencao);
    expect(DURACAO_POR_URGENCIA.atencao).toBeGreaterThan(DURACAO_POR_URGENCIA.info);
  });

  // Os 2 s antigos não davam para ler duas linhas de texto.
  it('nenhuma duração volta a ser curta demais para ler', () => {
    for (const ms of Object.values(DURACAO_POR_URGENCIA)) {
      expect(ms).toBeGreaterThanOrEqual(4_000);
    }
  });
});
