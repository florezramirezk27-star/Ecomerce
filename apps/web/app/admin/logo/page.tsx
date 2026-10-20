'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Film, Image as ImageIcon, Loader2, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/admin';
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
  const [heroVideo, setHeroVideo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editImage, setEditImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/settings/logo'),
      apiFetch('/settings/hero-video'),
    ])
      .then(([logoData, videoData]: [{ logo: string | null }, { video: string | null }]) => {
        setLogo(logoData.logo);
        setHeroVideo(videoData.video);
      })
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

      const data = await apiFetch('/uploads', {
        method: 'POST',
        body: formData,
      });

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
      await apiFetch('/settings/logo', {
        method: 'POST',
        body: JSON.stringify({ logo: url }),
      });
      window.dispatchEvent(new Event('logo-change'));
      setLogo(url);
      setMessage({ type: 'success', text: 'Logo actualizado correctamente' });
    } catch {
      setMessage({ type: 'error', text: 'Error al guardar el logo' });
    }
  };

  const handleRemove = async () => {
    try {
      await apiFetch('/settings/logo/remove', {
        method: 'POST',
      });
      window.dispatchEvent(new Event('logo-change'));
      setLogo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage({ type: 'success', text: 'Logo eliminado' });
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar el logo' });
    }
  };

  const MAX_VIDEO_BYTES = 25_000_000;

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setMessage({ type: 'error', text: 'Solo se permiten videos' });
      return;
    }

    if (file.size > MAX_VIDEO_BYTES) {
      setMessage({ type: 'error', text: 'El video debe pesar menos de 25MB' });
      return;
    }

    setUploadingVideo(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const data = await apiFetch('/uploads/video', {
        method: 'POST',
        body: formData,
      });

      await apiFetch('/settings/hero-video', {
        method: 'POST',
        body: JSON.stringify({ video: data.url }),
      });

      window.dispatchEvent(new Event('hero-video-change'));
      setHeroVideo(data.url);
      setMessage({ type: 'success', text: 'Video del banner actualizado correctamente' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al subir el video',
      });
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleRemoveVideo = async () => {
    try {
      await apiFetch('/settings/hero-video/remove', {
        method: 'POST',
      });
      window.dispatchEvent(new Event('hero-video-change'));
      setHeroVideo(null);
      if (videoInputRef.current) videoInputRef.current.value = '';
      setMessage({ type: 'success', text: 'Video eliminado' });
    } catch {
      setMessage({ type: 'error', text: 'Error al eliminar el video' });
    }
  };

  if (loading) {
    return <LoadingState label="Cargando logo..." />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Logo y banner"
        subtitle="Edita el logo y el video del banner de tu tienda"
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      <Card className="space-y-6 p-6">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Logo actual</p>
          <div className="flex items-center gap-4">
            {logo ? (
                  <Image
                    src={logo}
                    alt="Logo"
                    width={80}
                    height={80}
                    sizes="80px"
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

      <Card className="space-y-6 p-6">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Video del banner (inicio)
          </p>
          {heroVideo ? (
            <div className="space-y-3">
              <video
                key={heroVideo}
                src={heroVideo}
                muted
                loop
                autoPlay
                playsInline
                className="aspect-video w-full rounded-xl border border-slate-200 object-cover"
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm text-slate-500">
                  Se muestra como fondo en la página de inicio
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="px-4 py-2 text-xs"
                    onClick={handleRemoveVideo}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
              <Film className="h-6 w-6" />
              <span className="text-sm">No hay video configurado</span>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-6">
          <Field label="Subir video nuevo">
            <input
              ref={videoInputRef}
              id="heroVideoFile"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleVideoSelect}
              className="w-full cursor-pointer text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
          </Field>
          <p className="mt-1.5 text-xs text-slate-400">
            Formatos: MP4, WebM, MOV. Máx 25MB. Se reproduce en silencio y en
            bucle en el inicio de la tienda.
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

      {uploadingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-700">
              Subiendo video...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}