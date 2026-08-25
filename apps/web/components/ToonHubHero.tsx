"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

const IMAGES = [
  { src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png', bg: '#F4845F', panel: '#F79B7F' },
  { src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png', bg: '#6BBF7A', panel: '#85CC92' },
  { src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png', bg: '#E882B4', panel: '#ED9DC4' },
  { src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png', bg: '#6EB5FF', panel: '#8DC4FF' },
];

function getRoleIndex(activeIndex: number, role: 'center' | 'left' | 'right' | 'back') {
  switch (role) {
    case 'center': return activeIndex;
    case 'left': return (activeIndex + 3) % 4;
    case 'right': return (activeIndex + 1) % 4;
    case 'back': return (activeIndex + 2) % 4;
  }
}

export default function ToonHubHero() {
  const [activeIndex, setActiveIndex] = useState(0);
  const isAnimatingRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const navigate = useCallback((dir: 'next' | 'prev') => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setActiveIndex(prev => dir === 'next' ? (prev + 1) % 4 : (prev + 3) % 4);
    setTimeout(() => { isAnimatingRef.current = false; }, 650);
  }, []);

  useEffect(() => {
    IMAGES.forEach(img => {
      const i = new Image();
      i.src = img.src;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => navigate('next'), 5000);
    return () => clearInterval(timer);
  }, [navigate]);

  const getItemStyle = (role: 'center' | 'left' | 'right' | 'back'): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      aspectRatio: '0.6 / 1',
      transition: 'transform 650ms cubic-bezier(0.4,0,0.2,1), filter 650ms cubic-bezier(0.4,0,0.2,1), opacity 650ms cubic-bezier(0.4,0,0.2,1), left 650ms cubic-bezier(0.4,0,0.2,1)',
      willChange: 'transform, filter, opacity',
    };

    switch (role) {
      case 'center':
        return {
          ...base,
          left: '50%',
          transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
          filter: 'none',
          opacity: 1,
          zIndex: 20,
          height: isMobile ? '56%' : '85%',
          bottom: isMobile ? '18%' : 0,
        };
      case 'left':
        return {
          ...base,
          left: isMobile ? '20%' : '30%',
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
          height: isMobile ? '16%' : '28%',
          bottom: isMobile ? '32%' : '12%',
        };
      case 'right':
        return {
          ...base,
          left: isMobile ? '80%' : '70%',
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
          height: isMobile ? '16%' : '28%',
          bottom: isMobile ? '32%' : '12%',
        };
      case 'back':
        return {
          ...base,
          left: '50%',
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(4px)',
          opacity: 1,
          zIndex: 5,
          height: isMobile ? '13%' : '22%',
          bottom: isMobile ? '32%' : '12%',
        };
    }
  };

  const active = IMAGES[activeIndex];

  return (
    <div
      style={{
        backgroundColor: active.bg,
        transition: 'background-color 650ms cubic-bezier(0.4,0,0.2,1)',
        fontFamily: "'Inter', sans-serif",
      }}
      className="relative w-full overflow-hidden"
    >
      <div className="relative w-full" style={{ height: '85vh', overflow: 'hidden' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 50,
            opacity: 0.4,
            backgroundSize: '200px 200px',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
          }}
        />

        <div
          className="absolute left-[12%] sm:left-[18%] pointer-events-none select-none"
          style={{
            zIndex: 2,
            top: '18%',
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(28px, 10vw, 200px)',
            fontWeight: 900,
            color: 'white',
            opacity: 1,
            lineHeight: 1,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          KRONIO
        </div>
        <div
          className="absolute right-[12%] sm:right-[18%] pointer-events-none select-none text-right"
          style={{
            zIndex: 2,
            top: '18%',
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(28px, 10vw, 200px)',
            fontWeight: 900,
            color: 'white',
            opacity: 1,
            lineHeight: 1,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          MARKET
        </div>



        <div className="absolute inset-0" style={{ zIndex: 3 }}>
          {(['back', 'left', 'right', 'center'] as const).map(role => {
            const idx = getRoleIndex(activeIndex, role);
            const img = IMAGES[idx];
            const style = getItemStyle(role);
            return (
              <div key={idx} style={style}>
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                  }}
                />
              </div>
            );
          })}
        </div>

        <div
          className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24"
          style={{ zIndex: 60, maxWidth: 320 }}
        >
          <p
            className="font-bold uppercase tracking-widest mb-2 sm:mb-3 text-base sm:text-[22px]"
            style={{ color: 'white', opacity: 0.95, letterSpacing: '0.02em' }}
          >
            BIENVENIDO
          </p>
          <p
            className="hidden sm:block text-xs sm:text-sm"
            style={{ color: 'white', opacity: 0.85, lineHeight: 1.6, marginBottom: '1rem' }}
          >
            Calidad y confianza en cada compra. Productos seleccionados para ti, con env&iacute;o r&aacute;pido y atenci&oacute;n personalizada. &iexcl;Gracias por elegirnos!
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('prev')}
              className="flex items-center justify-center rounded-full border-2 border-white transition-all duration-150 w-12 h-12 sm:w-16 sm:h-16"
              style={{ background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <ArrowLeft size={26} strokeWidth={2.25} color="white" />
            </button>
            <button
              onClick={() => navigate('next')}
              className="flex items-center justify-center rounded-full border-2 border-white transition-all duration-150 w-12 h-12 sm:w-16 sm:h-16"
              style={{ background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <ArrowRight size={26} strokeWidth={2.25} color="white" />
            </button>
          </div>
        </div>

        <Link
          href="/products"
          className="absolute bottom-6 right-4 sm:bottom-20 sm:right-10 flex items-center gap-2 no-underline transition-opacity duration-200"
          style={{
            zIndex: 60,
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(20px, 4vw, 56px)',
            fontWeight: 400,
            color: 'white',
            opacity: 0.95,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.95'; }}
        >
          COMPRAR YA
          <ArrowRight strokeWidth={2.25} color="white" className="w-5 h-5 sm:w-8 sm:h-8" />
        </Link>
      </div>
    </div>
  );
}
