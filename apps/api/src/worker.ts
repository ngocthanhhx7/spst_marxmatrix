import { NestFactory } from '@nestjs/core';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { WorkerRunner } from './jobs/worker-runner.js';

export async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const runner = app.get(WorkerRunner);
  runner.start();
  await new Promise<void>((resolveShutdown) => {
    process.once('SIGINT', resolveShutdown);
    process.once('SIGTERM', resolveShutdown);
  });
  await runner.stop();
  await app.close();
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url)) {
  void bootstrapWorker().catch(() => {
    // Never include job payloads, document data, or configuration values in startup diagnostics.
    console.error('Worker failed to start.');
    process.exitCode = 1;
  });
}
