# Latencia de voz de Nunu

Se conserva Gemini 3.1 Flash TTS, Leda, el prompt infantil y `es-MX`.

- Memoria: hasta 48 audios / 12 MiB, reproducción desde el gesto de pulsación.
- IndexedDB: hasta 160 audios / 32 MiB, caducidad de 30 días; limpieza por antigüedad y uso al guardar. Las nuevas entradas guardan bytes `ArrayBuffer` y tipo MIME para evitar fallos de escritura de Blobs observados en WebKit; las entradas anteriores con Blob siguen siendo legibles. La reproducción comienza antes de esperar la confirmación de escritura. La clave incluye texto, modelo, idioma, voz y versión del estilo. Un cambio futuro del prompt debe incrementar la versión.
- Precarga: solo categoría activa, sin tarjetas con grabaciones; restaura inmediatamente de IndexedDB hasta 48 frases en memoria y luego prepara los audios faltantes; una petición de fondo global a la vez, máximo 12 textos revisados por visita y una generación de fondo por navegador cada 24 horas, reservada atómicamente en IndexedDB y conservada entre pestañas y recargas. Cambiar categoría cancela la cola anterior; la petición ya iniciada termina para aprovechar el resultado. Se detiene con la aplicación oculta y ante errores. Las pulsaciones pueden solicitar frases fuera del presupuesto de precarga y tienen prioridad antes de comenzar la siguiente generación de fondo. Una pulsación que comparte una petición de fondo la promueve, sin duplicarla ni esperar a sí misma.
- Una promesa compartida por texto evita solicitudes duplicadas. HTTP 429 bloquea globalmente nuevas generaciones hasta `Retry-After` / `RetryInfo` de Google; se conserva entre recargas. Los audios guardados se consultan antes de ese bloqueo. Los fallos locales de reproducción no tienen cooldown; los fallos temporales HTTP respetan su intervalo de reintento.
- Al editar el texto se elimina exclusivamente la clave anterior. Cambiar imagen/color o crear una tarjeta no vacía la caché. Las respuestas anteriores a una invalidación no se guardan.
- Leda es la voz habitual: memoria → IndexedDB → Gemini. Un audio guardado se reproduce en la primera pulsación tras recargar. Una frase nueva espera su generación sin voz alternativa. Se reutiliza un elemento de audio activado con WAV silencioso en el gesto para facilitar la reproducción asíncrona en Safari; si el navegador bloquea el inicio, se ofrece reintentar.
- SpeechSynthesis solo se permite si el cuidador habilita explícitamente «Voz local de emergencia (solo si falla Leda)» en Ajustes, desactivada por defecto, y después de un fallo de Gemini o reproducción. La falta de caché no activa otra voz. Un error sin audio recuperable muestra un mensaje `role="status"` y botón para reintentar; el reintento explícito nunca ignora un límite de cuota de Google.
- Grabaciones, voz nativa y Gemini comparten cancelación: solo continúa la última selección. `pagehide` detiene la reproducción sin borrar IndexedDB.
- IndexedDB es opcional: modo privado, cuota o expulsión del navegador no bloquean la voz. El navegador puede eliminar el almacenamiento; no se promete persistencia absoluta.

## Verificación

Ejecutar `npm test` y `npm run build`. Las 23 pruebas usan IndexedDB simulado, no consumen Gemini. También se comprobó en Chrome y WebKit con WAV sintético y red interceptada: reproducción asíncrona, caché tras recarga en la primera pulsación y ninguna invocación de voz local. Esto verifica el motor de audio y almacenamiento, no la calidad acústica de Leda ni un iPhone físico.

En las herramientas del navegador, antes de pulsar:

```js
window.addEventListener('nunu:tts-metric', ({ detail }) => console.table([detail]));
```

Los eventos usan `performance.now()` y no contienen textos:

