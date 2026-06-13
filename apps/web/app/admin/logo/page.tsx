'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE, getAuthHeader } from '@/lib/admin';
import ImageEditor from '@/components/ImageEditor';

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
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Logo</h1>
        <p className="text-gray-600 mt-1">Edita el logo de tu tienda</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Logo actual</label>
          <div className="flex items-center gap-4">
            {logo ? (
              <img src={logo} alt="Logo" className="h-20 w-20 object-contain rounded-lg border border-gray-200" />
            ) : (
              <div className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs text-center">
                Sin logo
              </div>
            )}
            {logo ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm text-gray-500">Logo visible para todos los usuarios</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditCurrentLogo}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={handleRemove}
                    className="px-4 py-1.5 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 font-medium transition"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <span className="text-sm text-gray-500">No hay logo configurado</span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Subir imagen nueva</label>
          <input
            ref={fileInputRef}
            id="logoFile"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
          <p className="text-xs text-gray-400 mt-1">Formatos: JPG, PNG, WebP. Máx 5MB. Podrás recortar y editar la imagen antes de guardarla.</p>
        </div>
      </div>

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-700 font-medium">Subiendo imagen...</p>
          </div>
        </div>
      )}
    </div>
  );
}
