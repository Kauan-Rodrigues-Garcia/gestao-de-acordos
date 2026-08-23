/**
 * fila.test.ts — a fila de tickets responde as perguntas certas.
 *
 * Os casos que importam de verdade são três, e todos já apareceram como defeito
 * em telas parecidas deste projeto:
 *
 *   • **"Parados" contando o histórico.** Sem excluir o que está encerrado, a
 *     aba abre com trinta "parados" que são o mês passado inteiro.
 *   • **Fila ordenada pelo mais novo.** É a ordem errada: quem precisa da fila
 *     quer o mais esquecido no topo, não o mais recente.
 *   • **Contadores discordando dos cartões.** Se o contador do topo usar uma
 *     regra e o cartão usar outra, "Sem dono: 2" convive com zero cartão
 *     marcado — e a tela perde a credibilidade inteira.
 */
import { describe, it, expect } from 'vitest';
import type { Ticket } from '@/services/tickets.service';
import {
  contarSegmentos, filtrarFila, ordenarFila, agruparFila, estaParado,
  temperatura, tempoSemMovimento, textoDeIdade, pertenceAoSegmento,
  CRITERIOS_VAZIOS, LIMITE_PARADO_MS,
} from './fila';

const AGORA = Date.parse('2026-08-23T12:00:00Z');
const HORA = 60 * 60 * 1000;

let sequencia = 0;

function ticket(p: Partial<Ticket> = {}): Ticket {
  sequencia += 1;
  return {
    id: `t${sequencia}`,
    numero: sequencia,
    empresaId: 'emp-1',
    setorId: null,
    abertoPor: 'u1',
    abertoPorNome: 'Ana',
    categoria: 'erro_sistema',
    assunto: 'Assunto',
    descricao: null,
    prioridade: 'normal',
    status: 'aberto',
    responsavelId: null,
    responsavelNome: null,
    campos: {},
    criadoEm: new Date(AGORA - HORA).toISOString(),
    atualizadoEm: new Date(AGORA - HORA).toISOString(),
    fechadoEm: null,
    ...p,
  };
}

/** Ticket cujo último movimento foi há `horas`. */
function paradoHa(horas: number, p: Partial<Ticket> = {}): Ticket {
  const carimbo = new Date(AGORA - horas * HORA).toISOString();
  return ticket({ criadoEm: carimbo, atualizadoEm: carimbo, ...p });
}

// ── Envelhecimento ───────────────────────────────────────────────────────────

describe('tempoSemMovimento', () => {
  it('conta a partir do último movimento, não da abertura', () => {
    const t = ticket({
      criadoEm:     new Date(AGORA - 20 * HORA).toISOString(),
      atualizadoEm: new Date(AGORA - 2 * HORA).toISOString(),
    });
    expect(tempoSemMovimento(t, AGORA)).toBe(2 * HORA);
  });

  it('cai para a abertura quando não há carimbo de atualização', () => {
    const t = ticket({ atualizadoEm: '', criadoEm: new Date(AGORA - 3 * HORA).toISOString() });
    expect(tempoSemMovimento(t, AGORA)).toBe(3 * HORA);
  });

  it('data inválida vale zero em vez de NaN espalhando pela tela', () => {
    expect(tempoSemMovimento(ticket({ atualizadoEm: 'nada disso', criadoEm: 'nada' }), AGORA)).toBe(0);
  });
});

describe('estaParado', () => {
  it('urgente passa a parado em 2 h; normal, não', () => {
    expect(estaParado(paradoHa(3, { prioridade: 'urgente' }), AGORA)).toBe(true);
    expect(estaParado(paradoHa(3, { prioridade: 'normal' }),  AGORA)).toBe(false);
  });

  it('cada prioridade tem o próprio limite', () => {
    for (const [prioridade, limite] of Object.entries(LIMITE_PARADO_MS)) {
      const dentro = ticket({
        prioridade: prioridade as Ticket['prioridade'],
        atualizadoEm: new Date(AGORA - limite + 1000).toISOString(),
      });
      const fora = ticket({
        prioridade: prioridade as Ticket['prioridade'],
        atualizadoEm: new Date(AGORA - limite - 1000).toISOString(),
      });
      expect(estaParado(dentro, AGORA)).toBe(false);
      expect(estaParado(fora, AGORA)).toBe(true);
    }
  });

  it('ticket ENCERRADO nunca está parado — ele chegou onde ia', () => {
    const velho = paradoHa(500, { status: 'concluido', prioridade: 'urgente' });
    expect(estaParado(velho, AGORA)).toBe(false);
    expect(estaParado(paradoHa(500, { status: 'cancelado' }), AGORA)).toBe(false);
    expect(estaParado(paradoHa(500, { status: 'recusado' }),  AGORA)).toBe(false);
  });
});

