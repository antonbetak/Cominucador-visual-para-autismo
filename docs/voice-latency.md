# Latencia de voz de Nunu

Se conserva Gemini 3.1 Flash TTS, Leda, el prompt infantil y `es-MX`.

- Memoria: hasta 48 audios / 12 MiB, reproducción desde el gesto de pulsación.
- IndexedDB: hasta 160 audios / 32 MiB, caducidad de 30 días; limpieza por antigüedad y uso al guardar. La clave incluye texto, modelo, idioma, voz y versión del estilo. Un cambio futuro del prompt debe incrementar la versión.
- Precarga: solo categoría activa, sin tarjetas con grabaciones; espera 500 ms, una petición de fondo global a la vez, máximo 12 textos por visita y 24 generaciones de fondo por carga de la aplicación. Cambiar categoría cancela la cola anterior; la petición ya iniciada termina para aprovechar el resultado. Se detiene con la aplicación oculta y ante errores. Las pulsaciones pueden solicitar frases fuera del presupuesto de precarga.
- Una promesa compartida por texto evita solicitudes duplicadas. Los errores tienen 60 segundos de enfriamiento.
- Al editar el texto se elimina exclusivamente la clave anterior. Cambiar imagen/color o crear una tarjeta no vacía la caché. Las respuestas anteriores a una invalidación no se guardan.
- Sin audio en memoria, la voz del dispositivo responde inmediatamente y Gemini calienta la caché, incluso si hay audio en disco. La siguiente pulsación usa Leda. Esto evita depender de reproducción asíncrona autorizada por Safari y evita cambiar de voz a mitad de una frase. SpeechSynthesis depende de las voces instaladas; no reproduce la voz Leda. La opción del servicio `preferSpeed: false` permite esperar a Gemini.
- Grabaciones, voz nativa y Gemini comparten cancelación: solo continúa la última selección. `pagehide` detiene la reproducción sin borrar IndexedDB.
- IndexedDB es opcional: modo privado, cuota o expulsión del navegador no bloquean la voz. El navegador puede eliminar el almacenamiento; no se promete persistencia absoluta.

## Verificación

Ejecutar `npm test` y `npm run build`. Las pruebas usan IndexedDB simulado, no consumen Gemini.

En las herramientas del navegador, antes de pulsar:

```js
window.addEventListener('nunu:tts-metric', ({ detail }) => console.table([detail]));
```

Los eventos usan `performance.now()` y no contienen textos:

- `request`: desde iniciar fetch hasta recibir cabeceras; incluye `serverTiming` con `gemini` (generación y recepción del resultado en Worker) y `encoding` (conversión a WAV).
- `download`: cabeceras a Blob completo, con bytes.
- `cache`: lectura de IndexedDB.
- `playback`: pulsación a evento `playing` o `SpeechSynthesisUtterance.onstart`, con fuente `memory`, `generated`, `speechSynthesis` o `recording`. Es el inicio observable por el navegador, no una medición física del altavoz.

Comparar la mediana y percentil 95 de `playback` entre primera pulsación, repetición y recarga. En Network comprobar que repetir una frase no genera otro POST. Esperar a que termine la precarga y recargar/cerrar/abrir: la categoría debe recuperarse de IndexedDB sin nuevos POST mientras no caduque. Pulsar rápidamente tres tarjetas y una grabación: únicamente debe seguir sonando la última. Editar una frase: solo esa frase vuelve a generarse. Repetir en Safari de iPhone, Android, modo privado y sin conexión (frases almacenadas y voz nativa si el sistema la permite).

## Streaming y despliegue

Gemini 3.1 TTS admite streaming: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation

Se mantiene WAV completo: el flujo actual entrega PCM envuelto en WAV. El streaming real requeriría transportar fragmentos y programar PCM con Web Audio, gestionar desbloqueo, interrupciones y reanudación en iOS, además de ensamblar el archivo persistente. No se introduce esa ruta sin medirla y validarla en dispositivos reales. Para pictogramas cortos precargados, la reproducción evita completamente la solicitud de red.

Vercel ya reescribe `/api/generate-speech` al Worker: no necesita cambios. Se agregó a Cloudflare el dominio publicado en el homepage del repositorio, `https://cominucador-visual-nunu.vercel.app` (HTTP 200 al verificar). El dominio anterior con `comunicador` respondía `DEPLOYMENT_NOT_FOUND`; se conserva como alias explícito sin abrir CORS a cualquier origen. Publicar frontend y Worker para activar todos los cambios. No se modifican ni trasladan las claves del servidor.

Las pruebas automatizadas no sustituyen la escucha en un iPhone real ni miden la latencia de Gemini en producción. No se hicieron generaciones reales de pago para verificar estos cambios.
