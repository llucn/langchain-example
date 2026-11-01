import { Global, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_ENV, type AppEnv } from '../config/env';
import { LOCAL_TOOL_NAMES } from '../agent/tools';
import { loadAgentConfig } from './agent-config.loader';
import { AgentConfigService } from './agent-config.service';
import { TypeOrmSnapshotStore } from './snapshot.store';

/** Loads the Agent Config during bootstrap: the app only starts listening once it is available. */
@Global()
@Module({
  providers: [
    {
      provide: AgentConfigService,
      inject: [APP_ENV, DataSource],
      useFactory: async (env: AppEnv, dataSource: DataSource) =>
        new AgentConfigService(
          await loadAgentConfig({
            env: env.agentConfig,
            store: new TypeOrmSnapshotStore(dataSource),
            knownLocalTools: LOCAL_TOOL_NAMES,
          }),
        ),
    },
  ],
  exports: [AgentConfigService],
})
export class AgentConfigModule {}
