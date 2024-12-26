import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport, StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
	CallToolResultSchema,
	ListResourcesResultSchema,
	ListResourceTemplatesResultSchema,
	ListToolsResultSchema,
	ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js"
import chokidar, { FSWatcher } from "chokidar"
import delay from "delay"
import deepEqual from "fast-deep-equal"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { z } from "zod"
import { ClineProvider, GlobalFileNames } from "../../core/webview/ClineProvider"
import {
	McpResource,
	McpResourceResponse,
	McpResourceTemplate,
	McpServer,
	McpTool,
	McpToolCallResponse,
} from "../../shared/mcp"
import { fileExistsAtPath } from "../../utils/fs"
import { arePathsEqual } from "../../utils/path"
import os from "os"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export type McpConnection = {
	server: McpServer
	client: Client
	transport: StdioClientTransport
}

// StdioServerParameters
const StdioConfigSchema = z.object({
	command: z.string(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string()).optional(),
})

const McpSettingsSchema = z.object({
	mcpServers: z.record(StdioConfigSchema),
})

export class McpHub {
	private providerRef: WeakRef<ClineProvider>
	private disposables: vscode.Disposable[] = []
	private settingsWatcher?: vscode.FileSystemWatcher
	private fileWatchers: Map<string, FSWatcher> = new Map()
	connections: McpConnection[] = []
	isConnecting: boolean = false

	constructor(provider: ClineProvider) {
		this.providerRef = new WeakRef(provider)
		this.watchMcpSettingsFile()
		// Initialize MCP servers when the hub is created
		this.initialize().catch(error => {
			console.error("Failed to initialize MCP servers:", error)
		})
	}

	getServers(): McpServer[] {
		return this.connections.map((conn) => conn.server)
	}

