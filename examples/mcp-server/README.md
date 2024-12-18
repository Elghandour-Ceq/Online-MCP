# MCP Server Example

This is a simple implementation of a Multi-Client Protocol (MCP) server using Node.js/TypeScript. The example demonstrates how to create a server that can handle multiple client connections and facilitate communication between them.

## Features

- Multiple client support
- Unique client identification
- Broadcasting messages to all connected clients
- Connection/disconnection handling
- Error handling

## Files

- `server.ts`: The MCP server implementation
- `client.ts`: A sample client implementation to test the server

## Running the Example

1. First, compile the TypeScript files:
```bash
tsc server.ts
tsc client.ts
```

2. Start the server:
```bash
node server.js
```

3. In separate terminal windows, run multiple clients:
```bash
node client.js
```

## How it Works

1. The server listens on port 3000 by default
2. When a client connects, they receive a unique ID
3. Clients can send messages that get broadcast to all other connected clients
4. The server handles client disconnections and errors gracefully

## Implementation Details

### Server
- Uses Node.js `net` module for TCP connections
- Maintains a map of connected clients
- Broadcasts messages to all clients except the sender
- Handles client connections, disconnections, and errors

### Client
- Connects to the server using TCP
- Can send messages to the server
- Receives broadcasts from other clients
- Handles server disconnection and errors

This example serves as a basic foundation for building more complex MCP applications. You can extend it by adding features like:
- Custom protocols for different message types
- Client authentication
- Room/channel support
- Direct messaging between clients
- Message persistence
