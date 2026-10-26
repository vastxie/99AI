import { AGENT_EVENT_FIXTURE } from '../../../../../packages/contracts/fixtures/agent-events.fixture';
import type { AgentEvent } from '@99agent/contracts';
import {
  projectInternalAgentEventToPublic,
  sanitizeAgentEventForFrontend,
} from './agent-public-event-projector';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('shared Agent Event wire contract', () => {
  const events: AgentEvent[] = AGENT_EVENT_FIXTURE.events.map(entry => entry.event);

  it.each(events)(
    'keeps the safe $type fixture byte-equivalent after projection',
    (event: AgentEvent) => {
      const before = JSON.stringify(event);
      const projected = sanitizeAgentEventForFrontend(event);
      expect(JSON.stringify(projected)).toBe(before);
    },
  );

  it('projects a real internal producer payload to a public safe tool event', () => {
    const fileId = 'file_contract_public_001';
    const projected = projectInternalAgentEventToPublic({
      type: 'tool.end',
      chatId: 42,
      toolCallId: 'tool-call-contract',
      timestamp: 1788051600099,
      data: {
        name: 'document_reader',
        status: 'success',
        display: {
          previewUrl: `/api/files/${fileId}/preview`,
          downloadUrl: `/api/files/${fileId}/download?token=private`,
          rawPayload: { secretKey: 'must-not-leak' },
        },
      },
      provider: {
        apiKey: 'must-not-leak',
        baseUrl: 'https://private-provider.example.test',
      },
    });
    const serialized = JSON.stringify(projected);

    expect(projected.type).toBe('tool.end');
    expect(projected.chatId).toBe('42');
    expect(serialized).toContain(fileId);
    expect(serialized).toContain('privatePreviewHidden');
    expect(serialized).toContain('privateDownloadHidden');
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('/api/files/');
    expect(serialized).not.toContain('private-provider');
  });
});
