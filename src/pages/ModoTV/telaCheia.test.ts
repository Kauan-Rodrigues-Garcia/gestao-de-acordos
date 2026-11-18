import { describe, it, expect } from 'vitest';
import { atalhoDaTv } from './telaCheia';

describe('atalho da TV (tela cheia sem F11)', () => {
  const bat = atalhoDaTv('https://app.gestaodeacordos.com.br');

  it('abre o /tv do endereço certo em modo quiosque', () => {
    expect(bat).toContain('set "URL=https://app.gestaodeacordos.com.br/#/tv"');
    expect(bat).toContain('--kiosk');
    expect(bat).toContain('start "" chrome %FLAGS% "%URL%"');
  });

  it('sem Chrome, cai no Edge em tela cheia', () => {
    expect(bat).toContain('start "" msedge %FLAGS% --edge-kiosk-type=fullscreen "%URL%"');
  });

  it('não troca de perfil: o token do pareamento continua valendo', () => {
    expect(bat).not.toContain('--user-data-dir');
  });

  it('é .bat do Windows: linhas com CRLF', () => {
    expect(bat.split('\r\n').length).toBeGreaterThan(5);
    expect(bat.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
