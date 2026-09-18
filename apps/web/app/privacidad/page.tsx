import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad | Kronio Market",
  description:
    "Política de tratamiento de datos personales de Kronio Market conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.",
};

const TOC = [
  { href: "#responsable", label: "1. Responsable del tratamiento" },
  { href: "#normativa", label: "2. Normativa aplicable" },
  { href: "#principios", label: "3. Principios del tratamiento" },
  { href: "#datos", label: "4. Datos personales que recopilamos" },
  { href: "#finalidades", label: "5. Finalidades del tratamiento" },
  { href: "#autorizacion", label: "6. Autorización previa, expresa e informada" },
  { href: "#sensibles", label: "7. Datos sensibles" },
  { href: "#derechos", label: "8. Derechos del titular de los datos" },
  { href: "#procedimiento", label: "9. Procedimiento de consultas y reclamos" },
  { href: "#compartir", label: "10. Transferencias de datos" },
  { href: "#internacionales", label: "11. Transferencias internacionales" },
  { href: "#conservacion", label: "12. Conservación de los datos" },
  { href: "#seguridad", label: "13. Seguridad de los datos" },
  { href: "#cookies", label: "14. Cookies y tecnologías similares" },
  { href: "#menores", label: "15. Datos de menores de edad" },
  { href: "#rnbd", label: "16. Registro Nacional de Bases de Datos" },
  { href: "#cambios", label: "17. Vigencia y cambios de esta política" },
  { href: "#contacto", label: "18. Contacto" },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-gray-800">
      <div className="border-b border-gray-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          Protección de datos personales
        </p>
        <h1 className="mt-2 text-4xl font-bold text-gray-900">Política de Privacidad</h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: Septiembre de 2026 &middot; Política de tratamiento de la
          información conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013 y el Decreto 1074
          de 2015.
        </p>
      </div>

      <nav className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
          Contenido
        </h2>
        <ol className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {TOC.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm text-gray-600 transition-colors hover:text-blue-600"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10 leading-relaxed">
        <Section id="responsable" title="1. Responsable del tratamiento">
          <p>
            El Responsable del tratamiento de los datos personales es <strong>Kronio Market</strong>,
            identificado con NIT 000.000.000-0, con domicilio en Bogotá, D.C., Colombia. Para
            cualquier consulta puede contactarnos a través de:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Correo electrónico:</strong> kroniomarket@gmail.com</li>
            <li><strong>Teléfono:</strong> +57 (1) 555-1234</li>
            <li><strong>Dirección:</strong> Bogotá, D.C., Colombia</li>
          </ul>
        </Section>

        <Section id="normativa" title="2. Normativa aplicable">
          <p>
            Esta política desarrolla el derecho constitucional a la protección de datos (artículo
            15 de la Constitución Política de Colombia) y se rige por:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ley 1581 de 2012 — Régimen general de protección de datos personales.</li>
            <li>Decreto 1377 de 2013 — Reglamentación parcial de la Ley 1581 de 2012.</li>
            <li>Decreto 1074 de 2015 — Decreto único reglamentario del sector comercio.</li>
            <li>Las directrices y circulares de la Superintendencia de Industria y Comercio (SIC).</li>
          </ul>
        </Section>

        <Section id="principios" title="3. Principios del tratamiento">
          <p>
            De conformidad con el artículo 4 de la Ley 1581 de 2012, el tratamiento de sus datos
            personales se desarrolla con sujeción a los siguientes principios:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Legalidad:</strong> el tratamiento se rige únicamente por las normas vigentes aplicables.</li>
            <li><strong>Finalidad:</strong> sus datos se recopilan para finalidades específicas, explícitas y legítimas, informadas previamente.</li>
            <li><strong>Libertad:</strong> el tratamiento se realiza con su autorización previa, expresa e informada.</li>
            <li><strong>Veracidad o calidad:</strong> los datos son veraces, completos, exactos, actualizados y pertinentes.</li>
            <li><strong>Transparencia:</strong> puede obtener información sobre la existencia y características del tratamiento, en cualquier momento.</li>
            <li><strong>Acceso y circulación restringida:</strong> sus datos solo son tratados por personas autorizadas.</li>
            <li><strong>Seguridad:</strong> se adoptan medidas técnicas, humanas y administrativas para su protección.</li>
            <li><strong>Confidencialidad:</strong> la información se mantiene reservada, incluso después de finalizada la relación.</li>
          </ul>
        </Section>

        <Section id="datos" title="4. Datos personales que recopilamos">
          <h3 className="font-semibold text-gray-800 mt-4">4.1 Datos suministrados por usted</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nombres y apellidos</li>
            <li>Documento de identificación</li>
            <li>Correo electrónico y número de teléfono</li>
            <li>Dirección de envío y facturación</li>
            <li>Datos de la cuenta de usuario</li>
          </ul>
          <h3 className="font-semibold text-gray-800 mt-4">4.2 Datos recopilados automáticamente</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Dirección IP, tipo de navegador y sistema operativo</li>
            <li>Páginas visitadas, productos consultados y comportamiento de navegación</li>
            <li>Cookies y tecnologías similares (ver sección 14)</li>
          </ul>
          <p>
            La recolección se limita a los datos pertinentes y adecuados para las finalidades
            informadas en esta política (Decreto 1377 de 2013, artículo 4).
          </p>
        </Section>

        <Section id="finalidades" title="5. Finalidades del tratamiento">
          <p>
            Sus datos personales serán utilizados para las siguientes finalidades específicas,
            explícitas y legítimas:
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Procesar, gestionar y entregar sus pedidos, y gestionar cambios y devoluciones.</li>
            <li>Crear y administrar su cuenta de usuario.</li>
            <li>Enviar confirmaciones de pedido, facturas, actualizaciones de envío y comunicaciones sobre su cuenta.</li>
            <li>Atender sus peticiones, quejas, reclamos y sugerencias (PQRS).</li>
            <li>Verificar la identidad y prevenir el fraude.</li>
            <li>Mejorar nuestros productos, servicios y experiencia de compra.</li>
            <li>Enviar comunicaciones comerciales y promocionales únicamente con su autorización previa.</li>
            <li>Cumplir con obligaciones legales, fiscales y regulatorias.</li>
          </ol>
        </Section>

        <Section id="autorizacion" title="6. Autorización previa, expresa e informada">
          <p>
            De acuerdo con el artículo 9 de la Ley 1581 de 2012, el tratamiento de datos
            personales requiere su autorización previa, expresa e informada. La autorización se
            obtiene por cualquier medio que permita su consulta posterior (escrito, oral o
            mediante conductas inequívocas; el silencio nunca equivale a autorización) y se
            solicita antes o a más tardar en el momento de la recolección de los datos.
          </p>
          <p>
            Al aceptar esta política y/o nuestros términos de compra, usted autoriza el
            tratamiento de sus datos personales conforme a las finalidades aquí descritas y
            conservamos prueba de dicha autorización (Decreto 1377 de 2013, artículo 7).
          </p>
        </Section>

        <Section id="sensibles" title="7. Datos sensibles">
          <p>
            Datos sensibles son aquellos que afectan la intimidad del titular o cuyo uso indebido
            puede generar discriminación (origen étnico o racial, orientación política,
            convicciones religiosas o filosóficas, pertenencia sindical, biometría, salud, etc.),
            conforme al artículo 5 de la Ley 1581 de 2012.
          </p>
          <p>
            Kronio Market <strong>no solicita ni trata datos sensibles</strong> como requisito
            para acceder a sus productos o servicios, salvo que usted los suministre
            voluntariamente o que la ley lo exija. En tal caso, se aplicará lo dispuesto en el
            artículo 6 de la Ley 1581 de 2012: usted será informado de que no está obligado a
            autorizar su tratamiento, se le indicará cuáles datos son sensibles y la finalidad
            específica, y se obtendrá su consentimiento expreso y facultativo.
          </p>
        </Section>

        <Section id="derechos" title="8. Derechos del titular de los datos">
          <p>
            De conformidad con el artículo 8 de la Ley 1581 de 2012, usted tiene los siguientes
            derechos (hábeas data):
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Conocer (acceder):</strong> obtener de nosotros información clara y completa sobre sus datos y su tratamiento.</li>
            <li><strong>Actualizar y rectificar:</strong> solicitar la corrección de datos inexactos, incompletos o desactualizados.</li>
            <li><strong>Suprimir:</strong> solicitar la eliminación de sus datos cuando no sean necesarios para las finalidades autorizadas.</li>
            <li><strong>Revocar la autorización:</strong> revocar total o parcialmente la autorización otorgada para el tratamiento.</li>
            <li><strong>Presentar reclamos por el uso indebido</strong> de sus datos.</li>
            <li><strong>Solicitar prueba de la autorización</strong> otorgada.</li>
          </ul>
          <p>
            Los derechos podrán ejercerse por usted, sus causahabientes, su representante o el
            apoderado. Cuando la solicitud sea presentada por persona distinta del titular, se
            deberá acreditar la calidad en que actúa.
          </p>
        </Section>

        <Section id="procedimiento" title="9. Procedimiento de consultas y reclamos">
          <p>
            <strong>Consultas:</strong> conforme al artículo 14 de la Ley 1581 de 2012, las
            consultas sobre sus datos personales se atenderán dentro de los diez (10) días
            hábiles siguientes a la recepción. Cuando no sea posible atenderla en dicho término,
            se le informará la razón de la demora y la fecha en que será atendida, sin exceder de
            cinco (5) días hábiles adicionales.
          </p>
          <p>
            <strong>Reclamos:</strong> conforme al artículo 15 de la Ley 1581 de 2012, los
            reclamos por tratamiento no autorizado se atenderán dentro de los quince (15) días
            hábiles siguientes a la recepción. Si no es posible atenderlo en ese plazo, se le
            informará la razón de la demora y la fecha en que se atenderá, sin exceder de ocho (8)
            días hábiles adicionales.
          </p>
          <p>
            Para ejercer sus derechos, envíe su solicitud a <strong>kroniomarket@gmail.com</strong>{" "}
            indicando su nombre, el derecho que desea ejercer, los datos objeto de la solicitud y
            una breve descripción de la petición. Le daremos respuesta por el mismo medio y le
            confirmaremos la radicación de su solicitud.
          </p>
        </Section>

        <Section id="compartir" title="10. Transferencias de datos">
          <p>
            No vendemos, alquilamos ni compartimos sus datos personales con terceros no
            relacionados. Los datos solo se comparten, de forma limitada, con:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Empresas de transporte y logística, para la entrega de los pedidos.</li>
            <li>Proveedores tecnológicos (hosting, analítica, mensajería y soporte).</li>
            <li>Autoridades competentes, cuando sea requerido por disposición legal o judicial.</li>
          </ul>
          <p>
            Todos los terceros que tratan sus datos por cuenta de Kronio Market actúan como
            Encargados del tratamiento, solo para los fines autorizados y con obligaciones de
            confidencialidad y seguridad (artículo 12 de la Ley 1581 de 2012).
          </p>
        </Section>

        <Section id="internacionales" title="11. Transferencias internacionales">
          <p>
            Cuando sus datos deban ser transferidos a un tercero ubicado fuera de Colombia, nos
            aseguraremos de que el país destino ofrezca niveles de protección adecuados conforme a
            los estándares de la SIC, o de que la transferencia se ajuste a las excepciones
            legales y a las declaraciones de conformidad aplicables (artículo 26 de la Ley 1581 de
            2012).
          </p>
        </Section>

        <Section id="conservacion" title="12. Conservación de los datos">
          <p>
            Conservaremos sus datos personales durante el tiempo necesario para cumplir las
            finalidades de esta política o el término exigido por las leyes aplicables. Los datos
            asociados a transacciones comerciales se conservan por el término exigido para el
            cumplimiento de obligaciones fiscales y contables. Una vez cumplida la finalidad o
            vencido el término, sus datos serán suprimidos de forma segura.
          </p>
        </Section>

        <Section id="seguridad" title="13. Seguridad de los datos">
          <p>
            Implementamos medidas técnicas, humanas y administrativas orientadas a garantizar la
            seguridad y confidencialidad de sus datos (artículo 17 de la Ley 1581 de 2012),
            incluyendo:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Cifrado en tránsito (HTTPS/TLS) para las comunicaciones.</li>
            <li>Almacenamiento cifrado de contraseñas.</li>
            <li>Control de acceso por roles y registro de consultas.</li>
            <li>Monitoreo de vulnerabilidades y copias de seguridad.</li>
          </ul>
        </Section>

        <Section id="cookies" title="14. Cookies y tecnologías similares">
          <p>
            Utilizamos cookies y tecnologías similares para el funcionamiento del sitio, mejorar
            la experiencia de compra y analizar el tráfico. Puede configurar el uso de cookies
            desde su navegador.
          </p>
          <h3 className="font-semibold text-gray-800 mt-4">Tipos de cookies:</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Esenciales:</strong> necesarias para el carrito de compras, el inicio de sesión y la seguridad.</li>
            <li><strong>De rendimiento y analítica:</strong> nos ayudan a entender el uso del sitio para mejorarlo.</li>
            <li><strong>De funcionalidad:</strong> recuerdan sus preferencias.</li>
          </ul>
          <p>
            No utilizamos cookies de publicidad comportamental sin su autorización previa. El
            tratamiento de datos derivado de cookies queda sujeto a esta política.
          </p>
        </Section>

        <Section id="menores" title="15. Datos de menores de edad">
          <p>
            Nuestros servicios y productos están dirigidos a personas mayores de 18 años. No
            recopilamos intencionalmente datos de menores. El tratamiento de datos de niñas,
            niños y adolescentes está sujeto a los requisitos especiales del Decreto 1377 de 2013
            (artículo 12). Si tiene conocimiento de que hemos tratado datos de un menor sin
            autorización de sus padres o representantes legales, contáctenos de inmediato para
            proceder a su eliminación.
          </p>
        </Section>

        <Section id="rnbd" title="16. Registro Nacional de Bases de Datos">
          <p>
            De conformidad con la Ley 1581 de 2012 y el Decreto 886 de 2014, complementamos las
            obligaciones propias de los Responsables del tratamiento, incluido, cuando
            corresponda, el registro de nuestras bases de datos en el Registro Nacional de Bases
            de Datos administrado por la Superintendencia de Industria y Comercio.
          </p>
        </Section>

        <Section id="cambios" title="17. Vigencia y cambios de esta política">
          <p>
            Esta política de tratamiento de la información entra en vigencia a partir de la fecha
            de la última actualización indicada al inicio de este documento. Nos reservamos el
            derecho de modificarla cuando sea necesario; los cambios serán publicados en esta
            página con la fecha de actualización correspondiente y, cuando sean significativos,
            se le notificará a través de un aviso visible en el sitio o por correo electrónico.
          </p>
        </Section>

        <Section id="contacto" title="18. Contacto">
          <p>
            Si tiene preguntas, inquietudes o desea presentar una queja sobre el tratamiento de
            sus datos personales, puede contactar a nuestro equipo de protección de datos en{" "}
            <strong>kroniomarket@gmail.com</strong> o al +57 (1) 555-1234. Ante cualquier
            duda, también puede consultar los términos de compra en{" "}
            <Link href="/terminos" className="text-blue-600 underline hover:text-blue-700">
              /terminos
            </Link>
            .
          </p>
          <p>
            Si considera que el tratamiento de sus datos vulnera la normativa aplicable, tiene
            derecho a presentar una reclamación ante la Superintendencia de Industria y Comercio
            (SIC) en{" "}
            <a
              href="https://www.sic.gov.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-700"
            >
              www.sic.gov.co
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 text-2xl font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3 text-gray-600">{children}</div>
    </section>
  );
}