/**
 * O recorte por SETOR saiu do menu e das rotas — e não volta por acidente.
 *
 * Entre 10 e 11/09/2026 o menu (`NavItem.nucleo`) e as rotas
 * (`ProtectedRoute nucleo`) recortavam abas pelo setor Núcleo de Inteligência e
 * Gestão, porque quem trabalhava lá tinha cargo da cobrança — operador, líder — e
 * herdava a cobrança inteira. O Núcleo ganhou cargo próprio, `assistente_adm`,
 * sem as chaves da cobrança, e o que cada pessoa enxerga voltou a sair só do
 * painel de permissões.
 *
 * Duas réguas para a mesma decisão foi o que fez o recorte tirar Controle de
 * Números do super_admin sem ninguém perceber. Este teste trava que a segunda
 * régua não reaparece, nem no menu nem numa rota.
 *
 * Lê o texto de `App.tsx` pelo mesmo motivo de antes: as rotas moram em JSX, e
 * não numa estrutura que dê para importar.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NAV_ITEMS } from './menuLateral';

const APP = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
const GUARDA = fs.readFileSync(path.resolve(__dirname, '../components/ProtectedRoute.tsx'), 'utf8');

describe('o recorte por setor saiu', () => {
  it('nenhum item do menu carrega marca de setor', () => {
    for (const item of NAV_ITEMS) {
      expect(Object.keys(item), `${item.label} voltou a ter marca de setor`).not.toContain('nucleo');
    }
  });

  it('nenhuma rota carrega a marca', () => {
    expect(APP).not.toMatch(/nucleo="(so|fora)"/);
  });

  it('o guarda de rota não pergunta o setor', () => {
    expect(GUARDA).not.toContain('useNucleo');
  });

  it('nem a porta de entrada pergunta o setor — a chave manda', () => {
    // Até 11/09/2026 `/` desenhava o painel do Núcleo para quem estava no setor
    // (`useNucleo`). O painel virou a aba Dashboard – ADM, e quem não tem o
    // Dashboard da cobrança mas tem a aba nova é mandado para ela pela CHAVE.
    expect(APP).not.toContain('useNucleo');
    expect(APP).toMatch(/alternativa=\{\{\s*permissao: 'ver_dashboard_adm'/);
  });

  it('Controle de Números, Meus Chips e Dashboard – ADM são abertos pela chave, como toda aba', () => {
    for (const label of ['Controle de Números', 'Meus Chips', 'Dashboard – ADM']) {
      const item = NAV_ITEMS.find(i => i.label === label);
      expect(item?.permissaoKey, `${label} sem chave`).toBeTruthy();
    }
  });
});
