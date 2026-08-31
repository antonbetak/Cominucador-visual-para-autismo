import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Camera,
  Check,
  Download,
  Image as ImageIcon,
  Link,
  Mic,
  MicOff,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "nunu-comunicador-v1";

const colorOptions = [
  "#F9E66B",
  "#8ED6FF",
  "#FFB7C3",
  "#B7E4A6",
  "#FFC36D",
  "#D6C4FF",
  "#F4F4F5",
  "#BFE8D4",
];

const defaultBoard = {
  categories: [
    {
      id: "basicas",
      name: "Necesidades",
      color: "#F9E66B",
      tiles: [
        tile("agua", "Agua", "Quiero agua", "#8ED6FF", "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=500&q=80"),
        tile("bano", "Baño", "Necesito ir al baño", "#B7E4A6", "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=500&q=80"),
        tile("comer", "Comer", "Quiero comer", "#FFC36D", "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=500&q=80"),
        tile("ayuda", "Ayuda", "Necesito ayuda", "#FFB7C3", "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=500&q=80"),
      ],
    },
    {
      id: "emociones",
      name: "Emociones",
      color: "#FFB7C3",
      tiles: [
        tile("feliz", "Feliz", "Estoy feliz", "#F9E66B", "https://images.unsplash.com/photo-1542596768-5d1d21f1cf98?auto=format&fit=crop&w=500&q=80"),
        tile("triste", "Triste", "Estoy triste", "#8ED6FF", "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=500&q=80"),
        tile("cansado", "Cansado", "Estoy cansado", "#D6C4FF", "https://images.unsplash.com/photo-1519003300449-424ad0405076?auto=format&fit=crop&w=500&q=80"),
        tile("molesto", "Molesto", "Estoy molesto", "#FFC36D", "https://images.unsplash.com/photo-1604881991720-f91add269bed?auto=format&fit=crop&w=500&q=80"),
      ],
    },
    {
      id: "personas",
      name: "Personas",
      color: "#BFE8D4",
      tiles: [
        tile("mama", "Mamá", "Quiero a mamá", "#FFB7C3", "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=500&q=80"),
        tile("papa", "Papá", "Quiero a papá", "#8ED6FF", "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=500&q=80"),
        tile("maestra", "Maestra", "Quiero a mi maestra", "#D6C4FF", "https://images.unsplash.com/photo-1544717297-fa95b6ee9643?auto=format&fit=crop&w=500&q=80"),
      ],
    },
    {
      id: "acciones",
      name: "Acciones",
      color: "#D6C4FF",
      tiles: [
        tile("jugar", "Jugar", "Quiero jugar", "#B7E4A6", "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=500&q=80"),
        tile("descansar", "Descansar", "Quiero descansar", "#8ED6FF", "https://images.unsplash.com/photo-1519003300449-424ad0405076?auto=format&fit=crop&w=500&q=80"),
        tile("terminar", "Terminar", "Ya terminé", "#F4F4F5", "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=500&q=80"),
      ],
    },
  ],
  settings: {
    voiceRate: 0.9,
    voicePitch: 1,
    largeTiles: true,
    autoSpeakPhrase: true,
  },
};

function tile(id, label, phrase, color, image) {
  return { id, label, phrase, color, image, audio: "", createdAt: Date.now() };
}

function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function loadBoard() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : defaultBoard;
  } catch {
    return defaultBoard;
  }
}

function getSupportedAudioMimeType() {
  if (!window.MediaRecorder) return "";
  const types = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function playAudioSource(source) {
  const audio = new Audio(source);
  audio.play().catch(() => {
    alert("No se pudo reproducir esta grabación en este navegador.");
  });
}

function normalizeImageInput(value) {
  const trimmed = value.trim();
  const markdownUrl = trimmed.match(/\]\((https?:\/\/[^)]+)\)/);
  const plainUrl = trimmed.match(/https?:\/\/\S+/);
  return (markdownUrl?.[1] || plainUrl?.[0] || trimmed).replaceAll("\\&", "&").replaceAll("\\_", "_");
}

function getImageUrlHint(value) {
  if (!value.trim()) return "";
  const normalized = normalizeImageInput(value);
  if (normalized.startsWith("data:image/") || normalized.startsWith("blob:")) return "";

  try {
    const url = new URL(normalized);
    const imageExtension = /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname);
    const pageExtension = /\.html?$/i.test(url.pathname);
    if (imageExtension) return "";
    if (pageExtension) return "Ese enlace parece una página web. Usa una URL directa de imagen o sube el archivo.";
  } catch {
    return "La URL no parece válida.";
  }

  return "";
}

function getSearchTerms(value) {
  const term = value.trim();
  if (!term) return [];

  const normalized = term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const relatedTerms = {
    popo: ["popo", "caca", "poop emoji", "poop cartoon", "poop gif"],
    poo: ["poo", "poop emoji", "poop cartoon", "poop gif"],
    poop: ["poop", "poop emoji", "poop cartoon", "poop gif"],
    caca: ["caca", "popo", "poop emoji", "poop cartoon", "poop gif"],
  };

  return [...new Set([term, ...(relatedTerms[normalized] || [])])].slice(0, 5);
}