	async getMcpServersPath(): Promise<string> {
		const provider = this.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available")
		}
		const mcpServersPath = await provider.apiProviderManager.ensureMcpServersDirectoryExists()
		return mcpServersPath
	}

	private async getZakiMcpPath(): Promise<string> {
		return path.join(os.homedir(), "Documents", "ZAKI", "MCP")
	}

	private async getOnlineMcpPath(): Promise<string> {
		return path.join(os.homedir(), "Documents", "ZAKI", "mcp-online")
	}

	private async buildServer(serverPath: string): Promise<void> {
		console.log(`Building server at ${serverPath}...`)
		try {
			// First install dependencies
			await execAsync('npm install', { cwd: serverPath })
			// Then build the server
			await execAsync('npm run build', { cwd: serverPath })
			console.log(`Successfully built server at ${serverPath}`)
		} catch (error) {
			console.error(`Failed to build server at ${serverPath}:`, error)
			throw error
		}
	}

	private async buildOnlineMcpServers(onlineMcpPath: string): Promise<void> {
		try {
			// Get list of all directories
			const entries = await fs.readdir(onlineMcpPath, { withFileTypes: true })
			const serverDirs = []
	
			// Check each directory for package.json
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const serverPath = path.join(onlineMcpPath, entry.name)
					const packageJsonPath = path.join(serverPath, "package.json")
					
					try {
						// Check if package.json exists
						await fs.access(packageJsonPath)
						
						// Read package.json to verify it's an MCP server
						const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
						
						// Check if it has MCP SDK dependency
						if (packageJson.dependencies?.["@modelcontextprotocol/sdk"]) {
							serverDirs.push(entry)
						}
					} catch (error) {
						// Skip if package.json doesn't exist or can't be read
						console.error(`Failed to parse package.json for ${entry.name}:`, error)
						continue
					}
				}
			}
	
			// Build each detected MCP server
			for (const dir of serverDirs) {
				const serverPath = path.join(onlineMcpPath, dir.name)
				try {
					await this.buildServer(serverPath)
					vscode.window.showInformationMessage(`Successfully built ${dir.name}`)
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to build ${dir.name}: ${error}`)
				}
			}
		} catch (error) {
			console.error("Failed to build online MCP servers:", error)
			throw error
		}
	}

	private async ensureOnlineMcpRepo(): Promise<void> {
		const onlineMcpPath = await this.getOnlineMcpPath()
		let needsBuild = false

		try {
			// Check if directory exists
			await fs.access(onlineMcpPath)
			// If exists, check for updates
			console.log("Checking for Online-MCP updates...")
			const { stdout } = await execAsync('git fetch && git status -uno', { cwd: onlineMcpPath })
			if (stdout.includes('behind')) {
				// Changes available, pull and rebuild
				console.log("Updates available, pulling changes...")
				await execAsync('git pull', { cwd: onlineMcpPath })
				needsBuild = true
				vscode.window.showInformationMessage("Online MCP servers updated, rebuilding...")
			}
		} catch {
			// If doesn't exist, clone the repo
			console.log("Cloning Online-MCP repository...")
			const parentDir = path.dirname(onlineMcpPath)
			await fs.mkdir(parentDir, { recursive: true })
			await execAsync(`git clone https://github.com/Elghandour-Ceq/Online-MCP.git ${onlineMcpPath}`)
			needsBuild = true
			vscode.window.showInformationMessage("Online MCP servers cloned, building...")
		}

		// Build servers if needed
		if (needsBuild) {
			await this.buildOnlineMcpServers(onlineMcpPath)
		}
	}

	private async promptForCredentials(serverPath: string): Promise<Record<string, string>> {
		// Check if .env.example exists
		const envExamplePath = path.join(serverPath, '.env.example')
		try {
			const envExample = await fs.readFile(envExamplePath, 'utf-8')
			const requiredEnvVars = envExample
				.split('\n')
				.map(line => line.trim())
				.filter(line => line && !line.startsWith('#'))
				.map(line => line.split('=')[0])

			const credentials: Record<string, string> = {}
			
			for (const envVar of requiredEnvVars) {
				const value = await vscode.window.showInputBox({
					prompt: `Please enter value for ${envVar}`,
					password: envVar.toLowerCase().includes('key') || 
							 envVar.toLowerCase().includes('token') || 
							 envVar.toLowerCase().includes('secret'),
				})
				if (value) {
					credentials[envVar] = value
				}
			}

			// Save credentials to .env file
			const envContent = Object.entries(credentials)
				.map(([key, value]) => `${key}=${value}`)
				.join('\n')
			await fs.writeFile(path.join(serverPath, '.env'), envContent)

			return credentials
		} catch {
			return {}
		}
	}

	private async scanZakiMcpDirectory(): Promise<Record<string, StdioServerParameters>> {
		const mcpPath = await this.getZakiMcpPath()
		const onlineMcpPath = await this.getOnlineMcpPath()
		const servers: Record<string, StdioServerParameters> = {}

		try {
			// Ensure directories exist
			await fs.mkdir(mcpPath, { recursive: true })
			
			// First ensure/update online MCP repository
			await this.ensureOnlineMcpRepo()

			// Scan local MCP directory
			const scanDirectory = async (dirPath: string, isOnline: boolean) => {
				const entries = await fs.readdir(dirPath, { withFileTypes: true })
				for (const entry of entries) {
					if (entry.isDirectory()) {
						const serverPath = path.join(dirPath, entry.name)
						const buildIndexPath = path.join(serverPath, "build", "index.js")
						const envPath = path.join(serverPath, ".env")

						try {
							await fs.access(buildIndexPath)
							
							// Check if server needs credentials
							let env = {}
							try {
								await fs.access(envPath)
								// If .env exists, read it
								const envContent = await fs.readFile(envPath, 'utf-8')
								env = Object.fromEntries(
									envContent
										.split('\n')
										.filter(line => line.includes('='))
										.map(line => line.split('='))
								)
							} catch {
								// If .env doesn't exist but .env.example does, prompt for credentials
								env = await this.promptForCredentials(serverPath)
							}

							// Add server to config
							const serverKey = isOnline ? `online-${entry.name}` : entry.name
							servers[serverKey] = {
								command: "node",
								args: [buildIndexPath],
								env
							}
						} catch {
							// Skip if build/index.js doesn't exist
							continue
						}
					}
				}
			}

			// Scan both directories
			await scanDirectory(mcpPath, false)
			await scanDirectory(onlineMcpPath, true)

		} catch (error) {
			console.error("Failed to scan MCP directories:", error)
		}

		return servers
	}

	private async updateSettingsWithNewServers(newServers: Record<string, StdioServerParameters>): Promise<void> {
		const settingsPath = await this.getMcpSettingsFilePath()
		const content = await fs.readFile(settingsPath, "utf-8")
		const config = JSON.parse(content)

		let hasChanges = false
		for (const [name, serverConfig] of Object.entries(newServers)) {
			if (!config.mcpServers[name] || !deepEqual(config.mcpServers[name], serverConfig)) {
				config.mcpServers[name] = serverConfig
				hasChanges = true
			}
		}

		if (hasChanges) {
			await fs.writeFile(settingsPath, JSON.stringify(config, null, 2))
			vscode.window.showInformationMessage("MCP settings updated with new/changed servers")
		}
	}

	async getMcpSettingsFilePath(): Promise<string> {
		const provider = this.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available")
		}
		const mcpSettingsFilePath = path.join(
			await provider.apiProviderManager.ensureSettingsDirectoryExists(),
			GlobalFileNames.mcpSettings,
		)
		const fileExists = await fileExistsAtPath(mcpSettingsFilePath)
		if (!fileExists) {
			await fs.writeFile(
				mcpSettingsFilePath,
				`{
  "mcpServers": {
    
  }
}`,
			)
		}
		return mcpSettingsFilePath
	}

	private async watchMcpSettingsFile(): Promise<void> {
		const settingsPath = await this.getMcpSettingsFilePath()
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument(async (document) => {
				if (arePathsEqual(document.uri.fsPath, settingsPath)) {
					const content = await fs.readFile(settingsPath, "utf-8")
					const errorMessage =
						"Invalid MCP settings format. Please ensure your settings follow the correct JSON format."
					let config: any
					try {
						config = JSON.parse(content)
					} catch (error) {
						vscode.window.showErrorMessage(errorMessage)
						return
					}
					const result = McpSettingsSchema.safeParse(config)
					if (!result.success) {
						vscode.window.showErrorMessage(errorMessage)
						return
					}
					try {
						vscode.window.showInformationMessage("Updating MCP servers...")
						await this.updateServerConnections(result.data.mcpServers || {})
						vscode.window.showInformationMessage("MCP servers updated")
					} catch (error) {
						console.error("Failed to process MCP settings change:", error)
					}
				}
			}),
		)
	}

	public async initialize(): Promise<void> {
		try {
			// First scan both local and online MCP directories for servers
			const newServers = await this.scanZakiMcpDirectory()
			
			// Update settings file with any new servers found
			await this.updateSettingsWithNewServers(newServers)

			// Read updated settings and start all servers
			const settingsPath = await this.getMcpSettingsFilePath()
			const content = await fs.readFile(settingsPath, "utf-8")
			const config = JSON.parse(content)
			await this.updateServerConnections(config.mcpServers || {})
			await this.notifyWebviewOfServerChanges()
		} catch (error) {
			console.error("Failed to initialize MCP servers:", error)
		}
	}

	private async connectToServer(name: string, config: StdioServerParameters): Promise<void> {
		// Remove existing connection if it exists
		this.connections = this.connections.filter((conn) => conn.server.name !== name)

		try {
			const client = new Client(
				{
					name: "Cline",
					version: this.providerRef.deref()?.context.extension?.packageJSON?.version ?? "1.0.0",
				},
				{
					capabilities: {},
				},
			)

			const transport = new StdioClientTransport({
				command: config.command,
				args: config.args,
				env: {
					...config.env,
					...(process.env.PATH ? { PATH: process.env.PATH } : {}),
				},
				stderr: "pipe",
			})

			transport.onerror = async (error) => {
				console.error(`Transport error for "${name}":`, error)
				const connection = this.connections.find((conn) => conn.server.name === name)
				if (connection) {
					connection.server.status = "disconnected"
					this.appendErrorMessage(connection, error.message)
				}
				await this.notifyWebviewOfServerChanges()
			}

			transport.onclose = async () => {
				const connection = this.connections.find((conn) => conn.server.name === name)
				if (connection) {
					connection.server.status = "disconnected"
				}
				await this.notifyWebviewOfServerChanges()
			}

			if (!StdioConfigSchema.safeParse(config).success) {
				console.error(`Invalid config for "${name}": missing or invalid parameters`)
				const connection: McpConnection = {
					server: {
						name,
						config: JSON.stringify(config),
						status: "disconnected",
						error: "Invalid config: missing or invalid parameters",
					},
					client,
					transport,
				}
				this.connections.push(connection)
				return
			}

			const connection: McpConnection = {
				server: {
					name,
					config: JSON.stringify(config),
					status: "connecting",
				},
				client,
				transport,
			}
			this.connections.push(connection)

			await transport.start()
			const stderrStream = transport.stderr
			if (stderrStream) {
				stderrStream.on("data", async (data: Buffer) => {
					const errorOutput = data.toString()
					console.error(`Server "${name}" stderr:`, errorOutput)
					const connection = this.connections.find((conn) => conn.server.name === name)
					if (connection) {
						this.appendErrorMessage(connection, errorOutput)
						if (connection.server.status === "disconnected") {
							await this.notifyWebviewOfServerChanges()
						}
					}
				})
			} else {
				console.error(`No stderr stream for ${name}`)
			}
			transport.start = async () => {}

			await client.connect(transport)
			connection.server.status = "connected"
			connection.server.error = ""

			connection.server.tools = await this.fetchToolsList(name)
			connection.server.resources = await this.fetchResourcesList(name)
			connection.server.resourceTemplates = await this.fetchResourceTemplatesList(name)
		} catch (error) {
			const connection = this.connections.find((conn) => conn.server.name === name)
			if (connection) {
				connection.server.status = "disconnected"
				this.appendErrorMessage(connection, error instanceof Error ? error.message : String(error))
			}
			throw error
		}
	}

	private appendErrorMessage(connection: McpConnection, error: string) {
		const newError = connection.server.error ? `${connection.server.error}\n${error}` : error
		connection.server.error = newError
	}

	private async fetchToolsList(serverName: string): Promise<McpTool[]> {
		try {
			const response = await this.connections
				.find((conn) => conn.server.name === serverName)
				?.client.request({ method: "tools/list" }, ListToolsResultSchema)
			return response?.tools || []
		} catch (error) {
			return []
		}
	}

	private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
		try {
			const response = await this.connections
				.find((conn) => conn.server.name === serverName)
				?.client.request({ method: "resources/list" }, ListResourcesResultSchema)
			return response?.resources || []
		} catch (error) {
			return []
		}
	}

	private async fetchResourceTemplatesList(serverName: string): Promise<McpResourceTemplate[]> {
		try {
			const response = await this.connections
				.find((conn) => conn.server.name === serverName)
				?.client.request({ method: "resources/templates/list" }, ListResourceTemplatesResultSchema)
			return response?.resourceTemplates || []
		} catch (error) {
			return []
		}
	}

	async deleteConnection(name: string): Promise<void> {
		const connection = this.connections.find((conn) => conn.server.name === name)
		if (connection) {
			try {
				await connection.transport.close()
				await connection.client.close()
			} catch (error) {
				console.error(`Failed to close transport for ${name}:`, error)
			}
			this.connections = this.connections.filter((conn) => conn.server.name !== name)
		}
	}

	async updateServerConnections(newServers: Record<string, any>): Promise<void> {
		this.isConnecting = true
		this.removeAllFileWatchers()
		const currentNames = new Set(this.connections.map((conn) => conn.server.name))
		const newNames = new Set(Object.keys(newServers))

		for (const name of currentNames) {
			if (!newNames.has(name)) {
				await this.deleteConnection(name)
				console.log(`Deleted MCP server: ${name}`)
			}
		}

		for (const [name, config] of Object.entries(newServers)) {
			const currentConnection = this.connections.find((conn) => conn.server.name === name)

			if (!currentConnection) {
				try {
					this.setupFileWatcher(name, config)
					await this.connectToServer(name, config)
				} catch (error) {
					console.error(`Failed to connect to new MCP server ${name}:`, error)
				}
			} else if (!deepEqual(JSON.parse(currentConnection.server.config), config)) {
				try {
					this.setupFileWatcher(name, config)
					await this.deleteConnection(name)
					await this.connectToServer(name, config)
					console.log(`Reconnected MCP server with updated config: ${name}`)
				} catch (error) {
					console.error(`Failed to reconnect MCP server ${name}:`, error)
				}
			}
		}
		await this.notifyWebviewOfServerChanges()
		this.isConnecting = false
	}

	private setupFileWatcher(name: string, config: any) {
		const filePath = config.args?.find((arg: string) => arg.includes("build/index.js"))
		if (filePath) {
			const watcher = chokidar.watch(filePath, {})

			watcher.on("change", () => {
				console.log(`Detected change in ${filePath}. Restarting server ${name}...`)
				this.restartConnection(name)
			})

			this.fileWatchers.set(name, watcher)
		}
	}

	private removeAllFileWatchers() {
		this.fileWatchers.forEach((watcher) => watcher.close())
		this.fileWatchers.clear()
	}

	async restartConnection(serverName: string): Promise<void> {
		this.isConnecting = true
		const provider = this.providerRef.deref()
		if (!provider) {
			return
		}

		const connection = this.connections.find((conn) => conn.server.name === serverName)
		const config = connection?.server.config
		if (config) {
			vscode.window.showInformationMessage(`Restarting ${serverName} MCP server...`)
			connection.server.status = "connecting"
			connection.server.error = ""
			await this.notifyWebviewOfServerChanges()
			await delay(500)
			try {
				await this.deleteConnection(serverName)
				await this.connectToServer(serverName, JSON.parse(config))
				vscode.window.showInformationMessage(`${serverName} MCP server connected`)
			} catch (error) {
				console.error(`Failed to restart connection for ${serverName}:`, error)
				vscode.window.showErrorMessage(`Failed to connect to ${serverName} MCP server`)
			}
		}

		await this.notifyWebviewOfServerChanges()
		this.isConnecting = false
	}

	public async notifyWebviewOfServerChanges(): Promise<void> {
		const settingsPath = await this.getMcpSettingsFilePath()
		const content = await fs.readFile(settingsPath, "utf-8")
		const config = JSON.parse(content)
		const serverOrder = Object.keys(config.mcpServers || {})
		await this.providerRef.deref()?.postMessageToWebview({
			type: "mcpServers",
			mcpServers: [...this.connections]
				.sort((a, b) => {
					const indexA = serverOrder.indexOf(a.server.name)
					const indexB = serverOrder.indexOf(b.server.name)
					return indexA - indexB
				})
				.map((connection) => connection.server),
		})
	}

	async readResource(serverName: string, uri: string): Promise<McpResourceResponse> {
		const connection = this.connections.find((conn) => conn.server.name === serverName)
		if (!connection) {
			throw new Error(
				`No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`,
			)
		}
		return await connection.client.request(
			{
				method: "resources/read",
				params: {
					uri,
				},
			},
			ReadResourceResultSchema,
		)
	}

	async callTool(
		serverName: string,
		toolName: string,
		toolArguments?: Record<string, unknown>,
	): Promise<McpToolCallResponse> {
		const connection = this.connections.find((conn) => conn.server.name === serverName)
		if (!connection) {
			throw new Error(
				`No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`,
			)
		}
		return await connection.client.request(
			{
				method: "tools/call",
				params: {
					name: toolName,
					arguments: toolArguments,
				},
			},
			CallToolResultSchema,
		)
	}

	async dispose(): Promise<void> {
		this.removeAllFileWatchers()
		for (const connection of this.connections) {
			try {
				await this.deleteConnection(connection.server.name)
			} catch (error) {
				console.error(`Failed to close connection for ${connection.server.name}:`, error)
			}
		}
		this.connections = []
		if (this.settingsWatcher) {
			this.settingsWatcher.dispose()
		}
		this.disposables.forEach((d) => d.dispose())
	}
}