describe('temperatura', () => {
  it('avisa antes de estourar, não depois', () => {
    // Normal vence em 24 h; a atenção começa em 16 h.
    expect(temperatura(paradoHa(1),  AGORA)).toBe('em_dia');
    expect(temperatura(paradoHa(20), AGORA)).toBe('atencao');
    expect(temperatura(paradoHa(30), AGORA)).toBe('parado');
  });

  it('encerrado é sempre frio', () => {
    expect(temperatura(paradoHa(900, { status: 'concluido' }), AGORA)).toBe('em_dia');
  });
});

// ── Segmentos ────────────────────────────────────────────────────────────────

describe('contarSegmentos', () => {
  it('conta o que cada segmento promete', () => {
    const lista = [
      paradoHa(1,  { status: 'aberto' }),                                  // fila, sem dono
      paradoHa(1,  { status: 'em_andamento', responsavelId: 'eu' }),        // fila, meus
      paradoHa(50, { status: 'em_andamento', responsavelId: 'outro' }),     // fila, parado
      paradoHa(1,  { status: 'concluido' }),                               // encerrado
      paradoHa(1,  { status: 'cancelado' }),                               // encerrado
    ];
    expect(contarSegmentos(lista, 'eu', AGORA)).toEqual({
      todos: 5, fila: 3, meus: 1, sem_dono: 1, parados: 1, encerrados: 2,
    });
  });

  it('sem usuário logado, "Comigo" é zero e não explode', () => {
    const lista = [ticket({ responsavelId: 'alguem' })];
    expect(contarSegmentos(lista, null, AGORA).meus).toBe(0);
  });

  it('lista vazia devolve todos os segmentos zerados', () => {
    expect(contarSegmentos([], 'eu', AGORA)).toEqual({
      todos: 0, fila: 0, meus: 0, sem_dono: 0, parados: 0, encerrados: 0,
    });
  });

  it('o contador concorda com o teste individual — a fonte é a mesma', () => {
    const lista = [
      paradoHa(50, { prioridade: 'urgente' }),
      paradoHa(1),
      paradoHa(100, { status: 'concluido' }),
    ];
    const conta = contarSegmentos(lista, 'eu', AGORA);
    const porItem = lista.filter(t => pertenceAoSegmento(t, 'parados', 'eu', AGORA)).length;
    expect(conta.parados).toBe(porItem);
  });
});

// ── Filtro ───────────────────────────────────────────────────────────────────

describe('filtrarFila', () => {
  const lista = [
    ticket({ numero: 101, assunto: 'Boleto não gera',  categoria: 'erro_sistema', prioridade: 'alta',    responsavelId: 'eu',    abertoPorNome: 'Ana'   }),
    ticket({ numero: 102, assunto: 'Senha do Marcos',  categoria: 'senha',        prioridade: 'normal',  responsavelId: null,    abertoPorNome: 'Bruno' }),
    ticket({ numero: 103, assunto: 'Acesso à aba',     categoria: 'acesso',       prioridade: 'urgente', responsavelId: 'outro', abertoPorNome: 'Ana', status: 'concluido' }),
  ];

  it('o segmento vem antes de tudo', () => {
    const r = filtrarFila(lista, { ...CRITERIOS_VAZIOS, segmento: 'encerrados' }, 'eu', AGORA);
    expect(r.map(t => t.numero)).toEqual([103]);
  });

  it('busca por número, com ou sem cerquilha', () => {
    const criterios = { ...CRITERIOS_VAZIOS, segmento: 'todos' as const };
    expect(filtrarFila(lista, { ...criterios, busca: '102' },  'eu', AGORA).map(t => t.numero)).toEqual([102]);
    expect(filtrarFila(lista, { ...criterios, busca: '#102' }, 'eu', AGORA).map(t => t.numero)).toEqual([102]);
  });

  it('busca por assunto e por quem abriu, sem diferenciar maiúscula', () => {
    const criterios = { ...CRITERIOS_VAZIOS, segmento: 'todos' as const };
    expect(filtrarFila(lista, { ...criterios, busca: 'BOLETO' }, 'eu', AGORA).map(t => t.numero)).toEqual([101]);
    expect(filtrarFila(lista, { ...criterios, busca: 'bruno' }, 'eu', AGORA).map(t => t.numero)).toEqual([102]);
  });

  it('busca na descrição — é onde mora o texto que a pessoa lembra', () => {
    const comDescricao = [ticket({ numero: 200, assunto: 'Outro', descricao: 'o PIX caiu duplicado' })];
    const r = filtrarFila(comDescricao, { ...CRITERIOS_VAZIOS, segmento: 'todos', busca: 'duplicado' }, 'eu', AGORA);
    expect(r).toHaveLength(1);
  });

  it('"ninguem" no responsável é o filtro de sem dono', () => {
    const r = filtrarFila(lista, { ...CRITERIOS_VAZIOS, segmento: 'todos', responsavel: 'ninguem' }, 'eu', AGORA);
    expect(r.map(t => t.numero)).toEqual([102]);
  });

  it('acumula critérios em vez de escolher um', () => {
    const r = filtrarFila(
      lista,
      { ...CRITERIOS_VAZIOS, segmento: 'todos', categoria: 'erro_sistema', prioridade: 'alta' },
      'eu', AGORA,
    );
    expect(r.map(t => t.numero)).toEqual([101]);
  });

  it('não devolve nada quando os critérios se contradizem', () => {
    const r = filtrarFila(
      lista,
      { ...CRITERIOS_VAZIOS, segmento: 'todos', categoria: 'senha', prioridade: 'urgente' },
      'eu', AGORA,
    );
    expect(r).toEqual([]);
  });
});

