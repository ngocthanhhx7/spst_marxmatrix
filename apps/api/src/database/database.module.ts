import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Module, OnApplicationBootstrap, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Connection } from 'mongoose';

/**
 * Mongoose creates indexes asynchronously by default. Waiting for every model
 * index before the app accepts traffic keeps idempotency and ownership
 * constraints effective for the very first requests after a restart.
 */
@Injectable()
export class DatabaseIndexService implements OnApplicationBootstrap {
  private ready: Promise<void> | undefined;

  public constructor(@InjectConnection() private readonly connection: Connection) {}

  public async onApplicationBootstrap(): Promise<void> {
    this.ready ??= Promise.all(
      this.connection.modelNames().map((name) => this.connection.model(name).createIndexes())
    ).then(() => undefined);
    await this.ready;
  }
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        dbName: config.getOrThrow<string>('MONGODB_DB_NAME')
      })
    })
  ],
  providers: [DatabaseIndexService],
  exports: [MongooseModule, DatabaseIndexService]
})
export class DatabaseModule {}