- `request`: desde iniciar fetch hasta recibir cabeceras; incluye `serverTiming` con `gemini` (generación y recepción del resultado en Worker) y `encoding` (conversión a WAV).
- `download`: cabeceras a Blob completo, con bytes.
- `cache`: lectura de IndexedDB.
- `playback`: pulsación a evento `playing` o `SpeechSynthesisUtterance.onstart`, con fuente `memory`, `indexeddb`, `generated`, `speechSynthesis` (emergencia explícita) o `recording`. Es el inicio observable por el navegador, no una medición física del altavoz.

Comparar la mediana y percentil 95 de `playback` entre primera pulsación, repetición y recarga. En Network comprobar que repetir una frase no genera otro POST. Esperar a que termine la precarga y recargar/cerrar/abrir: la categoría debe recuperarse de IndexedDB sin nuevos POST mientras no caduque. Pulsar rápidamente tres tarjetas y una grabación: únicamente debe seguir sonando la última. Editar una frase: solo esa frase vuelve a generarse. Repetir en Safari de iPhone, Android, modo privado y sin conexión (frases almacenadas; voz local solo si se habilitó explícitamente el modo de emergencia).

## Streaming y despliegue

Gemini 3.1 TTS admite streaming: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation

Se mantiene WAV completo: el flujo actual entrega PCM envuelto en WAV. El streaming real requeriría transportar fragmentos y programar PCM con Web Audio, gestionar desbloqueo, interrupciones y reanudación en iOS, además de ensamblar el archivo persistente. No se introduce esa ruta sin medirla y validarla en dispositivos reales. Para pictogramas cortos precargados, la reproducción evita completamente la solicitud de red.

Vercel ya reescribe `/api/generate-speech` al Worker: no necesita cambios. Se agregó a Cloudflare el dominio publicado en el homepage del repositorio, `https://cominucador-visual-nunu.vercel.app` (HTTP 200 al verificar). El dominio anterior con `comunicador` respondía `DEPLOYMENT_NOT_FOUND`; se conserva como alias explícito sin abrir CORS a cualquier origen. Publicar frontend y Worker para activar todos los cambios. No se modifican ni trasladan las claves del servidor.

El Worker no necesita cambios para recuperar la prioridad de Leda. Las pruebas automatizadas no sustituyen la escucha en un iPhone real ni miden la latencia de Gemini en producción. No se hicieron generaciones reales de pago para verificar estos cambios.

## Diagnóstico de producción del 5 de noviembre de 2026

La única generación real autorizada (`Hola`) devolvió HTTP 429: cuota gratuita diaria de 10 solicitudes agotada para `gemini-3.1-flash-tts`, con espera indicada de unas 9 h 44 min. No se recibió audio; no fue un error de decodificación del WAV silencioso. La precarga anterior permitía hasta 24 generaciones por carga de aplicación y podía consumir esa cuota. No se puede determinar qué solicitudes concretas agotaron la cuota a partir de esa respuesta.

Se mantiene el modelo configurado y su salida PCM16 little-endian envuelta en WAV según la documentación de Google: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation . No se modifica Leda ni su prompt. El Worker ahora conserva estado HTTP, categoría y tiempo de reintento; registra solo esos campos, sin frases, claves ni mensajes de Google que pudieran contener datos sensibles. El cliente valida RIFF, tamaño, chunks, PCM16, frecuencia, canales y alineación antes de guardar o reproducir. Una entrada corrupta se elimina individualmente.

El aviso ocupa una fila propia dentro de la barra de frases, sin posición absoluta, con un único mensaje `status` y botón táctil. Se retira después de una reproducción exitosa y no parpadea con cada intento fallido. La cuota deshabilita Reintentar hasta que venza el intervalo.

Las pruebas de WAV sintético en Chrome y WebKit comprueban el elemento HTMLAudioElement, la activación silenciosa y la recuperación de IndexedDB tras recargar; no prueban una generación exitosa de Gemini en producción. La cuota requiere esperar al restablecimiento o intervención del titular en Google AI Studio / facturación; el despliegue no amplía límites. No se realizaron más generaciones reales.
