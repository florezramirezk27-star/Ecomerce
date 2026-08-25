"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export default function VideoHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  return (
    <section className="relative w-full h-[80vh] md:h-[90vh] overflow-hidden bg-gray-900">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        poster="https://images.pexels.com/videos/8306452/free-video-8306452.jpg?fit=crop&w=1920&h=1080&auto=compress&cs=tinysrgb"
      >
        <source
          src="https://www.pexels.com/download/video/8306452/"
          type="video/mp4"
        />
      </video>

      <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 via-gray-900/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent" />

      <div className="absolute inset-0 flex items-center">
        <div className="max-w-7xl mx-auto px-6 md:px-10 w-full">
          <div className="max-w-2xl">
            <span className="inline-block text-cyan-400 text-sm md:text-base font-semibold tracking-[0.2em] uppercase mb-4">
              Kronio Market
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6">
              Tu tienda de{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                confianza
              </span>{" "}
              en Colombia
            </h1>
            <p className="text-gray-300 text-base md:text-lg max-w-lg mb-8 leading-relaxed">
              Envíos gratis a todo el país. Pago contra entrega. Los mejores productos
              con los precios más justos.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold px-8 py-3.5 rounded-full text-sm hover:from-cyan-400 hover:to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all duration-300"
              >
                Comprar ahora
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/nosotros"
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold px-8 py-3.5 rounded-full text-sm hover:bg-white/20 transition-all duration-300"
              >
                Conócenos
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <svg className="w-6 h-6 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
        </svg>
      </div>
    </section>
  );
}
