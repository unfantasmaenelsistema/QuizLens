import { preparar } from './imagen.js';
import { exportarPdf, letra } from './pdf.js';
import { resolver, listarModelos, elegirModelos, crearSalud, ErrorGemini, RAPIDOS_RESERVA, EXPERTOS_RESERVA } from './quiz.js';

const $ = (id) => document.getElementById(id);

// --- Almacenamiento local (todo con try/catch: puede estar bloqueado) ---
const K = {
  clave: 'ql_gemini_key', clavePago: 'ql_gemini_key_paid', lang: 'ql_lang', tema: 'ql_theme', votos: 'ql_votes',
  modelos: 'ql_models_', hist: 'ql_history', salud: 'ql_health', materia: 'ql_subject', sesion: 'ql_session',
};
const leer = (k, def = null) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? def : v;
  } catch {
    return def;
  }
};
const escribir = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};
const leerJson = (k, def) => {
  try {
    return JSON.parse(leer(k)) ?? def;
  } catch {
    return def;
  }
};

// --- Textos ---
const T = {
  es: {
    tagline: 'Respuestas a preguntas tipo test',
    settings: 'Ajustes', theme: 'Cambiar tema',
    drop_title: 'Sube o pega la pregunta',
    drop_sub: 'Arrastra una imagen, pégala con Ctrl+V o haz una foto.',
    camera: 'Hacer foto', file: 'Elegir imagen',
    no_key: 'Falta tu clave de Gemini.', add_key: 'Añadir clave',
    cancel: 'Cancelar', history: 'Historial en este navegador', clear: 'Borrar',
    privacy: 'Tu clave y tu historial solo se guardan en este navegador. Las imágenes van directas a Google.',
    key_label: 'Clave gratuita de Gemini (o tu única clave)', show: 'Ver', hide: 'Ocultar',
    key_paid_label: 'Clave de pago (opcional)',
    key_paid_note: 'Se usa cuando la gratuita se agota y para el desempate con Gemini Pro.',
    subject_label: 'Materia (opcional)', subject_ph: 'p. ej. Bases de datos Oracle', subject: 'Materia',
    session: 'Sesión actual', export_pdf: 'Exportar PDF', new_session: 'Nueva sesión',
    session_info: (n, d) => `· ${n} ${n === 1 ? 'pregunta' : 'preguntas'}${d ? ` · ${d} ${d === 1 ? 'dudosa' : 'dudosas'}` : ''}`,
    confirm_new: '¿Empezar una sesión nueva? Las preguntas anteriores siguen en el historial.',
    empty_session: 'Esta sesión aún no tiene preguntas.', pdf_error: 'No se pudo generar el PDF.',
    pdf_session: 'Sesión del', pdf_question: 'Pregunta', pdf_answer: 'Respuesta', pdf_other: 'otra lectura',
    pdf_summary: (n, d) => `${n} ${n === 1 ? 'pregunta' : 'preguntas'} · ${d} ${d === 1 ? 'dudosa' : 'dudosas'}`,
    pdf_key: 'Plantilla de respuestas',
    pdf_key_note: 'Las marcadas con ? son dudosas: conviene revisarlas.',
    key_note: 'Se guarda solo en este navegador (localStorage). Créala en',
    key_tip: 'Consejo: en Google Cloud restríngela a la API de Gemini y a tu dominio de GitHub Pages.',
    votes_label: 'Comprobaciones en paralelo',
    votes_1: '1 · más rápido, sin votación', votes_3: '3 · recomendado', votes_5: '5 · máxima seguridad',
    test_key: 'Comprobar clave', forget: 'Olvidar clave', close: 'Cerrar', save: 'Guardar',
    preparing: 'Preparando la imagen…', reading: 'Leyendo la pregunta…', checking: 'No coinciden: desempatando…',
    models_info: (c, r, e) => `${c}: rápido ${r} · experto ${e}`, free: 'Gratuita', paid: 'De pago',
    key_ok: (c, n) => `${c}: clave válida, ${n} modelos.`,
    key_testing: 'Comprobando…', key_forgot: 'Clave borrada de este navegador.',
    segura: 'Segura', revisada: 'Confirmada en el desempate', dudosa: 'Dudosa: revísala',
    option: 'Opción', question: (i, n) => `Pregunta ${i} de ${n}`,
    alt: (x) => `Otra lectura decía: ${x}`,
    transcript: 'Ver lo que ha leído', votes: (v, t) => `${v}/${t} votos`,
    empty: 'Aún no hay preguntas resueltas.', confirm_clear: '¿Borrar todo el historial de este navegador?',
    err_key: 'La clave de Gemini no es válida. Revísala en Ajustes.',
    err_key_perm: 'La clave no tiene permiso para Gemini (¿restringida a otra API o a otro dominio?).',
    err_quota: 'Se ha agotado la cuota de tu clave por ahora. Espera un minuto o baja las comprobaciones en Ajustes.',
    err_model: 'Ningún modelo de Gemini está disponible para tu clave.',
    err_service: 'Gemini está saturado. Inténtalo de nuevo.', err_timeout: 'Gemini tardó demasiado. Inténtalo de nuevo.',
    err_network: 'No hay conexión con Gemini. Comprueba Internet.', err_cancel: 'Cancelado.',
    err_blocked: 'Gemini ha bloqueado la imagen.', err_empty: 'Gemini devolvió una respuesta vacía.',
    err_json: 'Gemini devolvió una respuesta incompleta.',
    err_unreadable: 'No se lee bien la pregunta. Haz otra foto más cerca, recta y sin reflejos.',
    err_image: 'No se pudo abrir la imagen.', err_storage: 'El navegador no deja guardar datos (¿modo privado?).',
    retry: 'Reintentar',
  },
  en: {
    tagline: 'Answers to multiple-choice questions',
    settings: 'Settings', theme: 'Toggle theme',
    drop_title: 'Upload or paste the question',
    drop_sub: 'Drop an image, paste it with Ctrl+V or take a photo.',
    camera: 'Take photo', file: 'Choose image',
    no_key: 'Your Gemini key is missing.', add_key: 'Add key',
    cancel: 'Cancel', history: 'History in this browser', clear: 'Clear',
    privacy: 'Your key and history are stored only in this browser. Images go straight to Google.',
    key_label: 'Free Gemini key (or your only key)', show: 'Show', hide: 'Hide',
    key_paid_label: 'Paid key (optional)',
    key_paid_note: 'Used when the free key runs out and for the Gemini Pro tie-break.',
    subject_label: 'Subject (optional)', subject_ph: 'e.g. Oracle databases', subject: 'Subject',
    session: 'Current session', export_pdf: 'Export PDF', new_session: 'New session',
    session_info: (n, d) => `· ${n} ${n === 1 ? 'question' : 'questions'}${d ? ` · ${d} uncertain` : ''}`,
    confirm_new: 'Start a new session? Earlier questions stay in the history.',
    empty_session: 'This session has no questions yet.', pdf_error: 'The PDF could not be created.',
    pdf_session: 'Session of', pdf_question: 'Question', pdf_answer: 'Answer', pdf_other: 'other reading',
    pdf_summary: (n, d) => `${n} ${n === 1 ? 'question' : 'questions'} · ${d} uncertain`,
    pdf_key: 'Answer key',
    pdf_key_note: 'Items marked with ? are uncertain: double-check them.',
    key_note: 'Stored only in this browser (localStorage). Create one at',
    key_tip: 'Tip: in Google Cloud, restrict it to the Gemini API and your GitHub Pages domain.',
    votes_label: 'Parallel checks',
    votes_1: '1 · fastest, no voting', votes_3: '3 · recommended', votes_5: '5 · maximum safety',
    test_key: 'Test key', forget: 'Forget key', close: 'Close', save: 'Save',
    preparing: 'Preparing the image…', reading: 'Reading the question…', checking: 'No agreement: breaking the tie…',
    models_info: (c, r, e) => `${c}: fast ${r} · expert ${e}`, free: 'Free', paid: 'Paid',
    key_ok: (c, n) => `${c}: valid key, ${n} models.`,
    key_testing: 'Testing…', key_forgot: 'Key removed from this browser.',
    segura: 'Confident', revisada: 'Confirmed by the tie-break', dudosa: 'Uncertain: double-check it',
    option: 'Option', question: (i, n) => `Question ${i} of ${n}`,
    alt: (x) => `Another reading said: ${x}`,
    transcript: 'Show what it read', votes: (v, t) => `${v}/${t} votes`,
    empty: 'No questions solved yet.', confirm_clear: 'Clear all history in this browser?',
    err_key: 'The Gemini key is not valid. Check it in Settings.',
    err_key_perm: 'The key is not allowed to use Gemini (restricted to another API or domain?).',
    err_quota: 'Your key is out of quota for now. Wait a minute or lower the checks in Settings.',
    err_model: 'No Gemini model is available for your key.',
    err_service: 'Gemini is overloaded. Try again.', err_timeout: 'Gemini took too long. Try again.',
    err_network: 'Cannot reach Gemini. Check your connection.', err_cancel: 'Cancelled.',
    err_blocked: 'Gemini blocked the image.', err_empty: 'Gemini returned an empty answer.',
    err_json: 'Gemini returned an incomplete answer.',
    err_unreadable: 'The question cannot be read. Take a closer, straighter photo without glare.',
    err_image: 'The image could not be opened.', err_storage: 'The browser does not allow saving data (private mode?).',
    retry: 'Retry',
  },
};
let lang = leer(K.lang) === 'en' ? 'en' : 'es';
const t = (k, ...a) => {
  const v = T[lang][k] ?? T.es[k] ?? k;
  return typeof v === 'function' ? v(...a) : v;
};

