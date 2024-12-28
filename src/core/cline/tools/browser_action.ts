import { ClineSayTool, ClineSayBrowserAction, BrowserAction, browserActions } from "../../../shared/ExtensionMessage"
import { formatResponse } from "../../prompts/responses"
import { ToolUse } from "../../assistant-message"
import { removeClosingTag, askApproval, handleError } from "./helpers"

export const browser_action = async function(this: any, block: ToolUse) {
    const action: BrowserAction | undefined = block.params.action as BrowserAction
    const url: string | undefined = block.params.url
    const coordinate: string | undefined = block.params.coordinate
    const text: string | undefined = block.params.text

    if (!action || !browserActions.includes(action)) {
        if (!block.partial) {
            this.consecutiveMistakeCount++
            return [await this.sayAndCreateMissingParamError("browser_action", "action")]
            await this.browserSession.closeBrowser()
        }
        return
    }

    try {
        if (block.partial) {
            if (action === "launch") {
                if (this.shouldAutoApproveTool(block.name)) {
                    await this.say(
                        "browser_action_launch",
                        removeClosingTag("url", url),
                        undefined,
                        block.partial,
                    )
                } else {
                    await this.ask(
                        "browser_action_launch",
                        removeClosingTag("url", url),
                        block.partial,
                    ).catch(() => {})
                }
            } else {
                await this.say(
                    "browser_action",
                    JSON.stringify({
                        action: action as BrowserAction,
                        coordinate: removeClosingTag("coordinate", coordinate),
                        text: removeClosingTag("text", text),
                    } satisfies ClineSayBrowserAction),
                    undefined,
                    block.partial,
                )
            }
            return
        } else {
            let browserActionResult
            if (action === "launch") {
                if (!url) {
                    this.consecutiveMistakeCount++
                    return [await this.sayAndCreateMissingParamError("browser_action", "url")]
                    await this.browserSession.closeBrowser()
                }
                this.consecutiveMistakeCount = 0
                if (this.shouldAutoApproveTool(block.name)) {
                    await this.say("browser_action_launch", url, undefined, false)
                    this.consecutiveAutoApprovedRequestsCount++
                } else {
                    const didApprove = await askApproval.call(this, block, "browser_action_launch", url)
                    if (!didApprove) {
                        return
                    }
                }

                await this.say("browser_action_result", "")

                await this.browserSession.launchBrowser()
                browserActionResult = await this.browserSession.navigateToUrl(url)
            } else {
                if (action === "click") {
                    if (!coordinate) {
                        this.consecutiveMistakeCount++
                        return [await this.sayAndCreateMissingParamError("browser_action", "coordinate")]
                        await this.browserSession.closeBrowser()
                    }
                }
                if (action === "type") {
                    if (!text) {
                        this.consecutiveMistakeCount++
                        return [await this.sayAndCreateMissingParamError("browser_action", "text")]
                        await this.browserSession.closeBrowser()
                    }
                }
                this.consecutiveMistakeCount = 0
                await this.say(
                    "browser_action",
                    JSON.stringify({
                        action: action as BrowserAction,
                        coordinate,
                        text,
                    } satisfies ClineSayBrowserAction),
                    undefined,
                    false,
                )
                switch (action) {
                    case "click":
                        browserActionResult = await this.browserSession.click(coordinate!)
                        break
                    case "type":
                        browserActionResult = await this.browserSession.type(text!)
                        break
                    case "scroll_down":
                        browserActionResult = await this.browserSession.scrollDown()
                        break
                    case "scroll_up":
                        browserActionResult = await this.browserSession.scrollUp()
                        break
                    case "close":
                        browserActionResult = await this.browserSession.closeBrowser()
                        break
                }
            }

            switch (action) {
                case "launch":
                case "click":
                case "type":
                case "scroll_down":
                case "scroll_up":
                    await this.say("browser_action_result", JSON.stringify(browserActionResult))
                    return [formatResponse.toolResult(
                        `The browser action has been executed. The console logs and screenshot have been captured for your analysis.\n\nConsole logs:\n${
                            browserActionResult.logs || "(No new logs)"
                        }\n\n(REMEMBER: if you need to proceed to using non-\`browser_action\` tools or launch a new browser, you MUST first close this browser. For example, if after analyzing the logs and screenshot you need to edit a file, you must first close the browser before you can use the write_to_file tool.)`,
                        browserActionResult.screenshot ? [browserActionResult.screenshot] : [],
                    )]
                case "close":
                    return [formatResponse.toolResult(
                        `The browser has been closed. You may now proceed to using other tools.`,
                    )]
            }
        }
    } catch (error) {
        await this.browserSession.closeBrowser()
        const result = await handleError.call(this, "executing browser action", error)
        return [result]
    }
}