function getKidFriendlySearchTerms(value, mediaType = "image") {
  const baseTerms = getSearchTerms(value);
  const suffixes = mediaType === "gif"
    ? ["kids sticker", "cartoon sticker", "animated sticker", "cute gif"]
    : ["kids cartoon", "pictogram", "AAC symbol", "clipart"];

  return [
    ...baseTerms.flatMap((term) => suffixes.map((suffix) => `${term} ${suffix}`)),
    ...baseTerms,
  ].slice(0, 10);
}

function getConceptKey(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/agua|beber|tomar|sed/.test(normalized)) return "water";
  if (/bano|banio|pip[ií]|orina|bañ|wc|toilet/.test(normalized)) return "bathroom";
  if (/caca|popo|poop|hacer caca|excremento/.test(normalized)) return "poop";
  if (/comer|hambre|comida|snack|desayuno|almuerzo|cena/.test(normalized)) return "eat";
  if (/feliz|content|alegr/.test(normalized)) return "happy";
  if (/triste|llorar|llanto/.test(normalized)) return "sad";
  if (/mama|madre|pap[aá]|papa|familia/.test(normalized)) return "family";
  if (/ayuda|help|auxilio/.test(normalized)) return "help";
  if (/jugar|juego|play|pelota/.test(normalized)) return "play";
  if (/dormir|descansar|sue[nñ]o|cansad/.test(normalized)) return "sleep";
  if (/si|sí|yes|ok/.test(normalized)) return "yes";
  if (/no|stop|alto/.test(normalized)) return "no";
  if (/gracias|thank/.test(normalized)) return "thanks";
  if (/hola|salud/.test(normalized)) return "hello";
  return "generic";
}

function animatedSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeAnimatedSymbol(value, variant = 0) {
  const concept = getConceptKey(value);
  const palette = [
    ["#e7f7ff", "#2f8fc9", "#145a7a", "#ffd166"],
    ["#fff3cf", "#f28f3b", "#7a4f01", "#8ed6ff"],
    ["#f1ecff", "#8a6dd7", "#45306f", "#b7e4a6"],
  ][variant % 3];
  const [bg, accent, ink, extra] = palette;
  const base = (content) => animatedSvgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
  <rect width="500" height="500" rx="42" fill="${bg}"/>
  ${content}
</svg>`);

  const symbols = {
    water: [
      base(`<g fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"><path d="M170 210c45 28 95 28 160 0"><animate attributeName="d" values="M170 210c45 28 95 28 160 0;M170 220c55-28 105-28 160 0;M170 210c45 28 95 28 160 0" dur="1.4s" repeatCount="indefinite"/></path><path d="M160 280c55 30 125 30 180 0"><animate attributeName="d" values="M160 280c55 30 125 30 180 0;M160 292c60-24 120-24 180 0;M160 280c55 30 125 30 180 0" dur="1.4s" repeatCount="indefinite"/></path></g><g fill="${accent}"><circle cx="250" cy="105" r="18"><animate attributeName="cy" values="80;150;80" dur="1.1s" repeatCount="indefinite"/></circle><circle cx="205" cy="135" r="13"><animate attributeName="cy" values="105;170;105" dur="1.25s" repeatCount="indefinite"/></circle><circle cx="295" cy="135" r="13"><animate attributeName="cy" values="100;175;100" dur="1.35s" repeatCount="indefinite"/></circle></g><path d="M145 190h210l-26 185H171z" fill="#fff" opacity=".78" stroke="${ink}" stroke-width="14" stroke-linejoin="round"/>`),
      base(`<path d="M250 80c-54 70-96 124-96 190 0 63 43 106 96 106s96-43 96-106c0-66-42-120-96-190z" fill="${accent}" stroke="${ink}" stroke-width="14"/><ellipse cx="222" cy="250" rx="23" ry="34" fill="#fff" opacity=".75"><animate attributeName="cy" values="238;258;238" dur="1.2s" repeatCount="indefinite"/></ellipse><path d="M190 320c36 26 84 26 120 0" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"><animate attributeName="d" values="M190 320c36 26 84 26 120 0;M190 328c40-18 80-18 120 0;M190 320c36 26 84 26 120 0" dur="1.3s" repeatCount="indefinite"/></path>`),
    ],
    bathroom: [
      base(`<rect x="155" y="135" width="190" height="190" rx="24" fill="#fff" stroke="${ink}" stroke-width="16"/><path d="M195 135v-40h110v40" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round"/><path d="M190 240h120" stroke="${accent}" stroke-width="18" stroke-linecap="round"><animate attributeName="stroke-dasharray" values="0 130;130 0;0 130" dur="1.4s" repeatCount="indefinite"/></path><circle cx="250" cy="270" r="36" fill="${extra}" opacity=".85"><animate attributeName="r" values="30;40;30" dur="1.2s" repeatCount="indefinite"/></circle>`),
    ],
    poop: [
      base(`<g><path d="M250 110c-10 38 35 46 50 70 55 12 82 46 82 92 0 65-56 107-132 107s-132-42-132-107c0-49 32-83 86-94 0-35 24-58 46-68z" fill="#8a5c4f" stroke="${ink}" stroke-width="12"/><circle cx="205" cy="250" r="32" fill="#fff"/><circle cx="295" cy="250" r="32" fill="#fff"/><circle cx="205" cy="252" r="12" fill="${ink}"><animate attributeName="cy" values="246;258;246" dur="1s" repeatCount="indefinite"/></circle><circle cx="295" cy="252" r="12" fill="${ink}"><animate attributeName="cy" values="258;246;258" dur="1s" repeatCount="indefinite"/></circle><path d="M205 315c35 28 65 28 100 0" fill="none" stroke="${extra}" stroke-width="22" stroke-linecap="round"><animate attributeName="d" values="M205 315c35 28 65 28 100 0;M205 322c35 12 65 12 100 0;M205 315c35 28 65 28 100 0" dur="1.1s" repeatCount="indefinite"/></path><animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" dur="1.2s" repeatCount="indefinite"/></g>`),
    ],
    eat: [
      base(`<circle cx="250" cy="260" r="105" fill="#fff" stroke="${ink}" stroke-width="14"/><circle cx="250" cy="260" r="54" fill="${extra}"/><path d="M130 130v150M110 130v70M150 130v70" stroke="${ink}" stroke-width="14" stroke-linecap="round"/><path d="M360 125v175" stroke="${ink}" stroke-width="18" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="-8 360 125;8 360 125;-8 360 125" dur="1.2s" repeatCount="indefinite"/></path><circle cx="250" cy="260" r="22" fill="${accent}"><animate attributeName="r" values="18;28;18" dur="1s" repeatCount="indefinite"/></circle>`),
    ],
    happy: [
      base(`<circle cx="250" cy="250" r="130" fill="${extra}" stroke="${ink}" stroke-width="14"/><circle cx="205" cy="220" r="18" fill="${ink}"/><circle cx="295" cy="220" r="18" fill="${ink}"/><path d="M185 280c34 58 96 58 130 0" fill="none" stroke="${ink}" stroke-width="18" stroke-linecap="round"><animate attributeName="d" values="M185 280c34 58 96 58 130 0;M185 288c34 36 96 36 130 0;M185 280c34 58 96 58 130 0" dur="1.1s" repeatCount="indefinite"/></path><g fill="${accent}"><circle cx="128" cy="120" r="14"/><circle cx="372" cy="120" r="14"/><circle cx="410" cy="335" r="14"/><animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="1s" repeatCount="indefinite"/></g>`),
    ],
    sad: [
      base(`<circle cx="250" cy="250" r="130" fill="${extra}" stroke="${ink}" stroke-width="14"/><circle cx="205" cy="220" r="18" fill="${ink}"/><circle cx="295" cy="220" r="18" fill="${ink}"/><path d="M190 330c32-42 88-42 120 0" fill="none" stroke="${ink}" stroke-width="18" stroke-linecap="round"/><path d="M205 250c-22 36-22 58 0 70 22-12 22-34 0-70z" fill="${accent}"><animate attributeName="transform" values="translate(0 0);translate(0 28);translate(0 0)" dur="1.4s" repeatCount="indefinite"/></path>`),
    ],
    family: [
      base(`<circle cx="190" cy="190" r="48" fill="${extra}" stroke="${ink}" stroke-width="12"/><circle cx="310" cy="190" r="48" fill="${accent}" stroke="${ink}" stroke-width="12"/><circle cx="250" cy="290" r="42" fill="#fff" stroke="${ink}" stroke-width="12"/><path d="M130 365c20-70 100-70 120 0M250 365c20-70 100-70 120 0M200 395c14-50 86-50 100 0" fill="none" stroke="${ink}" stroke-width="14" stroke-linecap="round"/><g><path d="M160 130c30-26 60-26 90 0" stroke="${accent}" stroke-width="10" stroke-linecap="round"/><path d="M250 130c30-26 60-26 90 0" stroke="${extra}" stroke-width="10" stroke-linecap="round"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" dur="1.2s" repeatCount="indefinite"/></g>`),
    ],
    help: [
      base(`<circle cx="250" cy="220" r="66" fill="${extra}" stroke="${ink}" stroke-width="14"/><path d="M180 365c24-86 116-86 140 0" fill="none" stroke="${ink}" stroke-width="18" stroke-linecap="round"/><path d="M330 130l52-52M348 190h74M315 85l35-55" stroke="${accent}" stroke-width="18" stroke-linecap="round"><animate attributeName="opacity" values=".35;1;.35" dur=".9s" repeatCount="indefinite"/></path><path d="M250 200v65M250 305v2" stroke="${ink}" stroke-width="24" stroke-linecap="round"/>`),
    ],
    play: [
      base(`<g><circle cx="250" cy="260" r="92" fill="${extra}" stroke="${ink}" stroke-width="14"/><path d="M188 205c38 22 86 22 124 0M188 315c38-22 86-22 124 0M250 168v184" stroke="${ink}" stroke-width="12" stroke-linecap="round"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -35;0 0" dur=".9s" repeatCount="indefinite"/></g>`),
    ],
    sleep: [
      base(`<rect x="135" y="250" width="240" height="92" rx="24" fill="#fff" stroke="${ink}" stroke-width="14"/><circle cx="190" cy="220" r="42" fill="${extra}" stroke="${ink}" stroke-width="12"/><path d="M120 340h280" stroke="${ink}" stroke-width="16" stroke-linecap="round"/><text x="300" y="155" font-size="58" font-family="Arial" font-weight="900" fill="${accent}">Z</text><text x="355" y="105" font-size="44" font-family="Arial" font-weight="900" fill="${accent}">Z</text><g><animateTransform attributeName="transform" type="translate" values="0 12;0 -8;0 12" dur="1.6s" repeatCount="indefinite"/></g>`),
    ],
    yes: [
      base(`<circle cx="250" cy="250" r="130" fill="${extra}" stroke="${ink}" stroke-width="14"/><path d="M170 250l55 58 110-122" fill="none" stroke="${accent}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="stroke-width" values="24;36;24" dur=".9s" repeatCount="indefinite"/></path>`),
    ],
    no: [
      base(`<circle cx="250" cy="250" r="130" fill="#fff" stroke="${ink}" stroke-width="14"/><path d="M165 165l170 170M335 165L165 335" stroke="#e04f5f" stroke-width="34" stroke-linecap="round"><animate attributeName="stroke-width" values="26;38;26" dur=".9s" repeatCount="indefinite"/></path>`),
    ],
    thanks: [
      base(`<path d="M175 255c-28-58 38-104 75-52 37-52 103-6 75 52-22 47-75 78-75 78s-53-31-75-78z" fill="${extra}" stroke="${ink}" stroke-width="13"><animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="1s" repeatCount="indefinite"/></path><path d="M150 360c58 28 142 28 200 0" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>`),
    ],
    hello: [
      base(`<circle cx="230" cy="160" r="44" fill="${extra}" stroke="${ink}" stroke-width="12"/><path d="M160 340c20-82 120-82 140 0" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round"/><path d="M310 250c34-20 42-56 22-92" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="-12 310 250;15 310 250;-12 310 250" dur=".8s" repeatCount="indefinite"/></path>`),
    ],
    generic: [
      base(`<circle cx="250" cy="235" r="95" fill="${extra}" stroke="${ink}" stroke-width="14"/><path d="M210 220h.1M290 220h.1" stroke="${ink}" stroke-width="24" stroke-linecap="round"/><path d="M205 285c28 30 62 30 90 0" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round"/><g fill="${accent}"><circle cx="140" cy="140" r="16"/><circle cx="360" cy="140" r="16"/><circle cx="250" cy="90" r="16"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -12;0 0" dur="1s" repeatCount="indefinite"/></g>`),
    ],
  };

  return symbols[concept]?.[variant % symbols[concept].length] || symbols.generic[0];
}

