"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { apiFetch } from "@/lib/admin";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Textarea,
} from "@/components/admin/ui";

export default function EditCategoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
  });

  useEffect(() => {
    async function loadCategory() {
      try {
        const category = await apiFetch(`/categories/${params.id}`);
        setFormData({
          name: category.name,
          slug: category.slug,
          description: category.description || "",
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error al cargar categoria",
        );
      } finally {
        setLoading(false);
      }
    }

    loadCategory();
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      await apiFetch(`/categories/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify(formData),
      });
      router.push("/admin/categories");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al actualizar categoria",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Cargando categoría..." />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Editar Categoría"
        subtitle="Actualiza los datos de la categoría."
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Pencil className="h-4.5 w-4.5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Información de la categoría
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
            />
          </Field>

          <Field label="Descripción">
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
            />
          </Field>

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
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}