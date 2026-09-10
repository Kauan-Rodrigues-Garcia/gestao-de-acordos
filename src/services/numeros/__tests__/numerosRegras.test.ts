/**
 * As regras do Controle de Números, sem banco e sem tela.
 *
 * O que estes testes protegem: as TRANSIÇÕES. As mesmas perguntas são feitas em
 * três lugares — o botão da tela, o serviço antes de chamar a RPC, e a RPC
 * dentro do Postgres. Aqui elas respondem uma vez só, e o teste é o que impede
 * a tela oferecer uma ação que o banco vai recusar.
 *
 * O banco continua sendo a autoridade. Isto é o espelho dele em TypeScript.
 */
import { describe, it, expect } from 'vitest';
import {
  LIMITE_POR_CELULAR,
  SITUACOES,
  POSSES,
  MOTIVOS_RETORNO,
  SITUACAO_LABELS,
  MOTIVO_LABELS,
  cabeMaisNumero,
  vagasNoCelular,
  podeLiberarAoSetor,
  podeLancarAoOperador,
  podeDevolverALideranca,
  podeRelancarAoNucleo,
  motivoValido,
  ETIQUETAS,
  ETIQUETA_LABELS,
  ETIQUETA_DESCRICOES,
  TRATAMENTOS,
  TRATAMENTO_LABELS,
  etiquetaValida,
  etiquetasConhecidas,
  esperaTratamento,
  emTratamento,
  podeConcluirTratamento,
  foiLancadoAoSetor,
  podeCorrigirNumero,
  podeExcluirNumero,
  type EstadoNumero,
} from '../numerosRegras';

/** Um número no Núcleo, ainda aquecendo. É onde todo número começa. */
function numero(over: Partial<EstadoNumero> = {}): EstadoNumero {
  return { situacao: 'em_aquecimento', posse: 'nucleo', operadorId: null, ...over };
}

const noNucleoAtivo   = numero({ situacao: 'ativo' });
const noSetorLivre    = numero({ situacao: 'ativo', posse: 'setor' });
const comOperador     = numero({ situacao: 'ativo', posse: 'setor', operadorId: 'op-1' });

describe('o catálogo de estados', () => {
  it('tem só as três situações que a operação usa hoje', () => {
    expect(SITUACOES).toEqual(['em_aquecimento', 'ativo', 'banido']);
  });

  it('tem só os dois lugares onde um número pode estar', () => {
    expect(POSSES).toEqual(['nucleo', 'setor']);
  });

  it('rotula tudo em português, para a tela não montar texto', () => {
    for (const s of SITUACOES) expect(SITUACAO_LABELS[s]).toBeTruthy();
    for (const m of MOTIVOS_RETORNO) expect(MOTIVO_LABELS[m]).toBeTruthy();
  });
});

describe('limite de números por celular', () => {
  it('são seis', () => {
    expect(LIMITE_POR_CELULAR).toBe(6);
  });

  it('cabe até o sexto, não o sétimo', () => {
    expect(cabeMaisNumero(0)).toBe(true);
    expect(cabeMaisNumero(5)).toBe(true);
    expect(cabeMaisNumero(6)).toBe(false);
    expect(cabeMaisNumero(7)).toBe(false);
  });

  it('conta as vagas que sobram, sem devolver negativo', () => {
    expect(vagasNoCelular(0)).toBe(6);
    expect(vagasNoCelular(4)).toBe(2);
    expect(vagasNoCelular(6)).toBe(0);
    expect(vagasNoCelular(9)).toBe(0);
  });
});

describe('podeLiberarAoSetor', () => {
  it('libera número ativo que está no Núcleo', () => {
    expect(podeLiberarAoSetor(noNucleoAtivo)).toBe(true);
  });

  it('não libera quem ainda aquece nem quem foi banido', () => {
    expect(podeLiberarAoSetor(numero({ situacao: 'em_aquecimento' }))).toBe(false);
    expect(podeLiberarAoSetor(numero({ situacao: 'banido' }))).toBe(false);
  });

  it('não libera de novo quem já está no setor', () => {
    expect(podeLiberarAoSetor(noSetorLivre)).toBe(false);
  });
});

describe('podeLancarAoOperador', () => {
  it('lança número que já está no setor', () => {
    expect(podeLancarAoOperador(noSetorLivre)).toBe(true);
  });

  it('troca o operador de um número já lançado', () => {
    expect(podeLancarAoOperador(comOperador)).toBe(true);
  });

  it('não lança o que o Núcleo ainda não liberou', () => {
    expect(podeLancarAoOperador(noNucleoAtivo)).toBe(false);
  });

  it('não lança número banido', () => {
    // Ele está no setor, mas entregar um número banido a um operador é dar
    // trabalho que já se sabe que não vai funcionar. O caminho é relançar.
    expect(podeLancarAoOperador(numero({ situacao: 'banido', posse: 'setor' }))).toBe(false);
  });
});

