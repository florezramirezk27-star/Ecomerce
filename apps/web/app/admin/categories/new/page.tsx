'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Tag } from 'lucide-react';
import { apiFetch } from '@/lib/admin';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@/components/admin/ui';

export default function NewCategoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiFetch('/categories', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      router.push('/admin/categories');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al crear categoría',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Crear Categoría"
        subtitle="Agrega una nueva categoría de productos"
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Tag className="h-4.5 w-4.5" />
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
              placeholder="Ej: Electrónica"
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
              placeholder="ej: electronica"
            />
          </Field>

          <Field label="Descripción">
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              placeholder="Descripción breve de la categoría"
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
            <Button className="flex-1" type="submit" isLoading={loading}>
              {loading ? 'Guardando...' : 'Crear Categoría'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}