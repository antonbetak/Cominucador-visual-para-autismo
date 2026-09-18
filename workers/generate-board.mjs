const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_MODEL_CANDIDATES = [GEMINI_MODEL];

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://comunicador-visual-nunu.vercel.app",
];

const boardSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    context: { type: "STRING" },
    categories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          cards: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                speech: { type: "STRING" },
                concept: { type: "STRING" },
                keywords: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["label", "speech", "concept", "keywords"],
            },
          },
        },
        required: ["name", "cards"],
      },
    },
  },
  required: ["title", "description", "context", "categories"],
};

function buildCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  return headers;
}

function sanitizePrompt(prompt) {
  if (typeof prompt !== "string") return "";
  return prompt.trim().slice(0, 1500);
}

function normalizeJsonText(rawText) {
  if (typeof rawText !== "string") return "";

  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!text) return "";

  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");
  if (startIndex !== -1 && endIndex > startIndex) {
    return text.slice(startIndex, endIndex + 1).trim();
  }

  const arrayStartIndex = text.indexOf("[");
  const arrayEndIndex = text.lastIndexOf("]");
  if (arrayStartIndex !== -1 && arrayEndIndex > arrayStartIndex) {
    return text.slice(arrayStartIndex, arrayEndIndex + 1).trim();
  }

  return text;
}

function parseGeminiJson(text) {
  const candidates = [text, normalizeJsonText(text)];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      return JSON.parse(candidate);
    } catch {
      // Intentionally ignored: keep trying with more tolerant extraction.
    }

    const fallbackMatch = candidate.match(/\{[\s\S]*\}/);
    if (fallbackMatch) {
      try {
        return JSON.parse(fallbackMatch[0]);
      } catch {
        // Intentionally ignored.
      }
    }
  }

  return null;
}

function storyItemToCard(item, fallbackLabel = "Tarjeta") {
  const label = String(item?.label || item?.nombre || item?.name || item?.accion || item?.emocion || item?.titulo || fallbackLabel)
    .trim() || fallbackLabel;
  const speech = String(item?.speech || item?.descripcion || item?.momento || item?.caracteristica || item?.phrase || label)
    .trim() || label;
  const concept = String(item?.concept || item?.nombre || item?.label || item?.accion || item?.emocion || "general")
    .trim() || "general";

  return { label, speech, concept, keywords: Array.isArray(item?.keywords) ? item.keywords.filter(Boolean).slice(0, 8).map(String) : [] };
}

function buildStoryCategories(parsed) {
  const builtCategories = [];
  const mappings = [
    { key: "personajes", name: "Personajes" },
    { key: "acciones", name: "Acciones" },
    { key: "emociones", name: "Emociones" },
  ];

  for (const mapping of mappings) {
    const items = Array.isArray(parsed?.[mapping.key]) ? parsed[mapping.key] : [];
    if (!items.length) continue;

    builtCategories.push({
      name: mapping.name,
      cards: items
        .filter((item) => item && typeof item === "object")
        .map((item, itemIndex) => storyItemToCard(item, `${mapping.name} ${itemIndex + 1}`)),
    });
  }

  return builtCategories;
}

function normalizeGeneratedBoard(parsed) {
  const directCategories = Array.isArray(parsed?.categories) ? parsed.categories : [];
  if (directCategories.length) {
    return {
      title: String(parsed?.title || "Tablero generado").trim() || "Tablero generado",
      description: String(parsed?.description || "Tablero generado por Nunu").trim() || "Tablero generado por Nunu",
      context: String(parsed?.context || "general").trim() || "general",
      categories: directCategories,
    };
  }

  const storyCategories = buildStoryCategories(parsed);
  if (storyCategories.length) {
    return {
      title: String(parsed?.title || parsed?.titulo || "Tablero del cuento").trim() || "Tablero del cuento",
      description: String(parsed?.description || parsed?.descripcion || "Tablero de comunicación generado a partir del cuento").trim() || "Tablero de comunicación generado a partir del cuento",
      context: String(parsed?.context || parsed?.contexto || "cuento").trim() || "cuento",
      categories: storyCategories,
    };
  }

  return {
    title: String(parsed?.title || parsed?.titulo || "Tablero generado").trim() || "Tablero generado",
    description: String(parsed?.description || parsed?.descripcion || "Tablero generado por Nunu").trim() || "Tablero generado por Nunu",
    context: String(parsed?.context || parsed?.contexto || "general").trim() || "general",
    categories: [],
  };
}

function extractGeminiText(payload) {
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.text === "string" && payload.text.trim()) return payload.text.trim();

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }

  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return "";
}

const SYSTEM_PROMPT = `Eres el motor inteligente de generación de tableros de comunicación de Nunu.

Tu función es transformar instrucciones escritas en lenguaje natural en tableros estructurados de comunicación aumentativa y alternativa.

No mantienes conversaciones normales.
No expliques lo que haces.
Generas exclusivamente datos válidos según el schema solicitado.
Prioriza vocabulario funcional, breve, comprensible y útil.

Tu objetivo es permitir expresar deseos, necesidades, emociones, acciones, comentarios, preguntas, aceptación, rechazo, ayuda, repetición y finalización.
Si el usuario indica un cuento, identifica personajes, acciones, emociones, lugares, objetos relevantes, participación narrativa y preguntas útiles.
No conviertas el contexto en un simple resumen textual; transforma el cuento en oportunidades reales de comunicación.
Mantén frases cortas, evita duplicados y usa conceptos relevantes.
Respeta cualquier límite de tarjetas solicitado por el usuario.
No generes diagnósticos ni recomendaciones médicas.
No inventes información personal.
No generes imágenes, URLs ni rutas de pictogramas.
Devuelve un JSON válido siguiendo exactamente el schema solicitado.
`;

