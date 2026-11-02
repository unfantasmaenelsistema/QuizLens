// Lógica sin DOM: petición a Gemini, lectura de la respuesta y votación.
// La clave del usuario viaja solo en la cabecera `x-goog-api-key` hacia Google.

const API = 'https://generativelanguage.googleapis.com/v1beta';

// Reserva por si no se puede listar los modelos de la clave.
export const RAPIDOS_RESERVA = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
export const EXPERTOS_RESERVA = ['gemini-pro-latest'];

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    legible: { type: 'BOOLEAN', description: 'false si no se puede leer la pregunta o sus opciones con seguridad.' },
    preguntas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          enunciado: { type: 'STRING', description: 'Enunciado transcrito literalmente.' },
          opciones: {
            type: 'ARRAY',
            description: 'Opciones transcritas literalmente, en el orden en que aparecen (de arriba abajo).',
            items: { type: 'STRING' },
          },
          correctas: {
            type: 'ARRAY',
            description: 'Posiciones (empezando en 1) de la opción u opciones correctas.',
            items: { type: 'INTEGER' },
          },
          confianza: { type: 'INTEGER', description: 'Seguridad de 0 a 100 en la respuesta.' },
        },
        required: ['enunciado', 'opciones', 'correctas', 'confianza'],
      },
    },
  },
  required: ['legible', 'preguntas'],
};

const SISTEMA = `Eres un experto que resuelve preguntas tipo test de cualquier materia (informática, bases de datos, redes, seguridad, ofimática, ciencias, letras…).
Recibes una o dos versiones de la MISMA foto (la original y una mejorada en contraste). Pueden estar torcidas, borrosas, con reflejos o fotografiadas de una pantalla.
Procedimiento obligatorio:
1. Transcribe con exactitud el enunciado y cada opción, en el orden visual de arriba abajo. Fíjate en cada signo: comillas, paréntesis, =, comas, puntos y coma, mayúsculas, números.
2. Si una opción tiene letra o número propio (a, b, c / 1, 2, 3), consérvalo en el texto, pero la posición es siempre su orden visual.
3. Resuelve la pregunta analizando TODAS las opciones antes de decidir. Ojo con negaciones («¿cuál NO…?», «incorrecta», «falsa») y con «todas las anteriores» / «ninguna».
4. Normalmente hay una sola respuesta correcta. Devuelve varias solo si el enunciado pide expresamente elegir varias.
5. Si hay varias preguntas en la imagen, devuélvelas todas en orden. Ignora preguntas cortadas sin opciones visibles.
6. Si no puedes leer lo imprescindible, pon legible=false.
Responde únicamente con JSON ajustado al esquema.`;

export class ErrorGemini extends Error {
  constructor(motivo, mensaje, status) {
    super(mensaje);
    this.motivo = motivo; // clave | cuota | modelo | servicio | red | respuesta | cancelado
    this.status = status;
  }
}

export function errorDesdeRespuesta(status, cuerpo) {
  const info = cuerpo?.error;
  const razon = info?.details?.find((d) => d?.reason)?.reason ?? '';
  const texto = (info?.message ?? '').slice(0, 300);
  if (razon === 'API_KEY_INVALID' || /api key not valid/i.test(texto) || status === 401) {
    return new ErrorGemini('clave', 'err_key', status);
  }
  if (status === 403) return new ErrorGemini('clave', 'err_key_perm', status);
  // «limit: 0»: el plan de la clave no incluye ese modelo (p. ej. Pro en el plan gratuito).
  if (status === 429 && /limit:\s*0\b/.test(info?.message ?? '')) return new ErrorGemini('sinplan', 'err_quota', status);
  // Cuota diaria agotada: no vuelve hasta el día siguiente (hora del Pacífico).
  if (status === 429 && /per day/i.test(info?.message ?? '')) return new ErrorGemini('cuotadia', 'err_quota', status);
  if (status === 429) return new ErrorGemini('cuota', 'err_quota', status);
  if (status === 404) return new ErrorGemini('modelo', 'err_model', status);
  if (status >= 500) return new ErrorGemini('servicio', 'err_service', status);
  return new ErrorGemini('respuesta', texto || `HTTP ${status}`, status);
}

/** Saca el JSON del primer candidato, ignorando las partes de razonamiento. */
export function extraerJson(respuesta) {
  if (respuesta?.promptFeedback?.blockReason) throw new ErrorGemini('respuesta', 'err_blocked');
  const partes = respuesta?.candidates?.[0]?.content?.parts ?? [];
  const texto = partes
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  if (!texto) throw new ErrorGemini('respuesta', 'err_empty');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorGemini('respuesta', 'err_json');
  }
}