// ── Ordenação ────────────────────────────────────────────────────────────────

describe('ordenarFila', () => {
  it('urgência primeiro e, dentro dela, o mais esquecido no topo', () => {
    const lista = [
      paradoHa(1,  { numero: 1, prioridade: 'normal'  }),
      paradoHa(1,  { numero: 2, prioridade: 'urgente' }),
      paradoHa(10, { numero: 3, prioridade: 'urgente' }),
      paradoHa(1,  { numero: 4, prioridade: 'baixa'   }),
    ];
    expect(ordenarFila(lista, 'urgencia', AGORA).map(t => t.numero)).toEqual([3, 2, 1, 4]);
  });

  it('"parado há mais tempo" ignora a prioridade', () => {
    const lista = [
      paradoHa(1,  { numero: 1, prioridade: 'urgente' }),
      paradoHa(30, { numero: 2, prioridade: 'baixa'   }),
    ];
    expect(ordenarFila(lista, 'movimento', AGORA).map(t => t.numero)).toEqual([2, 1]);
  });

  it('recentes e antigos são espelhos, e olham para a ABERTURA', () => {
    const lista = [
      ticket({ numero: 1, criadoEm: new Date(AGORA - 5 * HORA).toISOString() }),
      ticket({ numero: 2, criadoEm: new Date(AGORA - 1 * HORA).toISOString() }),
    ];
    expect(ordenarFila(lista, 'recentes', AGORA).map(t => t.numero)).toEqual([2, 1]);
    expect(ordenarFila(lista, 'antigos',  AGORA).map(t => t.numero)).toEqual([1, 2]);
  });

  it('não muta a lista recebida — ela vem do estado do React', () => {
    const lista = [ticket({ numero: 1, prioridade: 'baixa' }), ticket({ numero: 2, prioridade: 'urgente' })];
    const antes = lista.map(t => t.numero);
    ordenarFila(lista, 'urgencia', AGORA);
    expect(lista.map(t => t.numero)).toEqual(antes);
  });
});

// ── Agrupamento ──────────────────────────────────────────────────────────────

describe('agruparFila', () => {
  it('sem agrupamento devolve um bloco só', () => {
    const lista = [ticket(), ticket()];
    const grupos = agruparFila(lista, 'nenhum');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].tickets).toHaveLength(2);
  });

  it('os grupos saem na ordem em que apareceram na fila já ordenada', () => {
    const lista = ordenarFila([
      paradoHa(1, { numero: 1, prioridade: 'normal'  }),
      paradoHa(1, { numero: 2, prioridade: 'urgente' }),
      paradoHa(1, { numero: 3, prioridade: 'normal'  }),
    ], 'urgencia', AGORA);
    const grupos = agruparFila(lista, 'prioridade');
    expect(grupos.map(g => g.chave)).toEqual(['urgente', 'normal']);
    expect(grupos[1].tickets).toHaveLength(2);
  });

  it('agrupa por estado sem perder ninguém', () => {
    const lista = [
      ticket({ status: 'aberto' }), ticket({ status: 'em_andamento' }), ticket({ status: 'aberto' }),
    ];
    const grupos = agruparFila(lista, 'status');
    expect(grupos.flatMap(g => g.tickets)).toHaveLength(3);
  });
});

// ── Texto ────────────────────────────────────────────────────────────────────

describe('textoDeIdade', () => {
  it('abaixo de um minuto não vira contador de segundos', () => {
    expect(textoDeIdade(30_000)).toBe('agora');
  });

  it('escala de minuto a mês', () => {
    expect(textoDeIdade(5 * 60_000)).toBe('há 5 min');
    expect(textoDeIdade(3 * HORA)).toBe('há 3 h');
    expect(textoDeIdade(2 * 24 * HORA)).toBe('há 2 d');
    expect(textoDeIdade(45 * 24 * HORA)).toBe('há 1 mês');
  });
});
