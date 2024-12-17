const Parser = require('web-tree-sitter');
const path = require('path');
const fs = require('fs');

beforeAll(async () => {
    // Initialize Parser
    await Parser.init();

    // Add required globals
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;

    // Copy language WASM files to the test environment
    // tree sitter
    const sourceDir = path.join(process.cwd(), "node_modules", "web-tree-sitter")
    const targetDir = __dirname

    // Copy tree-sitter.wasm
    fs.copyFileSync(path.join(sourceDir, "tree-sitter.wasm"), path.join(targetDir, "tree-sitter.wasm"))

    // Copy language-specific WASM files
    const languageWasmDir = path.join(process.cwd(), "node_modules", "tree-sitter-wasms", "out")
    const languages = [
        "typescript",
        "tsx",
        "python",
        "rust",
        "javascript",
        "go",
        "cpp",
        "c",
        "c_sharp",
        "ruby",
        "java",
        "php",
        "swift",
    ]

    languages.forEach((lang) => {
        const filename = `tree-sitter-${lang}.wasm`
        fs.copyFileSync(path.join(languageWasmDir, filename), path.join(targetDir, filename))
    })
});