/** Deja la respuesta del modelo en una forma fiable para comparar votos. */
export function normalizar(datos) {
  const preguntas = Array.isArray(datos?.preguntas) ? datos.preguntas : [];
  const limpias = preguntas
    .map((p) => {
      const opciones = Array.isArray(p?.opciones) ? p.opciones.map((o) => String(o ?? '').trim()) : [];
      const correctas = [...new Set((Array.isArray(p?.correctas) ? p.correctas : []).map(Number))]
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= opciones.length)
        .sort((a, b) => a - b);
      const confianza = Math.max(0, Math.min(100, Number(p?.confianza) || 0));
      return { enunciado: String(p?.enunciado ?? '').trim(), opciones, correctas, confianza };
    })
    .filter((p) => p.opciones.length > 0 && p.correctas.length > 0);
  return { legible: datos?.legible !== false && limpias.length > 0, preguntas: limpias };
}

/**
 * Clave de voto: posiciones elegidas más el número de opciones leídas. Así una
 * coma mal transcrita no rompe el acuerdo, pero saltarse una opción sí.
 */
export function claveVoto(pregunta) {
  return `${pregunta.opciones.length}:${pregunta.correctas.join(',')}`;
}

/**
 * Cuenta los votos de varias lecturas. Vota cada pregunta por separado; si las
 * lecturas no ven el mismo número de preguntas, no hay acuerdo.
 */
export function votar(lecturas) {
  const validas = lecturas.filter((l) => l?.legible);
  if (validas.length === 0) return { acuerdo: false, preguntas: [], minimoConfianza: 0, validas: 0 };
  const n = moda(validas.map((l) => l.preguntas.length));
  const mismas = validas.filter((l) => l.preguntas.length === n);
  const preguntas = [];
  let unanime = mismas.length === lecturas.length;
  let minimoConfianza = 100;
  for (let i = 0; i < n; i++) {
    const cuenta = new Map();
    for (const l of mismas) {
      const p = l.preguntas[i];
      const k = claveVoto(p);
      const e = cuenta.get(k) ?? { votos: 0, pregunta: p };
      e.votos++;
      if (p.confianza > e.pregunta.confianza) e.pregunta = p;
      cuenta.set(k, e);
    }
    const orden = [...cuenta.values()].sort((a, b) => b.votos - a.votos);
    const ganadora = orden[0];
    if (orden.length > 1 || ganadora.votos !== lecturas.length) unanime = false;
    minimoConfianza = Math.min(minimoConfianza, ganadora.pregunta.confianza);
    const segunda = orden[1] ? { ...orden[1].pregunta, votos: orden[1].votos, total: lecturas.length } : null;
    preguntas.push({ ...ganadora.pregunta, votos: ganadora.votos, total: lecturas.length, segunda });
  }
  return { acuerdo: unanime, preguntas, minimoConfianza, validas: validas.length };
}

