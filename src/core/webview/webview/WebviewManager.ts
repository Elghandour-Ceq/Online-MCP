import * as vscode from "vscode"
import { getTheme } from "../../../integrations/theme/getTheme"
import { ExtensionMessage } from "../../../shared/ExtensionMessage"
import { getNonce } from "../getNonce"
import { getUri } from "../getUri"

export class WebviewManager {
    private disposables: vscode.Disposable[] = []

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly postMessage: (message: ExtensionMessage) => Promise<void>
    ) {}

    dispose() {
        while (this.disposables.length) {
            const x = this.disposables.pop()
            if (x) {
                x.dispose()
            }
        }
    }

    setupWebview(webviewView: vscode.WebviewView | vscode.WebviewPanel): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        }
        webviewView.webview.html = this.getHtmlContent(webviewView.webview)

        this.setupVisibilityHandlers(webviewView)
        this.setupThemeHandler()
    }

    private setupVisibilityHandlers(webviewView: vscode.WebviewView | vscode.WebviewPanel): void {
        if ("onDidChangeViewState" in webviewView) {
            webviewView.onDidChangeViewState(
                () => {
                    if (webviewView.visible) {
                        this.postMessage({ type: "action", action: "didBecomeVisible" })
                    }
                },
                null,
                this.disposables,
            )
        } else if ("onDidChangeVisibility" in webviewView) {
            webviewView.onDidChangeVisibility(
                () => {
                    if (webviewView.visible) {
                        this.postMessage({ type: "action", action: "didBecomeVisible" })
                    }
                },
                null,
                this.disposables,
            )
        }
    }

    private setupThemeHandler(): void {
        vscode.workspace.onDidChangeConfiguration(
            async (e) => {
                if (e && e.affectsConfiguration("workbench.colorTheme")) {
                    await this.postMessage({ 
                        type: "theme", 
                        text: JSON.stringify(await getTheme()) 
                    })
                }
            },
            null,
            this.disposables,
        )
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const stylesUri = getUri(webview, this.extensionUri, [
            "webview-ui",
            "build",
            "static",
            "css",
            "main.css",
        ])
        const scriptUri = getUri(webview, this.extensionUri, [
            "webview-ui",
            "build",
            "static",
            "js",
            "main.js",
        ])
        const codiconsUri = getUri(webview, this.extensionUri, [
            "node_modules",
            "@vscode",
            "codicons",
            "dist",
            "codicon.css",
        ])

        const nonce = getNonce()

        return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
            <link href="${codiconsUri}" rel="stylesheet" />
            <title>Zaki</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
        </html>
      `
    }
}
