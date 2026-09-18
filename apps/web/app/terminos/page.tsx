import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Kronio Market",
  description:
    "Términos y condiciones de venta de Kronio Market de conformidad con la Ley 1480 de 2011 (Estatuto del Consumidor) y la Ley 2439 de 2024.",
};

const TOC = [
  { href: "#informacion-proveedor", label: "1. Información del proveedor" },
  { href: "#aceptacion", label: "2. Aceptación de los términos" },
  { href: "#productos", label: "3. Productos e información suministrada" },
  { href: "#precios", label: "4. Precios e impuestos" },
  { href: "#compra", label: "5. Proceso de compra y resumen del pedido" },
  { href: "#pagos", label: "6. Medios de pago" },
  { href: "#envios", label: "7. Envíos y entrega" },
  { href: "#retracto", label: "8. Derecho de retracto" },
  { href: "#garantia-legal", label: "9. Garantía legal" },
  { href: "#reversion", label: "10. Reversión de pagos" },
  { href: "#cambios-devoluciones", label: "11. Cambios y devoluciones" },
  { href: "#pqr", label: "12. PQRS y canales de atención" },
  { href: "#propiedad-intelectual", label: "13. Propiedad intelectual" },
  { href: "#responsabilidad", label: "14. Limitación de responsabilidad" },
  { href: "#ley-aplicable", label: "15. Ley aplicable y jurisdicción" },
  { href: "#contacto", label: "16. Contacto" },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-gray-800">
      <div className="border-b border-gray-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          Documento legal
        </p>
        <h1 className="mt-2 text-4xl font-bold text-gray-900">Términos y Condiciones</h1>
        <p className="mt-2 text-sm text-gray-500">
          Última actualización: Septiembre de 2026 &middot; Vigentes de conformidad con la
          Ley 1480 de 2011 (Estatuto del Consumidor), la Ley 2439 de 2024 y el Decreto 587 de 2016.
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
        <Section id="informacion-proveedor" title="1. Información del proveedor">
          <p>
            Conforme al literal a) del artículo 50 de la Ley 1480 de 2011, el proveedor que
            ofrece productos mediante comercio electrónico debe informar de forma cierta,
            fidedigna, suficiente, clara, accesible y actualizada su identidad. De conformidad
            con lo anterior:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Nombre o razón social:</strong> Kronio Market.</li>
            <li><strong>NIT:</strong> 000.000.000-0.</li>
            <li><strong>Dirección de notificación judicial:</strong> Bogotá, D.C., Colombia.</li>
            <li><strong>Teléfono:</strong> +57 (1) 555-1234.</li>
            <li><strong>Correo electrónico:</strong> kroniomarket@gmail.com.</li>
          </ul>
          <p>
            La entrega o distribución de productos con descuento, rebaja o con carácter
            promocional está sujeta a las reglas contenidas en la Ley 1480 de 2011.
          </p>
        </Section>

        <Section id="aceptacion" title="2. Aceptación de los términos">
          <p>
            Estos términos y condiciones regulan la relación entre Kronio Market y los
            consumidores que utilizan nuestro sitio de comercio electrónico. Al momento de
            confirmar una compra, usted acepta de manera expresa e inequívoca las condiciones
            generales del contrato (artículo 48 de la Ley 1480 de 2011), dejando constancia de
            la aceptación mediante el registro de su transacción.
          </p>
          <p>
            La Tienda se reserva el derecho de modificar estos términos en cualquier momento.
            Los cambios entrarán en vigor después de su publicación en el sitio y no afectarán
            las órdenes ya confirmadas. Le recomendamos revisar periódicamente esta página.
          </p>
        </Section>

        <Section id="productos" title="3. Productos e información suministrada">
          <p>
            De acuerdo con el literal b) del artículo 50 de la Ley 1480 de 2011, suministramos
            información cierta, fidedigna, suficiente, clara y actualizada respecto de los
            productos ofrecidos, incluyendo características, materiales, usos, restricciones
            de uso y cuidado, propiedades y calidad, de forma que el consumidor pueda hacerse
            una representación lo más aproximada a la realidad del producto.
          </p>
          <p>
            Las imágenes son de carácter ilustrativo. Hacemos esfuerzos razonables por mostrar
            descripciones y fotografías precisas, pero los colores y detalles pueden variar
            según las condiciones de cada pantalla.
          </p>
        </Section>

        <Section id="precios" title="4. Precios e impuestos">
          <p>
            Todos los precios están expresados en Pesos Colombianos (COP) e incluyen los
            impuestos, costos y gastos necesarios para adquirir el producto. En caso de
            aplicarse gastos de envío, estos se informan de forma separada y clara antes de
            finalizar la transacción (literal c) del artículo 50 de la Ley 1480 de 2011).
          </p>
          <p>
            Los precios están sujetos a cambios sin previo aviso, pero los cambios no afectarán
            las órdenes ya confirmadas. En caso de error manifiesto en el precio publicado, la
            Tienda podrá cancelar la orden y devolver la totalidad del dinero pagado.
          </p>
        </Section>

        <Section id="compra" title="5. Proceso de compra y resumen del pedido">
          <p>
            Antes de finalizar la transacción, le presentamos un resumen del pedido con la
            descripción completa de los bienes, el precio individual de cada uno, el precio
            total y, de ser aplicable, los costos de envío. Usted puede verificar, modificar o
            cancelar la transacción antes de concluirla. La aceptación de la transacción es
            expresa, inequívoca y verificable.
          </p>
          <p>
            Concluida la transacción, le remitimos a más tardar el día calendario siguiente un
            acuse de recibo del pedido con la información del tiempo de entrega, precio exacto,
            impuestos, gastos de envío y la forma en que se realizó el pago. También recibirá
            el número de seguimiento de su orden una vez sea despachada.
          </p>
        </Section>

        <Section id="pagos" title="6. Medios de pago">
          <p>
            El método de pago disponible en la Tienda es el <strong>pago contra entrega</strong>:
            usted paga el valor del pedido en efectivo en el momento en que recibe sus productos.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Pago contra entrega (efectivo):</strong> se cancela la totalidad del pedido,
              incluidos los gastos de envío, directamente al transportador al momento de la
              entrega. No se requiere ningún pago anticipado para realizar la compra.
            </li>
          </ul>
          <p>
            Por la naturaleza de este método de pago, no procesamos pagos con tarjetas o
            plataformas de pago en línea, y tampoco almacenamos datos de medios de pago en
            nuestros servidores.
          </p>
        </Section>

        <Section id="envios" title="7. Envíos y entrega">
          <p>
            Realizamos envíos a todo el territorio colombiano. El plazo de entrega se informa
            de manera previa a la finalización de la transacción. A falta de plazo pactado,
            el pedido será entregado a más tardar dentro de los treinta (30) días calendario
            siguientes a la recepción de su pedido, de conformidad con el literal h) del
            artículo 50 de la Ley 1480 de 2011.
          </p>
          <p>
            Si la entrega supera el plazo pactado o los treinta (30) días calendario, o si el
            producto adquirido no se encuentra disponible, usted podrá resolver el contrato
            unilateralmente y obtener la devolución de todas las sumas pagadas sin retención o
            descuento alguno, en un plazo máximo de quince (15) días calendario conforme a la
            Ley 2439 de 2024.
          </p>
          <p>
            Es responsabilidad del comprador suministrar una dirección de envío correcta y
            completa. Los costos de reenvío por dirección incorrecta o por no recepción del
            pedido en los términos pactados serán asumidos por el comprador.
          </p>
        </Section>

        <Section id="retracto" title="8. Derecho de retracto">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <p className="font-semibold text-blue-900">
              Usted tiene derecho a retractarse de la compra dentro de los cinco (5) días
              hábiles siguientes a la entrega del bien, sin necesidad de justificar su decisión.
            </p>
          </div>
          <p>
            De conformidad con el artículo 47 de la Ley 1480 de 2011, en las ventas a distancia
            o a través de medios electrónicos se entenderá pactado el derecho de retracto. En
            caso de ejercerlo, se resolverá el contrato y le reintegraremos el dinero que haya
            pagado:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              El producto debe devolverse por los mismos medios y en las mismas condiciones en
              que lo recibió, con todos sus empaques y accesorios.
            </li>
            <li>
              Los costos de transporte y demás que conlleve la devolución serán cubiertos por
              usted, salvo que el defecto corresponda a la calidad o idoneidad del producto.
            </li>
            <li>
              La devolución del dinero se realizará en un plazo máximo de quince (15) días
              calendario desde el ejercicio del derecho, sin retenciones ni descuentos,
              directamente sobre el medio de pago utilizado o el medio acordado (Ley 2439
              de 2024). La información de las opciones disponibles le será comunicada de forma
              clara y detallada.
            </li>
          </ul>
          <p>
            Se exceptúa del derecho de retracto, conforme a la ley, los siguientes casos:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Contratos de prestación de servicios cuya ejecución haya comenzado con su acuerdo.</li>
            <li>Productos confeccionados conforme a las especificaciones del consumidor o claramente personalizados.</li>
            <li>Productos que por su naturaleza no puedan ser devueltos o puedan deteriorarse o caducar con rapidez.</li>
            <li>Productos perecederos.</li>
            <li>Productos de uso personal de carácter higiénico cuyo sello haya sido retirado.</li>
            <li>Productos cuyo precio esté sujeto a fluctuaciones de coeficientes del mercado financiero que no puedan ser controladas por el proveedor.</li>
          </ul>
        </Section>

        <Section id="garantia-legal" title="9. Garantía legal">
          <p>
            Todos los productos comercializados cuentan con la garantía legal establecida en los
            artículos 7 y 8 de la Ley 1480 de 2011, que obliga al productor y al proveedor a
            responder por la calidad, idoneidad, seguridad y el buen estado y funcionamiento de
            los productos.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Plazo:</strong> la garantía empieza a correr desde la entrega del producto
              al consumidor. De no indicarse un término específico, la garantía es de un (1) año
              para productos nuevos y el término de la fecha de expiración para productos
              perecederos.
            </li>
            <li>
              <strong>Cobertura:</strong> reparación totalmente gratuita de los defectos del
              bien, incluyendo su transporte de ser necesario y el suministro oportuno de
              repuestos. Si el bien no admite reparación, se procederá a su reposición o a la
              devolución del dinero (artículo 11 de la Ley 1480 de 2011).
            </li>
            <li>
              <strong>No cubre:</strong> daños por uso indebido, accidentes, modificaciones no
              autorizadas o desgaste normal. La garantía legal no tendrá contraprestación
              adicional al precio del producto.
            </li>
          </ul>
          <p>
            Para hacer efectiva la garantía, debe presentar la factura o comprobante de compra y
            describir el defecto. Ante los consumidores, la responsabilidad recae solidariamente
            en productores y proveedores (artículo 10 de la Ley 1480 de 2011).
          </p>
        </Section>

        <Section id="reversion" title="10. Reversión de pagos">
          <p>
            Conforme al artículo 51 de la Ley 1480 de 2011 y al procedimiento del Decreto 587
            de 2016, usted puede solicitar la reversión del cargo realizado cuando la
            transacción se haya efectuado mediante fraude, el producto no haya sido entregado,
            no corresponda a lo ofrecido o haya sido devuelto.
          </p>
          <p>
            Para gestionar su solicitud, contáctenos a través de los canales de atención
            mencionados en la sección 12 y consigne los soportes correspondientes. La Tienda
            orientará el proceso hasta su solución y le devolverá las sumas pagadas por el
            medio acordado dentro de los plazos legales.
          </p>
        </Section>

        <Section id="cambios-devoluciones" title="11. Cambios y devoluciones">
          <p>
            Atendemos solicitudes de cambio o devolución dentro de los plazos legales. Si el
            producto presenta defecto de calidad o no corresponde a lo solicitado, cubriremos
            los costos de transporte de la devolución conforme a la garantía legal. En
            cualquier otro caso, se aplican los términos del derecho de retracto descritos en
            la sección 8.
          </p>
          <p>
            El producto debe devolverse en su estado original, sin uso indebido y con la
            totalidad de sus empaques, accesorios y la factura de compra.
          </p>
        </Section>

        <Section id="pqr" title="12. PQRS y canales de atención">
          <p>
            De conformidad con el literal g) del artículo 50 de la Ley 1480 de 2011, ponemos a
            su disposición canales de fácil acceso que garantizan la orientación y asistencia a
            los consumidores y la trazabilidad de las reclamaciones presentadas. Cada petición,
            queja, reclamo o sugerencia (PQRS) genera un número de radicado con fecha y hora,
            y un mecanismo de seguimiento.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Correo electrónico:</strong> kroniomarket@gmail.com</li>
            <li><strong>Teléfono:</strong> +57 (1) 555-1234</li>
            <li><strong>Dirección:</strong> Bogotá, D.C., Colombia</li>
          </ul>
          <p>
            También puede acudir directamente a la Superintendencia de Industria y Comercio
            (SIC), autoridad colombiana de protección al consumidor, en{" "}
            <a
              href="https://www.sic.gov.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-700"
            >
              www.sic.gov.co
            </a>.
          </p>
        </Section>

        <Section id="propiedad-intelectual" title="13. Propiedad intelectual">
          <p>
            Todos los contenidos del sitio web, incluyendo textos, imágenes, logotipos,
            diseños, iconos, software y código, son propiedad de Kronio Market o de sus
            proveedores de contenido y están protegidos por las leyes de propiedad intelectual
            colombianas e internacionales. Queda prohibida su reproducción o uso no autorizado.
          </p>
        </Section>

        <Section id="responsabilidad" title="14. Limitación de responsabilidad">
          <p>
            En la medida máxima permitida por la ley colombiana, la Tienda no será responsable
            por daños indirectos o consecuentes derivados del uso o la imposibilidad de usar la
            plataforma. Nuestra responsabilidad frente al consumidor se rige por las normas de
            protección al consumidor y no excluye las garantías y derechos que le asisten por
            mandato legal.
          </p>
        </Section>

        <Section id="ley-aplicable" title="15. Ley aplicable y jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República de Colombia, en especial por la
            Ley 1480 de 2011 (Estatuto del Consumidor), su normativa reglamentaria y las normas
            que las modifiquen o adicionen, incluida la Ley 2439 de 2024. Las controversias serán
            conocidas por las autoridades competentes de la ciudad de Bogotá, D.C., sin perjuicio
            de las facultades jurisdiccionales de la Superintendencia de Industria y Comercio.
          </p>
        </Section>

        <Section id="contacto" title="16. Contacto">
          <p>
            Para cualquier pregunta, queja o solicitud relacionada con estos términos, contáctenos
            a través de los canales indicados en la sección 12. También puede consultar nuestra
            Política de Privacidad en{" "}
            <Link href="/privacidad" className="text-blue-600 underline hover:text-blue-700">
              /privacidad
            </Link>
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