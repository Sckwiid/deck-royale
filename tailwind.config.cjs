/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tactical: {
          950: "#070b14",
          900: "#0b1222",
          800: "#101a33",
          cyan: "#38f6ff",
          violet: "#9768ff",
          gold: "#ffce52"
        }
      },
      fontFamily: {
        display: ["Rajdhani", "ui-sans-serif", "system-ui"],
        body: ["Manrope", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        glass: "0 0 0 1px rgba(255,255,255,0.06), 0 20px 45px rgba(3,7,17,0.6)",
        glow: "0 0 24px rgba(56,246,255,0.22)"
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.7" }
        }
      },
      animation: {
        scanline: "scanline 3.8s linear infinite",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