function aplicarIdioma() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  $('bLang').textContent = lang === 'es' ? 'EN' : 'ES';
  $('bVer').textContent = $('iClave').type === 'password' ? t('show') : t('hide');
  pintarHistorial();
  pintarSesion();
  if (ultimo) pintarResultado(ultimo);
  pintarModelos();
}

// --- Tema ---
function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  $('bTheme').textContent = tema === 'dark' ? '☀' : '☾';
  document.querySelector('meta[name=theme-color]').content = tema === 'dark' ? '#0b0f17' : '#f4f6fb';
}
const temaInicial = leer(K.tema) ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
aplicarTema(temaInicial);
$('bTheme').onclick = () => {
  const nuevo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  aplicarTema(nuevo);
  escribir(K.tema, nuevo);
};
$('bLang').onclick = () => {
  lang = lang === 'es' ? 'en' : 'es';
  escribir(K.lang, lang);
  aplicarIdioma();
};

// --- Claves y ajustes ---
const clave = () => (leer(K.clave) ?? '').trim();
const clavePago = () => (leer(K.clavePago) ?? '').trim();
const votos = () => [1, 3, 5].includes(Number(leer(K.votos))) ? Number(leer(K.votos)) : 3;
const CUENTAS = [
  { id: 'free', k: K.clave, input: 'iClave', nombre: 'free' },
  { id: 'paid', k: K.clavePago, input: 'iClavePago', nombre: 'paid', pago: true },
];
function revisarClave() {
  $('sinClave').classList.toggle('oculto', !!(clave() || clavePago()));
}
function pintarModelos() {
  $('modelosInfo').textContent = CUENTAS.map((c) => {
    const m = leerJson(K.modelos + c.id, null);
    return m && (leer(c.k) ?? '').trim() ? t('models_info', t(c.nombre), m.rapidos[0], m.expertos[0]) : '';
  })
    .filter(Boolean)
    .join(' · ');
}

