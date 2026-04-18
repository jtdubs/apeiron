/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';
import type { Plugin } from 'vite';

function watchRustMath(): Plugin {
  return {
    name: 'watch-rust-math',
    configureServer(server) {
      server.watcher.add('rust-math/src/**/*.rs');
      server.watcher.add('scripts/compileLayoutSchema.js');
      server.watcher.add('scripts/bundleShaders.js');
      server.watcher.add('src/engine/shaders/**/*.wgsl');

      let isBuilding = false;
      let pendingBuild = false;

      const buildMath = () => {
        if (isBuilding) {
          pendingBuild = true;
          return;
        }
        isBuilding = true;
        console.log('\n[\x1b[36mrust-math\x1b[0m] Compiling...');

        const child = spawn('npm', ['run', 'build:deps'], {
          stdio: 'inherit',
          shell: true,
        });

        child.on('close', (code) => {
          isBuilding = false;
          if (code === 0) {
            console.log('[\x1b[32mrust-math\x1b[0m] Build successful.\n');
            server.ws.send({ type: 'full-reload' });
          } else {
            console.error(`[\x1b[31mrust-math\x1b[0m] Build failed with code ${code}\n`);
          }

          if (pendingBuild) {
            pendingBuild = false;
            buildMath();
          }
        });
      };

      // Perform an initial build when the watcher starts
      buildMath();

      server.watcher.on('change', (file) => {
        if (
          file.includes('rust-math/src/') ||
          file.includes('compileLayoutSchema.js') ||
          file.includes('bundleShaders.js') ||
          file.endsWith('.wgsl')
        ) {
          if (!file.includes('.bundled.wgsl')) {
            buildMath();
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: mode === 'test' ? [react()] : [react(), watchRustMath()],
  base: '/apeiron/',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}));
