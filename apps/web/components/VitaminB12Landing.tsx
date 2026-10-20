"use client";

import { useEffect, useState } from "react";
import { addToGuestCart } from "@/lib/guest-cart";
import { isAuthenticated } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { trackMetaEvent } from "@/lib/facebook-pixel";

/**
 * Landing larga para "VITAMIN B12 B6 B1 LIQUID FORMULA".
 *
 * Se monta debajo de la ficha del producto (ver `app/products/[slug]/page.tsx`),
 * igual que las dos infografias de velas. Todo el marcado vive aqui para no
 * ensuciar la ficha, que es generica.
 *
 * Los combos NO son un adorno: el boton de compra mete al carrito la cantidad
 * real de frascos. El formulario de contacto contraentrega que traia el diseno
 * original se quito porque prometia "pedido registrado" sin llamar a ningun
 * lado; en su lugar se reusa el carrito y el checkout que ya existen.
 */

const COMBOS = [
  {
    id: 1,
    frascos: 1,
    precio: 59900,
    precioAntes: null as number | null,
    titulo: "Prueba Individual",
    subtitulo: "Tratamiento para 30 días",
    etiqueta: "1 FRASCO (30 ML)",
    beneficios: ["Envío estándar", "Pago contraentrega"],
  },
  {
    id: 2,
    frascos: 2,
    precio: 99900,
    precioAntes: 119800,
    titulo: "Dúo Vitalidad",
    subtitulo: "Tratamiento para 60 días en pareja",
    etiqueta: "2 FRASCOS (60 ML)",
    beneficios: [
      "Envío GRATIS a todo el país",
      "Pago contraentrega prioritario",
      "Mayor ahorro por frasco",
    ],
  },
  {
    id: 3,
    frascos: 3,
    precio: 129900,
    precioAntes: 179700,
    titulo: "Familia / Súper Ahorro",
    subtitulo: "Tratamiento completo 90 días",
    etiqueta: "3 FRASCOS (90 ML)",
    beneficios: [
      "Envío GRATIS en Colombia",
      "Máximo descuento",
      "Regalo sorpresa incluido",
    ],
  },
] as const;

const VITAMINAS = [
  {
    sigla: "B12",
    nombre: "Metilcobalamina",
    dosis: "2000 MCG",
    color: "bg-red-500",
    texto:
      "Aumenta la producción de energía celular, combate la fatiga crónica y apoya la renovación sanguínea.",
  },
  {
    sigla: "B6",
    nombre: "Piridoxina",
    dosis: "20 MG",
    color: "bg-amber-500",
    texto:
      "Mejora el estado de ánimo, fortalece el sistema inmunológico y optimiza la memoria y el enfoque.",
  },
  {
    sigla: "B1",
    nombre: "Tiamina HCL",
    dosis: "100 MG",
    color: "bg-orange-500",
    texto:
      "Acelera la conversión de carbohidratos y grasas en energía vital y apoya la salud cardiovascular.",
  },
];

const BENEFICIOS = [
  {
    titulo: "Energía y vitalidad constante",
    pill: "Sin bajones",
    pillClass: "text-amber-400",
    texto:
      "Combate el cansancio diario y el agotamiento sin recurrir a bebidas energizantes ni cafeína en exceso.",
    img: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80",
  },
  {
    titulo: "Claridad mental y enfoque",
    pill: "Función cerebral",
    pillClass: "text-sky-400",
    texto:
      "Reduce la neblina mental, mejora la concentración en el trabajo y refuerza la retención de memoria.",
    img: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
  },
  {
    titulo: "Salud neurológica",
    pill: "Alivio de hormigueo",
    pillClass: "text-emerald-400",
    texto:
      "Ayuda a mitigar calambres y adormecimientos en extremidades apoyando la vaina de mielina nerviosa.",
    img: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=800&q=80",
  },
  {
    titulo: "Fácil toma y buen sabor",
    pill: "Gotero preciso",
    pillClass: "text-indigo-400",
    texto:
      "Formato líquido sublingual con sabor natural, sin necesidad de tragar pastillas ni molestias digestivas.",
    img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80",
  },
];

