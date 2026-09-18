"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
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
} from '@/components/admin/ui';

const fileInputClass =
  'w-full cursor-pointer text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    price: 0,
    stock: 0,
    image: '',
    video: '',
    categoryId: '',
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [existingGallery, setExistingGallery] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [categoriesData, product] = await Promise.all([
          apiFetch('/categories'),
          apiFetch(`/products/${params.id}`),
        ]);

        setCategories(categoriesData);
        setForm({
          name: product.name,
          slug: product.slug,
          description: product.description || '',
          price: Number(product.price),
          stock: product.stock,
          image: product.image || '',
          video: product.video || '',
          categoryId: product.categoryId,
        });
        setExistingGallery(product.gallery || []);
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

  function handleGalleryFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setGalleryFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      setGalleryPreviews((prev) => [...prev, url]);
    });
  }

  function removeNewGalleryImage(index: number) {
    setGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeExistingGalleryImage(index: number) {
    setExistingGallery((prev) => prev.filter((_, i) => i !== index));
  }

  const uploadImageFile = async () => {
    if (!selectedFile) {
      return form.image;
    }
    return await uploadImage(selectedFile);
  };

  async function handleSubmit(
    e: React.FormEvent,
  ) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const imageUrl = await uploadImageFile();

      const newGalleryUrls: string[] = [];
      for (const file of galleryFiles) {
        const url = await uploadImage(file);
        newGalleryUrls.push(url);
      }

      await apiFetch(`/products/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          image: imageUrl,
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
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Cargando producto..." />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Editar Producto"
        subtitle="Actualiza la información del producto"
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Pencil className="h-4.5 w-4.5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Información básica
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Nombre *">
            <Input
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              required
            />
          </Field>

          <Field label="Slug *">
            <Input
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value })
              }
              required
            />
          </Field>

          <Field label="Descripción">
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={4}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Precio (COP) *">
              <Input
                type="number"
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
                required
                min="0"
              />
            </Field>

            <Field label="Stock *">
              <Input
                type="number"
                value={form.stock}
                onChange={(e) =>
                  setForm({ ...form, stock: Number(e.target.value) })
                }
                required
                min="0"
              />
            </Field>
          </div>

          <Field label="Categoría *">
            <Select
              value={form.categoryId}
              onChange={(e) =>
                setForm({ ...form, categoryId: e.target.value })
              }
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

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-4 text-sm font-bold text-slate-900">
              Imágenes del producto
            </h3>

            <div className="mb-4">
              <Field label="Imagen principal">
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

            {(existingGallery.length > 0 || galleryPreviews.length > 0) && (
              <div className="mb-4 flex flex-wrap gap-3">
                {existingGallery.map((url, i) => (
                  <div
                    key={`existing-${i}`}
                    className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={url}
                      alt={`Galería ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingGalleryImage(i)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Quitar imagen"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {galleryPreviews.map((url, i) => (
                  <div
                    key={`new-${i}`}
                    className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={url}
                      alt={`Nueva ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewGalleryImage(i)}
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
                value={form.image}
                onChange={(e) =>
                  setForm({ ...form, image: e.target.value })
                }
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </Field>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-4 text-sm font-bold text-slate-900">
              Video del producto (opcional)
            </h3>
            <Field label="URL del video">
              <Input
                value={form.video}
                onChange={(e) =>
                  setForm({ ...form, video: e.target.value })
                }
                placeholder="https://youtube.com/watch?v=..."
              />
            </Field>
          </div>

          {(previewUrl || form.image) && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <img
                src={previewUrl || form.image}
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
            <Button className="flex-1" type="submit" isLoading={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}