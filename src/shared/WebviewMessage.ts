import { ApiConfiguration, ApiProvider } from "./api"

export interface WebviewMessage {
	type:
		| "personality"
		| "apiConfiguration"
		| "customInstructions"
		| "alwaysAllowReadOnly"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "resetState"
		| "requestOllamaModels"
		| "requestLmStudioModels"
		| "openImage"
		| "openFile"
		| "openMention"
		| "cancelTask"
		| "refreshOpenRouterModels"
		| "retryUpdate"
		| "openMcpSettings"
		| "retryMcpServer"  // Added for update retry functionality
	text?: string
	askResponse?: ClineAskResponse
	apiConfiguration?: ApiConfiguration
	images?: string[]
	bool?: boolean
}

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"
