import handler, { condicaoDoSimbolo, previsaoDoMet, segundosDeGuarda, type RespostaMet } from '../../api/clima';

function respostaFake() {
  const state = { statusCode: 200, body: null as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { state.headers[name] = value; },
    status(code: number) { state.statusCode = code; return res; },
    json(data: unknown) { state.body = data; },
  };
  return { state, res };
}

const HORA = 60 * 60 * 1000;
/** 06/11/2026 14:30 em Brasília. */
const AGORA = Date.parse('2026-11-06T17:30:00Z');

/**
 * Um MET de mentira com a forma do de verdade: de hora em hora até o fim do
 * dia 08 (horário de Brasília), depois de seis em seis até o dia 13.
 */
function metDeExemplo(): RespostaMet {
  const timeseries: RespostaMet['properties']['timeseries'] = [];
  const inicio = Date.parse('2026-11-06T17:00:00Z');
  const fimHorario = Date.parse('2026-11-09T03:00:00Z');
  for (let t = inicio; t < fimHorario; t += HORA) {
    const local = new Date(t - 3 * HORA);
    const dia = local.getUTCDate();
    const h = local.getUTCHours();
    timeseries.push({
      time: new Date(t).toISOString(),
      data: {
        instant: { details: { air_temperature: 20 + (h >= 10 && h <= 16 ? 12 : 0) + (dia - 6), apparent_air_temperature: 35, relative_humidity: 47.3, wind_speed: 3.2 } },
        // Dia 07 com temporal à tarde; os outros, sol de dia e céu limpo de noite.
        next_1_hours: {
          summary: { symbol_code: dia === 7 && h >= 14 && h < 18 ? 'heavyrainandthunder' : (h >= 6 && h < 18 ? 'clearsky_day' : 'clearsky_night') },
          details: { precipitation_amount: dia === 7 && h >= 14 && h < 18 ? 4 : 0 },
        },
        next_6_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 99, air_temperature_max: 33, air_temperature_min: 19 } },
      },
    });
  }
  for (let t = fimHorario; t < Date.parse('2026-11-14T03:00:00Z'); t += 6 * HORA) {
    timeseries.push({
      time: new Date(t).toISOString(),
      data: {
        instant: { details: { air_temperature: 22 } },
        next_6_hours: { summary: { symbol_code: 'lightrain' }, details: { precipitation_amount: 0.1, air_temperature_max: 28, air_temperature_min: 18 } },
      },
    });
  }
  return { properties: { timeseries } };
}

describe('condicaoDoSimbolo', () => {
  it.each([
    ['clearsky_day', 'limpo'],
    ['clearsky_night', 'limpo'],
    ['fair_day', 'poucas_nuvens'],
    ['partlycloudy_night', 'poucas_nuvens'],
    ['cloudy', 'nublado'],
    ['fog', 'neblina'],
    ['lightrain', 'garoa'],
    ['lightrainshowers_day', 'garoa'],
    ['rain', 'chuva'],
    ['rainshowers_night', 'chuva'],
    ['heavyrain', 'chuva_forte'],
    ['heavyrainshowers_day', 'chuva_forte'],
    ['rainandthunder', 'tempestade'],
    ['heavyrainshowersandthunder_night', 'tempestade'],
    ['snow', 'chuva'],
    [undefined, 'limpo'],
  ])('%s vira %s', (simbolo, esperado) => {
    expect(condicaoDoSimbolo(simbolo)).toBe(esperado);
  });
});

