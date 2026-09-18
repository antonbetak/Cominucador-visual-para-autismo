const TTS_ENDPOINT = "/api/generate-speech";
const TTS_TIMEOUT_MS = 10000;
export const NUNU_TTS_STYLE = "child";
export const NUNU_TTS_VOICE = "Leda";

const ttsCache = new Map();
const pendingRequests = new Map();
let activeAudio = null;
let activeObjectUrl = "";
let playbackSequence = 0;

function getCacheKey(text) {
  return `${text}|${NUNU_TTS_STYLE}|${NUNU_TTS_VOICE}`;
}

function stopActiveAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }

  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }
}

async function requestSpeech(text) {
  const cacheKey = getCacheKey(text);
  const cachedAudio = ttsCache.get(cacheKey);
  if (cachedAudio) return cachedAudio;

  const pendingRequest = pendingRequests.get(cacheKey);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

    try {
      const response = await fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, voiceStyle: NUNU_TTS_STYLE }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`TTS request failed: ${response.status}`);
      const contentType = response.headers.get("Content-Type") || "";
      if (!contentType.toLowerCase().startsWith("audio/")) throw new Error("TTS response is not audio");

      const audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error("TTS response is empty");
      ttsCache.set(cacheKey, audioBlob);
      return audioBlob;
    } finally {
      window.clearTimeout(timeout);
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}

export async function playGeneratedSpeech(text) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return false;

  const requestSequence = ++playbackSequence;
  stopActiveAudio();
  const audioBlob = await requestSpeech(normalizedText);

  if (requestSequence !== playbackSequence) return false;

  const objectUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(objectUrl);
  activeAudio = audio;
  activeObjectUrl = objectUrl;

  const release = () => {
    if (activeAudio === audio) {
      activeAudio = null;
      URL.revokeObjectURL(objectUrl);
      activeObjectUrl = "";
    }
  };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });

  try {
    await audio.play();
    return true;
  } catch (error) {
    release();
    throw error;
  }
}

export function stopGeneratedSpeech() {
  playbackSequence += 1;
  stopActiveAudio();
}

export function clearGeneratedSpeechCache() {
  ttsCache.clear();
}
