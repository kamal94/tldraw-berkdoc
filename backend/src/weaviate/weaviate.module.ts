import { Module, Global } from '@nestjs/common';
import { WeaviateService } from './weaviate.service';

@Global()
@Module({
  providers: [WeaviateService],
  exports: [WeaviateService],
})
export class WeaviateModule {}

