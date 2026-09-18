'use client';

import { CheckCircle2, KeyRound, MailCheck, ShieldCheck, Timer } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/admin/ui';

const steps = [
  'Ingresa tu email y contraseña en la página de inicio de sesión',
  'Recibirás un código de 6 dígitos en tu correo',
  'Ingresa el código para completar el inicio de sesión',
  'El código expira después de 5 minutos',
];

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Seguridad"
        subtitle="Configuración de autenticación de administradores"
      />

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <MailCheck className="h-4.5 w-4.5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Verificación por correo electrónico
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-slate-600">
          Como administrador, cada vez que inicies sesión recibirás un código
          de verificación de 6 dígitos en tu correo electrónico. Deberás
          ingresar este código para completar el inicio de sesión.
        </p>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-800">
              <ShieldCheck className="h-4 w-4" />
              ¿Cómo funciona?
            </h3>
            <ol className="space-y-2.5">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-blue-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">
                Verificación por correo activa
              </span>
            </div>
            <p className="mt-1.5 text-sm text-emerald-600">
              La verificación por correo electrónico está habilitada para todos
              los administradores.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone="green">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Protegido
              </Badge>
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Timer className="h-3.5 w-3.5" />
                Códigos válidos por 5 minutos
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}