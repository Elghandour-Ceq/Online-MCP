import * as path from "path"
import Parser from "web-tree-sitter"
import {
    javascriptQuery,
    typescriptQuery,
    pythonQuery,
    rustQuery,
    goQuery,
    cppQuery,
    cQuery,
    csharpQuery,
    rubyQuery,
    javaQuery,
    phpQuery,
    swiftQuery,
} from "./queries"

export interface LanguageParser {
    [key: string]: {
        parser: Parser
        query: Parser.Query
    }
}

async function loadLanguage(langName: string) {
    // In test environment, look for WASM files in __tests__ directory
    const isTest = process.env.NODE_ENV === 'test';
    const wasmPath = isTest 
        ? path.join(__dirname, '__tests__', `tree-sitter-${langName}.wasm`)
        : path.join(__dirname, `tree-sitter-${langName}.wasm`);
    return await Parser.Language.load(wasmPath);
}

let isParserInitialized = false

async function initializeParser() {
    if (!isParserInitialized) {
        await Parser.init()
        isParserInitialized = true
    }
}

export async function loadRequiredLanguageParsers(filesToParse: string[]): Promise<LanguageParser> {
    await initializeParser()
    const extensionsToLoad = new Set(filesToParse.map((file) => path.extname(file).toLowerCase().slice(1)))
    const parsers: LanguageParser = {}
    for (const ext of extensionsToLoad) {
        let language: Parser.Language
        let query: Parser.Query
        switch (ext) {
            case "js":
            case "jsx":
                language = await loadLanguage("javascript")
                query = language.query(javascriptQuery)
                break
            case "ts":
                language = await loadLanguage("typescript")
                query = language.query(typescriptQuery)
                break
            case "tsx":
                language = await loadLanguage("tsx")
                query = language.query(typescriptQuery)
                break
            case "py":
                language = await loadLanguage("python")
                query = language.query(pythonQuery)
                break
            case "rs":
                language = await loadLanguage("rust")
                query = language.query(rustQuery)
                break
            case "go":
                language = await loadLanguage("go")
                query = language.query(goQuery)
                break
            case "cpp":
            case "hpp":
                language = await loadLanguage("cpp")
                query = language.query(cppQuery)
                break
            case "c":
            case "h":
                language = await loadLanguage("c")
                query = language.query(cQuery)
                break
            case "cs":
                language = await loadLanguage("c_sharp")
                query = language.query(csharpQuery)
                break
            case "rb":
                language = await loadLanguage("ruby")
                query = language.query(rubyQuery)
                break
            case "java":
                language = await loadLanguage("java")
                query = language.query(javaQuery)
                break
            case "php":
                language = await loadLanguage("php")
                query = language.query(phpQuery)
                break
            case "swift":
                language = await loadLanguage("swift")
                query = language.query(swiftQuery)
                break
            default:
                throw new Error(`Unsupported language: ${ext}`)
        }
        const parser = new Parser()
        parser.setLanguage(language)
        parsers[ext] = { parser, query }
    }
    return parsers
}
