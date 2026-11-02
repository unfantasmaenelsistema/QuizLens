// node tests/quiz.test.mjs — pruebas de la lógica con fetch simulado.
import assert from 'node:assert/strict';
import { resolver, crearSalud, elegirModelos, errorDesdeRespuesta, votar, normalizar } from '../assets/quiz.js';

const lectura = (c, n = 4, conf = 95) => ({
  legible: true,
  preguntas: [{ enunciado: 'P', opciones: Array.from({ length: n }, (_, i) => `op${i + 1}`), correctas: [c], confianza: conf }],
});
const ok = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const err = (status, message = '') => new Response(JSON.stringify({ error: { message } }), { status });
const espera = (ms, signal) =>
  new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('abort', 'AbortError')); });
  });

// comportamiento[modelo] = async (signal) => Response
function falso(comportamiento) {
  const llamadas = [];
  const f = async (url, opt) => {
    const m = String(url).match(/models\/([^:]+):/)[1];
    llamadas.push(m);
    return comportamiento[m](opt.signal);
  };
  f.llamadas = llamadas;
  return f;
}
const base = { imagenes: ['x'] };
const una = (rapidos, expertos = []) => [{ id: 'g', apiKey: 'FAKE', modelos: { rapidos, expertos } }];
let pruebas = 0;
async function prueba(nombre, fn) {
  await fn();
  pruebas++;
  console.log('ok -', nombre);
}

await prueba('3 modelos distintos y unánimes → segura', async () => {
  const f = falso({ a: async () => ok(lectura(3)), b: async () => ok(lectura(3)), c: async () => ok(lectura(3)) });
  const r = await resolver({ ...base, cuentas: una(['a', 'b', 'c'], []), fetchImpl: f });
  assert.equal(r.estado, 'segura');
  assert.deepEqual(r.preguntas[0].correctas, [3]);
  assert.deepEqual([...f.llamadas].sort(), ['a', 'b', 'c']);
});

await prueba('503 se castiga y se usa el siguiente; la salud lo recuerda', async () => {
  const salud = crearSalud();
  const f = falso({ a: async () => err(503), b: async () => ok(lectura(2)), c: async () => ok(lectura(2)), d: async () => ok(lectura(2)) });
  const r = await resolver({ ...base, cuentas: una(['a', 'b', 'c', 'd'], []), fetchImpl: f, salud });
  assert.equal(r.estado, 'segura');
  assert.equal(salud.disponible('g:a'), false);
  f.llamadas.length = 0;
  await resolver({ ...base, cuentas: una(['a', 'b', 'c', 'd'], []), fetchImpl: f, salud });
  assert.ok(!f.llamadas.includes('a'));
});

await prueba('modelo colgado → reserva en paralelo gana', async () => {
  const f = falso({
    lento: (s) => espera(60_000, s).then(() => ok(lectura(1))),
    b: async () => ok(lectura(1)),
    c: async () => ok(lectura(1)),
    d: async () => ok(lectura(1)),
  });
  const t0 = Date.now();
  // reservaMs por defecto es 12 s; se acorta el timeout para que la prueba no tarde
  const r = await resolver({ ...base, cuentas: una(['lento', 'b', 'c', 'd'], []), fetchImpl: f, timeoutMs: 30_000 });
  assert.equal(r.estado, 'segura');
  assert.ok(Date.now() - t0 < 14_000, 'la reserva entra a los 12 s');
});

await prueba('desacuerdo sin experto: 4 de 5 → revisada', async () => {
  let n = 0;
  const resp = [1, 1, 2, 1, 1];
  const f = falso(Object.fromEntries(['a', 'b', 'c'].map((m) => [m, async () => ok(lectura(resp[n++]))])));
  const r = await resolver({ ...base, cuentas: una(['a', 'b', 'c'], []), fetchImpl: f });
  assert.equal(f.llamadas.length, 5);
  assert.equal(r.estado, 'revisada');
  assert.deepEqual(r.preguntas[0].correctas, [1]);
});

await prueba('desacuerdo sin experto: 3 de 5 → dudosa con alternativa', async () => {
  let n = 0;
  const resp = [1, 2, 1, 2, 1];
  const f = falso(Object.fromEntries(['a', 'b', 'c'].map((m) => [m, async () => ok(lectura(resp[n++]))])));
  const r = await resolver({ ...base, cuentas: una(['a', 'b', 'c'], []), fetchImpl: f });
  assert.equal(r.estado, 'dudosa');
  assert.deepEqual(r.preguntas[0].correctas, [1]);
  assert.deepEqual(r.alternativa[0].correctas, [2]);
});

await prueba('experto discrepa → dudosa, gana el experto', async () => {
  let n = 0;
  const resp = [1, 2, 1, 1, 1];
  const f = falso({
    ...Object.fromEntries(['a', 'b', 'c'].map((m) => [m, async () => ok(lectura(resp[n++]))])),
    pro: async () => ok(lectura(4)),
  });
  const r = await resolver({ ...base, cuentas: una(['a', 'b', 'c'], ['pro']), fetchImpl: f });
  assert.equal(r.estado, 'dudosa');
  assert.deepEqual(r.preguntas[0].correctas, [4]);
});

