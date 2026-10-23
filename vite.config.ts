import { type Plugin, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** D22: fetch the skill generator chunk with the first load, so the skill pane also works offline. */
const preloadSkill = (): Plugin => ({
  name: 'spec2skill:preload-skill-chunk',
  transformIndexHtml: {
    order: 'post',
    handler: (_html, { bundle }) => {
      const chunk = Object.values(bundle ?? {}).find((c) => c.type === 'chunk' && c.isDynamicEntry && c.name === 'skill');
      return chunk ? [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `/${chunk.fileName}` }, injectTo: 'head' }] : [];
    },
  },
});

export default defineConfig({
  plugins: [react(), preloadSkill()],
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
});