function searchAnimatedSymbols(searchTerm) {
  return Promise.resolve([0, 1, 2].map((variant) => makeAnimatedSymbol(searchTerm, variant)));
}

function uniqueImageUrls(urls) {
  return [...new Set(urls.filter(Boolean))].slice(0, 18);
}

async function fetchJsonWithTimeout(url, timeoutMs = 5500) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("No se pudo buscar.");
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function isGifUrl(value) {
  try {
    return /\.gif$/i.test(new URL(value).pathname);
  } catch {
    return /\.gif($|\?)/i.test(value);
  }
}

async function searchCommonsImages(searchTerm, mediaType = "image", kidFriendly = true) {
  const searches = kidFriendly ? getKidFriendlySearchTerms(searchTerm, mediaType) : getSearchTerms(searchTerm);
  const responses = await Promise.allSettled(
    searches.map(async (term) => {
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: `file:${mediaType === "gif" ? `${term} gif` : term}`,
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "600",
        format: "json",
        origin: "*",
      });
      const data = await fetchJsonWithTimeout(url);
      return Object.values(data.query?.pages || {});
    })
  );

  return responses
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .flat()
    .map((page) => page.imageinfo?.[0])
    .filter((image) => image?.mime?.startsWith("image/"))
    .filter((image) => mediaType !== "gif" || image.mime === "image/gif" || isGifUrl(image.url || ""))
    .map((image) => (image.mime === "image/gif" ? image.url : image.thumburl || image.url));
}

async function searchOpenverseImages(searchTerm, mediaType = "image", kidFriendly = true) {
  const searches = kidFriendly ? getKidFriendlySearchTerms(searchTerm, mediaType) : getSearchTerms(searchTerm);
  const responses = await Promise.allSettled(
    searches.map(async (term) => {
      const url = new URL("https://api.openverse.org/v1/images/");
      url.search = new URLSearchParams({
        q: mediaType === "gif" ? `${term} gif` : term,
        page_size: "8",
      });
      const data = await fetchJsonWithTimeout(url, 3500);
      return data.results || [];
    })
  );

  return responses
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .flat()
    .filter((image) => image.url || image.thumbnail)
    .map((image) => image.url || image.thumbnail)
    .filter((url) => mediaType !== "gif" || isGifUrl(url));
}

async function searchArasaacImages(searchTerm) {
  const searches = getSearchTerms(searchTerm);
  const responses = await Promise.allSettled(
    searches.map(async (term) => {
      const url = new URL(`https://api.arasaac.org/v1/pictograms/es/bestsearch/${encodeURIComponent(term)}`);
      const data = await fetchJsonWithTimeout(url, 5500);
      return Array.isArray(data) ? data : [];
    })
  );

  return responses
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .filter((pictogram) => pictogram?._id && !pictogram.violence && !pictogram.sex)
    .sort((a, b) => Number(Boolean(b.aac)) - Number(Boolean(a.aac)))
    .map((pictogram) => `https://static.arasaac.org/pictograms/${pictogram._id}/${pictogram._id}_500.png`);
}

