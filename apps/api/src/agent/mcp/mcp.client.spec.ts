const getTools = jest.fn();
const close = jest.fn().mockResolvedValue(undefined);
const ctor = jest.fn();
jest.mock('@langchain/mcp-adapters', () => ({
  MultiServerMCPClient: class {
    constructor(cfg: unknown) {
      ctor(cfg);
    }
    getTools = getTools;
    close = close;
  },
}));

import { connectMcp } from './mcp.client';

describe('connectMcp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('contacts nothing without a token', async () => {
    const c = await connectMcp({ user: 'https://u' }, undefined);
    expect(c.tools).toEqual([]);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('contacts nothing without servers', async () => {
    await connectMcp({}, 'jwt');
    expect(ctor).not.toHaveBeenCalled();
  });

  it('forwards the token and prefixes tool names', async () => {
    getTools.mockResolvedValue([]);
    await connectMcp({ user: 'https://u', asset: 'https://a' }, 'jwt');
    const cfg = ctor.mock.calls[0][0];
    expect(cfg.prefixToolNameWithServerName).toBe(true);
    expect(cfg.mcpServers.user).toMatchObject({
      url: 'https://u',
      headers: { Authorization: 'Bearer jwt' },
    });
    expect(Object.keys(cfg.mcpServers)).toEqual(['user', 'asset']);
  });

  it('keeps the tools of the other servers when one fails', async () => {
    getTools.mockImplementation(async (name: string) => {
      if (name === 'asset') throw new Error('401');
      return [{ name: `${name}__t` }];
    });
    const c = await connectMcp({ user: 'https://u', asset: 'https://a' }, 'jwt');
    expect(c.tools).toEqual([{ name: 'user__t' }]);
    expect(c.toolsByServer).toEqual({ user: [{ name: 'user__t' }], asset: [] });
    await c.close();
    expect(close).toHaveBeenCalled();
  });
});
