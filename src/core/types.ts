import { Anthropic } from "@anthropic-ai/sdk"

export type TextBlock = Anthropic.Messages.TextBlockParam
export type ImageBlock = Anthropic.Messages.ImageBlockParam
export type ContentBlock = TextBlock | ImageBlock
export type ToolResponse = string | ContentBlock[]

export interface IMessageHandler {
    say(type: string, text?: string, images?: string[], partial?: boolean): Promise<void>
    ask(type: string, text?: string, partial?: boolean): Promise<{
        response: string
        text?: string
        images?: string[]
    }>
}

export interface IToolHandler extends IMessageHandler {
    askWithCatch(type: string, text?: string, partial?: boolean): Promise<void>
    askApproval(type: string, text?: string): Promise<boolean>
    handleError(action: string, error: Error): Promise<void>
    createMissingParamError(toolName: string, paramName: string): Promise<ToolResponse>
    incrementMistakeCount(): void
    resetMistakeCount(): void
}

// Export message types
export type MessageParam = Anthropic.MessageParam
