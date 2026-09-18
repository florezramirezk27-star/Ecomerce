'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Pencil, Trash2 } from 'lucide-react';
import { API_BASE, getAuthHeader } from '@/lib/admin';
import ImageEditor from '@/components/ImageEditor';
import {
  Alert,
  Button,
  Card,
  Field,
  LoadingState,
  PageHeader,
} from '@/components/admin/ui';

export default function AdminLogoPage() {
  const [logo, setLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editImage, setEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/settings/logo`)
      .then((r) => r.json())
      .then((data) => setLogo(data.logo))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Solo se permiten imágenes' });
      return;
    }

    if (file.size > 5_000_000) {
      setMessage({ type: 'error', text: 'La imagen debe pesar menos de 5MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setEditImage(reader.result as string);
    reader.readAsDataURL(file);
    setMessage(null);
  };

  const handleEditCurrentLogo = () => {
    if (logo) setEditImage(logo);
  };

  const handleEditorSave = async (croppedBlob: Blob) => {
    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      const croppedFile = new File([croppedBlob], 'logo.png', {
        type: 'image/png',
      });
      formData.append('file', croppedFile);

      const res = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        headers: getAuthHeader(formData),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al subir imagen');
      }

      const data = await res.json();
      await saveLogoUrl(data.url);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al subir imagen' });
    } finally {
      setUploading(false);
      setEditImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveLogoUrl = async (url: string) => {
    try {
      const res = await fetch(`${API_BASE}/settings/logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ logo: url }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new Event('logo-change'));
      setLogo(url);
      setMessage({ type: 'success', text: 'Logo actualizado correctamente' });
    } catch {
      setMessage({ type: 'error', text: 'Error al guardar el logo' });
    }
  };

  const handleRemove = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/logo/remove`, {
        method: 'POST',
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new Event('logo-change'));
      setLogo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage({ type: 'success', text: 'Logo eliminado' });
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar el logo' });
    }
  };

  if (loading) {
    return <LoadingState label="Cargando logo..." />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Logo"
        subtitle="Edita el logo de tu tienda"
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      <Card className="space-y-6 p-6">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Logo actual</p>
          <div className="flex items-center gap-4">
            {logo ? (
              <img
                src={logo}
                alt="Logo"
                className="h-20 w-20 rounded-xl border border-slate-200 object-contain p-1"
              />
            ) : (
              <div className="flex h-20 w-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
            {logo ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-500">
                  Logo visible para todos los usuarios
                </span>
                <div className="flex gap-2">
                  <Button
                    className="px-4 py-2 text-xs"
                    onClick={handleEditCurrentLogo}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="danger"
                    className="px-4 py-2 text-xs"
                    onClick={handleRemove}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : (
              <span className="text-sm text-slate-500">
                No hay logo configurado
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <Field label="Subir imagen nueva">
            <input
              ref={fileInputRef}
              id="logoFile"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="w-full cursor-pointer text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
          </Field>
          <p className="mt-1.5 text-xs text-slate-400">
            Formatos: JPG, PNG, WebP. Máx 5MB. Podrás recortar y editar la
            imagen antes de guardarla.
          </p>
        </div>
      </Card>

      {editImage && (
        <ImageEditor
          image={editImage}
          onSave={handleEditorSave}
          onCancel={() => {
            setEditImage(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      )}

      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-700">
              Subiendo imagen...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}