describe('podeDevolverALideranca', () => {
  it('o dono devolve o próprio número', () => {
    expect(podeDevolverALideranca(comOperador, 'op-1')).toBe(true);
  });

  it('ninguém devolve número alheio', () => {
    expect(podeDevolverALideranca(comOperador, 'op-2')).toBe(false);
  });

  it('não há o que devolver quando ninguém está com ele', () => {
    expect(podeDevolverALideranca(noSetorLivre, 'op-1')).toBe(false);
  });

  it('número banido também é devolvido — é justamente o caso comum', () => {
    const banidoComOperador = numero({ situacao: 'banido', posse: 'setor', operadorId: 'op-1' });
    expect(podeDevolverALideranca(banidoComOperador, 'op-1')).toBe(true);
  });
});

describe('podeRelancarAoNucleo', () => {
  it('relança o que está no setor, com ou sem operador', () => {
    expect(podeRelancarAoNucleo(noSetorLivre)).toBe(true);
    expect(podeRelancarAoNucleo(comOperador)).toBe(true);
  });

  it('relança número banido — é o motivo de a ação existir', () => {
    expect(podeRelancarAoNucleo(numero({ situacao: 'banido', posse: 'setor' }))).toBe(true);
  });

  it('não relança o que já está no Núcleo', () => {
    expect(podeRelancarAoNucleo(noNucleoAtivo)).toBe(false);
  });
});

describe('motivoValido', () => {
  it('aceita os quatro motivos da lista', () => {
    for (const m of MOTIVOS_RETORNO) expect(motivoValido(m)).toBe(true);
  });

  it('recusa motivo em branco — o Núcleo precisa saber o que tratar', () => {
    expect(motivoValido('')).toBe(false);
    expect(motivoValido(null)).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
  });

  it('recusa motivo inventado', () => {
    expect(motivoValido('sumiu')).toBe(false);
  });
});

// ── O que a migration 20260910210000 acrescentou ────────────────────────────

/**
 * O número que voltou de um setor e ainda não foi tratado.
 *
 * Este é o estado que motivou a mudança inteira. Antes dela, `situacao` ficava
 * `ativo` mesmo com o setor dizendo «banido», e `podeLiberarAoSetor` respondia
 * SIM — o número podia ser remandado no mesmo minuto, sem ninguém tratar nada.
 */
const voltouPendente = numero({
  situacao: 'ativo', posse: 'nucleo', tratamento: 'pendente',
});
const voltouEmAndamento = numero({
  situacao: 'ativo', posse: 'nucleo', tratamento: 'em_andamento',
});

describe('as etiquetas operacionais', () => {
  it('a lista e os rótulos não se descolam', () => {
    for (const e of ETIQUETAS) {
      expect(ETIQUETA_LABELS[e], `rótulo de ${e}`).toBeTruthy();
      expect(ETIQUETA_DESCRICOES[e], `descrição de ${e}`).toBeTruthy();
    }
    expect(Object.keys(ETIQUETA_LABELS).sort()).toEqual([...ETIQUETAS].sort());
  });

  it('«Não chegou SMS» existe — é a que o pedido nomeou', () => {
    expect(ETIQUETAS).toContain('nao_chegou_sms');
  });

  it('não nasceram etiquetas que ninguém pediu', () => {
    expect(ETIQUETAS).toHaveLength(1);
  });

  it('nenhuma etiqueta duplica situação ou motivo de retorno', () => {
    // Duas colunas para o mesmo fato voltam a discordar — é o defeito que a
    // migration foi corrigir, e criar «etiqueta: banido» o traria de volta.
    const proibidos = [...SITUACOES, ...MOTIVOS_RETORNO] as readonly string[];
    for (const e of ETIQUETAS) expect(proibidos).not.toContain(e);
  });

  it('etiquetaValida recusa o que não está na lista', () => {
    expect(etiquetaValida('nao_chegou_sms')).toBe(true);
    expect(etiquetaValida('inventada')).toBe(false);
    expect(etiquetaValida(null)).toBe(false);
    expect(etiquetaValida(42)).toBe(false);
  });

  it('etiquetasConhecidas descarta o que esta versão não sabe nomear', () => {
    // Um deploy antigo lendo uma etiqueta nova pintaria um badge em branco.
    expect(etiquetasConhecidas(['nao_chegou_sms', 'etiqueta_do_futuro']))
      .toEqual(['nao_chegou_sms']);
  });

  it('etiquetasConhecidas não repete — o CHECK da coluna não cobre duplicata', () => {
    // «sem repetido» exige `unnest`, e subconsulta em CHECK o Postgres recusa.
    // A RPC normaliza antes de gravar; isto cobre o UPDATE direto.
    expect(etiquetasConhecidas(['nao_chegou_sms', 'nao_chegou_sms']))
      .toEqual(['nao_chegou_sms']);
  });

  it('etiquetasConhecidas aguenta o que vier do banco', () => {
    expect(etiquetasConhecidas(null)).toEqual([]);
    expect(etiquetasConhecidas(undefined)).toEqual([]);
    expect(etiquetasConhecidas([])).toEqual([]);
    expect(etiquetasConhecidas('nao_chegou_sms')).toEqual([]);
  });
});

