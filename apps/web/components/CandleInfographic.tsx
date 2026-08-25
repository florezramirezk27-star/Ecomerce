"use client";

export default function CandleInfographic() {
  return (
    <div>
      <link
        href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Geist:wght@100..900&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .ci-body {
          background-color: #fbf9f5;
          font-family: 'Geist', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ci-cinematic-bg {
          background: radial-gradient(circle at 10% 10%, rgba(255, 215, 0, 0.03) 0%, transparent 50%),
                      radial-gradient(circle at 90% 90%, rgba(0, 238, 252, 0.03) 0%, transparent 50%),
                      #fbf9f5;
          position: relative;
        }
        .ci-glass-card {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.6);
        }
        .ci-neon-border-cyan {
          box-shadow: 0 0 15px rgba(0, 238, 252, 0.2);
        }
        .ci-gradient-progress {
          background: linear-gradient(90deg, #00eefc 0%, #ffd700 100%);
        }
      `}</style>

      <section className="ci-body w-full py-8 px-4 md:py-12 md:px-4">
        <div className="w-full max-w-[1376px] ci-cinematic-bg overflow-hidden relative shadow-2xl flex flex-col p-6 md:p-10 border border-stone-200 rounded-2xl">
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-baseline mb-6 md:mb-8 z-20 gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-[#705d00] uppercase mb-1">Luminous Digital Artisanal</span>
              <h1 className="text-3xl md:text-5xl font-bold text-[#1b1c1a]" style={{ fontFamily: "'Bodoni Moda', serif" }}>
                Set de Velas Artesanales
              </h1>
            </div>
            <div className="text-right">
              <p className="italic text-stone-500 text-base md:text-lg" style={{ fontFamily: "'Bodoni Moda', serif" }}>
                Colección Esencias Celestiales
              </p>
            </div>
          </header>

          {/* Content Grid */}
          <div className="flex-grow grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 relative z-10 overflow-hidden">
            {/* Left: Product Image */}
            <section className="md:col-span-5 flex flex-col justify-center relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl group border border-white/50 min-h-[250px] md:min-h-[400px]">
                <img
                  alt="Set de Velas Artesanales"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDeGQbMHF1uWgXS2HPJaQfKD16KYiLVZaklCF04Wwf7hueu7_DjdX_G2b3LLCTXyqE62v0QplnxKwr-qZ9oss_UHeHEnwIA7JX3FFHVFz4BgPAjrjPMhlTTPJNLWe1KYQebByDlF81Iq9tJAwE2by55Ic7AYL6mlu5aih9coVNfYi1nL9QjepOMLy-21LT8WdWWwz6d-owUGGEzhqAkumiYXGIxdhR0cgDzqyWiK775LHgmRMuPxOadIxIGmu4npPh0AKrJPsSOoYg"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
              </div>
              <div className="mt-4 md:mt-6 ci-glass-card p-4 md:p-5 rounded-xl">
                <p className="text-stone-600 text-xs md:text-sm leading-relaxed font-light italic">
                  &ldquo;Cada vela es vertida a mano en pequeños lotes, capturando la esencia pura de la naturaleza en un recipiente de cristal soplado con tapa de roble artesanal.&rdquo;
                </p>
              </div>
            </section>

            {/* Right: Olfactory Profiles */}
            <section className="md:col-span-7 flex flex-col gap-3 md:space-y-4">
              {profiles.map((p) => (
                <div
                  key={p.name}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:space-x-6 ci-glass-card p-3 md:p-4 rounded-2xl transition-all hover:translate-x-2"
                  style={{ borderLeft: `4px solid ${p.borderColor}` }}
                >
                  <div className="w-full sm:w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-stone-100 border border-white">
                    <img
                      alt={p.title}
                      className="w-full h-full object-cover"
                      src={p.image}
                    />
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex flex-col sm:flex-row items-start sm:items-baseline justify-between mb-1 gap-1">
                      <h3 className="text-xl md:text-2xl text-[#1b1c1a]" style={{ fontFamily: "'Bodoni Moda', serif" }}>
                        {p.title}
                      </h3>
                      <span className="text-[10px] tracking-widest uppercase font-bold text-stone-400 shrink-0">{p.tag}</span>
                    </div>
                    <p className="text-[10px] md:text-xs text-[#705d00] font-semibold mb-1 md:mb-2 uppercase tracking-tighter">{p.notes}</p>
                    <p className="text-stone-500 text-xs md:text-sm leading-snug line-clamp-2">{p.description}</p>
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Footer */}
          <footer className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-stone-200 flex flex-col md:flex-row items-start md:items-center justify-between z-20 gap-4 md:gap-0">
            <div className="flex flex-wrap gap-4 md:gap-6 md:space-x-12">
              {specs.map((s) => (
                <div key={s.label} className="flex flex-col">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{s.label}</span>
                  <span className="text-xs md:text-sm font-medium text-stone-700">{s.value}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 md:space-x-6 ci-glass-card px-4 md:px-6 py-2 md:py-3 rounded-full border border-stone-200 shadow-sm w-full md:w-auto justify-center md:justify-start">
              <div className="flex items-center gap-2 md:space-x-3 flex-1 md:flex-initial">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-[#00eefc]/50 flex items-center justify-center ci-neon-border-cyan shrink-0">
                  <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#00eefc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                  </svg>
                </div>
                <div className="flex-1 md:w-48">
                  <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full ci-gradient-progress w-4/5"></div>
                  </div>
                </div>
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="text-xl md:text-2xl font-bold text-[#705d00]" style={{ fontFamily: "'Bodoni Moda', serif" }}>40H</span>
                <span className="text-[10px] font-bold text-stone-400 uppercase">Duración</span>
              </div>
              <div className="text-[#ffd700] animate-pulse shrink-0">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" transform="rotate(-45 12 12)" />
                </svg>
              </div>
            </div>
          </footer>

          {/* Decorative Elements */}
          <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-[#00eefc]/5 blur-[120px] rounded-full pointer-events-none"></div>
          <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-[#ffd700]/5 blur-[120px] rounded-full pointer-events-none"></div>
        </div>
      </section>
    </div>
  );
}

const profiles = [
  {
    name: "vainilla",
    title: "Vainilla de Tahití",
    tag: "Dulce & Cálido",
    notes: "Orquídea de Tahití, Ámbar Gris, Musk Blanco",
    description:
      "Una fragancia envolvente que evoca tranquilidad. Perfecta para momentos de introspección y calidez hogareña.",
    borderColor: "#ffd700",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDeGQbMHF1uWgXS2HPJaQfKD16KYiLVZaklCF04Wwf7hueu7_DjdX_G2b3LLCTXyqE62v0QplnxKwr-qZ9oss_UHeHEnwIA7JX3FFHVFz4BgPAjrjPMhlTTPJNLWe1KYQebByDlF81Iq9tJAwE2by55Ic7AYL6mlu5aih9coVNfYi1nL9QjepOMLy-21LT8WdWWwz6d-owUGGEzhqAkumiYXGIxdhR0cgDzqyWiK775LHgmRMuPxOadIxIGmu4npPh0AKrJPsSOoYg",
  },
  {
    name: "lavanda",
    title: "Lavanda Francesa",
    tag: "Relajante & Floral",
    notes: "Bergamota, Eucalipto Real, Lavanda de Provenza",
    description:
      "Frescura botánica diseñada para purificar el ambiente y reducir los niveles de estrés diarios.",
    borderColor: "#00eefc",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAxH3Smcmmnz8vBDXM6Lec09NywXbqKSDWk1iKjGCNji3-o-2heBZJI6eoGQwW_zwSrpXD_Ay9ZryNhBTBL8iKUSTIf8gw9zpQnNHRp89GMK9IjmqAONn7UFCBW9_81PXDAHF7XevCgUjHAZ5UNH-HJssB7NMQar6JTq9x8RgKaPuFA7pphD8xgJ3bWBPdVCJlz09_HTQZf9mbkNH5IZ1sH2OGbFqZQD-c_PU5aFMjObAI4ksNtP1i_ePPbDU-CZK24mjdwRnM4uh8",
  },
  {
    name: "canela",
    title: "Canela y Especias",
    tag: "Especiado & Vital",
    notes: "Estrella de Anís, Jengibre Orgánico, Corteza de Canela",
    description:
      "Estimula los sentidos con una mezcla vibrante y acogedora. Ideal para reuniones familiares y festividades.",
    borderColor: "#a8a29e",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBsM8sUgRumvcuyPrHvhSoRkQtMS10mAOYSVR8aFrS6pP4Wa9vuRlxEjyWLiMoGOsv7iKwxYpDsn6pByZqjvyXqX-QHg4THHG0oTpDFNhfxf8p78dk-581O5vK173fz3zKN5T3MU4kUCQgLhyDokf8tn2wJ0jqe9BNtb0F4AeBbx4ipo2H0SThkjgjZ2CY5H-wkIHwzV-fwp2V8KCt1NUIw1rpWeXtbNi23Vslb8hDx1Bfyze3x4iGsZxsvtXEEK7IFAsqc98FjyQM",
  },
];

const specs = [
  { label: "Tipo de Cera", value: "Soja Orgánica 100%" },
  { label: "Mecha", value: "Algodón Egipcio" },
  { label: "Peso Neto", value: "250g / vela" },
];
