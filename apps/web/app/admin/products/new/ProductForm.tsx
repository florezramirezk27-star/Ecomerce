"use client";

import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/cloudinary";

interface CategoryOption {
  id: string;
  name: string;
}

export default function ProductForm() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    price: 0,
    stock: 0,
    image: "",
    categoryId: "",
  });

  useEffect(() => {
    apiFetch('/categories')
      .then(setCategories);
  }, []);

  async function handleSubmit(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    let imageUrl = "";

    if (imageFile) {
      imageUrl = await uploadImage(
        imageFile
      );
    }

    try {
      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          image: imageUrl,
        }),
      });
      alert("Producto creado");
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Error al crear",
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 max-w-xl"
    >
      <input
        placeholder="Nombre"
        className="border p-2 w-full"
        value={form.name}
        onChange={(e) =>
          setForm({
            ...form,
            name: e.target.value,
          })
        }
      />

      <input
        placeholder="Slug"
        className="border p-2 w-full"
        value={form.slug}
        onChange={(e) =>
          setForm({
            ...form,
            slug: e.target.value,
          })
        }
      />

      <textarea
        placeholder="Descripción"
        className="border p-2 w-full"
        value={form.description}
        onChange={(e) =>
          setForm({
            ...form,
            description:
              e.target.value,
          })
        }
      />

      <input
        type="number"
        placeholder="Precio"
        className="border p-2 w-full"
        onChange={(e) =>
          setForm({
            ...form,
            price: Number(
              e.target.value,
            ),
          })
        }
      />

      <input
        type="number"
        placeholder="Stock"
        className="border p-2 w-full"
        onChange={(e) =>
          setForm({
            ...form,
            stock: Number(
              e.target.value,
            ),
          })
        }
      />

      <input
        type="file"
        accept="image/*"
        className="border p-2 w-full"
        onChange={(e) =>
          setImageFile(
            e.target.files?.[0] || null
          )
        }
      />

      <select
        className="border p-2 w-full"
        value={form.categoryId}
        onChange={(e) =>
          setForm({
            ...form,
            categoryId:
              e.target.value,
          })
        }
      >
        <option value="">
          Selecciona categoría
        </option>

        {categories.map((cat) => (
          <option
            key={cat.id}
            value={cat.id}
          >
            {cat.name}
          </option>
        ))}
      </select>

      <button
        className="bg-black text-white px-4 py-2 rounded"
      >
        Crear producto
      </button>
    </form>
  );
}
