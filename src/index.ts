#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MoneybirdClient } from './services/moneybird.js';
import dotenv from 'dotenv';
import { isMoneybirdError, MoneybirdRateLimitError, MoneybirdReadOnlyError } from './common/errors.js';
import { parseReadOnly } from './common/config.js';
import { VERSION } from './common/version.js';

dotenv.config();

const requiredEnvVars = ['MONEYBIRD_API_TOKEN', 'MONEYBIRD_ADMINISTRATION_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

let readOnly: boolean;
try {
  readOnly = parseReadOnly(process.env.MONEYBIRD_READ_ONLY);
} catch (error: any) {
  console.error(error.message);
  process.exit(1);
}

const moneybirdClient = new MoneybirdClient(
  process.env.MONEYBIRD_API_TOKEN!,
  process.env.MONEYBIRD_ADMINISTRATION_ID!,
  {
    baseURL: process.env.MONEYBIRD_API_BASE_URL || undefined,
    readOnly,
  }
);

const REQUEST_METHODS = ['get', 'post', 'put', 'delete'] as const;
type RequestMethod = typeof REQUEST_METHODS[number];
const ALLOWED_METHODS: readonly RequestMethod[] = readOnly ? ['get'] : REQUEST_METHODS;

// Entity types and their API paths
const LIST_ENTITIES: Record<string, { path: string; supportsPagination: boolean }> = {
  contacts:                  { path: 'contacts',                  supportsPagination: true },
  sales_invoices:            { path: 'sales_invoices',            supportsPagination: true },
  estimates:                 { path: 'estimates',                 supportsPagination: true },
  recurring_sales_invoices:  { path: 'recurring_sales_invoices',  supportsPagination: true },
  products:                  { path: 'products',                  supportsPagination: true },
  projects:                  { path: 'projects',                  supportsPagination: true },
  time_entries:              { path: 'time_entries',              supportsPagination: true },
  financial_accounts:        { path: 'financial_accounts',        supportsPagination: false },
  ledger_accounts:           { path: 'ledger_accounts',           supportsPagination: false },
};

const GET_ENTITIES: Record<string, string> = {
  contact:                  'contacts',
  sales_invoice:            'sales_invoices',
  estimate:                 'estimates',
  recurring_sales_invoice:  'recurring_sales_invoices',
  product:                  'products',
  project:                  'projects',
  time_entry:               'time_entries',
  ledger_account:           'ledger_accounts',
};

const server = new Server({
  name: 'moneybird-mcp-server',
  version: `v${VERSION.toString()}`,
}, {
  capabilities: {
    tools: {},
  },
});

function formatError(error: any): string {
  if (error instanceof MoneybirdReadOnlyError) {
    return error.message;
  }
  if (error instanceof MoneybirdRateLimitError) {
    let msg = `Rate limit exceeded: ${error.message}`;
    if (error.resetAt) msg += ` (resets at ${error.resetAt.toISOString()})`;
    return msg;
  }
  if (isMoneybirdError(error)) {
    let msg = `Moneybird API error: ${error.message}`;
    if ((error as any).response?.status) msg += ` (${(error as any).response.status})`;
    return msg;
  }
  return error.message || String(error);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "moneybird_list",
        description: "List entities from Moneybird. Entities: contacts, sales_invoices, estimates, recurring_sales_invoices, products, projects, time_entries, financial_accounts, ledger_accounts. Use filter for server-side filtering (e.g. state:open, period:this_month, contact_id:123).",
        inputSchema: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              enum: Object.keys(LIST_ENTITIES),
              description: "Entity type to list"
            },
            page: { type: "number", description: "Page number" },
            per_page: { type: "number", description: "Items per page" },
            query: { type: "string", description: "Search term (contacts, products, time_entries)" },
            filter: { type: "string", description: "Server-side filter as property:value (e.g. state:open, period:this_month)" },
          },
          required: ["entity"],
        }
      },
      {
        name: "moneybird_get",
        description: "Get a single entity by ID from Moneybird.",
        inputSchema: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              enum: Object.keys(GET_ENTITIES),
              description: "Entity type"
            },
            id: { type: "string", description: "Entity ID" },
          },
          required: ["entity", "id"],
        }
      },
      {
        name: "moneybird_request",
        description: (readOnly
          ? "Read-only mode: only GET is allowed, writes are refused. "
          : "DELETE requires confirm: true; ask the user before deleting. ")
          + "Make a custom Moneybird API request. Common paths: contacts, sales_invoices, estimates, recurring_sales_invoices, documents/purchase_invoices, documents/receipts, financial_accounts, financial_mutations, ledger_accounts, products, projects, time_entries, tax_rates, subscriptions, webhooks. See https://developer.moneybird.com for full docs.",
        inputSchema: {
          type: "object",
          properties: {
            method: {
              type: "string",
              enum: [...ALLOWED_METHODS],
              description: "HTTP method"
            },
            path: { type: "string", description: "API path (e.g. contacts, sales_invoices/{id}/send_invoice)" },
            data: { description: "Request body for POST/PUT" },
            ...(readOnly ? {} : {
              confirm: {
                type: "boolean",
                description: "Must be true for DELETE. Set it only after the user has approved this deletion."
              }
            }),
          },
          required: ["method", "path"],
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "moneybird_list": {
        const { entity, page, per_page, query, filter } = args as {
          entity: string;
          page?: number;
          per_page?: number;
          query?: string;
          filter?: string;
        };

        const entityConfig = LIST_ENTITIES[entity];
        if (!entityConfig) {
          return { content: [{ type: "text", text: `Unknown entity: ${entity}` }], isError: true };
        }

        // Build query parameters based on what the API supports
        const params: Record<string, string> = {};
        if (entityConfig.supportsPagination) {
          if (page) params.page = String(page);
          if (per_page) params.per_page = String(per_page);
        }
        if (filter) params.filter = filter;
        if (query) params.query = query;

        const queryString = new URLSearchParams(params).toString();
        const path = queryString ? `${entityConfig.path}?${queryString}` : entityConfig.path;

        const data = await moneybirdClient.request('get', path);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "moneybird_get": {
        const { entity, id } = args as { entity: string; id: string };
        const basePath = GET_ENTITIES[entity];
        if (!basePath) {
          return { content: [{ type: "text", text: `Unknown entity: ${entity}` }], isError: true };
        }
        const result = await moneybirdClient.request('get', `${basePath}/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "moneybird_request": {
        const { method: rawMethod, path, data, confirm } = args as {
          method: string;
          path: string;
          data?: any;
          confirm?: unknown;
        };
        const method = String(rawMethod).toLowerCase() as RequestMethod;
        if (readOnly && method !== 'get') {
          return { content: [{ type: "text", text: new MoneybirdReadOnlyError(method, path).message }], isError: true };
        }
        if (!REQUEST_METHODS.includes(method)) {
          return { content: [{ type: "text", text: `Unsupported method: ${rawMethod}. Use one of: ${ALLOWED_METHODS.join(', ')}` }], isError: true };
        }
        // Only the boolean true counts: a model that sends "true" or 1 has not
        // used the field as documented, and a deletion cannot be undone.
        if (method === 'delete' && confirm !== true) {
          return { content: [{ type: "text", text: `Refused DELETE ${path}: deletions need confirm: true. Ask the user to approve this deletion, then repeat the call with confirm: true.` }], isError: true };
        }
        let processedData = data;
        if (typeof data === 'string') {
          try { processedData = JSON.parse(data); } catch { /* keep as-is */ }
        }
        const result = await moneybirdClient.request(method, path, processedData);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: formatError(error) }],
      isError: true
    };
  }
});

async function runServer() {
  console.error(`Starting Moneybird MCP Server v${VERSION.toString()}...`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Server running.");

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

runServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
