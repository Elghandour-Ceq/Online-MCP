import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ServerCredentials {
    [key: string]: string;
}

export class SecureCredentialsManager {
    private static instance: SecureCredentialsManager;
    private secretStorage: vscode.SecretStorage;
    private readonly PREFIX = 'mcp-credentials-';

    private constructor(context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
    }

    public static getInstance(context: vscode.ExtensionContext): SecureCredentialsManager {
        if (!SecureCredentialsManager.instance) {
            SecureCredentialsManager.instance = new SecureCredentialsManager(context);
        }
        return SecureCredentialsManager.instance;
    }

    private getKey(serverId: string): string {
        return `${this.PREFIX}${serverId}`;
    }

    private async showCredentialInstructions(varName: string): Promise<void> {
        // Generic instructions based on credential type
        let instructions = '';
        
        if (varName.toLowerCase().includes('token')) {
            instructions = 'Please enter your API token or access token';
        } else if (varName.toLowerCase().includes('key')) {
            instructions = 'Please enter your API key or client key';
        } else if (varName.toLowerCase().includes('secret')) {
            instructions = 'Please enter your client secret or API secret';
        } else if (varName.toLowerCase().includes('email')) {
            instructions = 'Please enter your email address';
        } else if (varName.toLowerCase().includes('domain')) {
            instructions = 'Please enter your domain name';
        } else if (varName.toLowerCase().includes('url')) {
            instructions = 'Please enter the URL';
        } else {
            instructions = `Please enter the value for ${varName}`;
        }

        await vscode.window.showInformationMessage(instructions, { modal: true });
    }

    public async promptAndStoreCredentials(serverId: string, requiredVars: string[]): Promise<ServerCredentials> {
        // Check for existing credentials first
        const existingCreds = await this.getCredentials(serverId);
        if (existingCreds) {
            // If credentials exist, ask if user wants to update them
            const update = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Credentials already exist for ${serverId}. Do you want to update them?`
            });
            if (update !== 'Yes') {
                return existingCreds;
            }
        }

        const credentials: ServerCredentials = {};
        
        for (const varName of requiredVars) {
            // Show instructions for getting this credential
            await this.showCredentialInstructions(varName);

            const value = await vscode.window.showInputBox({
                prompt: `Enter value for ${varName}`,
                password: this.isSecret(varName),
                ignoreFocusOut: true,
                title: `${serverId} Credentials`,
                placeHolder: `Enter your ${varName}`,
                value: existingCreds?.[varName] || '', // Show existing value if updating
            });
            
            if (!value) {
                throw new Error(`Credential input cancelled for ${varName}`);
            }
            
            credentials[varName] = value;
        }

        // Store credentials securely
        await this.setCredentials(serverId, credentials);

        // Create temporary .env file for backward compatibility
        const envPath = this.getEnvPath(serverId);
        const envContent = Object.entries(credentials)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
            
        await fs.writeFile(envPath, envContent);

        return credentials;
    }

    private getEnvPath(serverId: string): string {
        // Generic path construction based on server ID
        const basePath = path.join(process.env.HOME || '', 'Documents', 'ZAKI');
        const isOnline = serverId.startsWith('online-');
        const serverDir = isOnline ? 'mcp-online' : 'MCP';
        const serverName = isOnline ? serverId.replace('online-', '') : serverId;
        
        return path.join(basePath, serverDir, serverName, '.env');
    }

    private isSecret(varName: string): boolean {
        const secretKeywords = ['key', 'token', 'secret', 'password', 'auth'];
        return secretKeywords.some(keyword => 
            varName.toLowerCase().includes(keyword)
        );
    }

    public async setCredentials(serverId: string, credentials: ServerCredentials): Promise<void> {
        const key = this.getKey(serverId);
        await this.secretStorage.store(key, JSON.stringify(credentials));
    }

    public async getCredentials(serverId: string): Promise<ServerCredentials | undefined> {
        const key = this.getKey(serverId);
        const stored = await this.secretStorage.get(key);
        
        if (!stored) {
            return undefined;
        }

        try {
            return JSON.parse(stored);
        } catch {
            return undefined;
        }
    }

    public async hasCredentials(serverId: string): Promise<boolean> {
        const credentials = await this.getCredentials(serverId);
        return credentials !== undefined;
    }

    public async clearCredentials(serverId: string): Promise<void> {
        const key = this.getKey(serverId);
        await this.secretStorage.delete(key);

        // Also remove .env file if it exists
        try {
            const envPath = this.getEnvPath(serverId);
            await fs.unlink(envPath);
        } catch {
            // Ignore error if file doesn't exist
        }
    }

    public async clearAllCredentials(): Promise<void> {
        vscode.window.showInformationMessage(
            'To completely remove all credentials, please use VSCode\'s command palette and run "Clear Storage" for the extension.'
        );
    }
}