const COMPARATIVA = [
  {
    caracteristica: "Tasa de absorción real",
    liquida: "98% absorción directa",
    liquidaClass: "text-emerald-600",
    pastillas: "10% - 20% (pérdida en digestión)",
  },
  {
    caracteristica: "Velocidad de acción",
    liquida: "Inmediata (5-15 minutos)",
    liquidaClass: "text-slate-900",
    pastillas: "Lenta (2 a 4 horas)",
  },
  {
    caracteristica: "Impacto en el estómago",
    liquida: "Cero pesadez o irritación",
    liquidaClass: "text-slate-900",
    pastillas: "Puede causar gastritis o acidez",
  },
  {
    caracteristica: "Facilidad de consumo",
    liquida: "Solo 1 ml debajo de la lengua",
    liquidaClass: "text-slate-900",
    pastillas: "Difícil de tragar (cápsulas grandes)",
  },
];

const RESENAS = [
  {
    nombre: "Carolina Mendoza",
    ciudad: "Bogotá D.C.",
    cuando: "Hace 3 días",
    texto:
      "Llevo 2 semanas tomándola todas las mañanas. El cambio en la energía en el trabajo ha sido impresionante, ya no me da el pesadón de las 3 PM. Pagué cuando me llegó a la casa.",
    util: 34,
  },
  {
    nombre: "Héctor Ramírez",
    ciudad: "Medellín",
    cuando: "Hace 5 días",
    texto:
      "Tenía problemas de hormigueo en las manos y calambres. Mi médico me recomendó complejo B12 con B1 en gotas por la absorción. Santo remedio, el producto es 100% original.",
    util: 28,
  },
  {
    nombre: "Sonia Lucía Vargas",
    ciudad: "Bucaramanga",
    cuando: "Hace 1 semana",
    texto:
      "Pedí la opción de 2 frascos por combo para mi esposo y para mí. El envío llegó rapidísimo, en 48 horas. Sabor agradable y muy fácil de tomar.",
    util: 41,
  },
];

const FAQS = [
  {
    p: "¿Cuánto tarda en llegar mi pedido a mi ciudad?",
    r: "El tiempo promedio de entrega en ciudades principales (Bogotá, Medellín, Cali, Barranquilla, Bucaramanga) es de 24 a 48 horas hábiles. Para otros municipios toma entre 2 y 4 días hábiles.",
  },
  {
    p: "¿Tiene registro o contraindicaciones?",
    r: "Es un suplemento dietario compuesto por vitaminas hidrosolubles naturales (B12, B6 y B1) esenciales para el organismo. Es seguro para consumo diario. Si estás embarazada o bajo condición médica especial, consulta con tu médico de confianza.",
  },
  {
    p: "¿Realmente se paga cuando entreguen el producto?",
    r: "¡Sí, 100%! No tienes que pagar nada por adelantado. Agregas el combo al carrito, completas tus datos de envío y pagas el valor en efectivo directamente al mensajero cuando entregue el paquete en tu puerta.",
  },
];

interface VitaminB12LandingProps {
  /** id del producto en la tienda (se usa para agregarlo al carrito). */
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string;
}

const cop = (n: number) =>
  n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }) + " COP";

