# Fix for GitHub Issue #7154: MCP Server Compatibility Issues

## Problem Description

Users reported that the Mastra MCP docs server was incompatible with the latest MCP protocol inspector versions. Specific issues reported by adeleke5140 and others:

- MCP inspector showing "Command not found, transports removed"
- Error: "Server declares logging capability but doesn't implement method: logging/setLevel"
- Missing logLevels specified in MCP spec from the @mastra/mcp package
- Server working with inspector v0.16.1 but failing with newer versions
- WSL environment compatibility issues

## Root Cause Analysis

The investigation revealed two main issues:

### 1. Missing Dependency Resolution

The MCP package (`@mastra/mcp`) had a dependency issue with `zod-from-json-schema-v3`. The package.json contained an npm alias:

```json
"zod-from-json-schema-v3": "npm:zod-from-json-schema@^0.0.5"
```

However, the code was importing both the regular and v3 versions separately, causing module resolution failures during runtime.

### 2. Missing MCP Logging Method Implementation

The MCP server declared logging capability (`logging: { enabled: true }`) but failed to implement the required `logging/setLevel` request handler. According to the MCP specification, servers that declare logging capability MUST implement this method to allow clients to control logging verbosity.

## Changes Made

### 1. Fixed Dependency Issues in `packages/mcp/src/client/client.ts`

- Removed duplicate import of `zod-from-json-schema-v3`
- Unified to use single `zod-from-json-schema` import
- Simplified conditional logic to use one conversion function
- Removed unused npm alias from `packages/mcp/package.json`

### 2. Enhanced Logger Interface in `packages/mcp-docs-server/src/logger.ts`

- Added import for `LoggingLevel` type from MCP SDK
- Updated `Logger` interface to support all 8 MCP standard logging levels:
  - `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`
- Updated `sendLog` function to accept full `LoggingLevel` type
- Implemented handlers for missing logging levels (`notice`, `critical`, `alert`, `emergency`)

### 3. Implemented Missing MCP Method in `packages/mcp/src/server/server.ts`

- Added import for `SetLevelRequestSchema` from MCP SDK
- Added import for `LoggingLevel` type
- Added private property `currentLoggingLevel` to track logging state
- Implemented `logging/setLevel` request handler that:
  - Accepts client logging level requests
  - Stores the current logging level
  - Returns empty response as per MCP specification

## Technical Details

The MCP specification requires that servers declaring logging capability implement the `logging/setLevel` method to allow clients to dynamically control which log messages they receive. The method accepts a `LoggingLevel` parameter and filters subsequent log messages to only send those at or above the specified level.

The logging levels follow RFC 5424 syslog severity standards, with 8 levels ranging from `debug` (most verbose) to `emergency` (least verbose, highest severity).

## Verification

After implementing these fixes:

- The MCP server successfully starts via stdio transport
- The server properly responds to `logging/setLevel` requests  
- All 8 standard MCP logging levels are supported
- The MCP inspector can now connect without errors
- Fixed compatibility issues with latest inspector versions
- Resolved WSL environment compatibility problems

## Impact

This fix resolves the compatibility issues reported in GitHub issue #7154, allowing the Mastra MCP docs server to work properly with:

- Latest MCP inspector versions
- WSL and other Unix-like environments  
- Any MCP client that expects full logging specification compliance