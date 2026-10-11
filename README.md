[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/vanderheijden86-moneybird-mcp-server-badge.png)](https://mseep.ai/app/vanderheijden86-moneybird-mcp-server)

# Moneybird MCP Server

A Model Context Protocol (MCP) server that connects AI assistants like Claude to Moneybird accounting software via API.

<a href="https://glama.ai/mcp/servers/@vanderheijden86/moneybird-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@vanderheijden86/moneybird-mcp-server/badge" alt="Moneybird Server MCP server" />
</a>

## Features

- **Contact Management**: List, retrieve, filter, create, and update contacts
    - Advanced filtering by creation date, update date, name, and more
- **Financial Data**: Access sales invoices, financial accounts, and payments
- **Business Operations**: Manage products, projects, and time entries
- **Custom Requests**: Make custom API requests to Moneybird endpoints
- **Interactive Assistant**: Preconfigured prompt for a Moneybird assistant

## New Developments

- **Enhanced Contact Filtering**: Filter contacts using Moneybird's advanced query syntax
    - Filter by creation date: `created_after:2023-01-01 00:00:00 UTC`
    - Filter by update date: `updated_after:2023-01-01 10:45:35 UTC`
    - Filter by properties: `first_name:value`, etc.
- **Improved Error Handling**: Better error messages and recovery
- **Performance Optimizations**: Response chunking for large datasets
- **TypeScript Integration**: Full type safety with Zod schema validation

## Setup Instructions

### Basic Setup

1. **Install the package**:
   ```bash
   npm install -g moneybird-mcp-server
   ```

2. **Create a .env file** with your Moneybird credentials:
   ```
   MONEYBIRD_API_TOKEN=your_api_token
   MONEYBIRD_ADMINISTRATION_ID=your_administration_id
   ```

3. **Run the server**:
   ```bash
   npx moneybird-mcp-server
   ```

### Claude Desktop Setup

To set up this MCP server in Claude Desktop:

1. **Install the package globally** if you haven't already:
   ```bash
   npm install -g moneybird-mcp-server
   ```

2. **Create or edit** the Claude Desktop configuration file (usually in `~/Library/Application 
Support/Claude/claude_desktop_config.json`) to include the MCP server configuration:
   ```json
   {
     "mcpServers": {
       "moneybird": {
         "command": "npx",
         "args": [
           "-y",
           "moneybird-mcp-server"
         ],
         "env": {
           "MONEYBIRD_API_TOKEN": "your_api_token_here",
           "MONEYBIRD_ADMINISTRATION_ID": "your_administration_id_here"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop** to apply the changes

4. **Connect to the MCP server** by typing `/mcp moneybird` in the Claude chat input

## Usage Examples

### Basic Contact Listing

## Overview

This server allows AI assistants to interact with your Moneybird accounting data using the Model Context Protocol. It
provides various tools to:

- List and retrieve contacts
- View sales invoices
- Check financial accounts
- Access products and projects
- View time entries
- Make custom Moneybird API requests

## Prerequisites

- Node.js (v18 or higher recommended)
- A Moneybird account with API access
- A Moneybird API token

## Setup

1. Clone this repository:
   ```
   git clone https://github.com/vanderheijden86/moneybird-mcp-server.git
   cd moneybird-mcp-server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create `.env` file from the example:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file with your Moneybird API credentials:
    - `MONEYBIRD_API_TOKEN`: Your Moneybird API token (generate at https://moneybird.com/user/applications)
    - `MONEYBIRD_ADMINISTRATION_ID`: Your Moneybird administration ID (found in URL when logged in)
    - `MCP_SERVER_PORT`: The port to run the MCP server on (default: 3000)

## Running the Server

For development:

```
npm run dev
```

For production:

```
npm run build
npm start
```

To run the tests (they build first, then drive `dist/index.js` over stdio against a local stand-in for the Moneybird API, so no real token is needed):

```
npm test
```

## Releasing

Commits never change the version or create tags. To release, bump the version in `package.json` with `npm version`, which commits the change and creates the `vX.Y.Z` tag, then push the tag and publish:

```
npm version patch   # or minor, major
git push --follow-tags
npm run publish-npm
```

## Using with AI Assistants

This MCP server is compatible with any AI assistant that supports the Model Context Protocol. Once running, you can
connect it to your AI assistant by providing the server URL:

```
http://your-server-address:3000
```

## Available Tools

The server provides the following tools:

- `list_contacts`: List all contacts in Moneybird
- `get_contact`: Get details for a specific contact by ID
- `list_sales_invoices`: List all sales invoices
- `get_sales_invoice`: Get details for a specific sales invoice by ID
- `list_financial_accounts`: List all financial accounts
- `list_products`: List all products
- `list_projects`: List all projects
- `list_time_entries`: List all time entries
- `moneybird_request`: Make a custom request to the Moneybird API

## Read-only mode and the deletion guard

Set `MONEYBIRD_READ_ONLY=true` to let an assistant read your administration without changing it:

```json
"env": {
  "MONEYBIRD_API_TOKEN": "your_api_token_here",
  "MONEYBIRD_ADMINISTRATION_ID": "your_administration_id_here",
  "MONEYBIRD_READ_ONLY": "true"
}
```

In read-only mode:

- `moneybird_request` advertises only `get` and refuses `post`, `put` and `delete` before anything is sent to Moneybird.
- `moneybird_list` and `moneybird_get` work as usual.
- Accepted values are `true`, `1`, `yes`, `on` (read-only) and `false`, `0`, `no`, `off` or unset (read-write). Any other value stops the server at startup, so a typo never falls back to read-write.

Read-only mode limits what this server sends. For a hard guarantee, also give the server an API token that has only read scopes.

Outside read-only mode, a `delete` through `moneybird_request` also needs `"confirm": true` (the boolean, not a string). Without it the server refuses the call and asks the assistant to get your approval first.

## Security


This server should be deployed with appropriate security measures, as it provides access to your Moneybird data.
Consider:

- Running behind a secure proxy
- Implementing authentication for the MCP server
- Using HTTPS
- Restricting network access

## License

MIT 