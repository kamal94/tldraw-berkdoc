import { Module } from "@nestjs/common";
import { LlmService } from "./llm.service";
import { LLM_PROVIDER } from "./llm.tokens.js";
import { createLlmProvider } from "./providers/provider.factory.js";

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      useFactory: createLlmProvider,
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}