$('bAjustes').onclick = abrirAjustes;
$('bPonerClave').onclick = abrirAjustes;
function abrirAjustes() {
  $('iClave').value = clave();
  $('iClavePago').value = clavePago();
  $('sVotos').value = String(votos());
  $('pruebaClave').textContent = '';
  pintarModelos();
  $('dlg').showModal();
}
$('bVer').onclick = () => {
  const tipo = $('iClave').type === 'password' ? 'text' : 'password';
  $('iClave').type = $('iClavePago').type = tipo;
  $('bVer').textContent = tipo === 'password' ? t('show') : t('hide');
};
$('fAjustes').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'ok') return;
  let ok = escribir(K.votos, $('sVotos').value);
  for (const c of CUENTAS) {
    const nueva = $(c.input).value.trim();
    if (nueva !== (leer(c.k) ?? '').trim()) {
      escribir(K.modelos + c.id, null);
      escribir(K.salud, null);
    }
    ok = escribir(c.k, nueva || null) && ok;
  }
  if (!ok) alert(t('err_storage'));
  revisarClave();
});
$('bOlvidar').onclick = () => {
  for (const c of CUENTAS) {
    escribir(c.k, null);
    escribir(K.modelos + c.id, null);
    $(c.input).value = '';
  }
  escribir(K.salud, null);
  $('pruebaClave').textContent = t('key_forgot');
  pintarModelos();
  revisarClave();
};
$('bProbar').onclick = async () => {
  const lineas = [];
  $('pruebaClave').textContent = t('key_testing');
  for (const c of CUENTAS) {
    const k = $(c.input).value.trim();
    if (!k) continue;
    try {
      const nombres = await listarModelos(k);
      escribir(K.modelos + c.id, JSON.stringify({ ...elegirModelos(nombres), fecha: Date.now() }));
      lineas.push(t('key_ok', t(c.nombre), nombres.length));
    } catch (e) {
      lineas.push(`${t(c.nombre)}: ${mensajeError(e)}`);
    }
  }
  $('pruebaClave').textContent = lineas.join(' · ');
  pintarModelos();
};

