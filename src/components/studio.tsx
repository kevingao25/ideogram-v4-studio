"use client";

import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Frame,
  History,
  ImageIcon,
  KeyRound,
  Layers3,
  LoaderCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { bboxToPixels, clampBbox, type Bbox } from "@/lib/bbox";
import {
  loadHistory,
  sanitizeHistoryEntry,
  saveHistory,
  type HistoryEndpoint,
  type HistoryEntry,
} from "@/lib/history";
import { parseV4Prompt, type V4Prompt } from "@/lib/v4-prompt";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const KEY_STORAGE = "ideogram-v4-studio-api-key";

const posterPreset: V4Prompt = {
  high_level_description: "A modern exhibition poster celebrating the geometry of light.",
  style_description: {
    aesthetics: "Editorial Swiss design with tactile paper texture",
    lighting: "Warm directional light",
    medium: "Screen-printed poster",
  },
  compositional_deconstruction: {
    background: "Warm ivory paper with a subtle grain",
    elements: [
      {
        type: "text",
        text: "FORM / LIGHT",
        desc: "Condensed black display type, aligned to the upper-left",
        bbox: [100, 100, 300, 720],
      },
      {
        type: "obj",
        desc: "A translucent cobalt blue glass sphere casting an amber shadow",
        bbox: [390, 280, 850, 780],
      },
    ],
  },
};

const productPreset: V4Prompt = {
  high_level_description: "A premium skincare campaign with precise editorial spacing.",
  style_description: {
    aesthetics: "Quiet luxury product photography",
    lighting: "Soft morning window light",
    medium: "Medium-format commercial photography",
  },
  compositional_deconstruction: {
    background: "Pale travertine surface against a warm gray wall",
    elements: [
      {
        type: "obj",
        desc: "Frosted glass serum bottle with a matte cream cap",
        bbox: [250, 360, 800, 650],
      },
      {
        type: "text",
        text: "RITUAL 01",
        desc: "Small refined serif headline",
        bbox: [80, 100, 190, 500],
      },
    ],
  },
};

const editorialPreset: V4Prompt = {
  high_level_description: "An editorial travel cover about modern coastal architecture.",
  style_description: {
    aesthetics: "Contemporary culture magazine",
    lighting: "Late afternoon Mediterranean sunlight",
    medium: "High-end editorial photography",
  },
  compositional_deconstruction: {
    background: "Deep blue sea and a pale concrete house",
    elements: [
      {
        type: "text",
        text: "NEW HORIZONS",
        desc: "Elegant high-contrast serif masthead",
        bbox: [70, 80, 210, 920],
      },
      {
        type: "obj",
        desc: "White modernist home perched above the ocean",
        bbox: [260, 120, 860, 900],
      },
    ],
  },
};

type Result = {
  url?: string;
  seed?: number;
  resolution?: string;
  [key: string]: unknown;
};

type DragState = {
  index: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  initial: Bbox;
};

type View =
  | "prompt"
  | "structure"
  | "arrange"
  | "generate"
  | "describe"
  | "remix";

type Overlay = "recent" | "inspect" | "settings" | null;

const primaryNav: Array<{
  id: View;
  label: string;
  number: string;
  icon: typeof WandSparkles;
}> = [
  { id: "prompt", label: "Prompt", number: "01", icon: WandSparkles },
  { id: "structure", label: "Structure", number: "02", icon: Layers3 },
  { id: "arrange", label: "Arrange", number: "03", icon: Frame },
  { id: "generate", label: "Generate", number: "04", icon: Sparkles },
];

const secondaryNav = [
  { id: "describe" as const, label: "Describe", icon: ScanSearch },
  { id: "remix" as const, label: "Remix", icon: ImageIcon },
];

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function extractJsonPrompt(payload: Record<string, unknown>): unknown {
  return payload.json_prompt ?? (payload.data as Record<string, unknown> | undefined)?.json_prompt;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="studio-eyebrow">{children}</p>;
}

