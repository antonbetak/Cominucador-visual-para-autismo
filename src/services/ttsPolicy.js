const QUOTA_KEY = "nunu-tts-quota-until";
let quotaUntil = 0;
export function getQuotaUntil() {
  try { quotaUntil = Math.max(quotaUntil, Number(globalThis.localStorage?.getItem(QUOTA_KEY)) || 0); } catch { /* Optional device storage. */ }
  return quotaUntil;
}
export function blockQuota(until) {
  quotaUntil = Math.max(getQuotaUntil(), until);
  try { globalThis.localStorage?.setItem(QUOTA_KEY, String(quotaUntil)); } catch { /* In-memory protection still applies. */ }
}
// Atomic across tabs and reloads: reserve at most one background generation / 24 h.
// If persistence is unavailable, generate only in response to an actual tap.
export async function reserveBackgroundGeneration() {
  if (!globalThis.indexedDB) return false;
  return new Promise((resolve) => {
    let allowed = false;
    let db;
    try {
      const request = indexedDB.open("nunu-tts-policy", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("limits");
      request.onerror = request.onblocked = () => resolve(false);
      request.onsuccess = () => {
        db = request.result;
        const tx = db.transaction("limits", "readwrite");
        const store = tx.objectStore("limits");
        const read = store.get("background");
        read.onsuccess = () => {
          if (Date.now() - (read.result || 0) >= 86400000) {
            store.put(Date.now(), "background");
            allowed = true;
          }
        };
        tx.oncomplete = () => { db.close(); resolve(allowed); };
        tx.onabort = tx.onerror = () => { db.close(); resolve(false); };
      };
    } catch { db?.close(); resolve(false); }
  });
}
export function speechErrorMessage(error) {
  if (error?.code === "quota") return "La cuota de voz está agotada temporalmente. Los audios guardados siguen disponibles.";
  if (error?.code === "blocked") return "El navegador bloqueó el audio. Pulsa Reintentar para escucharlo.";
  if (error?.code === "format") return "El audio recibido no es válido. Puedes reintentar.";
  if (error?.code === "network") return "No se pudo conectar con la voz. Revisa tu conexión y reintenta.";
  if (["authentication", "configuration"].includes(error?.code)) return "El servicio de voz necesita revisión de configuración.";
  return "No se pudo reproducir la voz. Puedes reintentar.";
}
