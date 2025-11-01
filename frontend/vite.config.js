import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = env.VITE_DEV_SERVER_PORT ? Number(env.VITE_DEV_SERVER_PORT) : 5174;

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port,
    }
  };
});
