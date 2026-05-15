#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { KANBOTS_TOOLS } from './index.js';
import { requireCloudAuth } from './auth.js';

// Cloud-only launch: refuse to start without a signed-in kanbots session,
// independent of the bridge env vars below. Defense-in-depth so the MCP
// server cannot be wired up to a stale bridge or spoofed endpoint.
await requireCloudAuth();

const BRIDGE_URL = process.env.KANBOTS_TOOL_BRIDGE_URL;
const BRIDGE_TOKEN = process.env.KANBOTS_TOOL_BRIDGE_TOKEN;

if (!BRIDGE_URL || !BRIDGE_TOKEN) {
  process.stderr.write(
    '[kanbots-mcp] KANBOTS_TOOL_BRIDGE_URL and KANBOTS_TOOL_BRIDGE_TOKEN env vars are required\n',
  );
  process.exit(1);
}

async function callBridge(name: string, args: unknown): Promise<unknown> {
  const response = await fetch(`${BRIDGE_URL}/tool/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // not JSON
    }
    throw new Error(message || `tool bridge returned ${response.status}`);
  }
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const server = new Server(
  { name: 'kanbots', version: '0.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({ tools: KANBOTS_TOOLS as unknown as never[] }),
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await callBridge(name, args);
    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
    };
  }
});

const transport = new StdioServerTransport();
server
  .connect(transport)
  .catch((err: unknown) => {
    process.stderr.write(
      `[kanbots-mcp] failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
