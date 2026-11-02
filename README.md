<p align="center">
  <a href="https://www.unfantasmaenelsistema.com"><img src="assets/icon-192.png" width="110" alt="Un fantasma en el sistema"></a>
</p>

<h1 align="center">QuizLens</h1>

<p align="center">
  <b>Haz una foto a una pregunta tipo test y obtén la respuesta correcta</b><br>
  Fotos de pantalla torcidas, borrosas o con reflejos · Votación entre varias lecturas · Tu propia clave de Gemini
</p>

<p align="center">
  <a href="https://unfantasmaenelsistema.github.io/QuizLens/"><b>▶ Abrir QuizLens</b></a> ·
  <a href="https://www.unfantasmaenelsistema.com">unfantasmaenelsistema.com</a> ·
  <a href="https://www.ghostore.unfantasmaenelsistema.com">GhoStore</a>
</p>

## Qué hace

1. Subes, pegas (Ctrl+V) o fotografías una pregunta tipo test.
2. El navegador prepara dos versiones de la imagen: la original y otra «escaneada» (fondo aplanado, más contraste y nitidez).
3. Gemini la lee **3 veces en paralelo, cada vez con un modelo Flash distinto**. Si las tres coinciden y están seguras, ves la respuesta al momento (*Segura*).
4. Si no coinciden, hay desempate: dos lecturas más y, si tu clave lo permite, Gemini Pro. La respuesta queda como *Confirmada* o *Dudosa* (en ese caso también ves la otra opción).

QuizLens recuerda qué modelos están saturados (503), sin cuota (429) o no existen para tu clave, y los aparta un tiempo para no perder segundos con ellos.

### Plan gratuito de Gemini

Funciona con el plan gratuito, con dos límites:

- **Gemini Pro no está incluido** (cuota 0). El desempate se hace solo con modelos Flash.
- **Unas 20 peticiones al día por modelo.** Con 3 lecturas por pregunta y varios modelos Flash salen unas 30 preguntas al día; después, QuizLens pasa a modelos ligeros (Lite), que fallan más, y marca más respuestas como *Dudosa*.
- Pocas peticiones por minuto: a ritmo de examen (una pregunta cada 15–30 s) no se nota.
- En el plan gratuito Google puede usar lo que envías para mejorar sus productos; en el de pago, no.

Con una clave de pago desaparecen esos límites y el desempate puede usar Gemini Pro. Cada pregunta cuesta del orden de un céntimo o menos.

Solo muestra la respuesta, sin explicación. Si quieres comprobar lo que ha leído, despliega «Ver lo que ha leído».

## Privacidad: qué sale de tu equipo

- **Tu clave de Gemini** se guarda solo en el `localStorage` de tu navegador y viaja únicamente a `generativelanguage.googleapis.com`, en la cabecera `x-goog-api-key`.
- **Las imágenes** van directas de tu navegador a Google. No hay ningún servidor intermedio.
- **El historial** (40 últimas preguntas con miniatura) también se queda en tu navegador. Puedes borrarlo con un clic.
- La página tiene una CSP que solo deja conectar con la API de Gemini.

Consejo: en Google Cloud, restringe la clave a la *Generative Language API* y al referente `https://unfantasmaenelsistema.github.io/*`.

## Sesión y PDF

Cada pregunta resuelta se apunta en la **sesión actual**. Con **Exportar PDF** descargas un PDF (sin imágenes) con:

- el enunciado y las opciones (A, B, C, D) de cada pregunta, con la correcta en verde y negrita;
- las dudosas marcadas, con la opción alternativa;
- al final, una **plantilla de respuestas** compacta: `1C 2A? 3D …`.

**Nueva sesión** empieza otra lista. Las preguntas anteriores siguen en el historial.

## Materia (opcional)

Si escribes la materia (p. ej. «Bases de datos Oracle»), se envía como pista junto a la imagen y aparece en el PDF. No hace falta configurar un rol por tema: el mismo QuizLens vale para cualquier asignatura.

## Ajustes

- **Clave gratuita** y, opcionalmente, **clave de pago**. Primero se gasta la gratuita; la de pago entra cuando la gratuita agota su cuota y para el desempate con Gemini Pro.
- **Comprobaciones en paralelo**: 1 (más rápido), 3 (recomendado) o 5 (máxima seguridad).
- Los modelos se eligen solos: QuizLens consulta qué modelos admite cada clave.

## Pruebas

```bash
node tests/quiz.test.mjs
```

Prueban la votación, los modelos de reserva, la memoria de salud, las dos claves y la cancelación con un `fetch` simulado (no gastan cuota).

## Créditos y licencia

- [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 (MIT), incluido en `assets/vendor/`.

MIT © Un Fantasma en el Sistema
