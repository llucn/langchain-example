import type { AgentConfigService } from '../agent-config/agent-config.service';
import type { ConfigFiles } from '../agent-config/agent-config.types';
import { GitHubClient } from '../agent-config/github';
import { parseSource, readLocalConfig } from '../agent-config/source';
import type { AppEnv } from '../config/env';

/** The raw files of the config commit the API runs: the base every proposal is computed against. */
export class ConfigFilesProvider {
  constructor(
    private readonly env: AppEnv['agentConfig'],
    private readonly config: AgentConfigService,
    private readonly fetchGithub: (commit: string) => Promise<ConfigFiles> = (commit) =>
      this.defaultFetch(commit),
  ) {}

  private defaultFetch(commit: string): Promise<ConfigFiles> {
    const source = parseSource(this.env.source ?? '', this.env.githubApiUrl);
    if (source.kind !== 'github') throw new Error('The config source is not a GitHub repository');
    return new GitHubClient(source, { token: this.env.githubToken }).fetchFiles(commit);
  }

  async current(): Promise<ConfigFiles> {
    const source = parseSource(this.env.source ?? '', this.env.githubApiUrl);
    if (source.kind === 'local') {
      const { files, hash } = readLocalConfig(source.dir);
      if (hash !== this.config.hash) {
        throw new Error('The local config changed since the API started; restart the API first');
      }
      return files;
    }
    return this.fetchGithub(this.config.hash);
  }
}
