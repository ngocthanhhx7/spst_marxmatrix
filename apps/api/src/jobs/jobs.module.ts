import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobService } from './jobs.service.js';
import { Job, JobSchema } from './schemas/job.schema.js';
import {
  createWorkerInstanceId,
  JobHandlerRegistry,
  WorkerRunner,
  WORKER_HEARTBEAT_MS,
  WORKER_ID
} from './worker-runner.js';

/** Queue persistence module; consumers import this without coupling to workers. */
@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }])],
  providers: [
    JobService,
    JobHandlerRegistry,
    { provide: WORKER_ID, useFactory: createWorkerInstanceId },
    { provide: WORKER_HEARTBEAT_MS, useValue: 10_000 },
    WorkerRunner
  ],
  exports: [JobService, JobHandlerRegistry, WorkerRunner]
})
export class JobsModule {}
