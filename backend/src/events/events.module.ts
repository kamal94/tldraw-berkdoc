import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { QueueConsumerService } from './queue-consumer.service';

/**
 * Global EventBus module. Exposes EventBusService for publishing domain events
 * (in-process or Cloudflare Queue, selected by env) and runs the queue consumer
 * when queue mode is active. Relies on EventEmitterModule.forRoot() and the
 * global ConfigModule registered in AppModule.
 */
@Global()
@Module({
  providers: [EventBusService, QueueConsumerService],
  exports: [EventBusService],
})
export class EventsModule {}
