const { spawn } = require('child_process');
const http = require('http');

// Start Vite dev server
const vite = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});

vite.on('error', (err) => {
  console.error('Failed to start Vite:', err);
  process.exit(1);
});

// Wait for Vite to be ready, then start Electron
function waitForServer(url, retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry(attempt);
        }
      }).on('error', () => retry(attempt));
    };

    const retry = (attempt) => {
      if (attempt >= retries) {
        reject(new Error(`Server at ${url} not ready after ${retries} attempts`));
      } else {
        setTimeout(() => check(attempt + 1), 1000);
      }
    };

    check(0);
  });
}

const devUrl = 'http://localhost:5173';

waitForServer(devUrl)
  .then(() => {
    console.log('Vite is ready, starting Electron...');
    const electron = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, VITE_DEV_SERVER_URL: devUrl },
    });

    electron.on('close', () => {
      vite.kill();
      process.exit();
    });
  })
  .catch((err) => {
    console.error(err);
    vite.kill();
    process.exit(1);
  });