function UploadField({
  image,
  imagePreview,
  onImage,
}: {
  image: File | null;
  imagePreview: string;
  onImage: (file: File | null) => void;
}) {
  return (
    <label className="upload-field">
      {imagePreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagePreview} alt="" className="upload-field__image" />
      ) : (
        <div className="upload-field__empty">
          <div className="upload-field__icon">
            <Upload className="size-5" />
          </div>
          <span>{image ? image.name : "Drop a reference image"}</span>
          <small>JPEG, PNG, or WebP · up to 10 MB</small>
        </div>
      )}
      <input
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => onImage(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export function Studio() {
  const [hydrated, setHydrated] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [gatewayError, setGatewayError] = useState("");
  const [view, setView] = useState<View>("prompt");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [prompt, setPrompt] = useState("A modern exhibition poster about the geometry of light");
  const [jsonPrompt, setJsonPrompt] = useState<V4Prompt>(posterPreset);
  const [jsonText, setJsonText] = useState(pretty(posterPreset));
  const [jsonError, setJsonError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageWeight, setImageWeight] = useState(50);
  const [resolution, setResolution] = useState("2048x2048");
  const [speed, setSpeed] = useState("DEFAULT");
  const [requestPreview, setRequestPreview] = useState<Record<string, unknown>>({});
  const [responsePreview, setResponsePreview] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<HistoryEndpoint | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE) ?? "";
    // Session state is intentionally restored after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(stored);
    setSavedKey(stored);
    setHistory(loadHistory(localStorage));
    setHydrated(true);
  }, []);

  const elements = jsonPrompt.compositional_deconstruction.elements;
  const selected = elements[selectedIndex];

  const canvasAspect = useMemo(() => {
    const [width, height] = resolution.split("x").map(Number);
    return `${width || 1} / ${height || 1}`;
  }, [resolution]);

  const updatePrompt = (next: V4Prompt) => {
    setJsonPrompt(next);
    setJsonText(pretty(next));
    setJsonError("");
    setSelectedIndex(0);
  };

  const enterStudio = () => {
    const next = apiKey.trim();
    if (!next) {
      setGatewayError("Enter your Ideogram API key to continue.");
      return;
    }
    sessionStorage.setItem(KEY_STORAGE, next);
    setSavedKey(next);
    setGatewayError("");
  };

  const forgetKey = () => {
    sessionStorage.removeItem(KEY_STORAGE);
    setSavedKey("");
    setApiKey("");
    setOverlay(null);
    setView("prompt");
  };

  const applyJsonText = () => {
    try {
      updatePrompt(parseV4Prompt(JSON.parse(jsonText)));
    } catch (caught) {
      setJsonError(caught instanceof Error ? caught.message : "Invalid JSON prompt.");
    }
  };

  const updateElementBbox = (index: number, bbox: Bbox) => {
    const next = structuredClone(jsonPrompt);
    next.compositional_deconstruction.elements[index].bbox = clampBbox(bbox);
    setJsonPrompt(next);
    setJsonText(pretty(next));
  };

  const updateCoordinate = (coordinate: number, value: number) => {
    if (!selected?.bbox) return;
    const next = [...selected.bbox] as Bbox;
    next[coordinate] = value;
    updateElementBbox(selectedIndex, next);
  };

  const onPointerDown = (
    event: React.PointerEvent,
    index: number,
    mode: DragState["mode"],
  ) => {
    const bbox = elements[index].bbox;
    if (!bbox) return;
    event.preventDefault();
    setSelectedIndex(index);
    setDrag({
      index,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      initial: [...bbox] as Bbox,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 1000;
    const dy = ((event.clientY - drag.startY) / rect.height) * 1000;
    const [yMin, xMin, yMax, xMax] = drag.initial;
    updateElementBbox(
      drag.index,
      drag.mode === "move"
        ? [yMin + dy, xMin + dx, yMax + dy, xMax + dx]
        : [yMin, xMin, yMax + dy, xMax + dx],
    );
  };

  const addHistory = (endpoint: HistoryEndpoint, payload: Result | null) => {
    const next = [
      sanitizeHistoryEntry({
        id: crypto.randomUUID(),
        endpoint,
        createdAt: new Date().toISOString(),
        prompt,
        jsonPrompt: endpoint === "remix" ? null : jsonPrompt,
        seed: typeof payload?.seed === "number" ? payload.seed : null,
        resolution:
          typeof payload?.resolution === "string" ? payload.resolution : resolution,
      }),
      ...history,
    ].slice(0, 20);
    setHistory(next);
    saveHistory(localStorage, next);
  };

  const sendJson = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/ideogram/magic-prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ideogram-api-key": savedKey,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error ?? "Ideogram request failed."));
    return payload;
  };

  const validateImage = () => {
    if (!image) throw new Error("Choose an image first.");
    if (image.size > 10 * 1024 * 1024) throw new Error("Images must be 10 MB or smaller.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      throw new Error("Choose a JPEG, PNG, or WebP image.");
    }
    return image;
  };

  const sendMultipart = async (
    endpoint: "describe" | "remix",
    fields: Record<string, string>,
  ) => {
    const source = validateImage();
    const data = new FormData();
    data.set(endpoint === "describe" ? "image_file" : "image", source);
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    const response = await fetch(`/api/ideogram/${endpoint}`, {
      method: "POST",
      headers: { "x-ideogram-api-key": savedKey },
      body: data,
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error ?? "Ideogram request failed."));
    return payload;
  };

  const sendGenerate = async () => {
    const data = new FormData();
    data.set("json_prompt", JSON.stringify(jsonPrompt));
    data.set("resolution", resolution);
    data.set("rendering_speed", speed);
    const response = await fetch("/api/ideogram/generate", {
      method: "POST",
      headers: { "x-ideogram-api-key": savedKey },
      body: data,
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error ?? "Ideogram request failed."));
    return payload;
  };

  const run = async (endpoint: HistoryEndpoint) => {
    setBusy(endpoint);
    setError("");
    try {
      if (endpoint === "magic-prompt") {
        const body = { text_prompt: prompt, aspect_ratio: "1x1" };
        setRequestPreview(body);
        const payload = await sendJson(body);
        setResponsePreview(payload);
        const generatedPrompt = extractJsonPrompt(payload);
        if (generatedPrompt) updatePrompt(parseV4Prompt(generatedPrompt));
        addHistory(endpoint, null);
        setView("structure");
        return;
      }
      if (endpoint === "describe") {
        const fields = { include_bbox: "true" };
        setRequestPreview({ image: image?.name, ...fields });
        const payload = await sendMultipart(endpoint, fields);
        setResponsePreview(payload);
        const describedPrompt = extractJsonPrompt(payload);
        if (describedPrompt) updatePrompt(parseV4Prompt(describedPrompt));
        addHistory(endpoint, null);
        setView("structure");
        return;
      }
      if (endpoint === "remix") {
        const fields = {
          text_prompt: prompt,
          image_weight: String(imageWeight),
          resolution,
          rendering_speed: speed,
        };
        setRequestPreview({ image: image?.name, ...fields });
        const payload = await sendMultipart(endpoint, fields);
        setResponsePreview(payload);
        const first = ((payload.data as Result[] | undefined)?.[0] ?? payload) as Result;
        setResult(first);
        addHistory(endpoint, first);
        return;
      }
      const request = { json_prompt: jsonPrompt, resolution, rendering_speed: speed };
      setRequestPreview(request);
      const payload = await sendGenerate();
      setResponsePreview(payload);
      const first = ((payload.data as Result[] | undefined)?.[0] ?? payload) as Result;
      setResult(first);
      addHistory(endpoint, first);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const selectView = (next: View) => {
    setView(next);
    setMobileNavOpen(false);
    setOverlay(null);
  };

  const setSourceImage = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  if (!hydrated) {
    return <main className="gateway-screen" />;
  }

  if (!savedKey) {
    return (
      <main className="gateway-screen">
        <div className="gateway-grain" />
        <header className="gateway-header">
          <div className="wordmark">
            <span className="wordmark-mark">I4</span>
            <span>Ideogram V4 Studio</span>
          </div>
          <span className="gateway-edition">Designer Preview · 2026</span>
        </header>

        <section className="gateway-content">
          <div className="gateway-copy">
            <Eyebrow>Structured image design, made visual</Eyebrow>
            <h1>
              Design beyond
              <br />
              the prompt box.
            </h1>
            <p>
              Explore how Ideogram V4 turns an idea into editable structure, precise
              composition, and production-ready imagery.
            </p>
          </div>

          <div className="gateway-access">
            <div className="gateway-access__number">01 / ACCESS</div>
            <h2>Enter the studio</h2>
            <p>Your key stays in this browser session and is never saved by the demo.</p>
            <label className="gateway-key-field">
              <KeyRound className="size-5" />
              <Input
                aria-label="Ideogram API key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") enterStudio();
                }}
                placeholder="Paste your Ideogram API key"
              />
            </label>
            {gatewayError && <p className="gateway-error">{gatewayError}</p>}
            <Button className="gateway-button" onClick={enterStudio}>
              Enter Studio <ArrowRight className="size-4" />
            </Button>
            <a
              className="gateway-key-link"
              href="https://ideogram.ai/manage-api"
              target="_blank"
              rel="noreferrer"
            >
              Get an Ideogram API key <ChevronRight className="size-3" />
            </a>
          </div>
        </section>

        <footer className="gateway-footer">
          <span>Prompt fidelity</span>
          <span>Spatial control</span>
          <span>Reliable typography</span>
          <span>Editable structure</span>
        </footer>
      </main>
    );
  }

  return (
    <main className="studio-shell">
      <button
        className="mobile-menu-button"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="size-5" />
      </button>

      <aside
        className={cn(
          "studio-sidebar",
          sidebarOpen ? "studio-sidebar--open" : "studio-sidebar--compact",
          mobileNavOpen && "studio-sidebar--mobile-open",
        )}
      >
        <div className="sidebar-top">
          <button className="sidebar-wordmark" onClick={() => selectView("prompt")}>
            <span className="wordmark-mark">I4</span>
            {sidebarOpen && <span>V4 Studio</span>}
          </button>
          <button
            className="sidebar-collapse"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </button>
          <button
            className="sidebar-mobile-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Studio workflow">
          <div className="sidebar-section-label">{sidebarOpen ? "Workflow" : "•••"}</div>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={cn("sidebar-item", view === item.id && "sidebar-item--active")}
                onClick={() => selectView(item.id)}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className="sidebar-item__number">{item.number}</span>
                <Icon className="sidebar-item__icon size-4" />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && view === item.id && <span className="sidebar-item__dot" />}
              </button>
            );
          })}

          <div className="sidebar-rule" />
          <div className="sidebar-section-label">{sidebarOpen ? "Explore" : "•••"}</div>
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={cn("sidebar-item", view === item.id && "sidebar-item--active")}
                onClick={() => selectView(item.id)}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon className="sidebar-item__icon size-4" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-utility">
          {[
            { id: "recent" as const, label: "Recent", icon: History },
            { id: "inspect" as const, label: "Inspect JSON/API", icon: Braces },
            { id: "settings" as const, label: "Settings", icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className="sidebar-item sidebar-item--utility"
                onClick={() => {
                  setOverlay(item.id);
                  setMobileNavOpen(false);
                }}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon className="sidebar-item__icon size-4" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
          <div className="sidebar-key-status">
            <span className="sidebar-key-status__light" />
            {sidebarOpen && <span>API connected</span>}
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          className="mobile-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <section className="studio-main">
        <header className="studio-topbar">
          <div>
            <Eyebrow>Ideogram V4 / Designer workflow</Eyebrow>
            <p className="studio-progress">
              {primaryNav.map((item, index) => (
                <span
                  key={item.id}
                  className={cn(
                    "studio-progress__step",
                    view === item.id && "studio-progress__step--active",
                    primaryNav.findIndex((entry) => entry.id === view) > index &&
                      "studio-progress__step--done",
                  )}
                >
                  {primaryNav.findIndex((entry) => entry.id === view) > index ? (
                    <Check className="size-3" />
                  ) : (
                    item.number
                  )}
                  <span>{item.label}</span>
                </span>
              ))}
            </p>
          </div>
          <button className="topbar-inspect" onClick={() => setOverlay("inspect")}>
            <Braces className="size-4" /> Inspect
          </button>
        </header>

        <div key={view} className="studio-view">
          {view === "prompt" && (
            <section className="prompt-view">
              <div className="view-heading prompt-view__heading">
                <Eyebrow>01 / Prompt</Eyebrow>
                <h1>Start with an idea worth designing.</h1>
                <p>
                  Describe the piece you need. V4 will translate it into editable visual
                  structure in the next step.
                </p>
              </div>

              <div className="prompt-composer">
                <Textarea
                  aria-label="Text prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the image, composition, mood, and text..."
                />
                <div className="prompt-composer__footer">
                  <span>{prompt.length} characters</span>
                  <Button onClick={() => run("magic-prompt")} disabled={Boolean(busy)}>
                    {busy === "magic-prompt" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <WandSparkles className="size-4" />
                    )}
                    Build structure
                  </Button>
                </div>
              </div>

              <div className="preset-row">
                <span className="preset-row__label">Or begin with a direction</span>
                <div className="preset-grid">
                  {[
                    {
                      name: "Exhibition poster",
                      meta: "Typography / Object",
                      color: "preset-card--orange",
                      prompt: posterPreset,
                    },
                    {
                      name: "Product campaign",
                      meta: "Object / Editorial",
                      color: "preset-card--stone",
                      prompt: productPreset,
                    },
                    {
                      name: "Magazine cover",
                      meta: "Type / Architecture",
                      color: "preset-card--blue",
                      prompt: editorialPreset,
                    },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      className={cn("preset-card", preset.color)}
                      onClick={() => {
                        updatePrompt(preset.prompt);
                        setPrompt(preset.prompt.high_level_description);
                      }}
                    >
                      <span className="preset-card__visual">
                        <span>{preset.name.split(" ")[0]}</span>
                      </span>
                      <span className="preset-card__copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.meta}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {view === "structure" && (
            <section className="structure-view">
              <div className="view-heading">
                <Eyebrow>02 / Structure</Eyebrow>
                <h1>See the design V4 understood.</h1>
                <p>
                  Your prompt is now a composition. Review the background, style, type,
                  and objects before arranging them.
                </p>
              </div>

              <div className="structure-layout">
                <div className="structure-summary">
                  <div className="structure-summary__block structure-summary__block--lead">
                    <span>Creative direction</span>
                    <p>{jsonPrompt.high_level_description}</p>
                  </div>
                  <div className="structure-summary__block">
                    <span>Background</span>
                    <p>{jsonPrompt.compositional_deconstruction.background}</p>
                  </div>
                  <div className="structure-summary__block">
                    <span>Aesthetic</span>
                    <p>
                      {jsonPrompt.style_description?.aesthetics ??
                        jsonPrompt.style_description?.art_style ??
                        "Defined by the structured prompt"}
                    </p>
                  </div>
                </div>

                <div className="element-list">
                  <div className="element-list__header">
                    <span>{elements.length} composition elements</span>
                    <button onClick={() => setOverlay("inspect")}>
                      Edit JSON <Braces className="size-3" />
                    </button>
                  </div>
                  {elements.map((element, index) => (
                    <button
                      key={`${element.type}-${index}`}
                      className="element-row"
                      onClick={() => {
                        setSelectedIndex(index);
                        setView("arrange");
                      }}
                    >
                      <span className="element-row__index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="element-row__type">{element.type}</span>
                      <span className="element-row__copy">
                        <strong>{element.type === "text" ? element.text : element.desc}</strong>
                        <small>{element.desc}</small>
                      </span>
                      <ChevronRight className="size-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="view-actions">
                <Button variant="ghost" onClick={() => setView("prompt")}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button onClick={() => setView("arrange")}>
                  Arrange composition <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
          )}

          {view === "arrange" && (
            <section className="arrange-view">
              <div className="arrange-top">
                <div className="view-heading view-heading--compact">
                  <Eyebrow>03 / Arrange</Eyebrow>
                  <h1>Place every element with intent.</h1>
                  <p>Drag to position. Pull the violet handle to resize.</p>
                </div>
                <div className="arrange-actions">
                  <button onClick={() => setOverlay("inspect")}>
                    <Braces className="size-4" /> Coordinates
                  </button>
                  <Button onClick={() => setView("generate")}>
                    Review & generate <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="arrange-workspace">
                <div className="canvas-stage">
                  <div
                    ref={canvasRef}
                    data-testid="bbox-canvas"
                    onPointerMove={onPointerMove}
                    onPointerUp={() => setDrag(null)}
                    onPointerLeave={() => setDrag(null)}
                    className="composition-canvas"
                    style={{ aspectRatio: canvasAspect }}
                  >
                    <div className="composition-canvas__grid" />
                    <div className="composition-canvas__ghost">
                      <small>{jsonPrompt.compositional_deconstruction.background}</small>
                      <strong>{jsonPrompt.high_level_description}</strong>
                    </div>
                    {elements.map((element, index) => {
                      if (!element.bbox) return null;
                      const { x, y, width, height } = bboxToPixels(
                        element.bbox,
                        1000,
                        1000,
                      );
                      return (
                        <div
                          key={`${element.type}-${index}`}
                          data-testid={`bbox-element-${index}`}
                          onPointerDown={(event) => onPointerDown(event, index, "move")}
                          className={cn(
                            "composition-element",
                            index === selectedIndex && "composition-element--selected",
                          )}
                          style={{
                            left: `${x / 10}%`,
                            top: `${y / 10}%`,
                            width: `${width / 10}%`,
                            height: `${height / 10}%`,
                          }}
                        >
                          <span>{element.type === "text" ? element.text : element.desc}</span>
                          <button
                            aria-label={`Resize element ${index + 1}`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onPointerDown(event, index, "resize");
                            }}
                            className="composition-element__handle"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <aside className="layer-strip">
                  <Eyebrow>Layers</Eyebrow>
                  {elements.map((element, index) => (
                    <button
                      key={`${element.type}-layer-${index}`}
                      className={cn(
                        "layer-item",
                        selectedIndex === index && "layer-item--active",
                      )}
                      onClick={() => setSelectedIndex(index)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{element.type === "text" ? element.text : element.type}</strong>
                        <small>{element.desc}</small>
                      </div>
                    </button>
                  ))}
                </aside>
              </div>
            </section>
          )}

          {view === "generate" && (
            <section className="generate-view">
              <div className="view-heading">
                <Eyebrow>04 / Generate</Eyebrow>
                <h1>Turn the composition into an image.</h1>
                <p>
                  Choose the output shape and rendering mode. Your structure and placement
                  remain intact.
                </p>
              </div>

              <div className="generate-layout">
                <div className="generate-preview">
                  {result?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.url} alt="Generated Ideogram result" />
                  ) : (
                    <div className="generate-preview__placeholder">
                      <span>V4</span>
                      <p>{jsonPrompt.high_level_description}</p>
                      <small>Ready to render</small>
                    </div>
                  )}
                </div>

                <div className="generate-controls">
                  <div className="control-group">
                    <span>Canvas</span>
                    <div className="segmented-control">
                      {[
                        ["2048x2048", "Square"],
                        ["2880x1440", "Wide"],
                        ["1440x2880", "Tall"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={resolution === value ? "is-selected" : undefined}
                          onClick={() => setResolution(value)}
                        >
                          <Frame className="size-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-group">
                    <span>Rendering</span>
                    <div className="segmented-control">
                      {["TURBO", "DEFAULT", "QUALITY"].map((value) => (
                        <button
                          key={value}
                          className={speed === value ? "is-selected" : undefined}
                          onClick={() => setSpeed(value)}
                        >
                          {value.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="generate-recipe">
                    <span>Recipe</span>
                    <strong>{elements.length} positioned elements</strong>
                    <p>{jsonPrompt.style_description?.aesthetics}</p>
                  </div>

                  <Button
                    className="generate-button"
                    onClick={() => run("generate")}
                    disabled={Boolean(busy)}
                  >
                    {busy === "generate" ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <Sparkles className="size-5" />
                    )}
                    {result?.url ? "Generate another" : "Generate with V4"}
                  </Button>

                  {result?.url && (
                    <Button asChild variant="outline" className="download-button">
                      <a href={result.url} download target="_blank" rel="noreferrer">
                        <Download className="size-4" /> Download image
                      </a>
                    </Button>
                  )}
                  {result?.url && (
                    <p className="expiry-note">
                      Download now. Ideogram result URLs may expire.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {view === "describe" && (
            <section className="secondary-view">
              <div className="view-heading">
                <Eyebrow>Explore / Describe</Eyebrow>
                <h1>Reverse-engineer an image into structure.</h1>
                <p>
                  Upload a reference and V4 will identify its visual direction, elements,
                  and bounding boxes.
                </p>
              </div>
              <div className="secondary-workspace">
                <UploadField
                  image={image}
                  imagePreview={imagePreview}
                  onImage={setSourceImage}
                />
                <div className="secondary-copy">
                  <span>What happens next</span>
                  <ol>
                    <li>V4 analyzes the visual hierarchy.</li>
                    <li>Elements become editable structured JSON.</li>
                    <li>You continue in Structure and Arrange.</li>
                  </ol>
                  <Button onClick={() => run("describe")} disabled={Boolean(busy || !image)}>
                    {busy === "describe" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ScanSearch className="size-4" />
                    )}
                    Describe image
                  </Button>
                </div>
              </div>
            </section>
          )}

          {view === "remix" && (
            <section className="secondary-view">
              <div className="view-heading">
                <Eyebrow>Explore / Remix</Eyebrow>
                <h1>Carry a reference into a new direction.</h1>
                <p>
                  Keep the visual DNA of an image while changing its mood, purpose, or
                  art direction.
                </p>
              </div>
              <div className="secondary-workspace secondary-workspace--remix">
                <UploadField
                  image={image}
                  imagePreview={imagePreview}
                  onImage={setSourceImage}
                />
                <div className="remix-controls">
                  <label>
                    <span>New direction</span>
                    <Textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Describe the new direction..."
                    />
                  </label>
                  <label className="range-control">
                    <span>
                      Reference influence <strong>{imageWeight}%</strong>
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={imageWeight}
                      onChange={(event) => setImageWeight(Number(event.target.value))}
                    />
                  </label>
                  <Button onClick={() => run("remix")} disabled={Boolean(busy || !image)}>
                    {busy === "remix" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                    Create remix
                  </Button>
                </div>
              </div>
              {result?.url && (
                <div className="remix-result">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.url} alt="Remixed Ideogram result" />
                  <Button asChild variant="outline">
                    <a href={result.url} download target="_blank" rel="noreferrer">
                      <Download className="size-4" /> Download remix
                    </a>
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>

        {error && (
          <div className="studio-error">
            <span>{error}</span>
            <button onClick={() => setError("")}>
              <X className="size-4" />
            </button>
          </div>
        )}
      </section>

      {overlay && (
        <>
          <button
            className="drawer-backdrop"
            aria-label="Close panel"
            onClick={() => setOverlay(null)}
          />
          <aside className="studio-drawer">
            <header className="drawer-header">
              <div>
                <Eyebrow>Studio utility</Eyebrow>
                <h2>
                  {overlay === "recent"
                    ? "Recent work"
                    : overlay === "inspect"
                      ? "Inspect JSON / API"
                      : "Settings"}
                </h2>
              </div>
              <button onClick={() => setOverlay(null)} aria-label="Close panel">
                <X className="size-5" />
              </button>
            </header>

            {overlay === "recent" && (
              <div className="drawer-content">
                {history.length === 0 ? (
                  <div className="drawer-empty">
                    <Clock3 className="size-6" />
                    <p>Your recent prompt recipes will appear here.</p>
                    <small>Images and API keys are never stored.</small>
                  </div>
                ) : (
                  <div className="recent-list">
                    {history.map((entry) => (
                      <button
                        key={entry.id}
                        className="recent-item"
                        onClick={() => {
                          setPrompt(entry.prompt);
                          if (entry.jsonPrompt) updatePrompt(entry.jsonPrompt);
                          if (entry.resolution) setResolution(entry.resolution);
                          setOverlay(null);
                          setView(entry.endpoint === "generate" ? "generate" : "prompt");
                        }}
                      >
                        <span>{entry.endpoint}</span>
                        <strong>{entry.prompt || "Untitled prompt"}</strong>
                        <small>{new Date(entry.createdAt).toLocaleString()}</small>
                      </button>
                    ))}
                    <button
                      className="drawer-danger"
                      onClick={() => {
                        setHistory([]);
                        saveHistory(localStorage, []);
                      }}
                    >
                      <Trash2 className="size-4" /> Clear recent work
                    </button>
                  </div>
                )}
              </div>
            )}

            {overlay === "inspect" && (
              <div className="drawer-content inspector-content">
                <section>
                  <div className="inspector-section-title">
                    <span>Structured JSON</span>
                    <button onClick={applyJsonText}>Apply changes</button>
                  </div>
                  <Textarea
                    aria-label="Structured JSON editor"
                    value={jsonText}
                    onChange={(event) => setJsonText(event.target.value)}
                    onBlur={applyJsonText}
                    spellCheck={false}
                    className="inspector-editor"
                  />
                  {jsonError && <p className="inspector-error">{jsonError}</p>}
                </section>

                {selected?.bbox && (
                  <section>
                    <div className="inspector-section-title">
                      <span>Selected box</span>
                      <small>[y min, x min, y max, x max]</small>
                    </div>
                    <div className="coordinate-grid">
                      {(["Y min", "X min", "Y max", "X max"] as const).map(
                        (label, index) => (
                          <label key={label}>
                            <span>{label}</span>
                            <Input
                              aria-label={label}
                              type="number"
                              min="0"
                              max="1000"
                              value={selected.bbox?.[index] ?? 0}
                              onChange={(event) =>
                                updateCoordinate(index, Number(event.target.value))
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </section>
                )}

                <section className="payload-section">
                  <div className="inspector-section-title">
                    <span>Last request</span>
                  </div>
                  <pre>{pretty(requestPreview)}</pre>
                </section>
                <section className="payload-section">
                  <div className="inspector-section-title">
                    <span>Last response</span>
                  </div>
                  <pre>{pretty(responsePreview)}</pre>
                </section>
              </div>
            )}

            {overlay === "settings" && (
              <div className="drawer-content settings-content">
                <div className="settings-status">
                  <span className="settings-status__light" />
                  <div>
                    <strong>Ideogram API connected</strong>
                    <small>Stored for this browser session only</small>
                  </div>
                </div>
                <label>
                  <span>Replace API key</span>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
                <Button
                  onClick={() => {
                    sessionStorage.setItem(KEY_STORAGE, apiKey.trim());
                    setSavedKey(apiKey.trim());
                    setOverlay(null);
                  }}
                >
                  Save replacement key
                </Button>
                <button className="drawer-danger" onClick={forgetKey}>
                  <Trash2 className="size-4" /> Forget key and leave studio
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </main>
  );
}
