import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnvironment } from './env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile:
        process.env['MARXMATRIX_SKIP_ENV_FILE'] === 'true' || process.env['NODE_ENV'] === 'test',
      validate: (input: Record<string, string | undefined>) => parseEnvironment(input)
    })
  ]
})
export class ApplicationConfigModule {}
