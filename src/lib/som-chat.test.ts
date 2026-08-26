import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetarSomChat, prepararSomChat, tocarSomChat } from './som-chat';

const AudioOriginal = globalThis.Audio;
let criado: { src: string; play: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> } | null;

beforeEach(() => {
  __resetarSomChat();
  criado = null;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-26T16:00:00Z'));
  (globalThis as Record<string, unknown>).Audio = function (src: string) {
    criado = {
      src,
      play: vi.fn(() => Promise.resolve()),
      load: vi.fn(),
      volume: 1,
      currentTime: 0,
      preload: '',
      addEventListener: vi.fn(),
    } as never;
    return criado;
  } as unknown as typeof Audio;
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as Record<string, unknown>).Audio = AudioOriginal;
  __resetarSomChat();
});

describe('som exclusivo do chat', () => {
  it('prepara e toca o arquivo escolhido sem usar o som comum', () => {
    prepararSomChat();
    expect(criado?.src).toBe('/sounds/chat-notificacao.mp3');
    expect(criado?.load).toHaveBeenCalledTimes(1);

    tocarSomChat();
    expect(criado?.play).toHaveBeenCalledTimes(1);
  });

  it('não sobrepõe o áudio numa rajada', () => {
    tocarSomChat();
    tocarSomChat();
    expect(criado?.play).toHaveBeenCalledTimes(1);
  });
});
