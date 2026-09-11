/**
 * O cargo do Núcleo, do lado da tela.
 *
 * A trava de verdade é `fn_perfis_cargo_do_nucleo`, no banco
 * (`assistenteAdm.sql.test.ts` confere que ela está escrita). Estes testes
 * travam o ESPELHO: o cadastro e a transferência precisam oferecer só o que o
 * banco aceita, porque no cadastro a recusa dele chega como «Database error» e
 * não diz a ninguém o que fazer.
 */
import { describe, it, expect } from 'vitest';
import {
  CARGO_DO_NUCLEO, CARGOS_FORA_DO_NUCLEO,
  motivoCargoForaDoSetor, cargoCabeNoSetor,
  aoTrocarCargo, aoTrocarSetor, ajusteDeCargoNaTransferencia,
} from '../cargoDoNucleo';
import type { PerfilUsuario } from '@/lib/supabase';

const NUCLEO = 'setor-nucleo';
const PLAY = 'setor-play';
const SETORES = [{ id: NUCLEO }, { id: PLAY }];

function form(perfil: PerfilUsuario, setor_id: string) {
  return { nome: 'Ana', perfil, setor_id };
}

describe('onde cada cargo pode ser gravado', () => {
  it('Assistente ADM só no Núcleo', () => {
    expect(cargoCabeNoSetor(CARGO_DO_NUCLEO, NUCLEO, NUCLEO)).toBe(true);
    expect(cargoCabeNoSetor(CARGO_DO_NUCLEO, PLAY, NUCLEO)).toBe(false);
    expect(cargoCabeNoSetor(CARGO_DO_NUCLEO, null, NUCLEO)).toBe(false);
  });

  it('o Núcleo recusa cargo comum', () => {
    for (const cargo of ['operador', 'lider', 'gerencia', 'rh']) {
      expect(cargoCabeNoSetor(cargo, NUCLEO, NUCLEO), cargo).toBe(false);
      expect(cargoCabeNoSetor(cargo, PLAY, NUCLEO), cargo).toBe(true);
    }
  });

  it('acesso total atravessa nos dois sentidos', () => {
    for (const cargo of ['administrador', 'super_admin']) {
      expect(cargoCabeNoSetor(cargo, NUCLEO, NUCLEO), cargo).toBe(true);
      expect(cargoCabeNoSetor(cargo, PLAY, NUCLEO), cargo).toBe(true);
    }
  });

  it('a cúpula grava sem setor, e sem setor não está no Núcleo', () => {
    expect(cargoCabeNoSetor('diretoria', null, NUCLEO)).toBe(true);
  });

  it('sem Núcleo configurado, o Assistente ADM é recusado com o motivo certo', () => {
    expect(motivoCargoForaDoSetor(CARGO_DO_NUCLEO, PLAY, null)).toMatch(/não tem o Núcleo configurado/);
  });

  it('sem Núcleo configurado, nenhum cargo comum é barrado', () => {
    expect(cargoCabeNoSetor('operador', PLAY, null)).toBe(true);
  });

  it('as frases dizem o que fazer, e são as da trigger', () => {
    expect(motivoCargoForaDoSetor(CARGO_DO_NUCLEO, PLAY, NUCLEO))
      .toBe('Assistente ADM só pode estar no setor Núcleo de Inteligência e Gestão.');
    expect(motivoCargoForaDoSetor('operador', NUCLEO, NUCLEO))
      .toBe('O setor Núcleo de Inteligência e Gestão só aceita o cargo Assistente ADM.');
  });
});

describe('o formulário de cadastro fica coerente sozinho', () => {
  const ctx = { setorNucleoId: NUCLEO, setores: SETORES };

  it('virar Assistente ADM leva o setor para o Núcleo', () => {
    expect(aoTrocarCargo(form('operador', PLAY), CARGO_DO_NUCLEO, ctx))
      .toEqual(form(CARGO_DO_NUCLEO, NUCLEO));
  });

  it('deixar de ser Assistente ADM tira do Núcleo — o cargo novo não cabe lá', () => {
    expect(aoTrocarCargo(form(CARGO_DO_NUCLEO, NUCLEO), 'operador', ctx))
      .toEqual(form('operador', PLAY));
  });

  it('virar administrador no Núcleo não mexe no setor', () => {
    expect(aoTrocarCargo(form(CARGO_DO_NUCLEO, NUCLEO), 'administrador', ctx))
      .toEqual(form('administrador', NUCLEO));
  });

  it('trocar entre cargos comuns fora do Núcleo não mexe no setor', () => {
    expect(aoTrocarCargo(form('operador', PLAY), 'lider', ctx)).toEqual(form('lider', PLAY));
  });

  it('sem Núcleo configurado, escolher Assistente ADM não inventa setor', () => {
    expect(aoTrocarCargo(form('operador', PLAY), CARGO_DO_NUCLEO, { setorNucleoId: null, setores: SETORES }))
      .toEqual(form(CARGO_DO_NUCLEO, PLAY));
  });

  it('escolher o Núcleo põe o cargo em Assistente ADM', () => {
    expect(aoTrocarSetor(form('operador', PLAY), NUCLEO, ctx)).toEqual(form(CARGO_DO_NUCLEO, NUCLEO));
  });

  it('escolher o Núcleo sendo administrador mantém o cargo', () => {
    expect(aoTrocarSetor(form('administrador', PLAY), NUCLEO, ctx)).toEqual(form('administrador', NUCLEO));
  });

  it('escolher outro setor não mexe no cargo', () => {
    expect(aoTrocarSetor(form('operador', NUCLEO), PLAY, ctx)).toEqual(form('operador', PLAY));
  });
});

describe('a transferência troca o cargo junto quando atravessa o Núcleo', () => {
  it('quem entra no Núcleo vira Assistente ADM', () => {
    expect(ajusteDeCargoNaTransferencia('operador', NUCLEO, NUCLEO)).toBe(CARGO_DO_NUCLEO);
  });

  it('quem sai do Núcleo precisa de um cargo escolhido', () => {
    expect(ajusteDeCargoNaTransferencia(CARGO_DO_NUCLEO, PLAY, NUCLEO)).toBe('escolher');
  });

  it('a transferência comum não toca no cargo', () => {
    expect(ajusteDeCargoNaTransferencia('operador', PLAY, NUCLEO)).toBe('manter');
    expect(ajusteDeCargoNaTransferencia('administrador', NUCLEO, NUCLEO)).toBe('manter');
  });

  it('sem Núcleo configurado, ninguém troca de cargo', () => {
    expect(ajusteDeCargoNaTransferencia('operador', PLAY, null)).toBe('manter');
  });

  it('os cargos de quem sai são de setor: nem o do Núcleo, nem a cúpula', () => {
    expect(CARGOS_FORA_DO_NUCLEO).not.toContain(CARGO_DO_NUCLEO);
    for (const cupula of ['administrador', 'super_admin', 'diretoria']) {
      expect(CARGOS_FORA_DO_NUCLEO as readonly string[]).not.toContain(cupula);
    }
    for (const c of CARGOS_FORA_DO_NUCLEO) {
      expect(cargoCabeNoSetor(c, PLAY, NUCLEO), c).toBe(true);
    }
  });
});
