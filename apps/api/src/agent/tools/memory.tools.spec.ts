import { BadRequestException } from '@nestjs/common';
import { sampleAgentConfig } from '../../agent-config/sample-config';
import { AgentConfigService } from '../../agent-config/agent-config.service';
import { loadSampleConfig } from '../../agent-config/sample-config';
import { createForgetMemoryTool } from './forget-memory.tool';
import { createSaveMemoryTool } from './save-memory.tool';

const store = () => ({
  save: jest.fn().mockResolvedValue({ memory: { id: 'abcdef12-0000' }, created: true }),
  findByRef: jest.fn(),
  remove: jest.fn().mockResolvedValue(undefined),
});

const ctx = (memoryStore: unknown, config = sampleAgentConfig()) =>
  ({ memoryStore, config, ownerSub: 'u1', sessionId: 's1' }) as never;

const disabled = () => {
  const c = loadSampleConfig();
  c.settings.memory.enabled = false;
  return new AgentConfigService(c);
};

describe('saveMemory', () => {
  it('saves for the context owner and session, never from arguments', async () => {
    const m = store();
    const t = createSaveMemoryTool(ctx(m));
    const out = JSON.parse(await t.invoke({ content: 'Usually the Admin Building' }));
    expect(out).toEqual({ success: true, id: 'abcdef12', alreadyKnown: false });
    expect(m.save).toHaveBeenCalledWith('u1', 'Usually the Admin Building', 's1');
    expect(Object.keys((t.schema as { shape: object }).shape)).toEqual(['content']);
  });

  it('reports a duplicate as success', async () => {
    const m = store();
    m.save.mockResolvedValue({ memory: { id: 'abcdef12-0000' }, created: false });
    const out = JSON.parse(await createSaveMemoryTool(ctx(m)).invoke({ content: 'x' }));
    expect(out).toMatchObject({ success: true, alreadyKnown: true });
  });

  it('returns invalid content as an error result', async () => {
    const m = store();
    m.save.mockRejectedValue(new BadRequestException('memory content is empty'));
    const out = JSON.parse(await createSaveMemoryTool(ctx(m)).invoke({ content: ' ' }));
    expect(out).toEqual({ success: false, error: 'memory content is empty' });
  });

  it('writes nothing when memory is disabled', async () => {
    const m = store();
    const out = JSON.parse(await createSaveMemoryTool(ctx(m, disabled())).invoke({ content: 'x' }));
    expect(out).toEqual({ success: false, error: 'memory is disabled' });
    expect(m.save).not.toHaveBeenCalled();
  });
});

describe('forgetMemory', () => {
  it('deletes the owner memory found by its short id', async () => {
    const m = store();
    m.findByRef.mockResolvedValue({ id: 'abcdef12-0000-4000' });
    const t = createForgetMemoryTool(ctx(m));
    expect(JSON.parse(await t.invoke({ id: 'abcdef12' }))).toEqual({ success: true });
    expect(m.findByRef).toHaveBeenCalledWith('u1', 'abcdef12');
    expect(m.remove).toHaveBeenCalledWith('u1', 'abcdef12-0000-4000');
    expect(Object.keys((t.schema as { shape: object }).shape)).toEqual(['id']);
  });

  it('fails for an id that is not the owner memory', async () => {
    const m = store();
    m.findByRef.mockResolvedValue(undefined);
    const out = JSON.parse(await createForgetMemoryTool(ctx(m)).invoke({ id: 'bbbbbbbb' }));
    expect(out).toEqual({ success: false, error: 'no such memory' });
    expect(m.remove).not.toHaveBeenCalled();
  });

  it('does nothing when memory is disabled', async () => {
    const m = store();
    const out = JSON.parse(await createForgetMemoryTool(ctx(m, disabled())).invoke({ id: 'x' }));
    expect(out.success).toBe(false);
    expect(m.findByRef).not.toHaveBeenCalled();
  });
});
