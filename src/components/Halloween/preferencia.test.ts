import { describe, expect, it } from 'vitest';
import {
  pediuBoasVindasNaUrl, podeVerHalloween, resolverHalloween, temporadaHalloween,
} from './preferencia';
import { mesQuePassou, primeiroNome } from './textosBoasVindas';

const base = {
  temporada: true, podeVer: true,
  localDesligado: null, localBoasVindas: null,
  perfilDesligado: null, perfilBoasVindas: null,
};

describe('quem vê o Halloween', () => {
  it('antes da liberação, só o super_admin; depois, todo mundo', () => {
    expect(podeVerHalloween('super_admin', false)).toBe(true);
    expect(podeVerHalloween('operador', false)).toBe(false);
    expect(podeVerHalloween('operador', true)).toBe(true);
  });

  it('a temporada é outubro', () => {
    expect(temporadaHalloween('2026-10-01')).toBe(true);
    expect(temporadaHalloween('2026-10-31')).toBe(true);
    expect(temporadaHalloween('2026-11-01')).toBe(false);
    expect(temporadaHalloween('2026-09-30')).toBe(false);
  });

  it('fora da temporada, ou sem poder ver, nada liga e nada aparece', () => {
    for (const r of [
      resolverHalloween({ ...base, temporada: false }),
      resolverHalloween({ ...base, podeVer: false }),
    ]) {
      expect(r).toMatchObject({ disponivel: false, ligado: false, boasVindasPendentes: false });
    }
  });

  it('primeira vez na temporada: ligado e com a mensagem pendente', () => {
    expect(resolverHalloween(base)).toMatchObject({ disponivel: true, ligado: true, boasVindasPendentes: true });
  });

  it('a mensagem é uma vez só — vale o navegador ou o perfil', () => {
    expect(resolverHalloween({ ...base, localBoasVindas: '2026-10-01T09:00:00Z' }).boasVindasPendentes).toBe(false);
    expect(resolverHalloween({ ...base, perfilBoasVindas: '2026-10-01T09:00:00Z' }).boasVindasPendentes).toBe(false);
  });

  it('desligou: some o tema e a mensagem, mas o interruptor continua disponível', () => {
    const r = resolverHalloween({ ...base, perfilDesligado: true });
    expect(r).toMatchObject({ disponivel: true, desligado: true, ligado: false, boasVindasPendentes: false });
  });

  it('a escolha desta máquina vence a do perfil (é a mais recente)', () => {
    expect(resolverHalloween({ ...base, perfilDesligado: true, localDesligado: '0' }).ligado).toBe(true);
    expect(resolverHalloween({ ...base, perfilDesligado: false, localDesligado: '1' }).ligado).toBe(false);
  });

  it('?hw-boas-vindas reabre a mensagem para validar', () => {
    expect(pediuBoasVindasNaUrl('?hw-boas-vindas')).toBe(true);
    expect(pediuBoasVindasNaUrl('?x=1&hw-boas-vindas=1')).toBe(true);
    expect(pediuBoasVindasNaUrl('')).toBe(false);
  });
});

describe('textos da mensagem', () => {
  it('o mês que passou, pelo mês corrente', () => {
    expect(mesQuePassou('2026-10')).toBe('Setembro');
    expect(mesQuePassou('2027-01')).toBe('Dezembro');
  });

  it('só o primeiro nome, com a inicial maiúscula', () => {
    expect(primeiroNome('ANA PAULA SOUZA')).toBe('Ana');
    expect(primeiroNome('  kauan rodrigues ')).toBe('Kauan');
    expect(primeiroNome('')).toBeNull();
    expect(primeiroNome(null)).toBeNull();
  });
});
