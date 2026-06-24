import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", ...fontFamily.sans],
      },
      colors: {
        clinical: {
          navy: "#1E3A5F",
          blue: "#1d4f7a",
          line: "#d7dee8",
          mist: "#f7fafc"
        }
      }
    }
  },
  plugins: []
};

export default config;