async function searchGiphyEndpoint(searchTerm, endpoint) {
  const apiKey = import.meta.env.VITE_GIPHY_API_KEY;
  if (!apiKey) return [];

  const url = new URL(`https://api.giphy.com/v1/${endpoint}/search`);
  url.search = new URLSearchParams({
    api_key: apiKey,
    q: searchTerm,
    limit: "18",
    rating: "g",
    lang: "es",
    bundle: "messaging_non_clips",
    remove_low_contrast: "true",
  });
  const data = await fetchJsonWithTimeout(url, 5500);
  return (data.data || [])
    .map((gif) => gif.images?.fixed_height?.url || gif.images?.original?.url)
    .filter(Boolean);
}

async function searchGiphyGifs(searchTerm, kidFriendly = true) {
  const terms = kidFriendly ? getKidFriendlySearchTerms(searchTerm, "gif").slice(0, 4) : [searchTerm];
  const responses = await Promise.allSettled(
    terms.flatMap((term) => [
      searchGiphyEndpoint(term, "stickers"),
      searchGiphyEndpoint(term, "gifs"),
    ])
  );

  return responses
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);
}

function TileImage({ src, fallbackSize = 48 }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <ImageIcon size={fallbackSize} />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function App() {
  const [board, setBoard] = useState(loadBoard);
  const [activeCategoryId, setActiveCategoryId] = useState(board.categories[0]?.id);
  const [phrase, setPhrase] = useState([]);
  const [editingTile, setEditingTile] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [voices, setVoices] = useState([]);

  const activeCategory = board.categories.find((category) => category.id === activeCategoryId) || board.categories[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    } catch {
      alert("El navegador no pudo guardar el tablero. Prueba con grabaciones más cortas o exporta tu tablero.");
    }
  }, [board]);

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis?.getVoices?.() || []);
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  const phraseText = useMemo(() => phrase.map((item) => item.phrase || item.label).join(" "), [phrase]);

  function speak(text) {
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-MX";
    utterance.rate = board.settings.voiceRate;
    utterance.pitch = board.settings.voicePitch;
    const spanishVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith("es"));
    if (spanishVoice) utterance.voice = spanishVoice;
    window.speechSynthesis.speak(utterance);
  }

  function playTile(tileItem) {
    setPhrase((current) => [...current, tileItem]);
    if (tileItem.audio) {
      playAudioSource(tileItem.audio);
      return;
    }
    speak(tileItem.phrase || tileItem.label);
  }

  function updateSettings(settings) {
    setBoard((current) => ({ ...current, settings: { ...current.settings, ...settings } }));
  }

  function saveTile(categoryId, nextTile) {
    setBoard((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) return category;
        const exists = category.tiles.some((item) => item.id === nextTile.id);
        return {
          ...category,
          tiles: exists
            ? category.tiles.map((item) => (item.id === nextTile.id ? nextTile : item))
            : [...category.tiles, nextTile],
        };
      }),
    }));
    setEditingTile(null);
  }

  function deleteTile(categoryId, tileId) {
    setBoard((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === categoryId
          ? { ...category, tiles: category.tiles.filter((item) => item.id !== tileId) }
          : category
      ),
    }));
  }

  function saveCategory(category) {
    setBoard((current) => {
      const exists = current.categories.some((item) => item.id === category.id);
      return {
        ...current,
        categories: exists
          ? current.categories.map((item) => (item.id === category.id ? category : item))
          : [...current.categories, { ...category, tiles: [] }],
      };
    });
    setActiveCategoryId(category.id);
    setEditingCategory(null);
  }

  function deleteCategory(categoryId) {
    setBoard((current) => {
      const categories = current.categories.filter((category) => category.id !== categoryId);
      setActiveCategoryId(categories[0]?.id);
      return { ...current, categories };
    });
  }

  function exportBoard() {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nunu-comunicador-tablero.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importBoard(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.categories)) throw new Error("Formato invalido");
        setBoard(parsed);
        setActiveCategoryId(parsed.categories[0]?.id);
      } catch {
        alert("No se pudo importar el tablero.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Categorías">
        <div className="brand">
          <div className="brand-mark">Nu</div>
          <div>
            <h1>Nunu</h1>
            <p>Comunicador visual</p>
          </div>
        </div>

        <nav className="category-list">
          {board.categories.map((category) => (
            <button
              className={`category-button ${category.id === activeCategory?.id ? "active" : ""}`}
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              style={{ "--category-color": category.color }}
            >
              <span className="category-swatch" />
              {category.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-actions">
          <button className="secondary-button" onClick={() => setEditingCategory({ id: uid("cat"), name: "", color: "#8ED6FF" })}>
            <Plus size={18} /> Categoría
          </button>
          <button className="secondary-button" onClick={() => setIsManageOpen(true)}>
            <Settings size={18} /> Ajustes
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="phrase-bar">
          <div className="phrase-output" aria-live="polite">
            {phrase.length ? (
              phrase.map((item, index) => (
                <button key={`${item.id}-${index}`} onClick={() => setPhrase((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  {item.label}
                </button>
              ))
            ) : (
              <span>Toca tarjetas para formar una frase</span>
            )}
          </div>
          <div className="phrase-actions">
            <button className="icon-button" aria-label="Leer frase" title="Leer frase" onClick={() => speak(phraseText)}>
              <Volume2 size={22} />
            </button>
            <button className="icon-button" aria-label="Limpiar frase" title="Limpiar frase" onClick={() => setPhrase([])}>
              <RotateCcw size={22} />
            </button>
          </div>
        </header>

        <div className="content-header">
          <div>
            <button className="back-button" onClick={() => setActiveCategoryId(board.categories[0]?.id)}>
              <ArrowLeft size={18} /> Inicio
            </button>
            <h2>{activeCategory?.name || "Sin categorías"}</h2>
          </div>
          {activeCategory && (
            <button
              className="primary-button"
              onClick={() =>
                setEditingTile({
                  categoryId: activeCategory.id,
                  tile: tile(uid("tile"), "", "", activeCategory.color || "#F9E66B", ""),
                })
              }
            >
              <Plus size={20} /> Tarjeta
            </button>
          )}
        </div>

        <div className={`tile-grid ${board.settings.largeTiles ? "large" : "compact"}`}>
          {activeCategory?.tiles.map((item) => (
            <article className="comm-tile" key={item.id} style={{ "--tile-color": item.color }}>
              <button className="tile-play" onClick={() => playTile(item)}>
                <span className="tile-image">
                  <TileImage src={item.image} />
                </span>
                <strong>{item.label}</strong>
              </button>
              <div className="tile-tools">
                <button className="mini-button" aria-label={`Editar ${item.label}`} title="Editar" onClick={() => setEditingTile({ categoryId: activeCategory.id, tile: item })}>
                  <Pencil size={16} />
                </button>
                <button className="mini-button" aria-label={`Escuchar ${item.label}`} title="Escuchar" onClick={() => (item.audio ? playAudioSource(item.audio) : speak(item.phrase || item.label))}>
                  <Play size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {editingTile && (
        <TileEditor
          categoryId={editingTile.categoryId}
          tileItem={editingTile.tile}
          onClose={() => setEditingTile(null)}
          onSave={saveTile}
          onDelete={deleteTile}
        />
      )}

      {editingCategory && (
        <CategoryEditor
          category={editingCategory}
          canDelete={board.categories.length > 1 && board.categories.some((item) => item.id === editingCategory.id)}
          onClose={() => setEditingCategory(null)}
          onSave={saveCategory}
          onDelete={deleteCategory}
        />
      )}

      {isManageOpen && (
        <SettingsModal
          board={board}
          onClose={() => setIsManageOpen(false)}
          onSettings={updateSettings}
          onExport={exportBoard}
          onImport={importBoard}
          onReset={() => {
            if (confirm("¿Restaurar el tablero inicial?")) {
              setBoard(defaultBoard);
              setActiveCategoryId(defaultBoard.categories[0].id);
            }
          }}
          onEditCategory={(category) => {
            setIsManageOpen(false);
            setEditingCategory(category);
          }}
          onDeleteCategory={deleteCategory}
        />
      )}
    </main>
  );
}

function TileEditor({ categoryId, tileItem, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(tileItem);
  const [searchTerm, setSearchTerm] = useState(tileItem.label);
  const [mediaType, setMediaType] = useState("animated");
  const [kidFriendly, setKidFriendly] = useState(true);
  const [imageTool, setImageTool] = useState("search");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("Sin resultados todavía");
  const [uploadStatus, setUploadStatus] = useState("");
  const imageUrlHint = getImageUrlHint(draft.image);

  useEffect(() => {
    if (kidFriendly && mediaType === "gif") setMediaType("animated");
  }, [kidFriendly, mediaType]);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateImageValue(value) {
    updateField("image", normalizeImageInput(value));
  }

  async function searchImages() {
    if (!searchTerm.trim()) return;
    setIsSearching(true);
    setSearchStatus("Buscando...");
    try {
      const searches = kidFriendly
        ? [mediaType === "animated" ? searchAnimatedSymbols(searchTerm) : searchArasaacImages(searchTerm)]
        : [
            searchCommonsImages(searchTerm, mediaType, false),
            searchOpenverseImages(searchTerm, mediaType, false),
            mediaType === "gif" ? searchGiphyGifs(searchTerm, false) : Promise.resolve([]),
          ];
      const [primaryResults, secondaryResults, tertiaryResults] = await Promise.allSettled(searches);
      const nextResults = uniqueImageUrls([
        ...(primaryResults.status === "fulfilled" ? primaryResults.value : []),
        ...(secondaryResults.status === "fulfilled" ? secondaryResults.value : []),
        ...(tertiaryResults?.status === "fulfilled" ? tertiaryResults.value : []),
      ]);
      setResults(nextResults);
      setSearchStatus(nextResults.length ? "" : kidFriendly ? "No encontré material infantil. Prueba otra palabra, por ejemplo caca en vez de popo." : mediaType === "gif" ? "No encontré GIFs. Para GIFs confiables configura GIPHY o sube un GIF elegido por ustedes." : "No encontré resultados.");
    } catch {
      setResults([]);
      setSearchStatus("No pude buscar ahora. Prueba subir una imagen o GIF.");
    } finally {
      setIsSearching(false);
    }
  }

  function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadStatus("Elige una foto, imagen o GIF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateField("image", reader.result);
      setUploadStatus(file.type === "image/gif" ? "GIF agregado a la tarjeta." : "Imagen agregada a la tarjeta.");
    };
    reader.onerror = () => setUploadStatus("No pude leer ese archivo.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function useCapturedPhoto(image) {
    updateField("image", image);
    setUploadStatus("Foto agregada a la tarjeta.");
  }

  return (
    <Modal title="Editar tarjeta" onClose={onClose}>
      <div className="editor-layout">
        <div className="preview-tile" style={{ "--tile-color": draft.color }}>
          <TileImage src={draft.image} fallbackSize={56} />
          <strong>{draft.label || "Nueva tarjeta"}</strong>
        </div>

        <div className="form-stack">
          <label>
            Texto visible
            <input value={draft.label} onChange={(event) => updateField("label", event.target.value)} placeholder="Ej. Agua" />
          </label>
          <label>
            Frase que dirá
            <input value={draft.phrase} onChange={(event) => updateField("phrase", event.target.value)} placeholder="Ej. Quiero agua" />
          </label>

          <div className="color-row" aria-label="Color de tarjeta">
            {colorOptions.map((color) => (
              <button
                key={color}
                className={draft.color === color ? "selected" : ""}
                style={{ background: color }}
                aria-label={`Elegir color ${color}`}
                onClick={() => updateField("color", color)}
              />
            ))}
          </div>

          <div className="split-actions">
            <label className="file-button">
              <Upload size={18} /> Subir foto/GIF
              <input type="file" accept="image/*,.gif" onChange={uploadImage} />
            </label>
            <button className="secondary-button" onClick={() => setImageTool("camera")}>
              <Camera size={18} /> Tomar foto
            </button>
            <Recorder value={draft.audio} onChange={(audio) => updateField("audio", audio)} />
          </div>
          {uploadStatus ? <span className="field-hint">{uploadStatus}</span> : null}

          <div className="image-tool-tabs" aria-label="Herramientas de imagen">
            <button className={imageTool === "search" ? "active" : ""} onClick={() => setImageTool("search")}>
              <Search size={18} /> Buscar
            </button>
            <button className={imageTool === "camera" ? "active" : ""} onClick={() => setImageTool("camera")}>
              <Camera size={18} /> Cámara
            </button>
            <button className={imageTool === "url" ? "active" : ""} onClick={() => setImageTool("url")}>
              <Link size={18} /> URL
            </button>
          </div>

          {imageTool === "search" ? (
            <>
              <div className="search-controls">
                <label className="toggle-row compact-toggle">
                  Material infantil
                  <input type="checkbox" checked={kidFriendly} onChange={(event) => setKidFriendly(event.target.checked)} />
                </label>
                <div className="segmented-control" aria-label="Tipo de búsqueda">
                  {kidFriendly ? (
                    <>
                      <button className={mediaType === "animated" ? "active" : ""} onClick={() => setMediaType("animated")}>Animados</button>
                      <button className={mediaType === "image" ? "active" : ""} onClick={() => setMediaType("image")}>Pictogramas</button>
                    </>
                  ) : (
                    <>
                    <button className={mediaType === "image" ? "active" : ""} onClick={() => setMediaType("image")}>Imagen</button>
                    <button className={mediaType === "gif" ? "active" : ""} onClick={() => setMediaType("gif")}>GIF</button>
                    </>
                  )}
                </div>
                <div className="search-box">
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={kidFriendly ? "Buscar animados para niños" : mediaType === "gif" ? "Buscar GIFs" : "Buscar imágenes"} />
                  <button className="icon-button" aria-label={kidFriendly ? "Buscar material infantil" : mediaType === "gif" ? "Buscar GIFs" : "Buscar imágenes"} title="Buscar" onClick={searchImages}>
                    <Search size={20} />
                  </button>
                </div>
              </div>

              <div className="image-results" aria-live="polite">
                {searchStatus ? <span>{searchStatus}</span> : null}
                {results.map((url) => (
                  <button key={url} onClick={() => updateField("image", url)}>
                    <img src={url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {imageTool === "camera" ? <CameraCapture onCapture={useCapturedPhoto} /> : null}

          {imageTool === "url" ? (
            <label>
              URL directa de imagen
              <input value={draft.image} onChange={(event) => updateImageValue(event.target.value)} placeholder="https://.../imagen.gif" />
              {imageUrlHint ? <span className="field-hint warning">{imageUrlHint}</span> : null}
            </label>
          ) : null}
        </div>
      </div>

      <footer className="modal-actions">
        <button className="danger-button" onClick={() => { onDelete(categoryId, draft.id); onClose(); }}>
          <Trash2 size={18} /> Eliminar
        </button>
        <button className="primary-button" onClick={() => onSave(categoryId, { ...draft, label: draft.label.trim() || "Sin texto", phrase: draft.phrase.trim() || draft.label.trim() })}>
          <Save size={18} /> Guardar
        </button>
      </footer>
    </Modal>
  );
}

function CameraCapture({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("Presiona abrir cámara y acepta el permiso del navegador.");
  const [isCameraActive, setIsCameraActive] = useState(false);

  useEffect(() => {
    return () => stopCamera(false);
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Este navegador no permite usar cámara aquí.");
      return;
    }

    setStatus("Abriendo cámara...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setStatus("Cámara lista.");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      stopCamera();
      const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
      setStatus(denied ? "Permite la cámara en el navegador para tomar la foto." : "No se pudo abrir la cámara de la computadora.");
    }
  }

  function stopCamera(updateState = true) {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (updateState) {
      setIsCameraActive(false);
      setStatus("Cámara cerrada.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      setStatus("La cámara todavía no está lista.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.9));
    setStatus("Foto agregada a la tarjeta.");
  }

  return (
    <div className="camera-panel">
      <div className="camera-preview">
        <video className={isCameraActive ? "active" : ""} ref={videoRef} autoPlay playsInline muted />
        {!isCameraActive ? <Camera size={42} /> : null}
      </div>
      <canvas ref={canvasRef} hidden />
      <div className="camera-actions">
        <button className="secondary-button" onClick={isCameraActive ? stopCamera : startCamera}>
          <Camera size={18} /> {isCameraActive ? "Cerrar cámara" : "Abrir cámara"}
        </button>
        <button className="primary-button" disabled={!isCameraActive} onClick={capturePhoto}>
          <Check size={18} /> Usar foto
        </button>
      </div>
      {status ? <span className="field-hint">{status}</span> : null}
    </div>
  );
}

function CategoryEditor({ category, canDelete, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(category);
  return (
    <Modal title="Editar categoría" onClose={onClose}>
      <div className="form-stack">
        <label>
          Nombre
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Escuela" />
        </label>
        <div className="color-row">
          {colorOptions.map((color) => (
            <button
              key={color}
              className={draft.color === color ? "selected" : ""}
              style={{ background: color }}
              aria-label={`Elegir color ${color}`}
              onClick={() => setDraft({ ...draft, color })}
            />
          ))}
        </div>
      </div>
      <footer className="modal-actions">
        {canDelete ? (
          <button className="danger-button" onClick={() => { onDelete(draft.id); onClose(); }}>
            <Trash2 size={18} /> Eliminar
          </button>
        ) : <span />}
        <button className="primary-button" onClick={() => onSave({ ...draft, name: draft.name.trim() || "Nueva categoría" })}>
          <Check size={18} /> Guardar
        </button>
      </footer>
    </Modal>
  );
}

function Recorder({ value, onChange }) {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState(value ? "Grabación guardada" : "");
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus("Este navegador no permite grabar audio aquí.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blobType = recorder.mimeType || mimeType || "audio/mp4";
        const blob = new Blob(chunksRef.current, { type: blobType });
        const reader = new FileReader();
        reader.onload = () => {
          onChange(reader.result);
          setStatus("Grabación guardada");
        };
        reader.onerror = () => setStatus("No se pudo guardar la grabación.");
        reader.readAsDataURL(blob);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
      };
      recorder.onerror = () => {
        setStatus("El navegador detuvo la grabación.");
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setStatus("Grabando...");
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
      setStatus(denied ? "Permite el micrófono para grabar." : "No se pudo iniciar el micrófono.");
    }
  }

  return (
    <div className="recorder-panel">
      <div className="record-actions">
        <button className={isRecording ? "record-button active" : "record-button"} onClick={toggleRecording}>
          {isRecording ? <MicOff size={18} /> : <Mic size={18} />} {isRecording ? "Detener" : "Grabar"}
        </button>
        {value ? (
          <>
            <button className="icon-button" aria-label="Probar grabación" title="Probar grabación" onClick={() => playAudioSource(value)}>
              <Play size={18} />
            </button>
            <button className="icon-button" aria-label="Quitar grabación" title="Quitar grabación" onClick={() => { onChange(""); setStatus("Grabación eliminada"); }}>
              <Trash2 size={18} />
            </button>
          </>
        ) : null}
      </div>
      {status ? <span className={isRecording ? "record-status active" : "record-status"}>{status}</span> : null}
    </div>
  );
}

function SettingsModal({ board, onClose, onSettings, onExport, onImport, onReset, onEditCategory, onDeleteCategory }) {
  return (
    <Modal title="Ajustes" onClose={onClose}>
      <div className="settings-grid">
        <label>
          Velocidad de voz
          <input type="range" min="0.6" max="1.4" step="0.05" value={board.settings.voiceRate} onChange={(event) => onSettings({ voiceRate: Number(event.target.value) })} />
        </label>
        <label>
          Tono de voz
          <input type="range" min="0.7" max="1.4" step="0.05" value={board.settings.voicePitch} onChange={(event) => onSettings({ voicePitch: Number(event.target.value) })} />
        </label>
        <label className="toggle-row">
          Tarjetas grandes
          <input type="checkbox" checked={board.settings.largeTiles} onChange={(event) => onSettings({ largeTiles: event.target.checked })} />
        </label>
      </div>

      <div className="category-manager">
        {board.categories.map((category) => (
          <div key={category.id}>
            <span style={{ background: category.color }} />
            <strong>{category.name}</strong>
            <button className="mini-button" onClick={() => onEditCategory(category)} aria-label={`Editar ${category.name}`}>
              <Pencil size={16} />
            </button>
            {board.categories.length > 1 ? (
              <button className="mini-button" onClick={() => onDeleteCategory(category.id)} aria-label={`Eliminar ${category.name}`}>
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <footer className="modal-actions">
        <label className="secondary-button file-inline">
          <Upload size={18} /> Importar
          <input type="file" accept="application/json" onChange={onImport} />
        </label>
        <button className="secondary-button" onClick={onExport}>
          <Download size={18} /> Exportar
        </button>
        <button className="danger-button" onClick={onReset}>
          <RotateCcw size={18} /> Restaurar
        </button>
      </footer>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