/** Modelos de una clave, guardados una semana; si no se pueden listar, la reserva fija. */
async function modelos(id, k) {
  const m = leerJson(K.modelos + id, null);
  if (m?.rapidos?.length && Date.now() - (m.fecha ?? 0) < 7 * 864e5) return m;
  try {
    const elegidos = elegirModelos(await listarModelos(k));
    escribir(K.modelos + id, JSON.stringify({ ...elegidos, fecha: Date.now() }));
    return elegidos;
  } catch (e) {
    if (e instanceof ErrorGemini && e.motivo === 'clave') throw e;
    return { rapidos: RAPIDOS_RESERVA, expertos: EXPERTOS_RESERVA };
  }
}

async function cuentasActivas() {
  const r = [];
  for (const c of CUENTAS) {
    const k = (leer(c.k) ?? '').trim();
    if (k) r.push({ id: c.id, apiKey: k, pago: !!c.pago, modelos: await modelos(c.id, k) });
  }
  return r;
}

function mensajeError(e) {
  if (e instanceof ErrorGemini) return T[lang][e.message] ? t(e.message) : e.message;
  return String(e?.message ?? e);
}

// --- Entrada de imágenes ---
$('bCamara').onclick = () => $('fCamara').click();
$('bArchivo').onclick = () => $('fArchivo').click();
for (const id of ['fCamara', 'fArchivo']) {
  $(id).addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) procesar(f);
  });
}
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  }),
);
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f) procesar(f);
});
document.addEventListener('paste', (e) => {
  if ($('dlg').open) return;
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  const f = item?.getAsFile();
  if (f) {
    e.preventDefault();
    procesar(f);
  }
});

// --- Proceso ---
let control = null;
let ultimo = null;
let reloj = null;
let ultimoBlob = null;

$('bCancelar').onclick = () => control?.abort();

function paso(texto, activo = true) {
  $('paso').textContent = texto;
  $('estado').classList.toggle('oculto', !activo);
}