describe('o tratamento do retorno', () => {
  it('a lista e os rótulos não se descolam', () => {
    expect(Object.keys(TRATAMENTO_LABELS).sort()).toEqual([...TRATAMENTOS].sort());
  });

  it('ausência de tratamento é o estado normal', () => {
    expect(esperaTratamento(noNucleoAtivo)).toBe(false);
    expect(emTratamento(noNucleoAtivo)).toBe(false);
    expect(podeConcluirTratamento(noNucleoAtivo)).toBe(false);
  });

  it('«pendente» é a fila: espera, e ainda não começou', () => {
    expect(esperaTratamento(voltouPendente)).toBe(true);
    expect(emTratamento(voltouPendente)).toBe(false);
  });

  it('«em andamento» saiu da fila', () => {
    expect(esperaTratamento(voltouEmAndamento)).toBe(false);
    expect(emTratamento(voltouEmAndamento)).toBe(true);
  });

  it('encerrar vale nos dois pés, sem obrigar a passar por «comecei»', () => {
    expect(podeConcluirTratamento(voltouPendente)).toBe(true);
    expect(podeConcluirTratamento(voltouEmAndamento)).toBe(true);
  });
});

describe('podeLiberarAoSetor — a trava que o tratamento acrescentou', () => {
  it('o número ativo e sem pendência continua liberável', () => {
    expect(podeLiberarAoSetor(noNucleoAtivo)).toBe(true);
  });

  it('NÃO libera o que voltou de um setor e não foi tratado', () => {
    // O caso do pedido: volta como «banido», a situação ainda diz `ativo`, e
    // sem esta trava o número ia de volta sem ninguém ter feito nada.
    expect(podeLiberarAoSetor(voltouPendente)).toBe(false);
    expect(podeLiberarAoSetor(voltouEmAndamento)).toBe(false);
  });

  it('tratamento ausente e tratamento nulo valem o mesmo', () => {
    expect(podeLiberarAoSetor(numero({ situacao: 'ativo' }))).toBe(true);
    expect(podeLiberarAoSetor(numero({ situacao: 'ativo', tratamento: null }))).toBe(true);
  });
});

describe('foiLancadoAoSetor — a base da diferença visual', () => {
  it('responde pela posse, e por nada mais', () => {
    expect(foiLancadoAoSetor(noNucleoAtivo)).toBe(false);
    expect(foiLancadoAoSetor(noSetorLivre)).toBe(true);
    expect(foiLancadoAoSetor(comOperador)).toBe(true);
  });
});

describe('corrigir e excluir um cadastro', () => {
  it('corrige o que está no Núcleo e sem dono', () => {
    expect(podeCorrigirNumero(noNucleoAtivo)).toBe(true);
    expect(podeCorrigirNumero(voltouPendente)).toBe(true);
  });

  it('não corrige o que já está com um setor', () => {
    // Trocar o número de um chip em uso mudaria, em silêncio, o que aparece na
    // tela de quem o está usando.
    expect(podeCorrigirNumero(noSetorLivre)).toBe(false);
    expect(podeCorrigirNumero(comOperador)).toBe(false);
  });

  it('exclui o que nunca saiu do Núcleo', () => {
    expect(podeExcluirNumero(noNucleoAtivo)).toBe(true);
  });

  it('não exclui o que está com um setor', () => {
    expect(podeExcluirNumero(noSetorLivre)).toBe(false);
    expect(podeExcluirNumero(comOperador)).toBe(false);
  });

  it('não exclui o que já circulou — apagar levaria a trilha junto', () => {
    expect(podeExcluirNumero(noNucleoAtivo, true)).toBe(false);
  });
});