export default function VitaminB12Landing({
  productId,
  productName,
  productSlug,
  productImage,
}: VitaminB12LandingProps) {
  const [comboId, setComboId] = useState<number>(2);
  const [faqAbierto, setFaqAbierto] = useState<number | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [restante, setRestante] = useState(9647); // 2 h 40 min aprox

  const combo = COMBOS.find((c) => c.id === comboId) ?? COMBOS[1];

  // Contador de la barra superior. Arranca al montar y se reinicia al llegar a
  // cero, igual que el diseno original, para que la sensacion de urgencia no
  // muera si el visitante deja la pagina abierta.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRestante((s) => (s <= 0 ? 9647 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(Math.floor(restante / 3600)).padStart(2, "0");
  const mm = String(Math.floor((restante % 3600) / 60)).padStart(2, "0");
  const ss = String(restante % 60).padStart(2, "0");

  const handleComprar = async () => {
    setMensaje(null);
    setAgregando(true);
    try {
      const cantidad = combo.frascos;
      if (!isAuthenticated()) {
        addToGuestCart({
          productId,
          name: productName,
          price: combo.precio,
          image: productImage,
          slug: productSlug,
          quantity: cantidad,
          variationId: 0,
          variationName: null,
        });
      } else {
        await apiFetch("/cart/add", {
          method: "POST",
          body: JSON.stringify({
            productId,
            quantity: cantidad,
            variationId: 0,
          }),
        });
      }

      void trackMetaEvent("AddToCart", {
        content_ids: [productId],
        content_name: productName,
        content_type: "product",
        value: combo.precio,
        currency: "COP",
      });

      setMensaje({
        tipo: "ok",
        texto: `✓ ${combo.titulo} agregado: ${cantidad} frasco${cantidad === 1 ? "" : "s"}. Ve al carrito para pagar contraentrega.`,
      });
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto:
          err instanceof Error
            ? err.message
            : "No pudimos agregar el combo. Intenta de nuevo.",
      });
    } finally {
      setAgregando(false);
    }
  };

  return (
    <div className="vb12">
      {/* Utilidades que no existen en el tema global: animaciones y detalles
          puntuales de esta landing. Todo va con prefijo `vb12-` para no chocar
          con el resto del sitio. */}
      <style>{`
        .vb12 .vb12-pulse { animation: vb12-pulse 2s infinite; }
        @keyframes vb12-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .vb12 .vb12-selected {
          border-color: #4f46e5 !important;
          background-color: #ffffff !important;
        }
        .vb12 .vb12-shadow { box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4); }
      `}</style>

      {/* Barra de urgencia + envío gratis */}
      <div className="sticky top-0 z-40 bg-slate-900 px-4 py-2.5 text-xs text-white shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="vb12-pulse inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">
              ¡Oferta exclusiva!
            </span>
            <span className="hidden sm:inline">
              Envío GRATIS + pago contraentrega a toda Colombia hoy.
            </span>
          </div>
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <span aria-hidden="true">⏱</span>
            <span>La oferta termina en:</span>
            <span className="rounded bg-amber-400 px-2 py-0.5 font-mono text-xs font-black tabular-nums text-slate-950">
              {hh}:{mm}:{ss}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-8">
        {/* 1. Vitaminas */}
        <section className="space-y-4">
          <div className="space-y-2 text-center">
            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase text-emerald-800">
              Fórmula concentrada de máxima fuerza
            </span>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              3 VITAMINAS ESENCIALES EN CADA GOTA
            </h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-600">
              Absorción sublingual directa al torrente sanguíneo. Sin cápsulas
              difíciles de tragar ni pérdida en el sistema digestivo.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {VITAMINAS.map((v) => (
              <div
                key={v.sigla}
                className="flex items-start gap-4 rounded-2xl border-2 border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div
                  className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl font-black text-white shadow-lg ${v.color}`}
                >
                  <span className="text-xs uppercase leading-none">Vit</span>
                  <span className="text-xl leading-none">{v.sigla}</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">
                      {v.nombre}
                    </h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                      {v.dosis}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{v.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Beneficios */}
        <section className="space-y-6">
          <div className="space-y-2 text-center">
            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              Siente la diferencia desde la primera semana
            </span>
            <h2 className="text-2xl font-black text-slate-900 md:text-3xl">
              ¿POR QUÉ ELEGIR NUESTRA FÓRMULA LÍQUIDA?
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {BENEFICIOS.map((b) => (
              <div
                key={b.titulo}
                className="group overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-md transition-all hover:shadow-xl"
              >
                <div className="relative h-48 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.img}
                    alt={b.titulo}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span
                    className={`absolute left-3 top-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-extrabold backdrop-blur-md ${b.pillClass}`}
                  >
                    {b.pill}
                  </span>
                </div>
                <div className="space-y-2 p-5">
                  <h3 className="text-base font-extrabold text-slate-900">
                    {b.titulo}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    {b.texto}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Comparativa */}
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl md:p-8">
          <div className="space-y-2 text-center">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black uppercase text-indigo-600">
              Estudio de eficiencia
            </span>
            <h2 className="text-2xl font-black text-slate-900 md:text-3xl">
              GOTAS SUBLINGUALES VS. PASTILLAS CONVENCIONALES
            </h2>
            <p className="mx-auto max-w-xl text-xs text-slate-500">
              Las pastillas tradicionales pierden buena parte de sus vitaminas
              durante la digestión en el estómago.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="p-3 text-xs font-extrabold uppercase text-slate-500">
                    Característica
                  </th>
                  <th className="w-5/12 rounded-t-xl bg-indigo-50/60 p-3 text-center text-sm font-black text-indigo-600">
                    Fórmula líquida B12+B6+B1
                  </th>
                  <th className="w-4/12 p-3 text-center text-sm font-bold text-slate-400">
                    Pastillas / cápsulas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {COMPARATIVA.map((f) => (
                  <tr key={f.caracteristica}>
                    <td className="p-3 font-bold text-slate-700">
                      {f.caracteristica}
                    </td>
                    <td
                      className={`bg-indigo-50/60 p-3 text-center font-extrabold ${f.liquidaClass}`}
                    >
                      {f.liquida}
                    </td>
                    <td className="p-3 text-center text-slate-400">
                      {f.pastillas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Modo de uso */}
        <section className="space-y-6 rounded-3xl bg-slate-900 p-6 text-white shadow-2xl md:p-10">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <span className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-black uppercase text-slate-950">
                Uso diario sencillo
              </span>
              <h2 className="text-2xl font-black leading-tight md:text-3xl">
                ¿CÓMO SE TOMA LA FÓRMULA LÍQUIDA?
              </h2>
              <p className="text-xs leading-relaxed text-slate-300">
                Incorpórala a tu rutina matutina en solo 30 segundos, sin
                necesidad de agua.
              </p>
              <div className="space-y-3 pt-2">
                {[
                  "Carga el gotero con 1 ml (dosis diaria recomendada).",
                  "Colócalo debajo de la lengua durante 30 segundos.",
                  "Traga suavemente y disfruta de energía sostenida todo el día.",
                ].map((paso, i) => (
                  <div key={paso} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">
                      {i + 1}
                    </span>
                    <p className="text-xs font-semibold text-slate-200">
                      {paso}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-950 shadow-2xl">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                  poster={productImage}
                >
                  <track kind="captions" />
                </video>
                <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-semibold text-slate-200 backdrop-blur">
                  Demostración de uso
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Reseñas */}
        <section className="space-y-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm tracking-widest text-amber-400">
                  ★★★★★
                </span>
                <span className="text-xs font-extrabold text-slate-700">
                  4.9 de 5 estrellas
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 md:text-3xl">
                OPINIONES DE CLIENTES VERIFICADOS
              </h2>
              <p className="text-xs text-slate-500">
                Más de 2.400 colombianos ya están disfrutando sus beneficios
              </p>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 text-xs font-bold">
              <span className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-white">
                Todas (128)
              </span>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                Con foto (42)
              </span>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                ★ 5 estrellas (119)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {RESENAS.map((r) => (
              <div
                key={r.nombre}
                className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 text-xs tracking-widest text-amber-400">
                      ★★★★★
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {r.nombre}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {r.ciudad} • {r.cuando}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    ✓ Verificado
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600">
                  &ldquo;{r.texto}&rdquo;
                </p>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  <span>¿Fue útil esta reseña?</span>
                  <span className="font-bold text-slate-600">
                    👍 Sí ({r.util})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Combos + compra */}
        <section
          id="ordenar-combo"
          className="space-y-8 rounded-3xl border border-indigo-700/50 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white shadow-2xl md:p-10"
        >
          <div className="mx-auto max-w-2xl space-y-2 text-center">
            <span className="mb-1 inline-block rounded-full bg-emerald-500 px-3 py-1 text-xs font-black uppercase text-slate-950">
              Despacho inmediato en Colombia
            </span>
            <h2 className="text-2xl font-black tracking-tight md:text-4xl">
              SELECCIONA TU COMBO Y PAGA AL RECIBIR
            </h2>
            <p className="text-xs text-indigo-200">
              No necesitas tarjeta de crédito. Agregas el combo al carrito y
              pagas en efectivo al repartidor cuando entregue en tu casa u
              oficina.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {COMBOS.map((c) => {
              const activo = c.id === comboId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setComboId(c.id)}
                  aria-pressed={activo}
                  className={`relative flex flex-col justify-between rounded-3xl border-2 p-6 text-left transition-all ${
                    activo
                      ? "vb12-selected border-indigo-500 shadow-2xl"
                      : "border-slate-700 bg-slate-800/80 hover:border-indigo-500"
                  }`}
                >
                  {c.id === 2 && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-indigo-600 px-4 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                      ★ Más vendido · Ahorras{" "}
                      {cop((c.precioAntes ?? 0) - c.precio)}
                    </span>
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <span
                        className={`text-xs font-bold uppercase ${activo ? "text-indigo-600" : "text-slate-400"}`}
                      >
                        {c.etiqueta}
                      </span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${activo ? "border-indigo-600" : "border-slate-500"}`}
                      >
                        {activo && (
                          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                        )}
                      </span>
                    </div>
                    <h3
                      className={`text-xl font-black ${activo ? "text-slate-900" : "text-white"}`}
                    >
                      {c.titulo}
                    </h3>
                    <p
                      className={`mt-1 text-xs ${activo ? "text-slate-600" : "text-slate-300"}`}
                    >
                      {c.subtitulo}
                    </p>

                    <div
                      className={`my-4 flex items-baseline gap-2 border-t pt-3 ${activo ? "border-slate-100" : "border-slate-700"}`}
                    >
                      <span
                        className={`text-2xl font-black ${activo ? "text-indigo-600" : "text-emerald-400"}`}
                      >
                        {cop(c.precio)}
                      </span>
                      {c.precioAntes && (
                        <span className="text-xs text-slate-400 line-through">
                          {cop(c.precioAntes)}
                        </span>
                      )}
                    </div>
                  </div>

                  <ul
                    className={`space-y-1.5 pt-2 text-[11px] ${activo ? "font-medium text-slate-700" : "text-slate-300"}`}
                  >
                    {c.beneficios.map((b) => (
                      <li key={b}>
                        <span className="mr-1.5 text-emerald-500">✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl md:p-8">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="flex items-center gap-2 text-xl font-black text-slate-900">
                <span className="text-indigo-600">🛒</span>
                CONFIRMA TU COMBO CONTRAENTREGA
              </h3>
              <p className="text-xs text-slate-500">
                Al confirmar, el combo se agrega al carrito con tus datos de
                envío y pagas al recibir.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/80 p-4">
              <div>
                <span className="block text-[11px] font-bold text-slate-500">
                  Resumen del pedido:
                </span>
                <span className="text-sm font-black text-indigo-600">
                  {combo.titulo} ({combo.frascos} frasco
                  {combo.frascos === 1 ? "" : "s"})
                </span>
              </div>
              <span className="text-lg font-black text-slate-900">
                {cop(combo.precio)}
              </span>
            </div>

            {mensaje && (
              <div
                role="status"
                className={`rounded-xl p-3 text-sm font-medium ${
                  mensaje.tipo === "ok"
                    ? "border border-green-200 bg-green-50 text-green-700"
                    : "border border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {mensaje.texto}
              </div>
            )}

            <button
              type="button"
              onClick={handleComprar}
              disabled={agregando}
              className="vb12-shadow flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white transition-all hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 md:text-base"
            >
              {agregando ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Agregando...
                </>
              ) : (
                <>
                  <span>✓</span>
                  CONFIRMAR COMBO Y PAGAR CONTRAENTREGA
                </>
              )}
            </button>

            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-slate-400">
              <span>🔒 Datos 100% seguros</span>
              <span>•</span>
              <span>🛡 Garantía de satisfacción</span>
            </div>
          </div>
        </section>

        {/* 7. FAQ */}
        <section className="mx-auto max-w-4xl space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-black text-slate-900 md:text-3xl">
              PREGUNTAS FRECUENTES
            </h2>
            <p className="text-xs text-slate-500">
              Resolvemos todas tus dudas antes de ordenar
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((f, i) => {
              const abierto = faqAbierto === i;
              return (
                <div
                  key={f.p}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setFaqAbierto(abierto ? null : i)}
                    aria-expanded={abierto}
                    className="flex w-full items-center justify-between p-4 text-left text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <span>{f.p}</span>
                    <span
                      className={`text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
                    >
                      ▾
                    </span>
                  </button>
                  {abierto && (
                    <div className="border-t border-slate-100 p-4 pt-3 text-xs leading-relaxed text-slate-600">
                      {f.r}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 8. Garantía */}
        <section className="flex flex-col items-center gap-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 md:flex-row">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-2xl font-black text-slate-950 shadow-lg">
            🛡
          </div>
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-base font-extrabold text-slate-900">
              GARANTÍA DE SATISFACCIÓN Y CALIDAD
            </h3>
            <p className="text-xs leading-relaxed text-slate-600">
              Producto fabricado con altos estándares de calidad. Libre de
              gluten, libre de GMO y apto para consumo diario. Recuerda que es
              un suplemento dietario, no un medicamento.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
