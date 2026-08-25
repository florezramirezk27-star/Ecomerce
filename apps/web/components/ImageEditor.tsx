"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { Area, Point } from "react-easy-crop";

interface ImageEditorProps {
  image: string;
  onSave: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

interface FiltersState {
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  blur: number;
  hueRotate: number;
  invert: number;
}

interface EffectsState {
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  vignette: number;
}

const defaultFilters: FiltersState = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  hueRotate: 0,
  invert: 0,
};

const defaultEffects: EffectsState = {
  backgroundColor: "#ffffff",
  borderWidth: 0,
  borderColor: "#000000",
  borderRadius: 0,
  vignette: 0,
};

type AspectRatio = number | undefined;

const aspectPresets: { label: string; value: AspectRatio }[] = [
  { label: "Libre", value: undefined },
  { label: "1:1", value: 1 / 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "2:3", value: 2 / 3 },
];

const filterPresets: { label: string; get: () => FiltersState }[] = [
  { label: "Normal", get: () => defaultFilters },
  { label: "Grises", get: () => ({ ...defaultFilters, grayscale: 100 }) },
  { label: "Sepia", get: () => ({ ...defaultFilters, sepia: 80 }) },
  { label: "Vintage", get: () => ({ ...defaultFilters, sepia: 40, contrast: 80, brightness: 110 }) },
  { label: "Brillante", get: () => ({ ...defaultFilters, brightness: 130, contrast: 120, saturate: 130 }) },
  { label: "Oscuro", get: () => ({ ...defaultFilters, brightness: 60, contrast: 150 }) },
  { label: "Alto contraste", get: () => ({ ...defaultFilters, contrast: 200, brightness: 110, grayscale: 100 }) },
  { label: "Invertido", get: () => ({ ...defaultFilters, invert: 100 }) },
];

type UndoState = {
  filters: FiltersState;
  effects: EffectsState;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
};

