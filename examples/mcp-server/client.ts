import * as net from 'net';

class McpClient {
  private socket: net.Socket;
  private name: string;

  constructor(name: string = 'Client', port: number = 3000) {
    this.name = name;
    this.socket = new net.Socket();
    
    // Connect to the MCP server
    this.socket.connect(port, 'localhost', () => {
      console.log('Connected to MCP server');
    });

    // Handle incoming messages
    this.socket.on('data', (data: Buffer) => {
      console.log(data.toString());
    });

    // Handle server disconnection
    this.socket.on('end', () => {
      console.log('Disconnected from server');
    });

    // Handle errors
    this.socket.on('error', (error) => {
      console.error('Connection error:', error);
    });
  }

  public sendMessage(message: string): void {
    this.socket.write(`${message}\n`);
  }

  public disconnect(): void {
    this.socket.end();
  }
}

// Example usage:
const client = new McpClient('TestClient');

// Send a test message after 1 second
setTimeout(() => {
  client.sendMessage('Hello, MCP Server!');
}, 1000);

// Disconnect after 5 seconds
setTimeout(() => {
  client.disconnect();
}, 5000);
