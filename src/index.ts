#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MoneybirdClient } from './services/moneybird.js';
import dotenv from 'dotenv';
import { z } from 'zod';
import { isMoneybirdError, MoneybirdRateLimitError } from './common/errors.js';
import { VERSION } from './common/version.js';
import { listContacts } from './operations/contacts.js';
import type { MoneybirdContact } from './operations/contacts.js';
import type { MoneybirdInvoice } from './operations/invoices.js';

dotenv.config();

const requiredEnvVars = ['MONEYBIRD_API_TOKEN', 'MONEYBIRD_ADMINISTRATION_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const moneybirdClient = new MoneybirdClient(
  process.env.MONEYBIRD_API_TOKEN!,
  process.env.MONEYBIRD_ADMINISTRATION_ID!
);

const ENTITY_TYPES = ['contacts', 'sales_invoices', 'financial_accounts', 'products', 'projects', 'time_entries'] as const;
type EntityType = typeof ENTITY_TYPES[number];

const server = new Server({
  name: 'moneybird-mcp-server',
  version: `v${VERSION.toString()}`,
}, {
  capabilities: {
    tools: {},
  },
});

function formatError(error: any): string {
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
        description: "List entities from Moneybird. Supports: contacts, sales_invoices, financial_accounts, products, projects, time_entries.",
        inputSchema: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              enum: ENTITY_TYPES,
              description: "Entity type to list"
            },
            page: { type: "number", description: "Page number" },
            per_page: { type: "number", description: "Items per page" },
            query: { type: "string", description: "Search term (contacts only)" },
            filter: { type: "string", description: "Filter as property:value (contacts only)" },
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
              enum: ["contact", "sales_invoice"],
              description: "Entity type"
            },
            id: { type: "string", description: "Entity ID" },
          },
          required: ["entity", "id"],
        }
      },
      {
        name: "moneybird_request",
        description: "Make a custom Moneybird API request. Common paths: contacts, sales_invoices, estimates, recurring_sales_invoices, documents/purchase_invoices, documents/receipts, financial_accounts, financial_mutations, ledger_accounts, products, projects, time_entries, tax_rates, subscriptions, webhooks. See https://developer.moneybird.com for full docs.",
        inputSchema: {
          type: "object",
          properties: {
            method: {
              type: "string",
              enum: ["get", "post", "put", "delete"],
              description: "HTTP method"
            },
            path: { type: "string", description: "API path (e.g. contacts, sales_invoices, ledger_accounts)" },
            data: { description: "Request body for POST/PUT" }
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
          entity: EntityType;
          page?: number;
          per_page?: number;
          query?: string;
          filter?: string;
        };

        if (entity === 'contacts') {
          const result = await listContacts({
            page,
            perPage: per_page,
            query,
            filter,
          });
          const contacts = result.contacts;
          const formatted = contacts.map((c: MoneybirdContact) => ({
            id: c.id,
            company_name: c.company_name,
            firstname: c.firstname,
            lastname: c.lastname,
            email: c.email,
            phone: c.phone
          }));
          return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
        }

        if (entity === 'sales_invoices') {
          const invoices = await moneybirdClient.getSalesInvoices();
          const formatted = invoices.map((inv: MoneybirdInvoice) => ({
            id: inv.id,
            invoice_id: inv.invoice_id,
            contact_id: inv.contact_id,
            reference: inv.reference,
            state: inv.state,
            date: inv.date,
            due_date: inv.due_date,
            total_price_incl_tax: inv.total_price_incl_tax,
            currency: inv.currency,
            paid_at: inv.paid_at
          }));
          return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
        }

        // Generic list for other entity types
        const entityPathMap: Record<string, string> = {
          financial_accounts: 'financial_accounts',
          products: 'products',
          projects: 'projects',
          time_entries: 'time_entries',
        };
        const path = entityPathMap[entity];
        if (!path) {
          return { content: [{ type: "text", text: `Unknown entity: ${entity}` }], isError: true };
        }
        const data = await moneybirdClient.request('get', path);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "moneybird_get": {
        const { entity, id } = args as { entity: string; id: string };
        const pathMap: Record<string, string> = {
          contact: 'contacts',
          sales_invoice: 'sales_invoices',
        };
        const basePath = pathMap[entity];
        if (!basePath) {
          return { content: [{ type: "text", text: `Unknown entity: ${entity}` }], isError: true };
        }
        const result = await moneybirdClient.request('get', `${basePath}/${id}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "moneybird_request": {
        const { method, path, data } = args as {
          method: 'get' | 'post' | 'put' | 'delete';
          path: string;
          data?: any;
        };
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
