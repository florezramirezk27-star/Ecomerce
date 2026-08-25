"use client";

export default function CandleArtisanalInfographic() {
  return (
    <div>
      <style>{`
        .cai-glass {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(32px);
          -webkit-backdrop-filter: blur(32px);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        .cai-rim {
          box-shadow: inset 1px 1px 0px rgba(255, 255, 255, 0.4), 0 10px 30px rgba(0, 0, 0, 0.03);
        }
        .cai-glow-gold {
          box-shadow: 0 0 25px rgba(255, 215, 0, 0.15);
        }
        .cai-glow-cyan {
          box-shadow: 0 0 25px rgba(0, 238, 252, 0.15);
        }
        .cai-hover-lift:hover {
          transform: translateY(-8px);
          transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .cai-float {
          animation: caiFloat 6s ease-in-out infinite;
        }
        @keyframes caiFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
      `}</style>

      <section className="w-full py-8 md:py-16 px-4 md:px-10 bg-[#fbf9f5]">
        <div className="max-w-[1440px] mx-auto relative">
          {/* Artisanal Collection label */}
          <h2 className="text-xs md:text-sm italic text-[#705d00]/50 uppercase tracking-tighter mb-6 md:mb-8" style={{ fontFamily: "'Bodoni Moda', serif" }}>
            Colección Artesanal
          </h2>

          {/* Hero Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-center">
            {/* LEFT: Floating candle profiles */}
            <div className="lg:col-span-5 flex flex-col gap-8 md:gap-12">
              {profiles.map((p, i) => (
                <div key={p.name} className="flex items-center gap-4 md:gap-8 cai-hover-lift group cursor-pointer flex-col sm:flex-row">
                  <div className="w-24 h-24 md:w-32 md:h-32 cai-glass rounded-xl cai-rim p-2 overflow-hidden transition-transform group-hover:rotate-0 shrink-0" style={{ transform: i === 1 ? 'rotate(-2deg)' : i === 2 ? 'rotate(6deg)' : 'rotate(3deg)' }}>
                    <img className="w-full h-full object-cover rounded-lg" alt={p.title} src={p.image} />
                  </div>
                  <div className="cai-glass p-3 md:p-4 rounded-lg cai-rim border-l-4 shrink-0" style={{ borderColor: p.border, transform: 'translate(-12.66px, 23.72px)' }}>
                    <h3 className="text-lg md:text-xl font-semibold mb-1" style={{ color: p.color, fontFamily: "'Bodoni Moda', serif" }}>{p.title}</h3>
                    <p className="text-[10px] md:text-xs text-[#4d4732] uppercase tracking-wider">{p.notes}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <svg className="w-3 h-3 md:w-4 md:h-4 text-[#705d00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                      <span className="text-[10px] md:text-xs font-bold text-[#705d00]">40H Combustión</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* CENTER: 40 Hours display */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center relative py-8 md:py-0">
              <div className="w-48 h-48 md:w-72 md:h-72 cai-glass rounded-full flex flex-col items-center justify-center border-2 border-[#ffd700]/20 cai-glow-gold cai-float">
                <svg className="w-8 h-8 md:w-12 md:h-12 text-[#ffd700] mb-3 md:mb-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <div className="text-center">
                  <h3 className="text-4xl md:text-6xl font-bold text-[#705d00] leading-none" style={{ fontFamily: "'Bodoni Moda', serif" }}>40</h3>
                  <p className="text-[10px] md:text-xs font-semibold text-[#4d4732] tracking-[0.3em] mt-1 md:mt-2 uppercase">Horas</p>
                  <p className="text-[8px] md:text-[10px] mt-2 md:mt-4 font-semibold text-[#7e775f] uppercase tracking-wider">Luminiscencia Extendida</p>
                </div>
              </div>
            </div>

            {/* RIGHT: Technical specs */}
            <div className="lg:col-span-3">
              <div className="cai-glass p-6 md:p-8 rounded-2xl cai-rim space-y-6 md:space-y-8">
                <h4 className="text-xl md:text-2xl font-medium" style={{ fontFamily: "'Bodoni Moda', serif" }}>Excelencia Técnica</h4>
                <ul className="space-y-3 md:space-y-4">
                  {specs.map((s) => (
                    <li key={s.label} className="flex items-start gap-3">
                      <svg className="w-5 h-5 md:w-6 md:h-6 text-[#705d00] mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                      <div>
                        <p className="font-bold text-xs md:text-sm">{s.label}</p>
                        <p className="text-[10px] md:text-xs text-[#4d4732]">{s.value}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="pt-4 md:pt-6 border-t border-white/20">
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] md:text-xs font-semibold text-[#4d4732] uppercase tracking-wider">Progreso de Combustión</span>
                    <span className="text-[10px] md:text-xs font-bold text-[#705d00]">40H</span>
                  </div>
                  <div className="h-2 w-full bg-[#efeeea] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#705d00] to-[#00dbe9] rounded-full cai-glow-cyan" style={{ width: '85%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom strip */}
          <div className="mt-8 md:mt-20 w-full flex flex-col md:flex-row items-center justify-between cai-glass px-4 md:px-12 py-4 md:py-6 rounded-full cai-rim gap-4 md:gap-0">
            <div className="flex items-center gap-2 md:gap-4">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-[#705d00]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 12.5v-9l6 4.5-6 4.5z" />
              </svg>
              <span className="text-[10px] md:text-xs font-semibold tracking-widest text-[#1b1c1a] uppercase">40H DE AROMA PURO</span>
            </div>
            <div className="h-px flex-grow mx-4 md:mx-12 bg-[#d0c6ab] hidden md:block"></div>
            <div className="flex gap-2 md:gap-4 flex-wrap justify-center">
              {profiles.map((p) => (
                <span key={p.name} className="text-[8px] md:text-[10px] font-semibold text-[#4d4732] px-2 md:px-3 py-1 bg-[#efeeea] rounded-full border border-white/50 uppercase tracking-wider">
                  {p.tag}
                </span>
              ))}
            </div>
          </div>

          {/* Gallery Bento Grid */}
          <div className="mt-12 md:mt-24">
            <div className="flex flex-col md:flex-row justify-between items-end mb-8 md:mb-12">
              <div>
                <span className="text-[10px] md:text-xs font-semibold text-[#705d00] uppercase tracking-[0.2em]">Selección del Curador</span>
                <h2 className="text-2xl md:text-4xl font-medium mt-2" style={{ fontFamily: "'Bodoni Moda', serif" }}>Fragancia Esculpida</h2>
              </div>
              <p className="max-w-md text-[#4d4732] text-sm md:text-base text-right hidden md:block">
                Explora la intersección de la luz y el aroma, donde cada vela es una obra maestra del diseño digital y la artesanía física.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
              {/* Large Card */}
              <div className="md:col-span-2 relative h-[300px] md:h-[500px] rounded-2xl md:rounded-3xl overflow-hidden cai-glass group">
                <img className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Set de la Hora Dorada" src={galleryImages.large} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-6 md:bottom-10 left-6 md:left-10 text-white">
                  <span className="text-[10px] text-[#7df4ff] font-semibold tracking-widest uppercase">Edición Limitada</span>
                  <h3 className="text-xl md:text-3xl font-medium mt-1 md:mt-2" style={{ fontFamily: "'Bodoni Moda', serif" }}>Set de la Hora Dorada</h3>
                </div>
              </div>

              {/* Tall Card */}
              <div className="h-[300px] md:h-[500px] rounded-2xl md:rounded-3xl overflow-hidden cai-glass group flex flex-col">
                <div className="h-2/3 overflow-hidden relative">
                  <img className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Serenidad de Lavanda" src={galleryImages.lavender} />
                </div>
                <div className="p-4 md:p-8 h-1/3 flex flex-col justify-between bg-[#f5f3ef]">
                  <div>
                    <h3 className="text-lg md:text-xl font-medium" style={{ fontFamily: "'Bodoni Moda', serif" }}>Serenidad de Lavanda</h3>
                    <p className="text-[10px] md:text-xs text-[#4d4732] mt-1">Calma tu espacio digital</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xl md:text-2xl font-bold text-[#705d00]" style={{ fontFamily: "'Bodoni Moda', serif" }}>$45</span>
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-[#705d00] cursor-pointer hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Small: Vanilla */}
              <div className="h-[250px] md:h-[400px] rounded-2xl md:rounded-3xl overflow-hidden cai-glass group relative">
                <img className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Vainilla Clásica" src={galleryImages.vanilla} />
                <div className="absolute inset-0 bg-[#705d00]/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute bottom-6 md:bottom-8 left-6 md:left-8">
                  <h3 className="text-lg md:text-xl font-medium text-white" style={{ fontFamily: "'Bodoni Moda', serif" }}>Vainilla Clásica</h3>
                  <p className="text-[10px] text-white/80 uppercase tracking-widest mt-1">Más Vendido</p>
                </div>
              </div>

              {/* Small: Cinnamon */}
              <div className="h-[250px] md:h-[400px] rounded-2xl md:rounded-3xl overflow-hidden cai-glass group relative">
                <img className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Canela al Atardecer" src={galleryImages.cinnamon} />
                <div className="absolute inset-0 bg-[#a900a9]/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute bottom-6 md:bottom-8 left-6 md:left-8">
                  <h3 className="text-lg md:text-xl font-medium text-white" style={{ fontFamily: "'Bodoni Moda', serif" }}>Canela al Atardecer</h3>
                  <p className="text-[10px] text-white/80 uppercase tracking-widest mt-1">Ritual de Invierno</p>
                </div>
              </div>

              {/* Small: Rewards */}
              <div className="h-[250px] md:h-[400px] rounded-2xl md:rounded-3xl cai-glass flex flex-col items-center justify-center p-4 md:p-8 text-center">
                <div className="w-10 h-10 md:w-16 md:h-16 bg-[#705d00]/10 rounded-full flex items-center justify-center mb-3 md:mb-4">
                  <svg className="w-5 h-5 md:w-8 md:h-8 text-[#705d00]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <h3 className="text-lg md:text-xl font-medium" style={{ fontFamily: "'Bodoni Moda', serif" }}>Recompensas Luminosas</h3>
                <p className="text-xs md:text-sm text-[#4d4732] mt-2 mb-4 md:mb-6">Únete a nuestro círculo artesanal para acceso exclusivo a nuevos lanzamientos.</p>
                <button className="w-full py-2 md:py-3 bg-[#705d00] text-white rounded-full text-[10px] md:text-xs font-semibold tracking-widest uppercase hover:bg-[#544600] transition-colors">Regístrate Ahora</button>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}

const profiles = [
  {
    name: "vainilla",
    title: "Vainilla",
    tag: "Sueño de Vainilla",
    notes: "Orquídea, Ambar",
    color: "#705d00",
    border: "#705d00",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBJVOqvei36JUO4EMthc7_3sF5t1j2emsGCT7NRQeJQh95vOpG1wQ4YG9_yklDZ1mT7RxOKxVhAGhnmhxLl-T3JLpmfId9_k_jevaFezFC-ZQIa2eI_ualbVbmEXpYf8wiClwA5dFi85I7E5nkIohgkzsVY0Ay03wHbsLHOXVgo69cIETaSnJ3YfeEzMLa0_HfoKkPGxECtwTOdrpio0doxpZR4x2Ag-Z6EmmjyFm6D4NJhy7XnoqjGK0QoYVFoXxeUqcOYFybvaJs",
  },
  {
    name: "lavanda",
    title: "Lavanda",
    tag: "Bruma de Lavanda",
    notes: "Bergamota, Eucalipto",
    color: "#006970",
    border: "#006970",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuB3mlHhx4jhHYHC-KFgzjIUQoLeqf1K1qvCpQ_e5bJoPpXq8reBD_xwqI0vcTt4mPU8IaKCLSZaXpga_Zqw33rvr8l-g4sf0P-R6VkIs4S692dVuA1uLCVJPgnnEj9GWwjmKntYsaW2PJ3mZ5xYIkanVV2mcFjZGhqvIvfpq8ESNsYcpceV0y110vvhweLNm8Ew5qkSq9rXEMPVvzAKM43jP1J3QBNkQNt7WqSlOaHN-erXeMwS2_QpbozTT-oJoj9KMssb5_eoQ9k",
  },
  {
    name: "canela",
    title: "Canela",
    tag: "Especia de Canela",
    notes: "Anís, Jengibre",
    color: "#a900a9",
    border: "#a900a9",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDXBTVbDxOdQiNRZkW2Yvk0RaFXdo8CM8Hx1M8i-54vGuA54Q9SAOgx4sou3spPwhTX7W11bHjiiaFnbU3y2v87mK8WCDpzS7EFxnIE-RXn8Lp__NhFwerEDvicyeLhQdf0QceAjO0EZ-qJGotBoTu3Ve45NcHypj30NbKVXRbWoumbrXvIrvGpBHx2NtzzDnMN9dAuoJbAAKuJHoovN_1M4ldeZuO28O3shBBP28Vg6DUQn28lBfgqJ-Al_44X9L4M77-X52Jeoag",
  },
];

const galleryImages = {
  large: "https://lh3.googleusercontent.com/aida-public/AB6AXuBFUccY-I-zAX658FpN4zvMvF6g6_UPjm-cberpbXvmF2xFHPi4Dl9Z516bQgNSOpKptDxrvrRTHVvN5nTT5J7rD13NOCdOXLvLlWnDOxDv6SxGeaOaXg6gbvsG7Q8mHRLQhmTj279kKaqDAG22VuS8-CsfsOwePIQVBRwa0VfZ5EWsZ3_00Af6pRVzm02AzegV7WaGO0MIYHXGpWWCvIZe640KtYkl7DdED03oToLTfLUTzIKUgZnhPIZ5ctqCWUAoBAjo9hqs52A",
  lavender: "https://lh3.googleusercontent.com/aida-public/AB6AXuAjQJ0ANoc4GDboR1n51yM8NZ2LVnA_Zw7QdBio3jIa2uv98qNKjpLwqoxEXgJkWPLYF1lDQR_zWJgrTK2CPYmf-u4IQjaCVk9OVbPyRstlz_fB7ds8WbjQcqoeOvjAxzRhv4w2JeG_HjvTi3Ub-_6ZE7WRJwYTZaEJsPb-Z-uhu4-4p6AJ8Fo7FjYaKKLeVIWSklmyCzNq_i2K7tVoCDmXv2dL7QLwDp8dgtAzndWl17Y5AtVcXniyKzArNSp7BsxcgNxeTQC0wis",
  vanilla: "https://lh3.googleusercontent.com/aida-public/AB6AXuDx8CfFTFBdlF5DCXilB2lOX_RFZza4oLEptasdy0pXamezmRTOAmL4m9cykh3B2hSeHhvQAPQlVHsEJDNdWyahxqBhTE1Y90KvBJP-4pUK1QdLGaOxf8xRRCDKvMH2RFbtfybLnMizKjb6OFv9p0fJwdH9kyZ5TiPAplgpoyTXbQV13Z-otjpbxCv_v4oKeTTswWzlP0dStOQ-JkcFoGZDxoX6fLtXG7RcPj-UDKiLop33xFZpBiTqvyMTg0eojGS7w5pDHyLJaz4",
  cinnamon: "https://lh3.googleusercontent.com/aida-public/AB6AXuB9clL38cAb-WmLBii1hysg59-BqwF5WKK60_wLA5rikKU2B1xDckbS_8IDeaNciKiuGjAQ_cGkTd8XBTbhp7Td9zACduCVwhH-vwGwZgvNTlvEimZ0nQS1i71lv3gKge6Ua4NKcvpeImPQMV7VI-87x2DdYYPKDmATa5nFFtWF1mcYB_V0tg0SMns919Oq9Q65lzi53gAKrrR-TNFoZciXkVYYKWEWPekFAuFcLVoseG6u77zeKfa29Fwdmha2hEqOUkZEQLnbKkA",
};

const specs = [
  { label: "Cera de Soja 100% Natural", value: "Base ecológica de combustión limpia" },
  { label: "Vertido a Mano en Estudios", value: "Precisión artesanal en pequeños lotes" },
  { label: "Infusionado con Aceites Esenciales", value: "Pureza en cada molécula" },
  { label: "Mecha de Algodón", value: "Arquitectura de llama consistente" },
];
