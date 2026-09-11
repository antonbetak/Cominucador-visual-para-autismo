import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { error as logError } from "firebase-functions/logger";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

export const synthesizeSpeech = onCall(
  { secrets: [OPENAI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para generar voz.");
    }

    const data = request.data;
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).length !== 1 ||
      !Object.hasOwn(data, "text") ||
      typeof data.text !== "string"
    ) {
      throw new HttpsError("invalid-argument", "Envía únicamente el campo text como texto.");
    }

    const text = data.text.trim();
    if (!text || text.length > 500) {
      throw new HttpsError("invalid-argument", "El texto debe tener entre 1 y 500 caracteres.");
    }

    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) {
      logError("synthesizeSpeech: falta configurar OPENAI_API_KEY.");
      throw new HttpsError("failed-precondition", "El servicio de voz no está configurado.");
    }

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: "marin",
          response_format: "mp3",
          speed: 0.95,
          input: text,
          instructions: "Habla en español de México con una voz juvenil, cálida, amable y natural. Pronuncia con mucha claridad. Usa un ritmo ligeramente más lento que una conversación normal, sin sonar robótico ni caricaturesco. Mantén una entonación tranquila y natural.",
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        // No registrar ni devolver el cuerpo de error del proveedor.
        logError("synthesizeSpeech: OpenAI rechazó la solicitud.", { status: response.status });
        const code = response.status === 429
          ? "resource-exhausted"
          : response.status >= 500 ? "unavailable" : "internal";
        throw new HttpsError(code, "No se pudo generar la voz. Inténtalo más tarde.");
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) {
        logError("synthesizeSpeech: OpenAI devolvió audio vacío.");
        throw new HttpsError("unavailable", "El servicio de voz no devolvió audio.");
      }

      return { audioBase64: audio.toString("base64"), contentType: "audio/mpeg" };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      logError("synthesizeSpeech: falló la transferencia de audio.", { timedOut });
      throw new HttpsError(
        timedOut ? "deadline-exceeded" : "unavailable",
        timedOut ? "El servicio de voz tardó demasiado." : "No se pudo conectar con el servicio de voz.",
      );
    }
  },
);
