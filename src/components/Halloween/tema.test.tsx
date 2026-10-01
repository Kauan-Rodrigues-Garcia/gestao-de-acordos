import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ROUTE_PATHS } from '@/lib';
import { ComChapeu } from './Desenhos';
import { TemaHalloweenContext, cenaDaRota, indiceDaPessoa, temFundo } from './tema';
import { podeVerHalloween } from './preferencia';

describe('tema de Halloween', () => {
  it('por enquanto só o super_admin vê', () => {
    expect(podeVerHalloween('super_admin', false)).toBe(true);
    for (const p of ['administrador', 'diretoria', 'operador', null, undefined]) expect(podeVerHalloween(p, false)).toBe(false);
  });

  it('cada tela ganha só o que foi pedido', () => {
    expect(cenaDaRota(ROUTE_PATHS.DASHBOARD, false)).toMatchObject({ teias: 'ambas', aranha: true, chuva: true, nuvens: true, nevoa: false, lanterna: null });
    expect(cenaDaRota(ROUTE_PATHS.ACORDOS, false)).toMatchObject({ teias: 'esquerda', aranha: false, chuva: false, nevoa: true, fantasmas: true, lanterna: 32 });
    expect(cenaDaRota(ROUTE_PATHS.DASHBOARD, true)).toMatchObject({ teias: 'ambas', aranha: true, chuva: true, nuvens: false, nevoa: false, lanterna: 50 });
    expect(cenaDaRota(ROUTE_PATHS.ANALITICO, true)).toMatchObject({ teias: 'direita', olhos: true, chuva: false, lanterna: null });
    const outra = cenaDaRota(ROUTE_PATHS.ADMIN_USUARIOS, false);
    expect(outra.teias).toBeNull();
    expect(temFundo(outra)).toBe(false);
  });

  it('a cor do chapéu é da pessoa, não do acaso', () => {
    expect(indiceDaPessoa('Jéssica Martins', 5)).toBe(indiceDaPessoa('Jéssica Martins', 5));
    const cores = new Set(['Ana', 'Rafa', 'Bruna', 'Diego', 'Jéssica', 'Carla', 'Marcos'].map(n => indiceDaPessoa(n, 5)));
    expect(cores.size).toBeGreaterThan(1);
  });

  it('sem o tema a foto fica como estava; com ele ganha o chapéu', () => {
    const foto = <img alt="foto" />;
    const sem = render(<ComChapeu chave="Ana" tamanho={36}>{foto}</ComChapeu>);
    expect(sem.container.querySelector('.hw-chapeu')).toBeNull();
    const com = render(<TemaHalloweenContext.Provider value><ComChapeu chave="Ana" tamanho={36}>{foto}</ComChapeu></TemaHalloweenContext.Provider>);
    expect(com.container.querySelector('.hw-chapeu')).not.toBeNull();
    const miuda = render(<TemaHalloweenContext.Provider value><ComChapeu chave="Ana" tamanho={18}>{foto}</ComChapeu></TemaHalloweenContext.Provider>);
    expect(miuda.container.querySelector('.hw-chapeu')).toBeNull();
  });
});
