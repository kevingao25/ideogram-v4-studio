"use client";

import {
  Braces,
  Download,
  History,
  ImageIcon,
  KeyRound,
  LoaderCircle,
  PanelRight,
  ScanSearch,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
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
import { Card } from "@/components/ui/card";
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">
      {children}
    </span>
  );
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function extractJsonPrompt(payload: Record<string, unknown>): unknown {
  return payload.json_prompt ?? (payload.data as Record<string, unknown> | undefined)?.json_prompt;
}

export function Studio() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE) ?? "";
    // Browser storage is intentionally read after hydration to keep keys out of server output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(stored);
    setSavedKey(stored);
    setHistory(loadHistory(localStorage));
  }, []);

  const elements = jsonPrompt.compositional_deconstruction.elements;
  const selected = elements[selectedIndex];

  const updatePrompt = (next: V4Prompt) => {
    setJsonPrompt(next);
    setJsonText(pretty(next));
    setJsonError("");
  };

  const saveKey = () => {
    const next = apiKey.trim();
    if (!next) return;
    sessionStorage.setItem(KEY_STORAGE, next);
    setSavedKey(next);
  };

  const forgetKey = () => {
    sessionStorage.removeItem(KEY_STORAGE);
    setSavedKey("");
    setApiKey("");
  };

  const applyJsonText = () => {
    try {
      const parsed = parseV4Prompt(JSON.parse(jsonText));
      setJsonPrompt(parsed);
      setSelectedIndex(0);
      setJsonError("");
    } catch (caught) {
      setJsonError(caught instanceof Error ? caught.message : "Invalid JSON prompt.");
    }
  };

  const updateElementBbox = (index: number, bbox: Bbox) => {
    const next = structuredClone(jsonPrompt);
    next.compositional_deconstruction.elements[index].bbox = clampBbox(bbox);
    updatePrompt(next);
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
    const next: Bbox =
      drag.mode === "move"
        ? [yMin + dy, xMin + dx, yMax + dy, xMax + dx]
        : [yMin, xMin, yMax + dy, xMax + dx];
    updateElementBbox(drag.index, next);
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

  const sendJson = async (endpoint: "magic-prompt", body: Record<string, unknown>) => {
    const response = await fetch(`/api/ideogram/${endpoint}`, {
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

  const sendMultipart = async (
    endpoint: "describe" | "remix",
    fields: Record<string, string>,
  ) => {
    if (!image) throw new Error("Choose an image first.");
    if (image.size > 10 * 1024 * 1024) throw new Error("Images must be 10 MB or smaller.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      throw new Error("Choose a JPEG, PNG, or WebP image.");
    }
    const data = new FormData();
    data.set(endpoint === "describe" ? "image_file" : "image", image);
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

  const sendGenerate = async (body: {
    json_prompt: V4Prompt;
    resolution: string;
    rendering_speed: string;
  }) => {
    const data = new FormData();
    data.set("json_prompt", JSON.stringify(body.json_prompt));
    data.set("resolution", body.resolution);
    data.set("rendering_speed", body.rendering_speed);
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
    if (!savedKey) {
      setError("Save your Ideogram API key before sending a request.");
      return;
    }
    setBusy(endpoint);
    setError("");
    setResult(null);
    try {
      if (endpoint === "magic-prompt") {
        const body = { text_prompt: prompt, aspect_ratio: "1x1" };
        setRequestPreview(body);
        const payload = await sendJson(endpoint, body);
        setResponsePreview(payload);
        const generatedPrompt = extractJsonPrompt(payload);
        if (generatedPrompt) updatePrompt(parseV4Prompt(generatedPrompt));
        addHistory(endpoint, null);
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

      const body = {
        json_prompt: jsonPrompt,
        resolution,
        rendering_speed: speed,
      };
      setRequestPreview(body);
      const payload = await sendGenerate(body);
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

  const canvasAspect = useMemo(() => {
    const [width, height] = resolution.split("x").map(Number);
    return `${width || 1} / ${height || 1}`;
  }, [resolution]);

  return (
    <main className="min-h-screen p-3 md:p-5">
      <header className="mx-auto mb-4 flex max-w-[1800px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/70 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#191815] text-white">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-[-0.03em]">Ideogram V4 Studio</h1>
            <p className="text-xs text-black/45">Structured prompting and API explorer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "hidden rounded-full px-3 py-1 text-xs font-bold sm:block",
              savedKey ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
            )}
          >
            {savedKey ? "API key ready" : "API key required"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen((value) => !value)}>
            <History className="size-4" /> History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInspectorOpen((value) => !value)}
          >
            <PanelRight className="size-4" /> Inspector
          </Button>
        </div>
      </header>

      <section className="mx-auto mb-4 max-w-[1800px]">
        <Card className="flex flex-col gap-3 p-3 md:flex-row md:items-end">
          <div className="flex-1">
            <Label>Bring your own key</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 size-4 text-black/35" />
              <Input
                aria-label="Ideogram API key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your Ideogram API key"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveKey}>Save key</Button>
            {savedKey && (
              <Button variant="ghost" onClick={forgetKey}>
                Forget key
              </Button>
            )}
          </div>
          <p className="max-w-md text-xs leading-5 text-black/45">
            Stored in this browser session only. The relay forwards it to Ideogram and does not
            persist request headers.
          </p>
        </Card>
      </section>

      <div
        className={cn(
          "mx-auto grid max-w-[1800px] gap-4",
          inspectorOpen
            ? "xl:grid-cols-[330px_minmax(500px,1fr)_360px]"
            : "xl:grid-cols-[350px_minmax(520px,1fr)]",
        )}
      >
        <aside className="space-y-4">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Label>Prompt lab</Label>
                <h2 className="font-extrabold tracking-tight">Start with an idea</h2>
              </div>
              <WandSparkles className="size-5 text-[#ff6b35]" />
            </div>
            <Textarea
              aria-label="Text prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-28"
            />
            <Button
              variant="accent"
              className="mt-3 w-full"
              onClick={() => run("magic-prompt")}
              disabled={Boolean(busy)}
            >
              {busy === "magic-prompt" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Expand with Magic Prompt
            </Button>
          </Card>

          <Card className="p-4">
            <Label>Image workflow</Label>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-black/[0.025] px-3 py-5 text-sm font-semibold transition hover:bg-black/[0.045]">
              <Upload className="size-4" />
              {image ? image.name : "Choose reference image"}
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const nextImage = event.target.files?.[0] ?? null;
                  if (imagePreview) URL.revokeObjectURL(imagePreview);
                  setImage(nextImage);
                  setImagePreview(nextImage ? URL.createObjectURL(nextImage) : "");
                }}
              />
            </label>
            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Reference preview"
                className="mt-3 aspect-video w-full rounded-xl object-cover"
              />
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => run("describe")} disabled={Boolean(busy)}>
                <ScanSearch className="size-4" /> Describe
              </Button>
              <Button variant="outline" onClick={() => run("remix")} disabled={Boolean(busy)}>
                <ImageIcon className="size-4" /> Remix
              </Button>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span>Image weight</span>
                <span>{imageWeight}</span>
              </div>
              <input
                aria-label="Image weight"
                type="range"
                min="1"
                max="100"
                value={imageWeight}
                onChange={(event) => setImageWeight(Number(event.target.value))}
                className="w-full accent-[#ff6b35]"
              />
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <Label>Structured JSON</Label>
              <Braces className="size-4 text-black/35" />
            </div>
            <Textarea
              aria-label="Structured JSON editor"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              onBlur={applyJsonText}
              spellCheck={false}
              className="min-h-72 font-mono text-[11px] leading-5"
            />
            {jsonError && <p className="mt-2 text-xs font-semibold text-red-600">{jsonError}</p>}
          </Card>
        </aside>

        <section className="space-y-4">
          <Card className="overflow-hidden p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <Label>Composition canvas</Label>
                <h2 className="font-extrabold tracking-tight">Drag and resize V4 elements</h2>
              </div>
              <div className="flex gap-2">
                <select
                  aria-label="Resolution"
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  className="h-9 rounded-xl border border-black/10 bg-white px-3 text-xs font-bold"
                >
                  <option>2048x2048</option>
                  <option>2880x1440</option>
                  <option>1440x2880</option>
                </select>
                <select
                  aria-label="Rendering speed"
                  value={speed}
                  onChange={(event) => setSpeed(event.target.value)}
                  className="h-9 rounded-xl border border-black/10 bg-white px-3 text-xs font-bold"
                >
                  <option>DEFAULT</option>
                  <option>TURBO</option>
                  <option>QUALITY</option>
                </select>
              </div>
            </div>

            <div
              ref={canvasRef}
              data-testid="bbox-canvas"
              onPointerMove={onPointerMove}
              onPointerUp={() => setDrag(null)}
              onPointerLeave={() => setDrag(null)}
              className="relative mx-auto max-h-[68vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-black/10 bg-[#e9e2d2] shadow-inner touch-none"
              style={{ aspectRatio: canvasAspect }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(rgba(25,24,21,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(25,24,21,.04)_1px,transparent_1px)] bg-[size:10%_10%]" />
              <div className="absolute inset-0 grid place-items-center px-10 text-center">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/30">
                    {jsonPrompt.compositional_deconstruction.background}
                  </p>
                  <p className="mt-2 max-w-xl text-2xl font-extrabold tracking-[-0.04em] text-black/12 md:text-4xl">
                    {jsonPrompt.high_level_description}
                  </p>
                </div>
              </div>
              {elements.map((element, index) => {
                if (!element.bbox) return null;
                const { x, y, width, height } = bboxToPixels(element.bbox, 1000, 1000);
                return (
                  <div
                    key={`${element.type}-${index}`}
                    data-testid={`bbox-element-${index}`}
                    onPointerDown={(event) => onPointerDown(event, index, "move")}
                    className={cn(
                      "absolute cursor-move border-2 p-2 text-xs font-bold shadow-sm transition-colors",
                      index === selectedIndex
                        ? "border-[#ff6b35] bg-[#ff6b35]/12 text-[#8f2c08]"
                        : "border-blue-500 bg-blue-500/10 text-blue-800",
                    )}
                    style={{
                      left: `${x / 10}%`,
                      top: `${y / 10}%`,
                      width: `${width / 10}%`,
                      height: `${height / 10}%`,
                    }}
                  >
                    <span className="line-clamp-2">
                      {element.type === "text" ? element.text : element.desc}
                    </span>
                    <button
                      aria-label={`Resize element ${index + 1}`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onPointerDown(event, index, "resize");
                      }}
                      className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-[#ff6b35]"
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Label>Selected element</Label>
                <h3 className="font-bold">{selected?.desc ?? "No element selected"}</h3>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => updatePrompt(posterPreset)}>
                  Poster preset
                </Button>
                <Button variant="outline" size="sm" onClick={() => updatePrompt(productPreset)}>
                  Product preset
                </Button>
              </div>
            </div>
            {selected?.bbox && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["Y min", "X min", "Y max", "X max"] as const).map((label, index) => (
                  <label key={label}>
                    <Label>{label}</Label>
                    <Input
                      aria-label={label}
                      type="number"
                      min="0"
                      max="1000"
                      value={selected.bbox?.[index] ?? 0}
                      onChange={(event) => updateCoordinate(index, Number(event.target.value))}
                    />
                  </label>
                ))}
              </div>
            )}
          </Card>

          <Button
            variant="accent"
            className="h-14 w-full rounded-2xl text-base"
            onClick={() => run("generate")}
            disabled={Boolean(busy)}
          >
            {busy === "generate" ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Sparkles className="size-5" />
            )}
            Generate image
          </Button>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {result?.url && (
            <Card className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.url} alt="Generated Ideogram result" className="w-full object-contain" />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Label>Ephemeral result</Label>
                  <p className="text-sm font-bold">
                    Seed {String(result.seed ?? "unknown")} · {String(result.resolution ?? resolution)}
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    Download now. Ideogram result URLs may expire.
                  </p>
                </div>
                <Button asChild>
                  <a href={result.url} download target="_blank" rel="noreferrer">
                    <Download className="size-4" /> Download image
                  </a>
                </Button>
              </div>
            </Card>
          )}
        </section>

        {inspectorOpen && (
          <aside className="space-y-4">
            <Card className="sticky top-4 overflow-hidden">
              <div className="border-b border-black/8 p-4">
                <Label>Endpoint inspector</Label>
                <h2 className="font-extrabold tracking-tight">Request / response</h2>
              </div>
              <div className="grid max-h-[82vh] grid-rows-2 divide-y divide-black/8">
                <div className="overflow-auto p-4">
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase text-[#ff6b35]">
                    Request
                  </p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-black/65">
                    {pretty(requestPreview)}
                  </pre>
                </div>
                <div className="overflow-auto p-4">
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase text-blue-600">
                    Response
                  </p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-black/65">
                    {pretty(responsePreview)}
                  </pre>
                </div>
              </div>
            </Card>
          </aside>
        )}
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-50 bg-black/25 p-3 backdrop-blur-sm">
          <Card className="ml-auto h-full max-w-md overflow-auto bg-[#f8f5ed] p-4">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <Label>Local browser data</Label>
                <h2 className="text-xl font-extrabold">Recent requests</h2>
              </div>
              <Button variant="ghost" onClick={() => setHistoryOpen(false)}>
                Close
              </Button>
            </div>
            <div className="space-y-2">
              {history.length === 0 && (
                <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-black/45">
                  Your last 20 request recipes will appear here. Images and API keys are never saved.
                </p>
              )}
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setPrompt(entry.prompt);
                    if (entry.jsonPrompt) updatePrompt(entry.jsonPrompt);
                    if (entry.resolution) setResolution(entry.resolution);
                    setHistoryOpen(false);
                  }}
                  className="w-full rounded-xl border border-black/8 bg-white p-3 text-left transition hover:border-[#ff6b35]/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-extrabold uppercase">
                      {entry.endpoint}
                    </span>
                    <span className="text-[10px] text-black/35">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold">{entry.prompt}</p>
                </button>
              ))}
            </div>
            {history.length > 0 && (
              <Button
                variant="ghost"
                className="mt-4 w-full text-red-600"
                onClick={() => {
                  setHistory([]);
                  saveHistory(localStorage, []);
                }}
              >
                <Trash2 className="size-4" /> Clear history
              </Button>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}