describe('previsaoDoMet', () => {
  it('monta o agora da hora corrente', () => {
    const p = previsaoDoMet(metDeExemplo(), AGORA)!;
    expect(p.agora).toEqual({ temp: 32, sensacao: 35, condicao: 'limpo', noite: false, umidade: 47, vento: 12 });
  });

  it('dá seis dias, hoje primeiro, pelo horário de Brasília', () => {
    const p = previsaoDoMet(metDeExemplo(), AGORA)!;
    expect(p.dias.map(d => d.data)).toEqual([
      '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11',
    ]);
  });

  it('conta cada período uma vez só: o de seis horas de um passo horário não soma chuva', () => {
    const p = previsaoDoMet(metDeExemplo(), AGORA)!;
    const dia7 = p.dias[1];
    expect(dia7.chuvaMm).toBe(16);
    expect(dia7.condicao).toBe('tempestade');
    expect(p.dias[0].chuvaMm).toBe(0);
    expect(p.dias[0].condicao).toBe('limpo');
  });

  it('chuva de menos de 1 mm no dia não pinta o dia de chuvoso', () => {
    const p = previsaoDoMet(metDeExemplo(), AGORA)!;
    const dia10 = p.dias.find(d => d.data === '2026-11-10')!;
    expect(dia10.chuvaMm).toBeLessThan(1);
    expect(dia10.condicao).toBe('nublado');
  });

  it('máxima e mínima incluem as de seis horas', () => {
    const p = previsaoDoMet(metDeExemplo(), AGORA)!;
    expect(p.dias[0].max).toBe(33);
    expect(p.dias[0].min).toBe(19);
  });

  it('noite pelo símbolo, ou pela hora quando o símbolo não diz', () => {
    const met = metDeExemplo();
    const noite = Date.parse('2026-11-06T23:30:00Z'); // 20:30
    expect(previsaoDoMet(met, noite)!.agora.noite).toBe(true);
    met.properties.timeseries.forEach(t => { if (t.data.next_1_hours) t.data.next_1_hours.summary = { symbol_code: 'cloudy' }; });
    expect(previsaoDoMet(met, noite)!.agora.noite).toBe(true);
    expect(previsaoDoMet(met, AGORA)!.agora.noite).toBe(false);
  });

  it('sem passos: null', () => {
    expect(previsaoDoMet({ properties: { timeseries: [] } }, AGORA)).toBeNull();
  });
});

describe('segundosDeGuarda', () => {
  const MIN = 60 * 1000;
  it('guarda até o Expires mais cedo das cidades', () => {
    expect(segundosDeGuarda([AGORA + 31 * MIN, AGORA + 12 * MIN], AGORA)).toBe(12 * 60);
  });
  it('sem Expires: 30 minutos', () => {
    expect(segundosDeGuarda([], AGORA)).toBe(1800);
    expect(segundosDeGuarda([null], AGORA)).toBe(1800);
  });
  it('Expires vencido: 1 minuto; muito longe: 60 minutos', () => {
    expect(segundosDeGuarda([AGORA - 5 * MIN], AGORA)).toBe(60);
    expect(segundosDeGuarda([AGORA + 5 * 60 * MIN], AGORA)).toBe(3600);
  });
});

describe('/api/clima', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('busca as duas cidades no MET, com identificação, e guarda 30 min na CDN', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(metDeExemplo()), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({ method: 'GET' }, res);

    expect(state.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.every(u => u.startsWith('https://api.met.no/weatherapi/locationforecast/2.0/complete?'))).toBe(true);
    expect(urls.some(u => u.includes('lat=-21.2889'))).toBe(true);
    expect(urls.some(u => u.includes('lat=-22.2139'))).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^GestaoDeAcordos\//);
    expect(state.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=1800, stale-while-revalidate=3600');
    expect(state.body).toMatchObject({
      fonte: 'MET Norway',
      cidades: { birigui: { agora: { temp: 32 } }, marilia: { agora: { temp: 32 } } },
    });
  });

  it('a CDN guarda até o MET liberar a próxima (Expires)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    const expira = new Date(AGORA + 17 * 60 * 1000).toUTCString();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(metDeExemplo()), { status: 200, headers: { Expires: expira } }),
    )));
    const { state, res } = respostaFake();

    await handler({ method: 'GET' }, res);

    expect(state.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=1020, stale-while-revalidate=3600');
  });

  it('uma cidade falhando: a outra sai, e a CDN guarda pouco', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(metDeExemplo()), { status: 200 }))
      .mockResolvedValueOnce(new Response('erro', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const { state, res } = respostaFake();

    await handler({ method: 'GET' }, res);

    expect(state.statusCode).toBe(200);
    expect(state.headers['Cache-Control']).toContain('s-maxage=300');
    expect((state.body as { cidades: Record<string, unknown> }).cidades.marilia).toBeNull();
  });

  it('as duas falhando: 502 sem guardar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')));
    const { state, res } = respostaFake();

    await handler({ method: 'GET' }, res);

    expect(state.statusCode).toBe(502);
    expect(state.headers['Cache-Control']).toBe('no-store');
  });

  it('só GET', async () => {
    const { state, res } = respostaFake();
    await handler({ method: 'POST' }, res);
    expect(state.statusCode).toBe(405);
  });
});
