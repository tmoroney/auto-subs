// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// The site is published to GitHub Pages from the `website-dev` branch of
// tmoroney/auto-subs, so it is served from the /auto-subs sub-path.
export default defineConfig({
  site: 'https://tmoroney.github.io',
  base: '/auto-subs',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
