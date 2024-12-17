/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json'
        }]
    },
    setupFilesAfterEnv: [
        '<rootDir>/src/services/tree-sitter/__tests__/setup.js'
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'wasm'],
    testMatch: [
        '**/__tests__/**/*.test.[jt]s?(x)',
        '**/?(*.)+(spec|test).[jt]s?(x)'
    ],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/test/vscode.mock.js',
        'globby': '<rootDir>/src/test/globby.mock.js',
        '\\.wasm$': '<rootDir>/node_modules/tree-sitter-wasms/tree-sitter-$1.wasm'
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(web-tree-sitter|tree-sitter-wasms)/)'
    ]
}
