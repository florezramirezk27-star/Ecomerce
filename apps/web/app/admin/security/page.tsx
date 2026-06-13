'use client';

export default function SecurityPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Seguridad</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">
          Verificación por correo electrónico
        </h2>

        <div className="space-y-4">
          <p className="text-gray-600">
            Como administrador, cada vez que inicies sesión recibirás un código
            de verificación de 6 dígitos en tu correo electrónico.
            Deberás ingresar este código para completar el inicio de sesión.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">
              ¿Cómo funciona?
            </h3>
            <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
              <li>Ingresa tu email y contraseña en la página de inicio de sesión</li>
              <li>Recibirás un código de 6 dígitos en tu correo</li>
              <li>Ingresa el código para completar el inicio de sesión</li>
              <li>El código expira después de 5 minutos</li>
            </ol>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700">
              <span className="text-xl">✅</span>
              <span className="font-medium">Verificación por correo activa</span>
            </div>
            <p className="text-sm text-green-600 mt-1">
              La verificación por correo electrónico está habilitada para todos los administradores.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
