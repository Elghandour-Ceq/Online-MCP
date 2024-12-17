import { Anthropic } from "@anthropic-ai/sdk"
import * as path from "path"
import * as diff from "diff"

export const formatResponse = {
	toolDenied: () => `The user denied this operation.`,

	toolDeniedWithFeedback: (feedback?: string) =>
		`The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`,

	toolError: (error?: string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`,

	noToolsUsed: () =>
		`[ERROR] You did not use a tool in your previous response! Please retry with a tool use.

${toolUseInstructionsReminder}

# Next Steps

If you have completed the user's task, use the attempt_completion tool. 
If you require additional information from the user, use the ask_followup_question tool. 
Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. 
(This is an automated message, so do not respond to it conversationally.)`,

	tooManyMistakes: (feedback?: string) =>
		`You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,

	missingToolParameterError: (paramName: string) =>
		`Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${toolUseInstructionsReminder}`,

	toolResult: (
		text: string,
		images?: string[],
	): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
		console.log("[DEBUG] toolResult - Processing tool result with images:", !!images)
		if (images && images.length > 0) {
			console.log("[DEBUG] Creating image blocks for tool result")
			const textBlock: Anthropic.TextBlockParam = { type: "text", text }
			const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
			console.log("[DEBUG] Created image blocks:", imageBlocks.length)
			// Placing images after text leads to better results
			return [textBlock, ...imageBlocks]
		} else {
			return text
		}
	},

	imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
		console.log("[DEBUG] imageBlocks - Creating image blocks from images:", !!images)
		const blocks = formatImagesIntoBlocks(images)
		console.log("[DEBUG] Created image blocks:", blocks.length)
		return blocks
	},

	formatFilesList: (absolutePath: string, files: string[], didHitLimit: boolean): string => {
		const sorted = files
			.map((file) => {
				// convert absolute path to relative path
				const relativePath = path.relative(absolutePath, file).toPosix()
				return file.endsWith("/") ? relativePath + "/" : relativePath
			})
			// Sort so files are listed under their respective directories to make it clear what files are children of what directories. Since we build file list top down, even if file list is truncated it will show directories that cline can then explore further.
			.sort((a, b) => {
				const aParts = a.split("/") // only works if we use toPosix first
				const bParts = b.split("/")
				for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
					if (aParts[i] !== bParts[i]) {
						// If one is a directory and the other isn't at this level, sort the directory first
						if (i + 1 === aParts.length && i + 1 < bParts.length) {
							return -1
						}
						if (i + 1 === bParts.length && i + 1 < aParts.length) {
							return 1
						}
						// Otherwise, sort alphabetically
						return aParts[i].localeCompare(bParts[i], undefined, { numeric: true, sensitivity: "base" })
					}
				}
				// If all parts are the same up to the length of the shorter path,
				// the shorter one comes first
				return aParts.length - bParts.length
			})
		if (didHitLimit) {
			return `${sorted.join(
				"\n",
			)}\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)`
		} else if (sorted.length === 0 || (sorted.length === 1 && sorted[0] === "")) {
			return "No files found."
		} else {
			return sorted.join("\n")
		}
	},

	createPrettyPatch: (filename = "file", oldStr?: string, newStr?: string) => {
		// strings cannot be undefined or diff throws exception
		const patch = diff.createPatch(filename.toPosix(), oldStr || "", newStr || "")
		const lines = patch.split("\n")
		const prettyPatchLines = lines.slice(4)
		return prettyPatchLines.join("\n")
	},
}

// to avoid circular dependency
const formatImagesIntoBlocks = (images?: string[]): Anthropic.ImageBlockParam[] => {
	console.log("[DEBUG] formatImagesIntoBlocks - Starting image formatting")
	if (!images || images.length === 0) {
		console.log("[DEBUG] No images to format")
		return []
	}

	return images.map((dataUrl, index) => {
		console.log(`[DEBUG] Processing image ${index + 1}/${images.length}`)
		try {
			// data:image/png;base64,base64string
			const [header, base64] = dataUrl.split(",")
			console.log("[DEBUG] Image header:", header)
			
			if (!header || !base64) {
				console.error("[DEBUG] Invalid data URL format")
				throw new Error("Invalid data URL format")
			}

			// Extract mime type from header
			const mimeType = header.split(":")[1]?.split(";")[0]
			console.log("[DEBUG] Extracted mime type:", mimeType)
			
			if (!mimeType || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType)) {
				console.error("[DEBUG] Unsupported mime type:", mimeType)
				throw new Error(`Unsupported mime type: ${mimeType}`)
			}

			// Clean and validate base64 data
			const cleanBase64 = base64.replace(/\s/g, "")
			console.log("[DEBUG] Base64 data length:", cleanBase64.length)
			
			if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
				console.error("[DEBUG] Invalid base64 format")
				throw new Error("Invalid base64 format")
			}

			// Ensure base64 length is valid (must be multiple of 4)
			if (cleanBase64.length % 4 !== 0) {
				console.error("[DEBUG] Invalid base64 length")
				throw new Error("Invalid base64 length")
			}

			const block = {
				type: "image",
				source: {
					type: "base64",
					media_type: mimeType,
					data: cleanBase64
				}
			} as Anthropic.ImageBlockParam

			console.log("[DEBUG] Successfully created image block:", {
				type: block.type,
				source: {
					type: block.source.type,
					media_type: block.source.media_type,
					dataLength: block.source.data.length
				}
			})

			return block
		} catch (error) {
			console.error("[DEBUG] Error formatting image:", error)
			throw new Error(`Failed to format image: ${error.message}`)
		}
	})
}

const toolUseInstructionsReminder = `# Reminder: Instructions for Tool Use

Tool uses are formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

Always adhere to this format for all tool uses to ensure proper parsing and execution.`
