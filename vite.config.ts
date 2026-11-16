import { defineConfig } from 'vite';
export default defineConfig(({mode})=>({
  build:{outDir:mode==='preview'?'dist-preview':'dist-web',emptyOutDir:true,
    rollupOptions:mode==='preview'?{input:'preview.html'}:undefined},
  server:{port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:3000','/auth':'http://127.0.0.1:3000'}},
  esbuild:{jsx:'transform'}
}));
