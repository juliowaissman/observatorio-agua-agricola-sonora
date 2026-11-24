import { defineConfig } from 'astro/config';

// Publicado en GitHub Pages: https://juliowaissman.github.io/observatorio-agua-agricola-sonora/
export default defineConfig({
  site: 'https://juliowaissman.github.io',
  base: '/observatorio-agua-agricola-sonora',
  trailingSlash: 'always',
  redirects: { '/metodologia/': '/observatorio-agua-agricola-sonora/documentos/' },
});
