// Exporta la sesión a PDF (solo texto, sin imágenes) con jsPDF 4.2.1, servido
// desde assets/vendor para no depender de ningún CDN.

let cargando = null;
function cargarJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  cargando ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf);
    s.onerror = () => {
      cargando = null;
      rej(new Error('jsPDF'));
    };
    document.head.append(s);
  });
  return cargando;
}

// Las fuentes estándar del PDF solo cubren Latin-1 (WinAnsi): se aproximan
// los caracteres tipográficos y se cambia por «?» lo que no tenga equivalente.
const EQUIVALENCIAS = {
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"', '–': '-', '—': '-', '…': '...',
  '≤': '<=', '≥': '>=', '≠': '!=', '→': '->', '←': '<-', '⇒': '=>', '•': '·', '−': '-', '×': 'x',
};
export const latin1 = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, (c) => EQUIVALENCIAS[c] ?? (/\s/.test(c) ? ' ' : '?'));

export const letra = (n) => (n >= 1 && n <= 26 ? String.fromCharCode(64 + n) : String(n));

/**
 * @param items preguntas de la sesión en orden: { enunciado, opciones, correctas, estado, alternativa }
 * @param t     función de textos de la app (para ES/EN)
 */
export async function exportarPdf({ items, materia, inicio, t, lang }) {
  const { jsPDF } = await cargarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 16;
  const ANCHO = 210 - 2 * M;
  const ALTO = 297;
  let y = M;
  const verde = [0, 120, 80];
  const ambar = [170, 100, 0];
  const gris = [100, 110, 125];

  const texto = (s, x, { size = 10, bold = false, color = [20, 24, 38], ancho = ANCHO - (x - M), salto = 0.42 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(latin1(s), ancho);
    const alto = size * salto;
    for (const l of lineas) {
      if (y + alto > ALTO - M) nuevaPagina();
      doc.text(l, x, y + alto * 0.8);
      y += alto;
    }
  };
  const nuevaPagina = () => {
    doc.addPage();
    y = M;
  };
  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' });

  texto('QuizLens', M, { size: 18, bold: true });
  y += 1;
  texto(`${t('pdf_session')} ${fmt.format(new Date(inicio))}`, M, { size: 10, color: gris });
  if (materia) texto(`${t('subject')}: ${materia}`, M, { size: 10, color: gris });
  const dudosas = items.filter((p) => p.estado === 'dudosa').length;
  texto(t('pdf_summary', items.length, dudosas), M, { size: 10, color: gris });
  y += 4;

  items.forEach((p, i) => {
    // Que el enunciado no quede solo al pie de página.
    if (y > ALTO - M - 30) nuevaPagina();
    doc.setDrawColor(220, 224, 232);
    doc.line(M, y, M + ANCHO, y);
    y += 3;
    const cabecera = `${t('pdf_question')} ${i + 1}`;
    texto(cabecera + (p.estado === 'dudosa' ? `   [${t('dudosa')}]` : ''), M, {
      size: 11, bold: true, color: p.estado === 'dudosa' ? ambar : [20, 24, 38],
    });
    y += 0.5;
    texto(p.enunciado, M, { size: 10 });
    y += 1;
    p.opciones.forEach((o, j) => {
      const ok = p.correctas.includes(j + 1);
      texto(`${ok ? '»' : ' '} ${letra(j + 1)})  ${o}`, M + 3, { size: 10, bold: ok, color: ok ? verde : [40, 44, 58], ancho: ANCHO - 6 });
    });
    y += 0.5;
    let linea = `${t('pdf_answer')}: ${p.correctas.map(letra).join(' + ')}`;
    if (p.estado === 'dudosa' && p.alternativa?.length && p.alternativa.join() !== p.correctas.join()) {
      linea += `   (${t('pdf_other')}: ${p.alternativa.map(letra).join(' + ')})`;
    }
    texto(linea, M, { size: 10, bold: true, color: p.estado === 'dudosa' ? ambar : verde });
    y += 4;
  });

  // Plantilla final, como las de los exámenes: 1C 2A 3D…
  if (y > ALTO - M - 25) nuevaPagina();
  y += 2;
  texto(t('pdf_key'), M, { size: 12, bold: true });
  y += 1;
  const plantilla = items.map((p, i) => `${i + 1}${p.correctas.map(letra).join('+')}${p.estado === 'dudosa' ? '?' : ''}`).join('   ');
  texto(plantilla, M, { size: 11, salto: 0.55 });
  if (dudosas) {
    y += 1;
    texto(t('pdf_key_note'), M, { size: 9, color: gris });
  }

  const paginas = doc.getNumberOfPages();
  for (let n = 1; n <= paginas; n++) {
    doc.setPage(n);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...gris);
    doc.text('QuizLens · unfantasmaenelsistema.com', M, ALTO - 8);
    doc.text(`${n} / ${paginas}`, 210 - M, ALTO - 8, { align: 'right' });
  }
  const d = new Date(inicio);
  const nombre = `quizlens_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.pdf`;
  doc.save(nombre);
  return nombre;
}
