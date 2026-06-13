"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, Category } from '@/lib/admin';
import { uploadImage } from '@/lib/cloudinary';

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
    customCode: '',
  });
  const [categories, setCategories] = useState<Category[]>([]);
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
          customCode: product.customCode || '',
        });
        setExistingGallery(product.gallery || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Error al cargar producto',
        );
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

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">
        Editar Producto
      </h1>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 max-w-xl"
      >
        <input
          className="border p-2 w-full rounded"
          value={form.name}
          onChange={(e) =>
            setForm({
              ...form,
              name: e.target.value,
            })
          }
          placeholder="Nombre"
        />

        <input
          className="border p-2 w-full rounded"
          value={form.slug}
          onChange={(e) =>
            setForm({
              ...form,
              slug: e.target.value,
            })
          }
          placeholder="Slug"
        />

        <textarea
          className="border p-2 w-full rounded"
          value={form.description}
          onChange={(e) =>
            setForm({
              ...form,
              description: e.target.value,
            })
          }
          placeholder="Descripción"
        />

        <div className="grid grid-cols-2 gap-4">
          <input
            type="number"
            className="border p-2 w-full rounded"
            value={form.price}
            onChange={(e) =>
              setForm({
                ...form,
                price: Number(e.target.value),
              })
            }
            placeholder="Precio"
          />

          <input
            type="number"
            className="border p-2 w-full rounded"
            value={form.stock}
            onChange={(e) =>
              setForm({
                ...form,
                stock: Number(e.target.value),
              })
            }
            placeholder="Stock"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Imagen principal
          </label>
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
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Galería de imágenes
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleGalleryFiles}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">
            Puedes seleccionar varias imágenes
          </p>
        </div>

        {(existingGallery.length > 0 || galleryPreviews.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {existingGallery.map((url, i) => (
              <div
                key={`existing-${i}`}
                className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group"
              >
                <img
                  src={url}
                  alt={`Galería ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExistingGalleryImage(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
            {galleryPreviews.map((url, i) => (
              <div
                key={`new-${i}`}
                className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group"
              >
                <img
                  src={url}
                  alt={`Nueva ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeNewGalleryImage(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            URL Imagen
          </label>
          <input
            className="border p-2 w-full rounded"
            value={form.image}
            onChange={(e) =>
              setForm({
                ...form,
                image: e.target.value,
              })
            }
            placeholder="https://ejemplo.com/imagen.jpg"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            URL Video (opcional)
          </label>
          <input
            className="border p-2 w-full rounded"
            value={form.video}
            onChange={(e) =>
              setForm({
                ...form,
                video: e.target.value,
              })
            }
            placeholder="https://youtube.com/watch?v=..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Código HTML / CSS personalizado
          </label>
          <textarea
            value={form.customCode}
            onChange={(e) =>
              setForm({
                ...form,
                customCode: e.target.value,
              })
            }
            rows={8}
            placeholder="<style>/* Tus estilos aquí */</style>"
            className="border p-2 w-full rounded font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Este código se renderizará en la página del producto.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Categoría
          </label>
          <select
            value={form.categoryId}
            onChange={(e) =>
              setForm({
                ...form,
                categoryId: e.target.value,
              })
            }
            className="border p-2 w-full rounded"
          >
            <option value="">Selecciona una categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {(previewUrl || form.image) && (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <img
              src={previewUrl || form.image}
              alt="Vista previa"
              className="w-full h-64 object-cover"
            />
          </div>
        )}

        <button
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={saving}
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
