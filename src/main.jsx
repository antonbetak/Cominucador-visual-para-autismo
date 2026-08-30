import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Check,
  Download,
  Image as ImageIcon,
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
                  {item.image ? <img src={item.image} alt="" loading="lazy" /> : <ImageIcon size={48} />}
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
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function searchImages() {
    if (!searchTerm.trim()) return;
    setIsSearching(true);
    try {
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: `file:${searchTerm}`,
        gsrlimit: "12",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "600",
        format: "json",
        origin: "*",
      });
      const response = await fetch(url);
      const data = await response.json();
      const pages = Object.values(data.query?.pages || {});
      setResults(
        pages
          .map((page) => page.imageinfo?.[0])
          .filter((image) => image?.mime?.startsWith("image/"))
          .map((image) => image.thumburl || image.url)
      );
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateField("image", reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <Modal title="Editar tarjeta" onClose={onClose}>
      <div className="editor-layout">
        <div className="preview-tile" style={{ "--tile-color": draft.color }}>
          {draft.image ? <img src={draft.image} alt="" /> : <ImageIcon size={56} />}
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
          <label>
            URL de imagen
            <input value={draft.image} onChange={(event) => updateField("image", event.target.value)} placeholder="https://..." />
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
              <Upload size={18} /> Subir
              <input type="file" accept="image/*" onChange={uploadImage} />
            </label>
            <Recorder value={draft.audio} onChange={(audio) => updateField("audio", audio)} />
          </div>

          <div className="search-box">
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar imágenes en Wikimedia" />
            <button className="icon-button" aria-label="Buscar imagen" title="Buscar" onClick={searchImages}>
              <Search size={20} />
            </button>
          </div>

          <div className="image-results" aria-live="polite">
            {isSearching ? <span>Buscando...</span> : null}
            {results.map((url) => (
              <button key={url} onClick={() => updateField("image", url)}>
                <img src={url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
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
