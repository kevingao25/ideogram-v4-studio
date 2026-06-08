"use client";

import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  Download,
  ImageIcon,
  KeyRound,
  LoaderCircle,
  Plus,
  ScanSearch,
  Settings,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  bboxToPixels,
  clampBbox,
  defaultBbox,
  moveBbox,
  type Bbox,
} from "@/lib/bbox";
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

const starterPrompt: V4Prompt = {
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
        bbox: [90, 90, 290, 760],
      },
      {
        type: "obj",
        desc: "A translucent cobalt blue glass sphere casting an amber shadow",
        bbox: [380, 300, 880, 800],
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

type Mode = "create" | "describe" | "remix";
type CreateStep = "prompt" | "structure" | "arrange" | "generate";
type DragState = {
  index: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  initial: Bbox;
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function extractJsonPrompt(payload: Record<string, unknown>): unknown {
  return payload.json_prompt ?? (payload.data as Record<string, unknown> | undefined)?.json_prompt;
}

function readSessionKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function writeSessionKey(value: string) {
  try {
    sessionStorage.setItem(KEY_STORAGE, value);
  } catch {
    // Some browser contexts block sessionStorage. The in-memory key still works for the active page.
  }
}

function removeSessionKey() {
  try {
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // Ignore storage failures; clearing React state is enough for this demo.
  }
}

function SectionNumber({ children }: { children: React.ReactNode }) {
  return <span className="section-number">{children}</span>;
}

export function Studio() {
  const [hydrated, setHydrated] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [gatewayError, setGatewayError] = useState("");
  const [mode, setMode] = useState<Mode>("create");
  const [createStep, setCreateStep] = useState<CreateStep>("prompt");
  const [prompt, setPrompt] = useState("A modern exhibition poster about the geometry of light");
  const [jsonPrompt, setJsonPrompt] = useState<V4Prompt>(starterPrompt);
  const [jsonText, setJsonText] = useState(pretty(starterPrompt));
  const [showRawJson, setShowRawJson] = useState(false);
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
  const [showSettings, setShowSettings] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readSessionKey();
    // Session state is restored after hydration so keys never enter server-rendered HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(stored);
    setSavedKey(stored);
    try {
      setHistory(loadHistory(localStorage));
    } catch {
      setHistory([]);
    }
    setHydrated(true);
  }, []);

  const elements = jsonPrompt.compositional_deconstruction.elements;
  const selected = elements[selectedIndex];
  const missingBoxes = elements.filter((element) => !element.bbox).length;
  const canvasAspect = useMemo(() => {
    const [width, height] = resolution.split("x").map(Number);
    return `${width || 1} / ${height || 1}`;
  }, [resolution]);

  const enterStudio = () => {
    const next = apiKey.trim();
    if (!next) {
      setGatewayError("Enter your Ideogram API key to continue.");
      return;
    }
    writeSessionKey(next);
    setSavedKey(next);
    setGatewayError("");
  };

  const updatePrompt = (next: V4Prompt) => {
    setJsonPrompt(next);
    setJsonText(pretty(next));
    setJsonError("");
    setSelectedIndex(0);
  };

  const updateElement = (
    index: number,
    changes: Partial<V4Prompt["compositional_deconstruction"]["elements"][number]>,
  ) => {
    const next = structuredClone(jsonPrompt);
    next.compositional_deconstruction.elements[index] = {
      ...next.compositional_deconstruction.elements[index],
      ...changes,
    };
    setJsonPrompt(next);
    setJsonText(pretty(next));
  };

  const setElementBbox = (index: number, bbox: Bbox) => {
    updateElement(index, { bbox: clampBbox(bbox) });
  };

  const autoPlaceMissing = () => {
    const next = structuredClone(jsonPrompt);
    next.compositional_deconstruction.elements.forEach((element, index) => {
      if (!element.bbox) element.bbox = defaultBbox(index, elements.length);
    });
    updatePrompt(next);
  };

  const applyJson = () => {
    try {
      updatePrompt(parseV4Prompt(JSON.parse(jsonText)));
    } catch (caught) {
      setJsonError(caught instanceof Error ? caught.message : "Invalid structured JSON.");
    }
  };

  const onPointerDown = (
    event: React.PointerEvent,
    index: number,
    dragMode: DragState["mode"],
  ) => {
    const bbox = elements[index].bbox;
    if (!bbox) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedIndex(index);
    setDrag({
      index,
      mode: dragMode,
      startX: event.clientX,
      startY: event.clientY,
      initial: [...bbox] as Bbox,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = ((event.clientX - drag.startX) / rect.width) * 1000;
    const dy = ((event.clientY - drag.startY) / rect.height) * 1000;
    const [yMin, xMin, yMax, xMax] = drag.initial;
    const next =
      drag.mode === "move"
        ? moveBbox(drag.initial, dx, dy)
        : clampBbox([yMin, xMin, Math.max(yMin + 30, yMax + dy), Math.max(xMin + 30, xMax + dx)]);
    setElementBbox(drag.index, next);
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

  const validateImage = () => {
    if (!image) throw new Error("Choose an image first.");
    if (image.size > 10 * 1024 * 1024) throw new Error("Images must be 10 MB or smaller.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      throw new Error("Choose a JPEG, PNG, or WebP image.");
    }
    return image;
  };

  const run = async (endpoint: HistoryEndpoint) => {
    setBusy(endpoint);
    setError("");
    try {
      let payload: Record<string, unknown>;
      if (endpoint === "magic-prompt") {
        const body = { text_prompt: prompt, aspect_ratio: "1x1" };
        setRequestPreview(body);
        const response = await fetch("/api/ideogram/magic-prompt", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-ideogram-api-key": savedKey,
          },
          body: JSON.stringify(body),
        });
        payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(String(payload.error ?? "Magic Prompt failed."));
        const generated = extractJsonPrompt(payload);
        if (generated) updatePrompt(parseV4Prompt(generated));
        setCreateStep("structure");
        addHistory(endpoint, null);
      } else if (endpoint === "describe" || endpoint === "remix") {
        const source = validateImage();
        const data = new FormData();
        data.set(endpoint === "describe" ? "image_file" : "image", source);
        if (endpoint === "describe") {
          data.set("include_bbox", "true");
          setRequestPreview({ image: source.name, include_bbox: true });
        } else {
          data.set("text_prompt", prompt);
          data.set("image_weight", String(imageWeight));
          data.set("resolution", resolution);
          data.set("rendering_speed", speed);
          setRequestPreview({ image: source.name, text_prompt: prompt, image_weight: imageWeight });
        }
        const response = await fetch(`/api/ideogram/${endpoint}`, {
          method: "POST",
          headers: { "x-ideogram-api-key": savedKey },
          body: data,
        });
        payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(String(payload.error ?? `${endpoint} failed.`));
        if (endpoint === "describe") {
          const described = extractJsonPrompt(payload);
          if (described) updatePrompt(parseV4Prompt(described));
          setMode("create");
          setCreateStep("structure");
          addHistory(endpoint, null);
        } else {
          const first = ((payload.data as Result[] | undefined)?.[0] ?? payload) as Result;
          setResult(first);
          addHistory(endpoint, first);
        }
      } else {
        if (missingBoxes) throw new Error(`Add placement boxes for all ${missingBoxes} remaining elements.`);
        const data = new FormData();
        data.set("json_prompt", JSON.stringify(jsonPrompt));
        data.set("resolution", resolution);
        data.set("rendering_speed", speed);
        setRequestPreview({ json_prompt: jsonPrompt, resolution, rendering_speed: speed });
        const response = await fetch("/api/ideogram/generate", {
          method: "POST",
          headers: { "x-ideogram-api-key": savedKey },
          body: data,
        });
        payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(String(payload.error ?? "Generation failed."));
        const first = ((payload.data as Result[] | undefined)?.[0] ?? payload) as Result;
        setResult(first);
        addHistory(endpoint, first);
      }
      setResponsePreview(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const setSourceImage = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  if (!hydrated) return <main className="key-gate" />;

  if (!savedKey) {
    return (
      <main className="key-gate">
        <div className="key-gate__panel">
          <div className="demo-wordmark">
            <span>I4</span>
            <strong>Ideogram V4 Studio</strong>
          </div>
          <p className="demo-kicker">Interactive API demo</p>
          <h1>Connect your API key.</h1>
          <p className="key-gate__copy">
            Your key stays in this browser session and is only forwarded to Ideogram when you run a request.
          </p>
          <label className="key-input">
            <KeyRound className="size-5" />
            <Input
              aria-label="Ideogram API key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && enterStudio()}
              placeholder="Paste your Ideogram API key"
            />
          </label>
          {gatewayError && <p className="inline-error">{gatewayError}</p>}
          <Button onClick={enterStudio}>Open demo</Button>
          <a href="https://ideogram.ai/manage-api" target="_blank" rel="noreferrer">
            Get an Ideogram API key
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div className="demo-wordmark">
          <span>I4</span>
          <strong>V4 Studio</strong>
        </div>
        <nav className="mode-tabs" aria-label="Demo mode">
          {(["create", "describe", "remix"] as Mode[]).map((item) => (
            <button
              key={item}
              className={mode === item ? "is-active" : undefined}
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Settings">
          <Settings className="size-4" />
        </button>
      </header>

      <div className="demo-column">
        {mode === "create" && (
          <>
            <nav className="create-progress" aria-label="Create image steps">
              {(["prompt", "structure", "arrange", "generate"] as CreateStep[]).map((step, index) => (
                <button
                  key={step}
                  className={cn(createStep === step && "is-active")}
                  onClick={() => setCreateStep(step)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {step}
                </button>
              ))}
            </nav>

            {createStep === "prompt" && (
            <section className="demo-section prompt-section step-page">
              <div className="section-heading">
                <SectionNumber>01</SectionNumber>
                <div>
                  <h1>Create with structure</h1>
                  <p>Start with a prompt, then edit the structure Ideogram V4 understands.</p>
                </div>
              </div>
              <div className="prompt-box">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  aria-label="Text prompt"
                />
                <Button onClick={() => run("magic-prompt")} disabled={Boolean(busy)}>
                  {busy === "magic-prompt" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <WandSparkles className="size-4" />
                  )}
                  Magic Prompt
                </Button>
              </div>
              <div className="step-actions">
                <span />
                <Button onClick={() => setCreateStep("structure")}>
                  Continue to structure <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
            )}

            {createStep === "structure" && (
            <section className="demo-section step-page">
              <div className="section-heading section-heading--row">
                <div className="section-heading__title">
                  <SectionNumber>02</SectionNumber>
                  <div>
                    <h2>Structured prompt</h2>
                    <p>Edit each element and give it a placement box.</p>
                  </div>
                </div>
                <div className="section-tools">
                  {missingBoxes > 0 && (
                    <Button variant="outline" onClick={autoPlaceMissing}>
                      <Sparkles className="size-4" /> Auto-place {missingBoxes}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setShowRawJson((value) => !value)}>
                    <Braces className="size-4" />
                    {showRawJson ? "Visual editor" : "Raw JSON"}
                  </Button>
                  <span className="element-count">{elements.length}</span>
                </div>
              </div>

              {showRawJson ? (
                <div className="raw-json-panel">
                  <Textarea
                    value={jsonText}
                    onChange={(event) => setJsonText(event.target.value)}
                    aria-label="Structured JSON editor"
                    spellCheck={false}
                  />
                  <div className="raw-json-footer">
                    {jsonError && <span className="inline-error">{jsonError}</span>}
                    <Button onClick={applyJson}>Apply JSON</Button>
                  </div>
                </div>
              ) : (
                <div className="element-cards">
                  {elements.map((element, index) => (
                    <article
                      key={`${element.type}-${index}`}
                      className={cn(
                        "element-card",
                        selectedIndex === index && "element-card--selected",
                      )}
                    >
                      <button className="element-card__heading" onClick={() => setSelectedIndex(index)}>
                        <span className="element-dot" />
                        <strong>{element.type === "text" ? element.text || "Text element" : `Object ${index + 1}`}</strong>
                        <span className="type-pill">{element.type === "text" ? "TEXT" : "OBJECT"}</span>
                        {element.bbox ? <Check className="size-4" /> : <Plus className="size-4" />}
                      </button>

                      <div className="element-card__body">
                        {element.type === "text" && (
                          <label>
                            <span>Text</span>
                            <Textarea
                              value={element.text ?? ""}
                              onChange={(event) => updateElement(index, { text: event.target.value })}
                            />
                          </label>
                        )}
                        <label>
                          <span>Description</span>
                          <Textarea
                            value={element.desc}
                            onChange={(event) => updateElement(index, { desc: event.target.value })}
                          />
                        </label>

                        {element.bbox ? (
                          <div className="coordinate-row">
                            {(["TOP", "LEFT", "BOTTOM", "RIGHT"] as const).map((label, coordinate) => (
                              <label key={label}>
                                <span>{label}</span>
                                <Input
                                  type="number"
                                  min="0"
                                  max="1000"
                                  value={element.bbox?.[coordinate] ?? 0}
                                  onChange={(event) => {
                                    const bbox = [...(element.bbox as Bbox)] as Bbox;
                                    bbox[coordinate] = Number(event.target.value);
                                    setElementBbox(index, bbox);
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                        ) : (
                          <button
                            className="add-box-button"
                            onClick={() => setElementBbox(index, defaultBbox(index, elements.length))}
                          >
                            <Plus className="size-4" />
                            Add bounding box
                            <span>Required before generation</span>
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="step-actions">
                <Button variant="outline" onClick={() => setCreateStep("prompt")}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button onClick={() => setCreateStep("arrange")} disabled={Boolean(missingBoxes)}>
                  Arrange boxes <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
            )}

            {createStep === "arrange" && (
            <section className="demo-section step-page">
              <div className="section-heading section-heading--row">
                <div className="section-heading__title">
                  <SectionNumber>03</SectionNumber>
                  <div>
                    <h2>Arrange</h2>
                    <p>Drag boxes to move. Use the violet corner to resize.</p>
                  </div>
                </div>
                {missingBoxes > 0 && <span className="placement-warning">{missingBoxes} unplaced</span>}
              </div>

              <div className="canvas-wrap">
                <div
                  ref={canvasRef}
                  className="bbox-canvas"
                  style={{ aspectRatio: canvasAspect }}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)}
                  onPointerLeave={() => setDrag(null)}
                >
                  <div className="bbox-canvas__grid" />
                  {elements.map((element, index) => {
                    if (!element.bbox) return null;
                    const rect = bboxToPixels(element.bbox, 1000, 1000);
                    return (
                      <div
                        key={`${element.type}-box-${index}`}
                        className={cn("bbox-item", selectedIndex === index && "bbox-item--active")}
                        style={{
                          left: `${rect.x / 10}%`,
                          top: `${rect.y / 10}%`,
                          width: `${rect.width / 10}%`,
                          height: `${rect.height / 10}%`,
                        }}
                        onPointerDown={(event) => onPointerDown(event, index, "move")}
                      >
                        <span>{element.type === "text" ? element.text : element.desc}</span>
                        <button
                          aria-label={`Resize element ${index + 1}`}
                          className="bbox-handle"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            onPointerDown(event, index, "resize");
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="step-actions">
                <Button variant="outline" onClick={() => setCreateStep("structure")}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button onClick={() => setCreateStep("generate")} disabled={Boolean(missingBoxes)}>
                  Continue to generate <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
            )}

            {createStep === "generate" && (
            <section className="demo-section generate-section step-page">
              <div className="section-heading">
                <SectionNumber>04</SectionNumber>
                <div>
                  <h2>Generate</h2>
                  <p>Render the structured composition with Ideogram V4.</p>
                </div>
              </div>
              <div className="generate-bar">
                <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
                  <option>2048x2048</option>
                  <option>2880x1440</option>
                  <option>1440x2880</option>
                </select>
                <select value={speed} onChange={(event) => setSpeed(event.target.value)}>
                  <option>DEFAULT</option>
                  <option>TURBO</option>
                  <option>QUALITY</option>
                </select>
                <Button onClick={() => run("generate")} disabled={Boolean(busy || missingBoxes)}>
                  {busy === "generate" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate image
                </Button>
              </div>
              {result?.url && (
                <div className="result-panel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.url} alt="Generated Ideogram result" />
                  <Button asChild variant="outline">
                    <a href={result.url} download target="_blank" rel="noreferrer">
                      <Download className="size-4" /> Download
                    </a>
                  </Button>
                </div>
              )}
              <div className="step-actions step-actions--generate">
                <Button variant="outline" onClick={() => setCreateStep("arrange")}>
                  <ArrowLeft className="size-4" /> Back to arrange
                </Button>
              </div>
            </section>
            )}
          </>
        )}

        {(mode === "describe" || mode === "remix") && (
          <section className="demo-section utility-mode">
            <div className="section-heading">
              <SectionNumber>{mode === "describe" ? "D" : "R"}</SectionNumber>
              <div>
                <h1>{mode === "describe" ? "Describe an image" : "Remix an image"}</h1>
                <p>
                  {mode === "describe"
                    ? "Turn a reference into editable structured JSON with bounding boxes."
                    : "Keep a reference image while changing its creative direction."}
                </p>
              </div>
            </div>
            <label className="upload-box">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Uploaded reference" />
              ) : (
                <>
                  <Upload className="size-6" />
                  <strong>Choose an image</strong>
                  <span>JPEG, PNG, or WebP · 10 MB max</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setSourceImage(event.target.files?.[0] ?? null)}
              />
            </label>
            {mode === "remix" && (
              <>
                <label className="utility-field">
                  <span>New direction</span>
                  <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                </label>
                <label className="utility-field">
                  <span>Reference influence: {imageWeight}%</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={imageWeight}
                    onChange={(event) => setImageWeight(Number(event.target.value))}
                  />
                </label>
              </>
            )}
            <Button onClick={() => run(mode)} disabled={Boolean(busy || !image)}>
              {busy === mode ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : mode === "describe" ? (
                <ScanSearch className="size-4" />
              ) : (
                <ImageIcon className="size-4" />
              )}
              {mode === "describe" ? "Describe image" : "Create remix"}
            </Button>
            {mode === "remix" && result?.url && (
              <div className="result-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.url} alt="Remixed result" />
              </div>
            )}
          </section>
        )}

        <button className="api-disclosure" onClick={() => setShowApi((value) => !value)}>
          <span>Last API request / response</span>
          <ChevronDown className={cn("size-4", showApi && "rotate-180")} />
        </button>
        {showApi && (
          <section className="api-panel">
            <div>
              <span>Request</span>
              <pre>{pretty(requestPreview)}</pre>
            </div>
            <div>
              <span>Response</span>
              <pre>{pretty(responsePreview)}</pre>
            </div>
          </section>
        )}
      </div>

      {error && (
        <div className="toast-error">
          <span>{error}</span>
          <button onClick={() => setError("")}><X className="size-4" /></button>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onMouseDown={() => setShowSettings(false)}>
          <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettings(false)}>
              <X className="size-4" />
            </button>
            <h2>API settings</h2>
            <p>The key is stored for this browser session only.</p>
            <Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <Button
              onClick={() => {
                    writeSessionKey(apiKey.trim());
                    setSavedKey(apiKey.trim());
                setShowSettings(false);
              }}
            >
              Save key
            </Button>
            <button
              className="forget-key"
              onClick={() => {
                removeSessionKey();
                setSavedKey("");
                setApiKey("");
                setShowSettings(false);
              }}
            >
              Forget key and leave demo
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