async function procesar(blob) {
  if (!clave() && !clavePago()) {
    revisarClave();
    abrirAjustes();
    return;
  }
  control?.abort();
  const mio = new AbortController();
  control = mio;
  ultimo = null;
  ultimoBlob = blob;
  $('trabajo').classList.remove('oculto');
  $('resultado').replaceChildren();
  $('vista').replaceChildren();
  const inicio = performance.now();
  clearInterval(reloj);
  reloj = setInterval(() => ($('crono').textContent = `${((performance.now() - inicio) / 1000).toFixed(1)} s`), 100);
  paso(t('preparing'));
  try {
    let img;
    try {
      img = await preparar(blob);
    } catch {
      throw new Error(t('err_image'));
    }
    for (const src of [`data:image/jpeg;base64,${img.original}`, img.vistaMejorada]) {
      const el = document.createElement('img');
      el.src = src;
      el.alt = '';
      $('vista').append(el);
    }
    const materia = $('iMateria').value.trim();
    const r = await resolver({
      cuentas: await cuentasActivas(),
      imagenes: [img.original, img.mejorada],
      materia,
      votos: votos(),
      salud: crearSalud({ leer: () => leerJson(K.salud, {}), escribir: (o) => escribir(K.salud, JSON.stringify(o)) }),
      signal: mio.signal,
      alAvanzar: (p) => control === mio && paso(t(p)),
    });
    if (control !== mio) return;
    r.segundos = (performance.now() - inicio) / 1000;
    r.fecha = Date.now();
    r.miniatura = img.miniatura;
    r.materia = materia;
    r.sesion = sesionActual().id;
    ultimo = r;
    pintarResultado(r);
    guardarHistorial(r);
  } catch (e) {
    if (control !== mio) return;
    if (e instanceof ErrorGemini && e.motivo === 'modelo') CUENTAS.forEach((c) => escribir(K.modelos + c.id, null));
    mostrarError(mensajeError(e), !(e instanceof ErrorGemini && e.motivo === 'cancelado'));
  } finally {
    if (control === mio) {
      clearInterval(reloj);
      paso('', false);
      control = null;
    }
  }
}

function mostrarError(msg, reintentar) {
  const caja = document.createElement('div');
  caja.className = 'aviso err';
  caja.textContent = msg + ' ';
  if (reintentar && ultimoBlob) {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.type = 'button';
    b.textContent = t('retry');
    b.onclick = () => procesar(ultimoBlob);
    caja.append(b);
  }
  $('resultado').replaceChildren(caja);
}

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
};

const etiquetaCorrectas = (p) => p.correctas.map((n) => `${letra(n)} (${n}ª)`).join(' + ');

function pintarResultado(r) {
  $('trabajo').classList.remove('oculto');
  const cont = document.createDocumentFragment();
  const meta = el('div', 'meta');
  meta.append(el('span', `badge ${r.estado}`, t(r.estado)));
  if (r.segundos) meta.append(el('span', '', `${r.segundos.toFixed(1)} s`));
  if (r.modelo) meta.append(el('span', '', r.modelo));
  cont.append(meta);
  r.preguntas.forEach((p, i) => {
    const b = el('div', 'resp');
    if (r.preguntas.length > 1) b.append(el('div', 'num', t('question', i + 1, r.preguntas.length)));
    b.append(el('div', 'letra', `${t('option')} ${etiquetaCorrectas(p)}`));
    for (const n of p.correctas) b.append(el('div', 'texto', p.opciones[n - 1]));
    const alt = r.alternativa?.[i];
    if (alt && etiquetaCorrectas(alt) !== etiquetaCorrectas(p)) {
      b.append(el('div', 'alt', t('alt', `${t('option')} ${etiquetaCorrectas(alt)}`)));
    }
    const d = el('details');
    const s = el('summary', '', t('transcript') + (p.votos ? ` · ${t('votes', p.votos, p.total)}` : ''));
    d.append(s, el('p', 'enun', p.enunciado));
    const ol = el('ol');
    p.opciones.forEach((o, j) => ol.append(el('li', p.correctas.includes(j + 1) ? 'ok' : '', o)));
    d.append(ol);
    b.append(d);
    cont.append(b);
  });
  $('resultado').replaceChildren(cont);
}

