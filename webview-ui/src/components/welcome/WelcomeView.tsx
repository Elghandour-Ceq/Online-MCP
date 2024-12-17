import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useEffect, useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "../settings/ApiOptions"

const WelcomeView = () => {
	const { apiConfiguration } = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const disableLetsGoButton = apiErrorMessage != null

	const handleSubmit = () => {
		vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
	}

	useEffect(() => {
		setApiErrorMessage(validateApiConfiguration(apiConfiguration))
	}, [apiConfiguration])

	return (
		<div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, padding: "0 20px", maxWidth: "800px", margin: "0 auto" }}>
			<h2 style={{ color: "var(--vscode-editor-foreground)" }}>Meet Zaki Your New Coding Partner </h2>
			
			<div style={{ marginBottom: "24px" }}>
				<p>
					Transform your coding experience with Zaki - your intelligent assistant that understands not just code, 
					but the entire development workflow. Powered by Claude 3.5 Sonnet, I bring advanced AI capabilities 
					directly into your VS Code environment.
				</p>
			</div>

			<div style={{ marginBottom: "24px" }}>
				<h3 style={{ color: "var(--vscode-editor-foreground)", marginBottom: "12px" }}>What Makes Me Different</h3>
				<p>
					Unlike traditional AI assistants, I don't just suggest code - I actively help you build. 
					I can navigate your project structure, make real-time changes, and even test implementations 
					through browser interactions. Think of me as a pair programmer who's always ready to help, 
					equipped with tools to turn ideas into working solutions.
				</p>
			</div>

			<div style={{ marginBottom: "24px" }}>
				<h3 style={{ color: "var(--vscode-editor-foreground)", marginBottom: "12px" }}>My Capabilities</h3>
				<ul style={{ lineHeight: "1.8" }}>
					<li>🔨 Create, modify, and refactor code across your entire project</li>
					<li>🔍 Deep understanding of complex codebases and project structures</li>
					<li>🌐 Interactive web development with real-time browser testing</li>
					<li>⚡ Execute development tasks through terminal commands</li>
					<li>🔄 Validate changes with immediate feedback and testing</li>
				</ul>
			</div>

			<div style={{ marginBottom: "24px" }}>
				<h3 style={{ color: "var(--vscode-editor-foreground)" }}>Ready to Begin?</h3>
				<p>Connect me to Claude 3.5 Sonnet to unlock these capabilities:</p>
			</div>

			<div style={{ marginTop: "20px" }}>
				<ApiOptions showModelOptions={false} />
				<VSCodeButton 
					onClick={handleSubmit} 
					disabled={disableLetsGoButton} 
					style={{ marginTop: "15px", padding: "8px 20px" }}
				>
					Start Building Together
				</VSCodeButton>
			</div>

			{apiErrorMessage && (
				<div style={{ marginTop: "10px", color: "var(--vscode-errorForeground)" }}>
					{apiErrorMessage}
				</div>
			)}
		</div>
	)
}

export default WelcomeView