function moda(valores) {
  const c = new Map();
  for (const v of valores) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** ¿Coinciden dos resultados en todas las preguntas? */
export function coinciden(a, b) {
  if (!a?.preguntas?.length || a.preguntas.length !== b?.preguntas?.length) return false;
  return a.preguntas.every((p, i) => claveVoto(p) === claveVoto(b.preguntas[i]));
}

/** Una llamada a Gemini con una o dos imágenes. Devuelve la lectura normalizada. */
export async function preguntarModelo({ apiKey, modelo, imagenes, materia = '', fetchImpl = fetch, signal, timeoutMs = 60_000 }) {
  const contexto = String(materia).trim().slice(0, 200);
  const cuerpo = JSON.stringify({
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents: [
      {
        role: 'user',
        parts: [
          ...imagenes.map((b64) => ({ inlineData: { mimeType: 'image/jpeg', data: b64 } })),
          {
            text:
              'Lee la pregunta tipo test de la imagen y devuelve la respuesta correcta.' +
              (contexto ? `\nMateria o contexto del examen (úsalo solo como pista): ${contexto}` : ''),
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA },
  });
  const reloj = new AbortController();
  const t = setTimeout(() => reloj.abort(), timeoutMs);
  const cancelar = () => reloj.abort();
  signal?.addEventListener('abort', cancelar, { once: true });
  try {
    let r;
    try {
      r = await fetchImpl(`${API}/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: cuerpo,
        signal: reloj.signal,
      });
    } catch {
      if (signal?.aborted) throw new ErrorGemini('cancelado', 'err_cancel');
      if (reloj.signal.aborted) throw new ErrorGemini('servicio', 'err_timeout');
      throw new ErrorGemini('red', 'err_network');
    }
    if (!r.ok) throw errorDesdeRespuesta(r.status, await r.json().catch(() => null));
    return normalizar(extraerJson(await r.json()));
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', cancelar);
  }
}

// --- Salud de los modelos ---------------------------------------------------
// Un modelo saturado, sin cuota o que no existe se aparta un tiempo para no
// perder segundos con él en la siguiente pregunta.
const PAUSA_MS = { sinplan: 864e5, modelo: 864e5, cuotadia: 6 * 36e5, cuota: 60e3, servicio: 180e3 };

export function crearSalud(almacen = null) {
  const estado = { ...(almacen?.leer() ?? {}) };
  const guardar = () => almacen?.escribir(estado);
  return {
    disponible: (m, ahora = Date.now()) => !(estado[m] > ahora),
    castigar(m, motivo, ahora = Date.now()) {
      if (!PAUSA_MS[motivo]) return;
      estado[m] = ahora + PAUSA_MS[motivo];
      guardar();
    },
    sanar(m) {
      if (m in estado) {
        delete estado[m];
        guardar();
      }
    },
  };
}

const ERRORES_FATALES = ['clave', 'cancelado', 'red'];

/**
 * Una lectura: toma de la cola compartida el siguiente modelo disponible y,
 * si falla, el siguiente. Como la cola es común, las lecturas en paralelo
 * acaban en modelos distintos y sus errores no van de la mano.
 */
function leerUna(base, cola, salud, reservaMs = 12_000) {
  // Si un modelo tarda más de `reservaMs` (saturado pero sin responder 503),
  // se lanza otro en paralelo y gana el primero que conteste.
  return new Promise((resolve, reject) => {
    let activos = 0;
    let terminado = false;
    let ultimo = null;
    const controles = [];
    const cerrar = () => {
      terminado = true;
      controles.forEach((c) => c.abort());
    };
    const lanzar = () => {
      let el;
      while ((el = cola.shift()) && !salud.disponible(el.clave));
      if (!el) {
        if (activos === 0 && !terminado) {
          cerrar();
          reject(ultimo ?? new ErrorGemini('modelo', 'err_model'));
        }
        return;
      }
      activos++;
      const ctl = new AbortController();
      controles.push(ctl);
      if (base.signal?.aborted) ctl.abort();
      base.signal?.addEventListener('abort', () => ctl.abort(), { once: true });
      const reserva = setTimeout(() => !terminado && lanzar(), reservaMs);
      preguntarModelo({ ...base, apiKey: el.apiKey, signal: ctl.signal, modelo: el.modelo }).then(
        (lectura) => {
          clearTimeout(reserva);
          activos--;
          salud.sanar(el.clave);
          if (terminado) return;
          cerrar();
          resolve({ lectura, modelo: el.modelo, pago: el.pago });
        },
        (e) => {
          clearTimeout(reserva);
          activos--;
          if (terminado) return;
          if (e instanceof ErrorGemini && e.motivo === 'cancelado' && !base.signal?.aborted) return;
          if (!(e instanceof ErrorGemini) || ERRORES_FATALES.includes(e.motivo)) {
            cerrar();
            reject(e);
            return;
          }
          salud.castigar(el.clave, e.motivo);
          ultimo = e;
          if (activos === 0) lanzar();
        },
      );
    };
    lanzar();
  });
}

async function leerVarias(base, cola, salud, n) {
  const r = await Promise.allSettled(Array.from({ length: n }, () => leerUna(base, cola, salud)));
  const fatal = r.find((x) => x.status === 'rejected' && x.reason instanceof ErrorGemini && ['clave', 'cancelado'].includes(x.reason.motivo));
  if (fatal) throw fatal.reason;
  return {
    hechas: r.filter((x) => x.status === 'fulfilled').map((x) => x.value),
    fallos: r.filter((x) => x.status === 'rejected').map((x) => x.reason),
  };
}

/** Ordena modelos por versión (3.8 > 3.5 > 2.5). */
function version(nombre) {
  const m = nombre.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Reparte los modelos de la clave en rápidos (Flash, del más nuevo al más
 * viejo, y los Lite al final) y expertos (Pro). Se descartan las variantes de
 * imagen, audio, TTS, etc.
 */
export function elegirModelos(nombres) {
  const utiles = nombres
    .map((n) => n.replace(/^models\//, ''))
    .filter((n) => /^gemini-\d/.test(n))
    .filter((n) => !/(image|audio|tts|live|embed|vision|robotics|computer|native|transcribe|customtools|thinking-exp|exp-\d|-\d{3}$)/i.test(n));
  const porVersion = (a, b) => version(b) - version(a) || a.length - b.length;
  const flash = utiles.filter((n) => /-flash(-preview)?$/.test(n)).sort(porVersion);
  const lite = utiles.filter((n) => /-flash-lite(-preview)?$/.test(n)).sort(porVersion);
  const pro = utiles.filter((n) => /-pro(-preview)?$/.test(n)).sort(porVersion);
  return {
    rapidos: [...new Set([...flash, ...lite.slice(0, 1), ...RAPIDOS_RESERVA])],
    expertos: [...new Set([...pro.slice(0, 2), ...EXPERTOS_RESERVA])],
  };
}

export async function listarModelos(apiKey, fetchImpl = fetch) {
  const r = await fetchImpl(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!r.ok) throw errorDesdeRespuesta(r.status, await r.json().catch(() => null));
  const d = await r.json();
  return (d.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name);
}

const corto = (h) => h.modelo.replace(/^gemini-/, '') + (h.pago ? ' €' : '');

/**
 * Cola de modelos de varias cuentas. La clave gratuita va siempre delante
 * (sale gratis); la de pago entra cuando la gratuita se agota o falla.
 */
function colaDe(cuentas, tipo, salud) {
  return cuentas.flatMap((c) =>
    (c.modelos?.[tipo] ?? [])
      .map((modelo) => ({ apiKey: c.apiKey, modelo, pago: !!c.pago, clave: `${c.id}:${modelo}` }))
      .filter((el) => salud.disponible(el.clave)),
  );
}

/**
 * Proceso completo. Primero N lecturas en paralelo con modelos distintos; si
 * todas coinciden con buena confianza, «segura». Si no, desempate: el modelo
 * experto (si alguna clave lo tiene) y dos lecturas rápidas más.
 * Estados: segura | revisada | dudosa.
 */
export async function resolver({
  cuentas, imagenes, materia = '', votos = 3, umbral = 75, fetchImpl = fetch, signal,
  salud = crearSalud(), alAvanzar = () => {}, timeoutMs = 25_000,
}) {
  const base = { imagenes, materia, fetchImpl, signal, timeoutMs };
  const sanos = colaDe(cuentas, 'rapidos', salud);
  // Dos vueltas: si hay menos modelos sanos que lecturas, se repite modelo.
  const cola = [...sanos, ...sanos];
  alAvanzar('reading');
  const r1 = await leerVarias(base, cola, salud, votos);
  const lecturas = r1.hechas.map((h) => h.lectura);
  const voto = lecturas.length ? votar(lecturas) : null;
  if (voto?.acuerdo && lecturas.length === votos && voto.minimoConfianza >= umbral) {
    return { estado: 'segura', preguntas: voto.preguntas, modelo: r1.hechas.map(corto).join(' · ') };
  }

  alAvanzar('checking');
  // El experto de pago va primero: el plan gratuito no incluye Pro.
  const expertos = colaDe([...cuentas].sort((a, b) => !!b.pago - !!a.pago), 'expertos', salud);
  const [rExp, r2] = await Promise.all([
    expertos.length ? leerVarias({ ...base, timeoutMs: 60_000 }, expertos, salud, 1) : { hechas: [], fallos: [] },
    leerVarias(base, cola, salud, 2),
  ]);
  const todas = [...r1.hechas, ...r2.hechas];
  const rapidas = todas.length ? votar(todas.map((h) => h.lectura)) : null;
  const nombres = [...todas, ...rExp.hechas].map(corto).join(' · ');
  const ex = rExp.hechas[0]?.lectura;

  if (ex?.legible) {
    const deAcuerdo = rapidas && coinciden(ex, rapidas);
    return {
      estado: deAcuerdo ? 'revisada' : 'dudosa',
      preguntas: ex.preguntas,
      alternativa: deAcuerdo ? null : rapidas?.preguntas ?? null,
      modelo: nombres,
    };
  }
  if (rapidas?.preguntas.length) {
    // Sin experto: «revisada» solo si al menos 4 de cada 5 lecturas coinciden.
    const firme = rapidas.preguntas.every((p) => p.votos >= Math.ceil(todas.length * 0.8)) && todas.length >= 4;
    return {
      estado: firme ? 'revisada' : 'dudosa',
      preguntas: rapidas.preguntas,
      alternativa: firme ? null : rapidas.preguntas.map((p) => p.segunda ?? p),
      modelo: nombres,
    };
  }
  if (todas.length || ex) throw new ErrorGemini('respuesta', 'err_unreadable');
  throw r1.fallos[0] ?? r2.fallos[0] ?? rExp.fallos[0] ?? new ErrorGemini('respuesta', 'err_unreadable');
}
