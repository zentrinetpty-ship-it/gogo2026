/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1080px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        /* The brand pair. The accent is a CSS variable rather than a literal so
           the same components can be re-skinned by overriding one value — which
           is exactly what /lv does with the Louis Vuitton orange. `deep` is the
           text-safe shade on white, `wash` the tint. */
        lime: {
          DEFAULT: "rgb(var(--gogo-accent) / <alpha-value>)",
          deep: "rgb(var(--gogo-accent-deep) / <alpha-value>)",
          wash: "rgb(var(--gogo-accent) / 0.14)",
        },
        /* #1A1A1A is the deep brown-black, not pure black: it reads warm beside
           the lime, where #000 reads dead. `ink` stays the default text colour. */
        ink: { DEFAULT: "#1A1A1A", soft: "#2A2A2E", mute: "#6B7280" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "999px",
      },
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        /* the header face: self-hosted Anton, falling back to Poppins */
        display: ["Anton", "Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        lift: "0 24px 60px -34px rgba(11,11,11,.45)",
        soft: "0 10px 30px -18px rgba(11,11,11,.35)",
        glow: "0 0 0 1px rgba(141,182,0,.35), 0 18px 50px -22px rgba(141,182,0,.55)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(14px)" }, "100%": { opacity: "1", transform: "none" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        pulseRing: { "0%": { transform: "scale(.85)", opacity: ".7" }, "100%": { transform: "scale(1.9)", opacity: "0" } },
      },
      animation: {
        "fade-up": "fade-up .6s cubic-bezier(.2,.8,.2,1) both",
        marquee: "marquee 38s linear infinite",
        "pulse-ring": "pulseRing 2.4s cubic-bezier(.2,.8,.2,1) infinite",
      },
    },
  },
  plugins: [],
};
