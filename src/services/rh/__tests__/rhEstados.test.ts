/**
 * A máquina de estados do RH e os estados derivados.
 *
 * O que estes testes protegem, em uma frase: **devolver um operador não pode
 * reprovar os outros**. É o requisito 15 do pedido e a razão de o estado de
 * equipe ser calculado em vez de guardado — uma coluna `status` na equipe
 * poderia ser marcada como reprovada por engano, e um `every`/`some` não pode.
 */
import { describe, it, expect } from 'vitest';
import {
  alcancou, editavel, resumirGrupo, estadoDoPrazo, diasEntreISO, rotuloValor,
  ESTADO_META, STATUS_LANCAMENTO, DIAS_PRAZO_PROXIMO,
  type StatusLancamento, type LinhaResumivel,
} from '../rhEstados';

function linha(status: StatusLancamento, valor: number | null = 100): LinhaResumivel {
  return { status, valor };
}

describe('a máquina', () => {
  it('todo status tem rótulo — nenhum aparece cru na tela', () => {
    for (const s of STATUS_LANCAMENTO) {
      expect(ESTADO_META[s], s).toBeTruthy();
      expect(ESTADO_META[s].label.length).toBeGreaterThan(0);
    }
  });

  it('avança na ordem do fluxo', () => {
    expect(alcancou('enviado_rh', 'preenchido')).toBe(true);
    expect(alcancou('preenchido', 'enviado_rh')).toBe(false);
  });

  it('devolvido NÃO alcançou nada — ele voltou', () => {
    // A distinção importa: sem ela, um devolvido contaria como "já passou por
    // preenchido" e a equipe apareceria concluída com uma pendência dentro.
    expect(alcancou('devolvido_rh', 'pendente')).toBe(false);
    expect(alcancou('devolvido_rh', 'preenchido')).toBe(false);
  });

  it('preenchido e concluído pelo líder são passos diferentes', () => {
    // Ter valor digitado não é a equipe estar conferida — requisito 8.
    expect(alcancou('preenchido', 'concluido_lider')).toBe(false);
    expect(alcancou('concluido_lider', 'preenchido')).toBe(true);
  });

  it('editável só enquanto está em mãos de quem preenche', () => {
    expect(editavel('pendente')).toBe(true);
    expect(editavel('preenchido')).toBe(true);
    expect(editavel('concluido_lider')).toBe(true);
    expect(editavel('devolvido_rh')).toBe(true);
    // Depois da conferência, mudar o valor por baixo é o que a devolução evita.
    expect(editavel('validado_gerencia')).toBe(false);
    expect(editavel('enviado_rh')).toBe(false);
    expect(editavel('aprovado_rh')).toBe(false);
  });
});

describe('resumirGrupo', () => {
  it('grupo vazio não é "não iniciado" — é vazio', () => {
    // São coisas diferentes: setor sem operadores não está atrasado.
    expect(resumirGrupo([]).estado).toBe('vazio');
  });

  it('ninguém preencheu: não iniciado', () => {
    expect(resumirGrupo([linha('pendente', null), linha('pendente', null)]).estado)
      .toBe('nao_iniciado');
  });

  it('alguns preenchidos: em preenchimento', () => {
    expect(resumirGrupo([linha('preenchido'), linha('pendente', null)]).estado)
      .toBe('em_preenchimento');
  });

  it('todos preenchidos ainda NÃO é concluído', () => {
    // Requisito 8: a conclusão é ato do líder, e não consequência do último
    // valor digitado.
    expect(resumirGrupo([linha('preenchido'), linha('preenchido')]).estado)
      .toBe('em_preenchimento');
  });

  it('todos concluídos pelo líder: concluído', () => {
    expect(resumirGrupo([linha('concluido_lider'), linha('concluido_lider')]).estado)
      .toBe('concluido');
  });

  it('UM devolvido no meio de aprovados vence tudo', () => {
    // O caso que o RH precisa enxergar de longe. Se a ordem das perguntas
    // mudasse, «9 aprovados e 1 devolvido» apareceria como aprovado.
    const g = resumirGrupo([
      linha('aprovado_rh'), linha('aprovado_rh'), linha('aprovado_rh'),
      linha('devolvido_rh'),
    ]);
    expect(g.estado).toBe('com_devolucao');
    expect(g.devolvidos).toBe(1);
    expect(g.aprovados).toBe(3);
  });

  it('devolver um operador não muda o status dos outros', () => {
    // Prova do requisito 15 no nível da leitura: os três aprovados continuam
    // aprovados, e é isso que a tela mostra.
    const linhas = [linha('aprovado_rh'), linha('aprovado_rh'), linha('devolvido_rh')];
    expect(linhas.filter(l => l.status === 'aprovado_rh')).toHaveLength(2);
    expect(resumirGrupo(linhas).aprovados).toBe(2);
  });

  it('soma só o que tem valor', () => {
    const g = resumirGrupo([linha('preenchido', 450), linha('pendente', null), linha('preenchido', 50)]);
    expect(g.valorTotal).toBe(500);
    expect(g.pendentes).toBe(1);
  });

  it('um enviado e um validado ainda não é enviado', () => {
    expect(resumirGrupo([linha('enviado_rh'), linha('validado_gerencia')]).estado)
      .toBe('validado');
  });
});

describe('prazo', () => {
  it('quem já enviou não vê alerta de prazo vencido', () => {
    expect(estadoDoPrazo('2026-09-02', '2026-09-20', true)).toBe('enviado');
  });

  it('sem prazo definido é um estado próprio, não "dentro"', () => {
    expect(estadoDoPrazo(null, '2026-09-01', false)).toBe('sem_prazo');
  });

  it('depois da data: encerrado', () => {
    expect(estadoDoPrazo('2026-09-02', '2026-09-03', false)).toBe('encerrado');
  });

  it('no próprio dia do prazo ainda está no prazo', () => {
    // O prazo é «até 02/09», e não «até 01/09». Comparar como texto evita o
    // deslocamento de fuso que anteciparia o vencimento em três horas.
    expect(estadoDoPrazo('2026-09-02', '2026-09-02', false)).toBe('proximo');
  });

  it('faltando pouco: próximo', () => {
    expect(estadoDoPrazo('2026-09-10', '2026-09-09', false)).toBe('proximo');
    // Zero à esquerda importa: a comparação é de TEXTO ISO, e '2026-09-8'
    // ordenaria depois de '2026-09-10'. Todo chamador passa data do banco ou de
    // `getTodayISO`, que já vêm com dois dígitos.
    const limite = String(10 - DIAS_PRAZO_PROXIMO).padStart(2, '0');
    expect(estadoDoPrazo('2026-09-10', `2026-09-${limite}`, false)).toBe('proximo');
  });

  it('com folga: dentro', () => {
    expect(estadoDoPrazo('2026-09-30', '2026-09-01', false)).toBe('dentro');
  });

  it('conta dias sem passar por fuso', () => {
    expect(diasEntreISO('2026-09-01', '2026-09-03')).toBe(2);
    expect(diasEntreISO('2026-09-03', '2026-09-01')).toBe(-2);
    // Virada de mês e de ano.
    expect(diasEntreISO('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('rótulo do valor', () => {
  it('sai da configuração do setor, e não de um if por nome', () => {
    expect(rotuloValor('premiacao')).toBe('Premiação');
    expect(rotuloValor('comissao')).toBe('Comissão');
  });

  it('tipo desconhecido cai em Premiação em vez de quebrar', () => {
    expect(rotuloValor(null)).toBe('Premiação');
  });
});
