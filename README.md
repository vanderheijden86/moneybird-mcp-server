[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/vanderheijden86-moneybird-mcp-server-badge.png)](https://mseep.ai/app/vanderheijden86-moneybird-mcp-server)

# Moneybird MCP Server

A Model Context Protocol (MCP) server that connects AI assistants like Claude to [Moneybird](https://www.moneybird.com/) accounting software.

<a href="https://glama.ai/mcp/servers/@vanderheijden86/moneybird-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@vanderheijden86/moneybird-mcp-server/badge" alt="Moneybird Server MCP server" />
</a>

## Quick Start (Claude Desktop)

### Option 1: One-Click Install (.mcpb)

Download the latest `moneybird-mcp-server.mcpb` from [Releases](https://github.com/vanderheijden86/moneybird-mcp-server/releases) and double-click it. Claude Desktop will prompt you for your API token and administration ID — that's it.

### Option 2: npx

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "moneybird": {
      "command": "npx",
      "args": ["-y", "moneybird-mcp-server"],
      "env": {
        "MONEYBIRD_API_TOKEN": "your_api_token_here",
        "MONEYBIRD_ADMINISTRATION_ID": "your_administration_id_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Getting Your Credentials

1. **API Token**: Generate one at https://moneybird.com/user/applications
2. **Administration ID**: Found in the URL when logged in to Moneybird: `https://moneybird.com/<YOUR_ID>/`

## Features

- **Contact Management** — List, retrieve, filter, create, and update contacts with advanced filtering (by creation date, update date, name, etc.)
- **Financial Data** — Access sales invoices, estimates, recurring invoices, financial accounts, and ledger accounts
- **Business Operations** — Manage products, projects, and time entries
- **Custom API Requests** — Make any GET/POST/PUT/DELETE request to the Moneybird API

## Available Tools

| Tool | Description |
|------|-------------|
| `moneybird_list` | List entities with filtering and pagination. Supports: contacts, sales_invoices, estimates, recurring_sales_invoices, products, projects, time_entries, financial_accounts, ledger_accounts |
| `moneybird_get` | Get a single entity by ID (contact, sales_invoice, estimate, product, project, time_entry, ledger_account) |
| `moneybird_request` | Make a custom API request to any Moneybird endpoint. See [Moneybird API docs](https://developer.moneybird.com) |

## Development

### Prerequisites

- Node.js v18+
- A Moneybird account with API access

### Setup

```bash
git clone https://github.com/vanderheijden86/moneybird-mcp-server.git
cd moneybird-mcp-server
npm install
cp .env.example .env
# Edit .env with your credentials
```

### Run

```bash
npm run dev          # development (with auto-reload)
npm run build        # compile TypeScript
npm start            # production
```

### Building the .mcpb Bundle

```bash
npm run build
# Package dist/ + node_modules (prod) + manifest.json into a ZIP with .mcpb extension
```

## Security

- API tokens are passed via `Authorization: Bearer` header, never in URLs
- The `.mcpb` bundle stores tokens in the OS keychain (marked `sensitive` in manifest)
- The server uses stdio transport — no network ports are opened
- All requests go directly to `https://moneybird.com/api/v2` (hardcoded base URL)

## License

MIT
