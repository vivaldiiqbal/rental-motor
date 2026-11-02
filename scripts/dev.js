import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.resolve(rootDir, 'backend');

/**
 * Periksa apakah port TCP sedang digunakan
 */
function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(600);

    socket.on('connect', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(true);
      }
    });

    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on('error', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

async function main() {
  console.log('[RODAKITA DEV] Memeriksa status port 5001 (Backend) & port 5173 (Frontend)...');

  const backendRunning = await isPortOpen(5001);
  let backendProc = null;

  if (backendRunning) {
    console.log('[RODAKITA DEV] ✓ Backend server sudah aktif di http://localhost:5001');
  } else {
    console.log('[RODAKITA DEV] → Memulai Backend REST API di http://localhost:5001...');
    backendProc = spawn('node', ['server.js'], {
      cwd: backendDir,
      stdio: 'inherit',
      env: { ...process.env, PORT: '5001', NODE_ENV: 'development' },
    });

    backendProc.on('error', (err) => {
      console.error('[RODAKITA DEV] Gagal memulai backend server:', err.message);
    });
  }

  const frontendRunning = await isPortOpen(5173);
  let viteProc = null;

  if (frontendRunning) {
    console.log('[RODAKITA DEV] ✓ Vite frontend sudah aktif di http://localhost:5173');
  } else {
    console.log('[RODAKITA DEV] → Memulai Vite Dev Server di http://localhost:5173...');
    viteProc = spawn('npx', ['vite'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });

    viteProc.on('error', (err) => {
      console.error('[RODAKITA DEV] Gagal memulai Vite frontend:', err.message);
    });
  }

  const cleanup = () => {
    console.log('\n[RODAKITA DEV] Menghentikan dev server...');
    if (backendProc) {
      try {
        backendProc.kill('SIGINT');
      } catch {
        /* ignore */
      }
    }
    if (viteProc) {
      try {
        viteProc.kill('SIGINT');
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('[RODAKITA DEV] Error:', err);
  process.exit(1);
});