async function callGemini({ apiKey, prompt, instruction, currentBoardSummary, maxCards }) {
  const finalPrompt = `Genera un tablero de comunicación de Nunu para esta petición: ${prompt || "Refina este tablero"}. ${instruction ? `Instrucción adicional: ${instruction}.` : ""} ${currentBoardSummary ? `Contexto actual: ${currentBoardSummary}.` : ""} ${maxCards ? `Máximo ${maxCards} tarjetas en total.` : ""}`;

  let lastError = null;

  for (const modelName of GEMINI_MODEL_CANDIDATES) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: finalPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: boardSchema,
            temperature: 0.5,
            maxOutputTokens: 2000,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data?.error?.message || `Gemini request failed for ${modelName}`;
        lastError = new Error(errorMessage);
        continue;
      }

      const text = extractGeminiText(data);
      if (!text) {
        lastError = new Error(`Respuesta vacía de Gemini para ${modelName}`);
        continue;
      }

      const parsed = parseGeminiJson(text);
      if (!parsed || typeof parsed !== "object") {
        lastError = new Error(`Respuesta de Gemini no es JSON válido para ${modelName}`);
        continue;
      }

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini request failed");
    }
  }

  throw lastError || new Error("Gemini request failed");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin),
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
      });
    }

    try {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return new Response(JSON.stringify({ error: "Invalid content type" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
        });
      }

      const body = await request.json();
      const prompt = sanitizePrompt(body?.prompt || "");
      const instruction = sanitizePrompt(body?.instruction || body?.refinement || "");
      const currentBoard = body?.currentBoard && typeof body.currentBoard === "object" ? body.currentBoard : null;
      const maxCards = Number.isFinite(body?.maxCards) ? Math.max(2, Math.min(16, Number(body.maxCards))) : null;

      if (!prompt && !currentBoard) {
        return new Response(JSON.stringify({ error: "Prompt requerido" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
        });
      }

      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "Servicio no disponible. Configura GEMINI_API_KEY en el Worker." }), {
          status: 503,
          headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
        });
      }

      const currentBoardSummary = currentBoard ? JSON.stringify({
        title: currentBoard.title || "Tablero actual",
        description: currentBoard.description || "",
        categories: (currentBoard.categories || []).slice(0, 6).map((category) => ({
          name: category?.name || "Categoría",
          cards: (category?.cards || category?.tiles || []).slice(0, 8).map((card) => ({
            label: card?.label || card?.name || "",
            speech: card?.phrase || card?.speech || "",
            concept: card?.concept || card?.label || "",
          })),
        })),
      }) : "";

      const parsed = await callGemini({
        apiKey,
        prompt,
        instruction,
        currentBoardSummary,
        maxCards,
      });

      const normalizedBoard = normalizeGeneratedBoard(parsed);

      if (!normalizedBoard.categories || !Array.isArray(normalizedBoard.categories) || !normalizedBoard.categories.length) {
        return new Response(JSON.stringify({ error: "No se generaron categorías válidas" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
        });
      }

      const normalizedCategories = normalizedBoard.categories.map((category, categoryIndex) => {
        const cards = Array.isArray(category.cards) ? category.cards.filter((card) => card && typeof card.label === "string") : [];
        const safeCards = cards.slice(0, Math.max(2, maxCards ? Math.ceil(maxCards / Math.max(normalizedBoard.categories.length, 1)) : 8));
        return {
          id: `ai-${categoryIndex + 1}-${Math.random().toString(36).slice(2, 8)}`,
          name: typeof category.name === "string" && category.name.trim() ? category.name.trim() : `Categoría ${categoryIndex + 1}`,
          color: ["#F9E66B", "#8ED6FF", "#FFB7C3", "#B7E4A6", "#D6C4FF", "#BFE8D4"][categoryIndex % 6],
          cards: safeCards.map((card, cardIndex) => ({
            id: `ai-card-${categoryIndex + 1}-${cardIndex + 1}-${Math.random().toString(36).slice(2, 8)}`,
            label: String(card.label || "Sin texto").trim() || "Sin texto",
            phrase: String(card.speech || card.label || "Sin texto").trim() || "Sin texto",
            color: ["#F9E66B", "#8ED6FF", "#FFB7C3", "#B7E4A6", "#D6C4FF", "#BFE8D4"][cardIndex % 6],
            concept: String(card.concept || card.label || "general").trim() || "general",
            keywords: Array.isArray(card.keywords) ? card.keywords.filter(Boolean).slice(0, 8).map(String) : [],
            image: "",
            audio: "",
            youtubeUrl: "",
            youtubeStart: "",
            youtubeEnd: "",
            createdAt: Date.now(),
          })),
        };
      }).filter((category) => category.cards.length > 0);

      if (!normalizedCategories.length) {
        return new Response(JSON.stringify({ error: "No se generaron tarjetas válidas" }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
        });
      }

      return new Response(JSON.stringify({
        title: String(normalizedBoard.title || "Tablero generado").trim() || "Tablero generado",
        description: String(normalizedBoard.description || "Tablero generado por Nunu").trim() || "Tablero generado por Nunu",
        context: String(normalizedBoard.context || "general").trim() || "general",
        categories: normalizedCategories,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
      });
    } catch (error) {
      console.error("generate-board-worker-error", error instanceof Error ? error.message : "unknown");
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "No pude crear el tablero. Inténtalo nuevamente." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...buildCorsHeaders(origin) },
      });
    }
  },
};
