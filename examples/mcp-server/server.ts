import * as net from 'net';

interface Client {
  id: string;
  socket: net.Socket;
}

class McpServer {
  private server: net.Server;
  private clients: Map<string, Client>;
  private port: number;

  constructor(port: number = 3000) {
    this.server = net.createServer();
    this.clients = new Map();
    this.port = port;
    this.setupServer();
  }

  private setupServer(): void {
    this.server.on('connection', (socket: net.Socket) => {
      const clientId = `client-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store new client
      this.clients.set(clientId, { id: clientId, socket });
      
      console.log(`New client connected: ${clientId}`);
      
      // Send welcome message to the new client
      socket.write(`Welcome! Your client ID is: ${clientId}\n`);
      
      // Broadcast to other clients about new connection
      this.broadcast(clientId, `Client ${clientId} has joined\n`);

      // Handle incoming messages
      socket.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        console.log(`Received from ${clientId}: ${message}`);
        
        // Broadcast message to all other clients
        this.broadcast(clientId, `${clientId}: ${message}\n`);
      });

      // Handle client disconnection
      socket.on('end', () => {
        this.clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
        this.broadcast(clientId, `Client ${clientId} has left\n`);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Error with client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });
  }

  private broadcast(senderId: string, message: string): void {
    this.clients.forEach((client) => {
      if (client.id !== senderId) {
        client.socket.write(message);
      }
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`MCP Server is running on port ${this.port}`);
    });
  }

  public stop(): void {
    this.server.close(() => {
      console.log('MCP Server stopped');
    });
  }
}

// Create and start the server
const mcpServer = new McpServer(3000);
mcpServer.start();
