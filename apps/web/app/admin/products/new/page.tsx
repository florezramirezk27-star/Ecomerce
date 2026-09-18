'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { apiFetch, Category } from '@/lib/admin';
import { uploadImage } from '@/lib/cloudinary';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/components/admin/ui';

const fileInputClass =
  'w-full cursor-pointer text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100';

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    price: '',
    stock: '',
    image: '',
    video: '',
    categoryId: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/categories');
        setCategories(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Error al cargar categorías',
        );
      }
    })();
  }, []);

  function handleGalleryFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setGalleryFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      setGalleryPreviews((prev) => [...prev, url]);
    });
  }

  function removeGalleryImage(index: number) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  const uploadImageFile = async () => {
    if (!selectedFile) {
      return formData.image;
    }
    return await uploadImage(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      const mainImageUrl = await uploadImageFile();

      const galleryUrls: string[] = [];
      for (const file of galleryFiles) {
        const url = await uploadImage(file);
        galleryUrls.push(url);
      }

      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock),
          image: mainImageUrl,
          gallery: galleryUrls,
        }),
      });
      router.push('/admin/products');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al crear producto',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Crear Producto"
        subtitle="Agrega un nuevo producto a tu catálogo"
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Package className="h-4.5 w-4.5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Información básica
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Nombre *">
            <Input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              placeholder="Ej: Camiseta Oversize Algodón"
            />
          </Field>

          <Field label="Slug *">
            <Input
              type="text"
              value={formData.slug}
              onChange={(e) =>
                setFormData({ ...formData, slug: e.target.value })
              }
              required
              placeholder="ej: camiseta-oversize"
            />
          </Field>

          <Field label="Descripción">
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              placeholder="Descripción del producto"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Precio (COP) *">
              <Input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                required
                min="0"
                step="0.01"
                placeholder="0"
              />
            </Field>

            <Field label="Stock *">
              <Input
                type="number"
                value={formData.stock}
                onChange={(e) =>
                  setFormData({ ...formData, stock: e.target.value })
                }
                required
                min="0"
                placeholder="0"
              />
            </Field>
          </div>

          <Field label="Categoría *">
            <Select
              value={formData.categoryId}
              onChange={(e) =>
                setFormData({ ...formData, categoryId: e.target.value })
              }
              required
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-4 text-sm font-bold text-slate-900">
              Imágenes del producto
            </h3>

            <div className="mb-4">
              <Field label="Imagen principal *">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    if (file) {
                      setPreviewUrl(URL.createObjectURL(file));
                    }
                  }}
                  className={fileInputClass}
                />
              </Field>
            </div>

            <div className="mb-4">
              <Field label="Galería de imágenes (opcional)">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryFiles}
                  className={fileInputClass}
                />
              </Field>
              <p className="mt-1.5 text-xs text-slate-400">
                Puedes seleccionar varias imágenes
              </p>
            </div>

            {(previewUrl || galleryPreviews.length > 0) && (
              <div className="mb-4 flex flex-wrap gap-3">
                {previewUrl && (
                  <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200">
                    <img
                      src={previewUrl}
                      alt="Principal"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-slate-900/70 py-0.5 text-center text-[10px] font-medium text-white">
                      Principal
                    </span>
                  </div>
                )}
                {galleryPreviews.map((url, i) => (
                  <div
                    key={i}
                    className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={url}
                      alt={`Galería ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(i)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Quitar imagen"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Field label="URL Imagen (opcional)">
              <Input
                type="url"
                value={formData.image}
                onChange={(e) =>
                  setFormData({ ...formData, image: e.target.value })
                }
                placeholder="https://ejemplo.com/imagen.jpg"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Si no deseas subir archivos, pega la URL directamente
              </p>
            </Field>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-4 text-sm font-bold text-slate-900">
              Video del producto (opcional)
            </h3>
            <Field label="URL del video">
              <Input
                type="url"
                value={formData.video}
                onChange={(e) =>
                  setFormData({ ...formData, video: e.target.value })
                }
                placeholder="https://youtube.com/watch?v=..."
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Soporta YouTube, Vimeo, o URL directa de video
              </p>
            </Field>
          </div>

          {previewUrl && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <img
                src={previewUrl}
                alt="Vista previa"
                className="h-64 w-full object-cover"
              />
            </div>
          )}

          <div className="flex gap-4 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              type="button"
              onClick={() => router.back()}
            >
              Cancelar
            </Button>
            <Button className="flex-1" type="submit" isLoading={loading}>
              {loading ? 'Guardando...' : 'Crear Producto'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}