await prueba('Pro con «limit: 0» se aparta un día', async () => {
  const salud = crearSalud();
  let n = 0;
  const resp = [1, 2, 1, 1, 1];
  const f = falso({
    ...Object.fromEntries(['a', 'b', 'c'].map((m) => [m, async () => ok(lectura(resp[n++]))])),
    pro: async () => err(429, 'Quota exceeded for metric: x, limit: 0, model: gemini-3.1-pro'),
  });
  const r = await resolver({ ...base, cuentas: una(['a', 'b', 'c'], ['pro']), fetchImpl: f, salud });
  assert.equal(r.estado, 'revisada');
  assert.equal(salud.disponible('g:pro', Date.now() + 20 * 36e5), false);
});

await prueba('clave inválida corta en seco', async () => {
  const f = falso({ a: async () => err(400, 'API key not valid. Please pass a valid API key.') });
  await assert.rejects(resolver({ ...base, cuentas: una(['a'], []), fetchImpl: f }), (e) => e.motivo === 'clave');
});

await prueba('cancelar aborta todo', async () => {
  const ctl = new AbortController();
  const f = falso({ a: (s) => espera(5000, s).then(() => ok(lectura(1))), b: (s) => espera(5000, s).then(() => ok(lectura(1))) });
  setTimeout(() => ctl.abort(), 100);
  await assert.rejects(resolver({ ...base, cuentas: una(['a', 'b'], []), fetchImpl: f, signal: ctl.signal }), (e) => e.motivo === 'cancelado');
});

await prueba('gratuita primero; de pago cuando la gratuita agota la cuota diaria', async () => {
  const salud = crearSalud();
  const usadas = [];
  const f = async (url, opt) => {
    const k = opt.headers['x-goog-api-key'];
    usadas.push(k);
    if (k === 'GRATIS') return err(429, 'Generate content requests per day limit exceeded on Free Tier');
    return ok(lectura(2));
  };
  const cuentas = [
    { id: 'g', apiKey: 'GRATIS', modelos: { rapidos: ['a', 'b', 'c'], expertos: ['pro'] } },
    { id: 'p', apiKey: 'PAGO', pago: true, modelos: { rapidos: ['a', 'b', 'c'], expertos: ['pro'] } },
  ];
  const r = await resolver({ ...base, cuentas, fetchImpl: f, salud });
  assert.equal(r.estado, 'segura');
  assert.match(r.modelo, /€/);
  assert.equal(salud.disponible('g:a'), false);
  assert.equal(salud.disponible('p:a'), true);
  usadas.length = 0;
  await resolver({ ...base, cuentas, fetchImpl: f, salud });
  assert.ok(usadas.every((k) => k === 'PAGO'), 'la gratuita agotada ya no se intenta');
});

await prueba('desempate: el Pro de pago va antes que el gratuito', async () => {
  let n = 0;
  const resp = [1, 2, 1, 1, 1];
  const pro = [];
  const f = async (url, opt) => {
    const m = String(url).match(/models\/([^:]+):/)[1];
    if (m === 'pro') {
      pro.push(opt.headers['x-goog-api-key']);
      return ok(lectura(1));
    }
    return ok(lectura(resp[n++]));
  };
  const cuentas = [
    { id: 'g', apiKey: 'GRATIS', modelos: { rapidos: ['a', 'b', 'c'], expertos: ['pro'] } },
    { id: 'p', apiKey: 'PAGO', pago: true, modelos: { rapidos: [], expertos: ['pro'] } },
  ];
  const r = await resolver({ ...base, cuentas, fetchImpl: f });
  assert.equal(r.estado, 'revisada');
  assert.deepEqual(pro, ['PAGO']);
});

await prueba('la materia viaja en el texto de la petición', async () => {
  let cuerpo = '';
  const f = async (url, opt) => {
    cuerpo = opt.body;
    return ok(lectura(1));
  };
  await resolver({ ...base, cuentas: una(['a', 'b', 'c']), materia: 'Bases de datos Oracle', fetchImpl: f });
  assert.match(cuerpo, /Bases de datos Oracle/);
});

await prueba('errores 429', async () => {
  assert.equal(errorDesdeRespuesta(429, { error: { message: 'requests per minute' } }).motivo, 'cuota');
  assert.equal(errorDesdeRespuesta(429, { error: { message: 'requests per day limit exceeded' } }).motivo, 'cuotadia');
  assert.equal(errorDesdeRespuesta(429, { error: { message: 'limit: 0, model: x' } }).motivo, 'sinplan');
});

await prueba('elegirModelos filtra variantes', async () => {
  const m = elegirModelos(['models/gemini-3.8-flash', 'models/gemini-3.8-flash-tts', 'models/gemini-3.1-pro-preview-customtools', 'models/gemini-3.1-pro-preview', 'models/gemini-3.5-flash-lite', 'models/gemini-3.6-flash']);
  assert.deepEqual(m.rapidos.slice(0, 3), ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']);
  assert.equal(m.expertos[0], 'gemini-3.1-pro-preview');
});

await prueba('normalizar descarta posiciones imposibles', async () => {
  const n = normalizar({ legible: true, preguntas: [{ enunciado: 'x', opciones: ['a', 'b'], correctas: [0, 2, 2, 7], confianza: 300 }] });
  assert.deepEqual(n.preguntas[0].correctas, [2]);
  assert.equal(n.preguntas[0].confianza, 100);
  assert.equal(votar([n, n]).acuerdo, true);
});

console.log(`\n${pruebas} pruebas superadas`);
