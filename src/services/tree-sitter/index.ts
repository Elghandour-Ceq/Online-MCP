import * as fs from "fs/promises"
import * as path from "path"
import { listFiles } from "../glob/list-files"
import { LanguageParser, loadRequiredLanguageParsers } from "./languageParser"
import { fileExistsAtPath } from "../../utils/fs"

export async function parseSourceCodeForDefinitionsTopLevel(dirPath: string, recursive: boolean = false): Promise<string> {
	const dirExists = await fileExistsAtPath(path.resolve(dirPath))
	if (!dirExists) {
		return "This directory does not exist or you do not have permission to access it."
	}

	// Get all files, using recursive parameter
	const [allFiles, _] = await listFiles(dirPath, recursive, 200)
	let result = ""

	// Group files by directory in recursive mode
	const filesByDir = new Map<string, string[]>()
	allFiles.forEach(file => {
		const dir = recursive ? path.dirname(path.relative(dirPath, file)) : '.'
		if (!filesByDir.has(dir)) {
			filesByDir.set(dir, [])
		}
		filesByDir.get(dir)?.push(file)
	})

	// Process files directory by directory
	for (const [dir, files] of filesByDir) {
		const { filesToParse } = separateFiles(files)
		if (filesToParse.length === 0) {
			continue
		}

		const languageParsers = await loadRequiredLanguageParsers(filesToParse)
		let dirResult = ""

		for (const file of filesToParse) {
			const definitions = await parseFile(file, languageParsers)
			if (definitions) {
				// Use only the filename for file entries
				const filename = path.basename(file)
				dirResult += `${filename}\n${definitions}\n`
			}
		}

		if (dirResult) {
			// Add directory header in recursive mode with full path
			if (recursive && dir !== '.') {
				const dirPath = dir.replace(/\\/g, '/')
				result += `[${dirPath}]\n${dirResult}`
			} else {
				result += dirResult
			}
		}
	}

	return result ? result : "No source code definitions found."
}

function separateFiles(allFiles: string[]): { filesToParse: string[]; remainingFiles: string[] } {
	const extensions = [
		"js", "jsx", "ts", "tsx", "py",
		"rs", "go",
		"c", "h",
		"cpp", "hpp",
		"cs",
		"rb", "java", "php", "swift",
	].map((e) => `.${e}`)
	const filesToParse = allFiles.filter((file) => extensions.includes(path.extname(file))).slice(0, 200)
	const remainingFiles = allFiles.filter((file) => !filesToParse.includes(file))
	return { filesToParse, remainingFiles }
}

async function parseFile(filePath: string, languageParsers: LanguageParser): Promise<string | undefined> {
	const fileContent = await fs.readFile(filePath, "utf8")
	const ext = path.extname(filePath).toLowerCase().slice(1)

	const { parser, query } = languageParsers[ext] || {}
	if (!parser || !query) {
		return undefined
	}

	let formattedOutput = ""
	const seenDefinitions = new Set<string>()

	try {
		const tree = parser.parse(fileContent)
		const captures = query.captures(tree.rootNode)
		captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row)

		const lines = fileContent.split("\n")
		let lastLine = -1
		let currentSection = ""

		captures.forEach((capture) => {
			const { node, name } = capture
			if (!name.includes("name")) {
				return
			}

			const startLine = node.startPosition.row
			const line = lines[startLine].trim()

			// Skip duplicates
			if (seenDefinitions.has(line)) {
				return
			}
			seenDefinitions.add(line)

			// Add separator if there's a gap between captures
			if (lastLine !== -1 && startLine > lastLine + 1 && currentSection) {
				formattedOutput += currentSection + "|----\n"
				currentSection = ""
			}

			currentSection += `│${line}\n`
			lastLine = node.endPosition.row
		})

		// Add the final section
		if (currentSection) {
			formattedOutput += currentSection + "|----\n"
		}
	} catch (error) {
		console.log(`Error parsing file: ${error}\n`)
	}

	return formattedOutput ? `|----\n${formattedOutput}` : undefined
}
