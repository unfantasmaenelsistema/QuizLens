// Preparación de la foto en el navegador antes de enviarla a Gemini.
// Se mandan dos versiones: la original reescalada y otra «escaneada»
// (fondo aplanado, contraste estirado y algo de nitidez).

const LADO_MAX = 2048;
const LADO_MIN = 1400;

function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function aBase64(canvas, calidad = 0.9) {
  return canvas.toDataURL('image/jpeg', calidad).split(',')[1];
}

/** Abre la imagen respetando la orientación EXIF del móvil. */
export async function abrir(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function medidas(img) {
  const w = img.width;
  const h = img.height;
  const largo = Math.max(w, h);
  let f = 1;
  if (largo > LADO_MAX) f = LADO_MAX / largo;
  else if (largo < LADO_MIN) f = Math.min(2, LADO_MIN / largo);
  return { w: Math.round(w * f), h: Math.round(h * f) };
}

/** Versión «escaneada»: texto oscuro sobre blanco aunque la foto sea de una pantalla. */
function mejorar(base) {
  const { width: w, height: h } = base;
  const ctx = base.getContext('2d', { willReadFrequently: true });
  const datos = ctx.getImageData(0, 0, w, h);
  const px = datos.data;
  const lum = new Float32Array(w * h);
  let suma = 0;
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
    lum[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    suma += lum[j];
  }
  // Pantallas en modo oscuro: se invierte para que el texto quede oscuro.
  if (suma / lum.length < 110) for (let j = 0; j < lum.length; j++) lum[j] = 255 - lum[j];

  // Fondo estimado: la imagen muy reducida y vuelta a ampliar (desenfoque barato).
  const gris = lienzo(w, h);
  const g = gris.getContext('2d', { willReadFrequently: true });
  const gd = g.createImageData(w, h);
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
    gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = lum[j];
    gd.data[i + 3] = 255;
  }
  g.putImageData(gd, 0, 0);
  const pw = Math.max(8, Math.round(w / 24));
  const ph = Math.max(8, Math.round(h / 24));
  const peq = lienzo(pw, ph);
  const p = peq.getContext('2d');
  p.imageSmoothingQuality = 'high';
  p.drawImage(gris, 0, 0, pw, ph);
  const fondo = lienzo(w, h);
  const f = fondo.getContext('2d', { willReadFrequently: true });
  f.imageSmoothingQuality = 'high';
  f.drawImage(peq, 0, 0, w, h);
  const bg = f.getImageData(0, 0, w, h).data;

  // Aplanar el fondo (quita degradados y reflejos suaves).
  const plano = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < plano.length; i += 4, j++) {
    const v = Math.min(255, (lum[j] / Math.max(bg[i] * 1.08, 1)) * 255);
    plano[j] = v;
    hist[v | 0]++;
  }
  // Estirar contraste entre los percentiles 1 y 99.
  const total = plano.length;
  let acc = 0;
  let bajo = 0;
  let alto = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc <= total * 0.01) bajo = v;
    if (acc <= total * 0.99) alto = v;
  }
  const rango = Math.max(alto - bajo, 32);

  // Nitidez: máscara de enfoque con vecinos en cruz.
  const out = gd.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = y * w + x;
      const c = plano[j];
      const vec =
        (plano[x > 0 ? j - 1 : j] + plano[x < w - 1 ? j + 1 : j] + plano[y > 0 ? j - w : j] + plano[y < h - 1 ? j + w : j]) / 4;
      const nitido = c + 0.7 * (c - vec);
      const v = Math.max(0, Math.min(255, ((nitido - bajo) / rango) * 255));
      const i = j * 4;
      out[i] = out[i + 1] = out[i + 2] = v;
    }
  }
  g.putImageData(gd, 0, 0);
  return gris;
}

/** Devuelve las dos versiones en base64 (JPEG) y una miniatura para el historial. */
export async function preparar(blob) {
  const img = await abrir(blob);
  const { w, h } = medidas(img);
  const base = lienzo(w, h);
  const ctx = base.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  const original = aBase64(base, 0.9);
  const mejorada = mejorar(base);
  const fm = 220 / Math.max(w, h);
  const mini = lienzo(Math.round(w * fm), Math.round(h * fm));
  mini.getContext('2d').drawImage(base, 0, 0, mini.width, mini.height);
  return {
    original,
    mejorada: aBase64(mejorada, 0.92),
    vistaMejorada: mejorada.toDataURL('image/jpeg', 0.8),
    miniatura: mini.toDataURL('image/jpeg', 0.6),
  };
}