export default function ImageEditor({ image, onSave, onCancel }: ImageEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"ajustes" | "filtros" | "efectos">("ajustes");
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [effects, setEffects] = useState<EffectsState>(defaultEffects);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>(1);
  const [history, setHistory] = useState<UndoState[]>([]);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });

  const filterCssString = [
    `brightness(${filters.brightness}%)`,
    `contrast(${filters.contrast}%)`,
    `saturate(${filters.saturate}%)`,
    `grayscale(${filters.grayscale}%)`,
    `sepia(${filters.sepia}%)`,
    `blur(${filters.blur}px)`,
    `hue-rotate(${filters.hueRotate}deg)`,
    `invert(${filters.invert}%)`,
  ].join(" ");

  const pushHistory = () => {
    setHistory((prev) => [...prev, {
      filters: { ...filters },
      effects: { ...effects },
      rotation,
      flipH,
      flipV,
    }]);
  };

  const handleFlipH = () => { pushHistory(); setFlipH((prev) => !prev); };
  const handleFlipV = () => { pushHistory(); setFlipV((prev) => !prev); };
  const handleRotate = (deg: number) => { pushHistory(); setRotation((r) => r + deg); };

  const getCroppedImg = async (): Promise<Blob | null> => {
    if (!croppedAreaPixels) return null;

    try {
      const img = await createImage(image);

      const cropW = croppedAreaPixels.width;
      const cropH = croppedAreaPixels.height;

      // Step 1: crop original to selected area
      const cropCanvas = document.createElement("canvas");
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) return null;
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      cropCtx.drawImage(img, croppedAreaPixels.x, croppedAreaPixels.y, cropW, cropH, 0, 0, cropW, cropH);

      // Step 2: rotate + flip + filters on cropped image
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const rotW = Math.ceil(cropW * cos + cropH * sin);
      const rotH = Math.ceil(cropW * sin + cropH * cos);

      const rotCanvas = document.createElement("canvas");
      const rotCtx = rotCanvas.getContext("2d");
      if (!rotCtx) return null;
      rotCanvas.width = rotW || 1;
      rotCanvas.height = rotH || 1;

      rotCtx.filter = filterCssString;
      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      rotCtx.rotate(rad);
      rotCtx.drawImage(cropCanvas, -cropW / 2, -cropH / 2, cropW, cropH);

      // Step 3: final output with effects (background, border, radius, vignette)
      const hasBg = effects.backgroundColor && effects.backgroundColor !== "transparent";
      const hasBorder = effects.borderWidth > 0;
      const hasRadius = effects.borderRadius > 0;
      const hasVignette = effects.vignette > 0;
      const pad = hasBorder ? effects.borderWidth + 4 : 0;

      if (!hasBg && !hasBorder && !hasRadius && !hasVignette) {
        return new Promise((resolve) => rotCanvas.toBlob((b) => resolve(b), "image/png", 0.9));
      }

      const outW = rotW + pad * 2;
      const outH = rotH + pad * 2;

      const finalCanvas = document.createElement("canvas");
      const finalCtx = finalCanvas.getContext("2d");
      if (!finalCtx) return null;
      finalCanvas.width = outW || 1;
      finalCanvas.height = outH || 1;

      // background
      if (hasBg) {
        finalCtx.fillStyle = effects.backgroundColor;
        finalCtx.fillRect(0, 0, outW, outH);
      }

      // rounded corners clip + draw image
      if (hasRadius) {
        finalCtx.beginPath();
        finalCtx.roundRect(pad, pad, rotW, rotH, effects.borderRadius);
        finalCtx.closePath();
        finalCtx.clip();
      }
      finalCtx.drawImage(rotCanvas, pad, pad, rotW, rotH);

      // border
      if (hasBorder) {
        finalCtx.strokeStyle = effects.borderColor;
        finalCtx.lineWidth = effects.borderWidth;
        finalCtx.beginPath();
        if (hasRadius) {
          finalCtx.roundRect(pad, pad, rotW, rotH, effects.borderRadius);
        } else {
          finalCtx.rect(pad, pad, rotW, rotH);
        }
        finalCtx.stroke();
      }

      // vignette
      if (hasVignette) {
        const grad = finalCtx.createRadialGradient(
          outW / 2, outH / 2, Math.min(outW, outH) * 0.3 * (1 - effects.vignette / 100),
          outW / 2, outH / 2, Math.min(outW, outH) * 0.7,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, `rgba(0,0,0,${effects.vignette / 100 * 0.7})`);
        finalCtx.fillStyle = grad;
        finalCtx.fillRect(0, 0, outW, outH);
      }

      return new Promise((resolve) => finalCanvas.toBlob((b) => resolve(b), "image/png", 0.9));
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    setProcessing(true);
    try {
      const blob = await getCroppedImg();
      if (blob) onSave(blob);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setFilters(defaultFilters);
    setEffects(defaultEffects);
    setFlipH(false);
    setFlipV(false);
    setAspect(1);
    setHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFilters(prev.filters);
    setEffects(prev.effects);
    setRotation(prev.rotation);
    setFlipH(prev.flipH);
    setFlipV(prev.flipV);
  };

  const updateFilter = (key: keyof FiltersState, val: number) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  };

  const applyFilterPreset = (get: () => FiltersState) => {
    pushHistory();
    setFilters(get());
  };

  const updateEffect = <K extends keyof EffectsState>(key: K, val: EffectsState[K]) => {
    pushHistory();
    setEffects((prev) => ({ ...prev, [key]: val }));
  };

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (v: number) => void,
  ) => (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 w-20 shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-600"
      />
      <span className="text-xs font-mono text-gray-400 w-12 text-right">{value}{unit}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-bold text-gray-900">Editor de imagen</h3>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button onClick={handleUndo} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="Deshacer">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 shrink-0">
          {([
            ['ajustes', 'Ajustes'],
            ['filtros', 'Filtros'],
            ['efectos', 'Efectos'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium transition border-b-2 ${
                activeTab === tab
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Cropper area */}
        <div className="relative h-[420px] min-h-[300px] bg-gray-900" style={{ filter: filterCssString }}>
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0 space-y-2 max-h-[260px] overflow-y-auto">
          {activeTab === "ajustes" && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Zoom</label>
                <input
                  type="range"
                  min={1} max={3} step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-xs font-mono text-gray-400 w-12 text-right">{(zoom * 100).toFixed(0)}%</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Rotación</label>
                <button onClick={() => handleRotate(-90)} className="p-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition" title="90° izquierda">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <input
                  type="range"
                  min={-180} max={180} step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="flex-[2] accent-blue-600"
                />
                <span className="text-xs font-mono text-gray-500 w-9 text-center">{rotation}°</span>
                <button onClick={() => handleRotate(90)} className="p-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition" title="90° derecha">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Voltear</label>
                <div className="flex gap-1">
                  <button onClick={handleFlipH} className={`p-1.5 border rounded-lg flex items-center gap-1 text-xs transition ${flipH ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-300 hover:bg-gray-100 text-gray-600"}`} title="Voltear horizontal">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3l-7 9h5v9h6v-9h5l-7-9z" /></svg>H
                  </button>
                  <button onClick={handleFlipV} className={`p-1.5 border rounded-lg flex items-center gap-1 text-xs transition ${flipV ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-300 hover:bg-gray-100 text-gray-600"}`} title="Voltear vertical">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l9 7h-5v9H8v-9H3l9-7z" /></svg>V
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Relación</label>
                <div className="flex gap-1 flex-wrap">
                  {aspectPresets.map((p) => (
                    <button key={p.label} onClick={() => setAspect(p.value)} className={`px-2 py-1 border rounded-lg text-xs font-medium transition ${aspect === p.value ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-300 hover:bg-gray-100 text-gray-600"}`}>{p.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "filtros" && (
            <div className="space-y-2">
              <div className="flex gap-1 flex-wrap pb-1">
                {filterPresets.map((p) => (
                  <button key={p.label} onClick={() => applyFilterPreset(p.get)} className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 transition text-gray-600 bg-white">{p.label}</button>
                ))}
              </div>
              {slider("Brillo", filters.brightness, 0, 200, 1, "%", (v) => updateFilter("brightness", v))}
              {slider("Contraste", filters.contrast, 0, 200, 1, "%", (v) => updateFilter("contrast", v))}
              {slider("Saturación", filters.saturate, 0, 200, 1, "%", (v) => updateFilter("saturate", v))}
              {slider("Grises", filters.grayscale, 0, 100, 1, "%", (v) => updateFilter("grayscale", v))}
              {slider("Sepia", filters.sepia, 0, 100, 1, "%", (v) => updateFilter("sepia", v))}
              {slider("Hue", filters.hueRotate, 0, 360, 1, "°", (v) => updateFilter("hueRotate", v))}
              {slider("Invertir", filters.invert, 0, 100, 1, "%", (v) => updateFilter("invert", v))}
              {slider("Desenfoque", filters.blur, 0, 10, 0.5, "px", (v) => updateFilter("blur", v))}
            </div>
          )}

          {activeTab === "efectos" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Fondo</label>
                <input
                  type="color"
                  value={effects.backgroundColor === "transparent" ? "#ffffff" : effects.backgroundColor}
                  onChange={(e) => updateEffect("backgroundColor", e.target.value)}
                  className="w-8 h-8 p-0.5 border border-gray-300 rounded cursor-pointer"
                />
                <span className="text-xs text-gray-400">{effects.backgroundColor}</span>
                <button
                  onClick={() => updateEffect("backgroundColor", "transparent")}
                  className={`px-2 py-1 border rounded-lg text-xs font-medium transition ${effects.backgroundColor === "transparent" ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-300 hover:bg-gray-100 text-gray-600"}`}
                >
                  Sin fondo
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 shrink-0">Borde</label>
                <input
                  type="range"
                  min={0} max={20} step={1}
                  value={effects.borderWidth}
                  onChange={(e) => updateEffect("borderWidth", Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-xs font-mono text-gray-400 w-8 text-right">{effects.borderWidth}px</span>
                <input
                  type="color"
                  value={effects.borderColor}
                  onChange={(e) => updateEffect("borderColor", e.target.value)}
                  className="w-7 h-7 p-0.5 border border-gray-300 rounded cursor-pointer"
                />
              </div>

              {slider("Esquinas", effects.borderRadius, 0, 60, 1, "px", (v) => updateEffect("borderRadius", v))}
              {slider("Viñeta", effects.vignette, 0, 100, 1, "%", (v) => updateEffect("vignette", v))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 shrink-0">
          <button onClick={handleReset} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition text-gray-600 text-sm">
            Restablecer todo
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onCancel} className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition text-gray-700">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={processing} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {processing ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Procesando...</>
              ) : "Aplicar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
