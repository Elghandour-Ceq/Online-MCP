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

    private async getCredentialInstructions(credentialType: string): Promise<string> {
        const instructions: Record<string, string> = {
            // Google Calendar credentials
            'GOOGLE_CLIENT_ID': [
                'To get Google Calendar Client ID:',
                '1. Go to https://console.cloud.google.com',
                '2. Create a new project or select existing one',
                '3. Enable Google Calendar API',
                '4. Go to Credentials > Create Credentials > OAuth client ID',
                '5. Application type: Web application',
                '6. Add redirect URI: http://localhost:3000/oauth2callback',
                '7. Copy the Client ID'
            ].join('\n'),

            'GOOGLE_CLIENT_SECRET': [
                'To get Google Calendar Client Secret:',
                '1. Go to https://console.cloud.google.com',
                '2. Select your project',
                '3. Go to Credentials',
                '4. Find your OAuth 2.0 Client ID',
                '5. Copy the Client Secret'
            ].join('\n'),

            'GOOGLE_REFRESH_TOKEN': [
                'To get Google Calendar Refresh Token:',
                '1. Make sure you have Client ID and Secret',
                '2. Run the helper script:',
                '   node src/services/mcp/scripts/get-google-refresh-token.js',
                '3. Follow the browser authentication flow',
                '4. Copy the provided refresh token'
            ].join('\n'),

            // Jira credentials
            'JIRA_API_TOKEN': [
                'To get Jira API Token:',
                '1. Go to https://id.atlassian.com/manage-profile/security/api-tokens',
                '2. Click "Create API token"',
                '3. Give it a name (e.g., "MCP Integration")',
                '4. Copy the generated token'
            ].join('\n'),

            'JIRA_EMAIL': [
                'Enter your Atlassian account email address',
                'This is the email you use to log into Jira'
            ].join('\n'),

            'JIRA_DOMAIN': [
                'Enter your Jira domain',
                'Format: company.atlassian.net',
                'This is the URL you use to access Jira'
            ].join('\n'),

            // Default instructions
            'default': 'Please enter the required credential value'
        };

        return instructions[credentialType] || instructions['default'];
    }

    private async showCredentialInstructions(credentialType: string): Promise<void> {
        const instructions = await this.getCredentialInstructions(credentialType);
        await vscode.window.showInformationMessage(instructions, { modal: true });
    }

    public async promptAndStoreCredentials(serverId: string, requiredVars: string[]): Promise<ServerCredentials> {
        // Check for existing credentials first
        const existingCreds = await this.getCredentials(serverId);
        if (existingCreds) {
            return existingCreds;
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
            });
            
            if (!value) {
                throw new Error(`Credential input cancelled for ${varName}`);
            }
            
            credentials[varName] = value;
        }

        // Store credentials securely
        await this.setCredentials(serverId, credentials);

        // Create temporary .env file for backward compatibility
        if (serverId.includes('jira-server') || serverId.includes('Calendar-MCP-Server')) {
            const envPath = path.join(process.env.HOME || '', 'Documents', 'ZAKI', 
                serverId.includes('online') ? 'mcp-online' : 'MCP',
                serverId.replace('online-', ''),
                '.env'
            );
            
            const envContent = Object.entries(credentials)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
                
            await fs.writeFile(envPath, envContent);
        }

        return credentials;
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
    }

    public async clearAllCredentials(): Promise<void> {
        vscode.window.showInformationMessage(
            'To completely remove all credentials, please use VSCode\'s command palette and run "Clear Storage" for the extension.'
        );
    }
}