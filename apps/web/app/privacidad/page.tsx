import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | Kronio Market",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 text-gray-800">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
      <p className="text-sm text-gray-500 mb-10">Última actualización: Junio 2026</p>

      <div className="space-y-8 leading-relaxed">
        <Section title="1. Introducción">
          <p>
            En Kronio Market (en adelante, &ldquo;la Tienda&rdquo;, &ldquo;nosotros&rdquo; o
            &ldquo;nuestro&rdquo;), nos comprometemos a proteger la privacidad de nuestros
            usuarios. Esta Política de Privacidad explica cómo recopilamos, usamos, almacenamos
            y protegemos la información personal que usted nos proporciona al utilizar nuestra
            plataforma de comercio electrónico.
          </p>
          <p>
            Esta política cumple con lo establecido en la Ley 1581 de 2012 (Protección de Datos
            Personales) y el Decreto Reglamentario 1377 de 2013, así como con el Reglamento
            General de Protección de Datos (RGPD) de la Unión Europea cuando sea aplicable.
          </p>
        </Section>

        <Section title="2. Responsable del Tratamiento de Datos">
          <p>
            El responsable del tratamiento de sus datos personales es Kronio Market, con
            domicilio en Bogotá, Colombia. Para cualquier consulta relacionada con la protección
            de datos, puede contactarnos a través de:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Correo electrónico: privacidad@kroniomarket.com</li>
            <li>Teléfono: +57 (1) 555-1234</li>
            <li>Dirección: Bogotá, Colombia</li>
          </ul>
        </Section>

        <Section title="3. Datos que Recopilamos">
          <p>Podemos recopilar los siguientes tipos de información personal:</p>

          <h3 className="font-semibold text-gray-800 mt-4">3.1 Información proporcionada por el usuario</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nombre completo y apellidos</li>
            <li>Dirección de correo electrónico</li>
            <li>Número de teléfono</li>
            <li>Dirección de envío y facturación</li>
            <li>Información de pago (procesada a través de terceros seguros)</li>
            <li>Contraseña de la cuenta (almacenada de forma cifrada)</li>
          </ul>

          <h3 className="font-semibold text-gray-800 mt-4">3.2 Información recopilada automáticamente</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Dirección IP y tipo de navegador</li>
            <li>Páginas visitadas y productos vistos</li>
            <li>Duración de la visita y comportamiento de navegación</li>
            <li>Información del dispositivo (sistema operativo, resolución de pantalla)</li>
            <li>Cookies y tecnologías similares (ver sección de Cookies)</li>
          </ul>
        </Section>

        <Section title="4. Finalidad del Tratamiento de Datos">
          <p>Sus datos personales serán utilizados para los siguientes fines:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Procesar y gestionar sus pedidos y devoluciones</li>
            <li>Crear y mantener su cuenta de usuario</li>
            <li>Enviar confirmaciones de pedido, facturas y actualizaciones de envío</li>
            <li>Comunicarnos con usted sobre su cuenta o transacciones</li>
            <li>Mejorar nuestros productos, servicios y experiencia de usuario</li>
            <li>Enviar comunicaciones comerciales y promociones (con su consentimiento previo)</li>
            <li>Cumplir con obligaciones legales y regulatorias</li>
            <li>Prevenir el fraude y garantizar la seguridad de la plataforma</li>
          </ol>
        </Section>

        <Section title="5. Base Legal para el Tratamiento">
          <p>
            El tratamiento de sus datos personales se fundamenta en las siguientes bases
            legales:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Ejecución de un contrato:</strong> Para procesar sus pedidos y proporcionar los servicios solicitados.</li>
            <li><strong>Consentimiento:</strong> Para el envío de comunicaciones comerciales y el uso de ciertas cookies.</li>
            <li><strong>Obligación legal:</strong> Para cumplir con requisitos fiscales, contables y regulatorios.</li>
            <li><strong>Interés legítimo:</strong> Para mejorar nuestros servicios y prevenir el fraude.</li>
          </ul>
        </Section>

        <Section title="6. Derechos del Titular de los Datos (ARCO)">
          <p>
            De conformidad con la Ley 1581 de 2012, usted tiene los siguientes derechos sobre
            sus datos personales:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Acceso:</strong> Conocer qué datos personales tenemos sobre usted y cómo los estamos usando.</li>
            <li><strong>Rectificación:</strong> Solicitar la corrección de datos inexactos o incompletos.</li>
            <li><strong>Cancelación:</strong> Solicitar la eliminación de sus datos cuando ya no sean necesarios para los fines establecidos.</li>
            <li><strong>Oposición:</strong> Oponerse al tratamiento de sus datos para fines específicos, como marketing directo.</li>
          </ul>
          <p>
            Para ejercer estos derechos, puede enviar una solicitud escrita a
            privacidad@kroniomarket.com. Responderemos a su solicitud dentro de los plazos
            establecidos por la ley (máximo 15 días hábiles).
          </p>
        </Section>

        <Section title="7. Transferencia y Divulgación de Datos">
          <p>
            No vendemos, alquilamos ni compartimos sus datos personales con terceros no
            relacionados, excepto en los siguientes casos:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Empresas de transporte y logística para la entrega de pedidos</li>
            <li>Procesadores de pago para la gestión de transacciones</li>
            <li>Proveedores de servicios tecnológicos (hosting, analítica, atención al cliente)</li>
            <li>Autoridades gubernamentales cuando sea requerido por ley</li>
          </ul>
          <p>
            Todos los terceros con los que compartimos datos están obligados contractualmente
            a mantener la confidencialidad y seguridad de sus datos, y solo pueden usarlos
            para los fines específicos para los que fueron contratados.
          </p>
        </Section>

        <Section title="8. Transferencias Internacionales">
          <p>
            Sus datos pueden ser transferidos y procesados en servidores ubicados fuera de
            Colombia. En tales casos, nos aseguramos de que existan garantías adecuadas para
            proteger sus datos, incluyendo cláusulas contractuales tipo aprobadas por las
            autoridades de protección de datos y la verificación de que el país destino
            cuenta con niveles de protección adecuados.
          </p>
        </Section>

        <Section title="9. Conservación de Datos">
          <p>
            Conservaremos sus datos personales durante el tiempo necesario para cumplir con
            los fines establecidos en esta política, o durante el período requerido por las
            leyes aplicables. Una vez que ya no sean necesarios, sus datos serán eliminados
            de forma segura.
          </p>
          <p>
            Los datos relacionados con transacciones comerciales se conservarán por un período
            mínimo de cinco (5) años para cumplir con obligaciones fiscales y contables.
          </p>
        </Section>

        <Section title="10. Seguridad de los Datos">
          <p>
            Implementamos medidas de seguridad técnicas, administrativas y físicas para
            proteger sus datos personales contra el acceso no autorizado, la alteración,
            la divulgación o la destrucción. Estas medidas incluyen:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Cifrado SSL/TLS para todas las comunicaciones</li>
            <li>Almacenamiento cifrado de contraseñas (hash + salt)</li>
            <li>Firewalls y sistemas de detección de intrusiones</li>
            <li>Acceso restringido a datos personales basado en roles</li>
            <li>Monitoreo regular de vulnerabilidades y auditorías de seguridad</li>
          </ul>
        </Section>

        <Section title="11. Cookies y Tecnologías Similares">
          <p>
            Utilizamos cookies y tecnologías similares para mejorar su experiencia de
            navegación, analizar el tráfico del sitio y personalizar el contenido.
            Puede controlar el uso de cookies a través de la configuración de su navegador.
          </p>

          <h3 className="font-semibold text-gray-800 mt-4">Tipos de cookies que utilizamos:</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cookies esenciales:</strong> Necesarias para el funcionamiento básico del sitio (carrito de compras, inicio de sesión).</li>
            <li><strong>Cookies de rendimiento:</strong> Nos ayudan a entender cómo los usuarios interactúan con el sitio para mejorarlo.</li>
            <li><strong>Cookies de funcionalidad:</strong> Recuerdan sus preferencias y configuraciones.</li>
            <li><strong>Cookies de publicidad:</strong> Se utilizan para mostrar anuncios relevantes (con su consentimiento).</li>
          </ul>
        </Section>

        <Section title="12. Menores de Edad">
          <p>
            Nuestros servicios no están dirigidos a menores de 14 años. No recopilamos
            intencionalmente datos personales de menores. Si descubrimos que hemos recopilado
            datos de un menor sin el consentimiento de sus padres o tutores, procederemos
            a eliminarlos de inmediato. Si usted es padre, madre o tutor y cree que un menor
            ha proporcionado sus datos, por favor contáctenos.
          </p>
        </Section>

        <Section title="13. Cambios a esta Política de Privacidad">
          <p>
            Nos reservamos el derecho de actualizar esta política de privacidad en cualquier
            momento. Los cambios serán publicados en esta página con la fecha de actualización
            correspondiente. Le recomendamos revisar esta página periódicamente para
            mantenerse informado sobre cómo protegemos sus datos.
          </p>
          <p>
            En caso de cambios significativos, le notificaremos a través de un aviso
            destacado en nuestro sitio web o mediante correo electrónico.
          </p>
        </Section>

        <Section title="14. Contacto del Delegado de Protección de Datos">
          <p>
            Si tiene preguntas, inquietudes o desea presentar una queja relacionada con
            el tratamiento de sus datos personales, puede contactar a nuestro Delegado
            de Protección de Datos:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Correo electrónico: privacidad@kroniomarket.com</li>
            <li>Teléfono: +57 (1) 555-1234</li>
            <li>Dirección: Bogotá, Colombia</li>
          </ul>
          <p>
            También tiene derecho a presentar una reclamación ante la Superintendencia de
            Industria y Comercio (SIC) si considera que el tratamiento de sus datos viola
            la normativa aplicable.
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600">{children}</div>
    </section>
  );
}
