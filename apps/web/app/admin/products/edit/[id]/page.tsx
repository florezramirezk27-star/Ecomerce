"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  Link2,
  Package,
  Save,
  Tag,
  Trash2,
  Upload,
  Video as VideoIcon,
  Wand2,
} from 'lucide-react';
import { apiFetch, Category } from '@/lib/admin';
import { uploadImage } from '@/lib/cloudinary';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
  cn,
} from '@/components/admin/ui';

/**
 * Precio y stock se guardan como texto, no como numero. Con `Number(...)` en
 * cada pulsacion, borrar el campo devolvia `NaN` y el input se rompia al
 * escribir de nuevo. Guardando el texto tal cual se ve exactamente lo que se
 * escribio y la conversion ocurre una sola vez, al guardar y ya validada.
 */
interface ProductForm {
  name: string;
  slug: string;
  description: string;
  price: string;
  stock: string;
  image: string;
  video: string;
  categoryId: string;
}

const EMPTY_FORM: ProductForm = {
  name: '',
  slug: '',
  description: '',
  price: '',
  stock: '',
  image: '',
  video: '',
  categoryId: '',
};

const NAME_HINT_LENGTH = 60;
const MAX_SLUG_LENGTH = 140;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}

function formatCop(value: number): string {
  return `$${value.toLocaleString('es-CO')}`;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Instantanea para detectar si hay cambios sin guardar. */
function snapshot(form: ProductForm, gallery: string[]): string {
  return JSON.stringify({ ...form, gallery });
}

function SectionCard({
  icon: Icon,
  title,
  description,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone: 'blue' | 'emerald' | 'violet' | 'amber';
  children: React.ReactNode;
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  } as const;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            tones[tone],
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </Card>
  );
}

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();

  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [existingGallery, setExistingGallery] = useState<string[]>([]);
  /** Valores tal como venían del servidor, para poder volver atrás. */
  const [original, setOriginal] = useState<{
    form: ProductForm;
    gallery: string[];
  } | null>(null);

  /**
   * Todas las URLs de objeto creadas, para poder liberarlas al desmontar.
   * React no las libera solo y cada una retiene el archivo completo en
   * memoria mientras el usuario esta en la pagina.
   */
  const objectUrls = useRef<string[]>([]);

  function createObjectUrl(file: File): string {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    return url;
  }

  function revokeObjectUrl(url: string) {
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((item) => item !== url);
  }

  useEffect(() => {
    const created = objectUrls.current;
    return () => {
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [categoriesData, product] = await Promise.all([
          apiFetch('/categories'),
          apiFetch(`/products/${params.id}`),
        ]);

        setCategories(categoriesData);

        const loaded: ProductForm = {
          name: product.name,
          slug: product.slug,
          description: product.description || '',
          price: String(product.price),
          stock: String(product.stock),
          image: product.image || '',
          video: product.video || '',
          categoryId: product.categoryId,
        };

        setForm(loaded);
        setExistingGallery(product.gallery || []);
        setOriginal({ form: loaded, gallery: product.gallery || [] });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Error al cargar producto',
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [params.id]);

  const dirty = useMemo(() => {
    if (loading || !original) return false;
    return (
      snapshot(form, existingGallery) !==
        snapshot(original.form, original.gallery) ||
      selectedFile !== null ||
      galleryFiles.length > 0
    );
  }, [
    form,
    existingGallery,
    original,
    selectedFile,
    galleryFiles,
    loading,
  ]);

  /** Vuelve todo a como estaba al abrir, archivos incluidos. */
  function discardChanges() {
    if (!original) return;
    if (previewUrl) revokeObjectUrl(previewUrl);
    galleryPreviews.forEach(revokeObjectUrl);
    setForm(original.form);
    setExistingGallery(original.gallery);
    setSelectedFile(null);
    setPreviewUrl('');
    setGalleryFiles([]);
    setGalleryPreviews([]);
    setError('');
  }

  // El navegador tiene su propio aviso para recargar o cerrar con cambios a
  // medias. Sin esto, un PATCH a medias pierde lo escrito sin avisar.
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function update(patch: Partial<ProductForm>) {
    setForm((previous) => ({ ...previous, ...patch }));
  }

  function handleGalleryFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setGalleryFiles((prev) => [...prev, ...files]);
    setGalleryPreviews((prev) => [...prev, ...files.map(createObjectUrl)]);
    // Permite volver a elegir el mismo archivo si se habia quitado.
    e.target.value = '';
  }

  function removeNewGalleryImage(index: number) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => {
      const removed = prev[index];
      if (removed) revokeObjectUrl(removed);
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeExistingGalleryImage(index: number) {
    setExistingGallery((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMainFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (previewUrl) revokeObjectUrl(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file ? createObjectUrl(file) : '');
    e.target.value = '';
  }

  function clearMainFile() {
    if (previewUrl) revokeObjectUrl(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const price = toNumber(form.price);
    const stock = toNumber(form.stock);

    if (!form.name.trim()) {
      setError('El nombre no puede quedar vacío.');
      return;
    }
    if (!form.slug.trim()) {
      setError('El slug no puede quedar vacío. Se genera desde el nombre.');
      return;
    }
    if (!form.categoryId) {
      setError('Selecciona una categoría.');
      return;
    }
    if (form.price.trim() === '' || !Number.isFinite(Number(form.price))) {
      setError('El precio debe ser un número. Ejemplo: 269000');
      return;
    }
    if (price < 0) {
      setError('El precio no puede ser negativo.');
      return;
    }
    if (form.stock.trim() === '' || !Number.isFinite(Number(form.stock))) {
      setError('El stock debe ser un número. Ejemplo: 25');
      return;
    }
    if (stock < 0) {
      setError('El stock no puede ser negativo.');
      return;
    }

    setSaving(true);

    try {
      // Si hay archivo nuevo se sube y manda su URL; si no, se conserva la
      // que ya estaba guardada.
      let imageUrl = form.image;
      if (selectedFile) {
        setProgress('Subiendo imagen principal...');
        imageUrl = await uploadImage(selectedFile);
      }

      const newGalleryUrls: string[] = [];
      for (const [index, file] of galleryFiles.entries()) {
        setProgress(
          `Subiendo galería (${index + 1} de ${galleryFiles.length})...`,
        );
        newGalleryUrls.push(await uploadImage(file));
      }

      setProgress('Guardando cambios...');
      await apiFetch(`/products/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          slug: slugify(form.slug),
          description: form.description,
          price,
          stock,
          image: imageUrl,
          video: form.video,
          categoryId: form.categoryId,
          gallery: [...existingGallery, ...newGalleryUrls],
        }),
      });
      router.push('/admin/products');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al actualizar producto',
      );
      setSaving(false);
      setProgress('');
    }
  }

  if (loading) {
    return <LoadingState label="Cargando producto..." />;
  }

  const mainPreview = previewUrl || form.image;
  const priceValue = toNumber(form.price);
  const stockValue = toNumber(form.stock);
  const categoryName =
    categories.find((item) => item.id === form.categoryId)?.name ?? null;
  const stockPercent = Math.min(100, (stockValue / 50) * 100);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Editar producto"
        subtitle="Los cambios se reflejan en la tienda en cuanto guardes."
        action={
          dirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              Cambios sin guardar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Todo guardado
            </span>
          )
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="space-y-6">
          <SectionCard
            icon={Tag}
            tone="blue"
            title="Información básica"
            description="Nombre, dirección en la tienda y descripción."
          >
            <Field
              label="Nombre *"
              htmlFor="name"
              hint={
                <p
                  className={cn(
                    'text-xs',
                    form.name.length > NAME_HINT_LENGTH
                      ? 'text-amber-600'
                      : 'text-slate-400',
                  )}
                >
                  {form.name.length} caracteres
                  {form.name.length > NAME_HINT_LENGTH &&
                    ` · por encima de ${NAME_HINT_LENGTH} se corta en Google`}
                </p>
              }
            >
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                required
                placeholder="Ej: Reloj Naviforce Casual NF8028"
              />
            </Field>

            <Field
              label="Slug *"
              htmlFor="slug"
              hint={
                <p className="text-xs text-slate-400">
                  Se usa en la dirección:{' '}
                  <span className="text-slate-600">
                    /products/{slugify(form.slug) || '...'}
                  </span>
                </p>
              }
            >
              <div className="flex gap-2">
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => update({ slug: e.target.value })}
                  required
                  placeholder="reloj-naviforce-casual-nf8028"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => update({ slug: slugify(form.name) })}
                  disabled={!form.name.trim()}
                >
                  <Wand2 className="h-4 w-4" />
                  Generar
                </Button>
              </div>
            </Field>

            <Field
              label="Descripción"
              htmlFor="description"
              hint={
                <p className="text-xs text-slate-400">
                  {form.description.length} caracteres
                </p>
              }
            >
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                rows={5}
                placeholder="Materiales, medidas, garantía, qué incluye el envío..."
              />
            </Field>
          </SectionCard>

          <SectionCard
            icon={Package}
            tone="emerald"
            title="Precio, inventario y categoría"
            description="Lo que ve el cliente y lo que descuenta el stock."
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Precio (COP) *"
                htmlFor="price"
                hint={
                  <p className="text-xs text-slate-400">
                    Se guardará como {formatCop(priceValue)}
                  </p>
                }
              >
                <Input
                  id="price"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={form.price}
                  onChange={(e) => update({ price: e.target.value })}
                  required
                  placeholder="269000"
                />
              </Field>

              <Field
                label="Stock *"
                htmlFor="stock"
                hint={
                  <p className="text-xs text-slate-400">
                    Con {stockValue} unidad
                    {stockValue === 1 ? '' : 'es'} la barra llega al{' '}
                    {Math.round(stockPercent)}%
                  </p>
                }
              >
                <Input
                  id="stock"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => update({ stock: e.target.value })}
                  required
                  placeholder="25"
                />
              </Field>
            </div>

            <Field label="Categoría *" htmlFor="categoryId">
              <Select
                id="categoryId"
                value={form.categoryId}
                onChange={(e) => update({ categoryId: e.target.value })}
                required
              >
                <option value="">Selecciona una categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </SectionCard>

          <SectionCard
            icon={ImageIcon}
            tone="violet"
            title="Imágenes"
            description="La primera es la que aparece en listados y resultados de búsqueda."
          >
            <Field label="Imagen principal" htmlFor="main-image">
              <div className="flex flex-wrap items-center gap-4">
                {mainPreview ? (
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={mainPreview}
                      alt="Imagen principal"
                      className="h-full w-full object-cover"
                    />
                    {selectedFile && (
                      <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 py-0.5 text-center text-[10px] font-semibold text-white">
                        Sin guardar
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-300">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <input
                    id="main-image"
                    type="file"
                    accept="image/*"
                    onChange={handleMainFile}
                    className="w-full cursor-pointer text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={clearMainFile}
                      className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-800"
                    >
                      Quitar el archivo seleccionado
                    </button>
                  )}
                </div>
              </div>
            </Field>

            <Field
              label="Galería (opcional)"
              htmlFor="gallery"
              hint={
                <p className="text-xs text-slate-400">
                  {existingGallery.length + galleryPreviews.length} imagen
                  {existingGallery.length + galleryPreviews.length === 1
                    ? ''
                    : 'es'}
                   . La primera de la galería es la segunda foto del producto.
                </p>
              }
            >
              <input
                id="gallery"
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryFiles}
                className="w-full cursor-pointer text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              />
            </Field>

            {(existingGallery.length > 0 || galleryPreviews.length > 0) && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {existingGallery.map((url, i) => (
                  <div
                    key={`existing-${i}`}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  >
                    <img
                      src={url}
                      alt={`Galería ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {i === 0 && (
                      <span className="absolute inset-x-0 bottom-0 bg-slate-900/80 py-0.5 text-center text-[10px] font-semibold text-white">
                        1ª foto
                      </span>
                    )}
                    {/* Visible siempre: con `opacity-0` hasta el hover, en
                        celular no hay hover y no habia forma de quitar nada. */}
                    <button
                      type="button"
                      onClick={() => removeExistingGalleryImage(i)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow-sm transition hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      aria-label={`Quitar imagen ${i + 1} de la galería`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {galleryPreviews.map((url, i) => (
                  <div
                    key={`new-${i}`}
                    className="group relative aspect-square overflow-hidden rounded-xl border-2 border-blue-200 bg-slate-50"
                  >
                    <img
                      src={url}
                      alt={`Nueva ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-blue-600/90 py-0.5 text-center text-[10px] font-semibold text-white">
                      Sin guardar
                    </span>
                    <button
                      type="button"
                      onClick={() => removeNewGalleryImage(i)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 text-red-600 shadow-sm transition hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      aria-label={`Quitar imagen nueva ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Field
              label="URL de la imagen (opcional)"
              htmlFor="image-url"
              hint={
                <p className="text-xs text-slate-400">
                  Solo si no subiste archivo: una URL tiene prioridad sobre la
                  imagen ya guardada.
                </p>
              }
            >
              <Input
                id="image-url"
                value={form.image}
                onChange={(e) => update({ image: e.target.value })}
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </Field>
          </SectionCard>

          <SectionCard
            icon={VideoIcon}
            tone="amber"
            title="Video (opcional)"
            description="Se muestra bajo las imágenes, en la misma proporción del producto."
          >
            <Field
              label="URL del video"
              htmlFor="video"
              hint={
                <p className="text-xs text-slate-400">
                  Admite YouTube y Vimeo. Con el video de ejemplo el sitio no
                  carga nada de Google hasta que el visitante pulse reproducir.
                </p>
              }
            >
              <Input
                id="video"
                value={form.video}
                onChange={(e) => update({ video: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
              />
            </Field>
          </SectionCard>
        </div>

        {/* Vista previa: lo que vera el cliente, sin salir del formulario. */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Link2 className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Vista previa
              </h2>
            </div>

            <div className="p-4">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
                {mainPreview ? (
                  <img
                    src={mainPreview}
                    alt="Vista previa del producto"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>

              <p className="mt-3 line-clamp-2 text-sm font-bold leading-snug text-slate-900">
                {form.name || 'Nombre del producto'}
              </p>

              {categoryName && (
                <p className="mt-1 text-xs text-slate-400">{categoryName}</p>
              )}

              <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                {formatCop(priceValue)}
              </p>

              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      stockValue === 0
                        ? 'bg-red-500'
                        : stockValue <= 10
                          ? 'bg-amber-500'
                          : 'bg-emerald-500',
                    )}
                    style={{ width: `${stockPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {stockValue === 0
                    ? 'Agotado'
                    : `Quedan ${stockValue} unidad${stockValue === 1 ? '' : 'es'}`}
                </p>
              </div>

              {existingGallery.length + galleryPreviews.length > 0 && (
                <div className="mt-3 flex gap-1.5">
                  {existingGallery
                    .slice(0, 4)
                    .map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ))}
                  {galleryPreviews
                    .slice(0, 4 - existingGallery.length)
                    .map((url, i) => (
                      <img
                        key={`new-${i}`}
                        src={url}
                        alt=""
                        className="h-10 w-10 rounded-lg border-2 border-blue-200 object-cover"
                        loading="lazy"
                      />
                    ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            {progress && (
              <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-blue-600">
                <Upload className="h-3.5 w-3.5 animate-pulse" />
                {progress}
              </p>
            )}

            <div className="space-y-2.5">
              <Button
                type="submit"
                className="w-full"
                isLoading={saving}
                disabled={!dirty}
              >
                {!saving && <Save className="h-4 w-4" />}
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              <Button
                variant="secondary"
                type="button"
                className="w-full"
                onClick={() => {
                  if (dirty) {
                    discardChanges();
                    return;
                  }
                  router.back();
                }}
                disabled={saving}
              >
                {dirty ? 'Descartar cambios' : 'Cancelar'}
              </Button>
            </div>

            {dirty && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Si sales de la pagina, el navegador te avisará antes de perder
                lo escrito.
              </p>
            )}
          </Card>
        </div>
      </form>
    </div>
  );
}