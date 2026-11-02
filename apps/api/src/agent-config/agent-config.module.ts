import { Global, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
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
      inject: [SettingsService, DataSource],
      useFactory: async (settings: SettingsService, dataSource: DataSource) =>
        new AgentConfigService(
          await loadAgentConfig({
            env: settings.effective.agentConfig,
            store: new TypeOrmSnapshotStore(dataSource),
            knownLocalTools: LOCAL_TOOL_NAMES,
          }),
        ),
    },
  ],
  exports: [AgentConfigService],
})
export class AgentConfigModule {}
