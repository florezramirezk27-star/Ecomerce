import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Kronio Market",
};

export default function TermsPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 text-gray-800">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">Términos y Condiciones</h1>
      <p className="text-sm text-gray-500 mb-10">Última actualización: Junio 2026</p>

      <div className="space-y-8 leading-relaxed">
        <Section title="1. Información General">
          <p>
            Este documento establece los términos y condiciones bajo los cuales Kronio Market
            (en adelante, &ldquo;la Tienda&rdquo;, &ldquo;nosotros&rdquo; o &ldquo;nuestro&rdquo;)
            opera su plataforma de comercio electrónico. Al acceder y utilizar este sitio web,
            usted acepta cumplir con estos términos. Si no está de acuerdo con alguna parte,
            le solicitamos que no utilice nuestros servicios.
          </p>
          <p>
            La Tienda se reserva el derecho de modificar estos términos en cualquier momento.
            Los cambios entrarán en vigor inmediatamente después de su publicación en el sitio.
            Es responsabilidad del usuario revisar periódicamente esta página.
          </p>
        </Section>

        <Section title="2. Registro y Cuenta de Usuario">
          <p>
            Para realizar compras en nuestra plataforma, el usuario debe registrarse
            proporcionando información veraz, completa y actualizada. El usuario es el único
            responsable de mantener la confidencialidad de sus credenciales de acceso y de
            todas las actividades que ocurran bajo su cuenta.
          </p>
          <p>
            Nos reservamos el derecho de suspender o cancelar cuentas que proporcionen
            información falsa, que violen estos términos o que realicen actividades
            fraudulentas. El usuario debe ser mayor de 18 años o contar con autorización
            de un representante legal para utilizar la plataforma.
          </p>
        </Section>

        <Section title="3. Productos y Precios">
          <p>
            Todos los precios publicados en la plataforma están expresados en Pesos Colombianos
            (COP) e incluyen los impuestos aplicables, salvo que se indique lo contrario.
            Los precios están sujetos a cambios sin previo aviso, pero los cambios no afectarán
            las órdenes ya confirmadas.
          </p>
          <p>
            Las imágenes de los productos son de carácter ilustrativo y pueden no corresponder
            exactamente al producto final. Hacemos esfuerzos razonables para mostrar
            descripciones precisas, pero no garantizamos que los colores, tamaños y detalles
            sean exactos.
          </p>
          <p>
            La Tienda se reserva el derecho de limitar las cantidades de compra y de rechazar
            cualquier pedido. En caso de que un producto aparezca con un precio incorrecto,
            nos reservamos el derecho de cancelar el pedido y reembolsar el monto pagado.
          </p>
        </Section>

        <Section title="4. Proceso de Compra">
          <p>
            Para realizar una compra, el usuario debe agregar productos al carrito, completar
            el proceso de pago y proporcionar la información de envío requerida. Una vez
            confirmado el pago, el usuario recibirá un correo electrónico con la confirmación
            del pedido y el número de seguimiento.
          </p>
          <p>
            La Tienda se reserva el derecho de verificar la información de pago antes de
            procesar el pedido. En caso de inconsistencias, podremos solicitar información
            adicional o cancelar la transacción.
          </p>
        </Section>

        <Section title="5. Métodos de Pago">
          <p>
            Aceptamos los siguientes métodos de pago:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tarjetas de crédito y débito (Visa, Mastercard, American Express)</li>
            <li>Transferencias bancarias</li>
            <li>Pagos a través de plataformas de pago electrónico</li>
            <li>Pago contra entrega (en zonas seleccionadas)</li>
          </ul>
          <p>
            Todos los pagos se procesan a través de pasarelas de pago seguras. No almacenamos
            información de tarjetas de crédito en nuestros servidores.
          </p>
        </Section>

        <Section title="6. Envíos y Entregas">
          <p>
            Realizamos envíos a todo el territorio colombiano. Los tiempos de entrega varían
            según la ubicación del destinatario y se indicarán durante el proceso de compra.
            Los plazos de entrega son estimados y no vinculantes.
          </p>
          <p>
            La Tienda no se hace responsable por retrasos causados por terceros (transportadoras,
            condiciones climáticas, desastres naturales, etc.). El riesgo de pérdida o daño de
            los productos se transfiere al comprador en el momento de la entrega al transportador.
          </p>
          <p>
            Es responsabilidad del comprador proporcionar una dirección de envío correcta y
            completa. Los costos de reenvío por dirección incorrecta serán asumidos por el
            comprador.
          </p>
        </Section>

        <Section title="7. Cambios y Devoluciones">
          <p>
            De conformidad con el Estatuto del Consumidor colombiano (Ley 1480 de 2011),
            el consumidor tiene derecho a retractarse de la compra dentro de los cinco (5)
            días hábiles siguientes a la recepción del producto, sin necesidad de justificar
            su decisión.
          </p>
          <p>
            Para ejercer este derecho, el producto debe estar en su estado original, sin usar
            y con todos sus empaques y accesorios. Los gastos de devolución serán asumidos
            por la Tienda cuando se trate de un defecto del producto o error en el envío.
          </p>
          <p>
            No aplica derecho de retracto para:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Productos personalizados o hechos a medida</li>
            <li>Productos sellados que no puedan ser devueltos por razones de higiene</li>
            <li>Productos digitales descargables</li>
          </ul>
        </Section>

        <Section title="8. Garantías">
          <p>
            Todos los productos comercializados en nuestra plataforma cuentan con la garantía
            mínima establecida por la ley colombiana. La garantía cubre defectos de fabricación
            y no cubre daños causados por mal uso, accidentes, modificaciones no autorizadas
            o desgaste normal.
          </p>
          <p>
            Para hacer efectiva la garantía, el comprador debe presentar la factura de compra
            y describir detalladamente el defecto. La Tienda evaluará el caso y procederá
            al reemplazo, reparación o reembolso según corresponda.
          </p>
        </Section>

        <Section title="9. Limitación de Responsabilidad">
          <p>
            En la medida máxima permitida por la ley, la Tienda no será responsable por daños
            indirectos, incidentales, especiales o consecuentes que surjan del uso o la
            imposibilidad de usar nuestros productos o servicios, incluyendo pérdida de
            beneficios, pérdida de datos o interrupción del negocio.
          </p>
          <p>
            Nuestra responsabilidad total frente al usuario por cualquier reclamo derivado
            de estos términos no excederá el monto pagado por el producto o servicio
            correspondiente.
          </p>
        </Section>

        <Section title="10. Propiedad Intelectual">
          <p>
            Todos los contenidos del sitio web, incluyendo textos, imágenes, logotipos,
            diseños, iconos, software y código, son propiedad de Kronio Market o de sus
            proveedores de contenido y están protegidos por las leyes de propiedad intelectual
            colombianas e internacionales.
          </p>
          <p>
            Queda prohibida la reproducción, distribución, modificación, exhibición pública
            o cualquier otro uso no autorizado de los contenidos sin el consentimiento
            expreso por escrito de la Tienda.
          </p>
        </Section>

        <Section title="11. Conducta del Usuario">
          <p>
            El usuario se compromete a utilizar la plataforma de manera ética y legal.
            Queda prohibido:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Realizar actividades fraudulentas o ilegales</li>
            <li>Publicar información falsa o engañosa</li>
            <li>Interferir con el funcionamiento de la plataforma</li>
            <li>Intentar acceder a cuentas de otros usuarios sin autorización</li>
            <li>Utilizar robots, spiders u otros mecanismos automatizados para acceder al sitio</li>
          </ul>
        </Section>

        <Section title="12. Ley Aplicable y Jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República de Colombia. Cualquier
            controversia derivada de estos términos será sometida a los jueces y tribunales
            de la ciudad de Bogotá, Colombia, renunciando expresamente a cualquier otro fuero.
          </p>
          <p>
            Para reclamaciones, el consumidor puede contactar a la Superintendencia de
            Industria y Comercio (SIC) o acudir a los mecanismos de solución de conflictos
            establecidos por la ley.
          </p>
        </Section>

        <Section title="13. Contacto">
          <p>
            Para cualquier pregunta, queja o solicitud relacionada con estos términos, puede
            contactarnos a través de los siguientes medios:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Correo electrónico: soporte@kroniomarket.com</li>
            <li>Teléfono: +57 (1) 555-1234</li>
            <li>Dirección: Bogotá, Colombia</li>
          </ul>
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
