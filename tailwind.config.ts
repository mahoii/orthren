import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
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
