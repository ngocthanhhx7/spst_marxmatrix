import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const compilerCommand = isWindows ? 'cmd.exe' : 'pnpm';
const compilerArgs = isWindows
  ? ['/d', '/s', '/c', 'pnpm exec nest build --watch']
  : ['exec', 'nest', 'build', '--watch'];
let server;
let restartTimer;
let restartInProgress = false;
let restartPending = false;
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[api-dev] ${message}\n`);
}

function stopServer() {
  const current = server;
  if (current === undefined || current.exitCode !== null || current.signalCode !== null) {
    if (server === current) server = undefined;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onExit = () => {
      current.removeListener('exit', onExit);
      if (server === current) server = undefined;
      resolve();
    };
    current.once('exit', onExit);
    terminateServerProcess(current);
    setTimeout(() => {
      if (current.exitCode === null && current.signalCode === null)
        terminateServerProcess(current, true);
    }, 2_000).unref();
  });
}

function terminateServerProcess(child, force = false) {
  if (isWindows && child.pid !== undefined) {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    killer.once('error', () => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill(force ? 'SIGKILL' : undefined);
    });
    return;
  }
  child.kill(force ? 'SIGKILL' : undefined);
}

function startServer() {
  if (shuttingDown) return;
  log('starting Nest server from dist/main.js');
  server = spawn(process.execPath, ['--enable-source-maps', 'dist/main.js'], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit'
  });
  server.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0 && signal === null) {
      log(`server exited with code ${code}`);
      setTimeout(() => void restartServer(), 300).unref();
    }
  });
}

async function restartServer() {
  restartPending = true;
  if (restartInProgress) return;
  restartInProgress = true;
  try {
    while (restartPending && !shuttingDown) {
      restartPending = false;
      await stopServer();
      startServer();
    }
  } finally {
    restartInProgress = false;
  }
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => void restartServer(), 150);
}

function handleCompilerOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  if (/Found 0 errors?/i.test(text)) {
    scheduleRestart();
  }
}

const compiler = spawn(compilerCommand, compilerArgs, {
  cwd: apiRoot,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe']
});

compiler.stdout.on('data', handleCompilerOutput);
compiler.stderr.on('data', handleCompilerOutput);
compiler.on('exit', (code, signal) => {
  if (!shuttingDown) {
    log(`compiler exited${signal === null ? ` with code ${code}` : ` from ${signal}`}`);
  }
  void stopServer();
  process.exitCode = code ?? 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    clearTimeout(restartTimer);
    stopServer();
    compiler.kill();
  });
}
