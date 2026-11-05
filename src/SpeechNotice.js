import { createElement } from "react";
import { speechErrorMessage } from "./services/ttsPolicy.js";

export function SpeechNotice({ error, onRetry }) {
  if (!error) return null;
  return createElement("div", { className: "speech-notice" },
    createElement("span", { role: "status", "aria-live": "polite", "aria-atomic": true }, speechErrorMessage(error)),
    createElement("button", { className: "mini-button", type: "button", disabled: error.retryAt > Date.now(), onClick: onRetry }, "Reintentar"));
}
