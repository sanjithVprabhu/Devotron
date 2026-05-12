import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        veda: {
          bg: '#0b0c10',
          surface: '#16181d',
          ink: '#f5f6f8',
          accent: '#7aed8a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