// --- Historial ---
// Se guardan hasta 300 resultados (un examen largo cabe entero en la sesión);
// solo los 40 más recientes conservan la miniatura, para no llenar el almacenamiento.
const MAX_HIST = 300;
const MAX_MINIATURAS = 40;
function guardarHistorial(r) {
  const h = leerJson(K.hist, []);
  const { estado, preguntas, alternativa, modelo, segundos, fecha, miniatura, materia, sesion } = r;
  h.unshift({ estado, preguntas, alternativa, modelo, segundos, fecha, miniatura, materia, sesion });
  h.forEach((x, i) => i >= MAX_MINIATURAS && delete x.miniatura);
  // Si no cabe, se van quitando las más antiguas.
  while (h.length) {
    if (h.length <= MAX_HIST && escribir(K.hist, JSON.stringify(h))) break;
    h.pop();
  }
  pintarHistorial();
  pintarSesion();
}
function pintarHistorial() {
  const h = leerJson(K.hist, []);
  const cont = $('hist');
  if (!h.length) {
    cont.replaceChildren(el('p', 'vacio', t('empty')));
    $('bBorrar').classList.add('oculto');
    return;
  }
  $('bBorrar').classList.remove('oculto');
  const fmt = new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  cont.replaceChildren(
    ...h.slice(0, MAX_MINIATURAS).map((r) => {
      const b = el('button');
      b.type = 'button';
      const img = el('img');
      img.alt = '';
      if (typeof r.miniatura === 'string' && r.miniatura.startsWith('data:image/')) img.src = r.miniatura;
      const x = el('div', 'x');
      const p = r.preguntas?.[0];
      x.append(
        el('span', 'r', r.preguntas.map((q) => `${t('option')} ${etiquetaCorrectas(q)}`).join(' · ')),
        el('span', '', p ? p.opciones[p.correctas[0] - 1] ?? '' : ''),
        el('span', 't', [fmt.format(new Date(r.fecha)), t(r.estado), r.materia].filter(Boolean).join(' · ')),
      );
      b.append(img, x);
      b.onclick = () => {
        ultimo = r;
        $('vista').replaceChildren();
        pintarResultado(r);
        $('trabajo').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      return b;
    }),
  );
}
$('bBorrar').onclick = () => {
  if (confirm(t('confirm_clear'))) {
    escribir(K.hist, null);
    pintarHistorial();
    pintarSesion();
  }
};

// --- Sesión y PDF ---
function sesionActual() {
  let s = leerJson(K.sesion, null);
  if (!s?.id) {
    s = { id: Date.now().toString(36), inicio: Date.now() };
    escribir(K.sesion, JSON.stringify(s));
  }
  return s;
}
/** Preguntas de la sesión en el orden en que se resolvieron. */
function preguntasSesion() {
  const id = sesionActual().id;
  return leerJson(K.hist, [])
    .filter((r) => r.sesion === id)
    .reverse()
    .flatMap((r) =>
      r.preguntas.map((p, i) => ({
        enunciado: p.enunciado,
        opciones: p.opciones,
        correctas: p.correctas,
        estado: r.estado,
        alternativa: r.alternativa?.[i]?.correctas ?? null,
        materia: r.materia,
      })),
    );
}
function pintarSesion() {
  const items = preguntasSesion();
  $('sesionInfo').textContent = t('session_info', items.length, items.filter((p) => p.estado === 'dudosa').length);
  $('bPdf').disabled = items.length === 0;
}
$('bPdf').onclick = async () => {
  const items = preguntasSesion();
  if (!items.length) return alert(t('empty_session'));
  const materias = [...new Set(items.map((p) => p.materia).filter(Boolean))];
  try {
    await exportarPdf({ items, materia: materias.join(', '), inicio: sesionActual().inicio, t, lang });
  } catch {
    alert(t('pdf_error'));
  }
};
$('bNueva').onclick = () => {
  if (preguntasSesion().length && !confirm(t('confirm_new'))) return;
  escribir(K.sesion, null);
  sesionActual();
  pintarSesion();
};

// La materia se recuerda entre preguntas.
$('iMateria').value = leer(K.materia) ?? '';
$('iMateria').addEventListener('input', () => escribir(K.materia, $('iMateria').value.trim() || null));

revisarClave();
aplicarIdioma();
