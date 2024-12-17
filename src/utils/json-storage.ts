import * as fs from "fs/promises"
import * as vscode from "vscode"
import { fileExistsAtPath } from "./fs"

interface JsonStorageOptions {
    /** Custom message to show in warning notification */
    warningMessage?: string;
    /** Whether to create a backup of corrupted files */
    createBackup?: boolean;
    /** Whether to reset corrupted files to a default value */
    resetOnError?: boolean;
    /** Default value to use when resetting corrupted files */
    defaultValue?: any;
    /** Whether to delete the corrupted file instead of resetting it */
    deleteOnError?: boolean;
    /** Number of retry attempts for reading the file */
    retryAttempts?: number;
    /** Delay between retry attempts in milliseconds */
    retryDelay?: number;
}

const defaultOptions: JsonStorageOptions = {
    createBackup: true,
    resetOnError: false,
    defaultValue: [],
    deleteOnError: false,
    retryAttempts: 3,
    retryDelay: 100
}

/**
 * Safely reads and parses a JSON file with error handling and retry mechanism
 * @param filePath Path to the JSON file
 * @param options Configuration options for error handling
 * @returns Parsed JSON data or undefined if file doesn't exist
 */
export async function readJsonFile<T>(filePath: string, options: JsonStorageOptions = {}): Promise<T | undefined> {
    const opts = { ...defaultOptions, ...options }
    
    if (!await fileExistsAtPath(filePath)) {
        return undefined
    }

    let attempts = 0
    while (attempts < opts.retryAttempts!) {
        try {
            const content = await fs.readFile(filePath, "utf8")
            return JSON.parse(content) as T
        } catch (error) {
            attempts++
            console.error(`[ERROR] Failed to parse JSON file ${filePath} (Attempt ${attempts}):`, error)
            if (attempts < opts.retryAttempts!) {
                await new Promise(resolve => setTimeout(resolve, opts.retryDelay))
            } else {
                console.error(`[ERROR] Exceeded maximum retry attempts for ${filePath}`)
            }
        }
    }

    if (opts.warningMessage) {
        vscode.window.showWarningMessage(opts.warningMessage)
    }

    if (opts.deleteOnError) {
        try {
            await fs.unlink(filePath)
            console.log(`[DEBUG] Deleted corrupted file ${filePath}`)
        } catch (deleteError) {
            console.error(`[ERROR] Failed to delete corrupted file ${filePath}:`, deleteError)
        }
    } else if (opts.resetOnError) {
        try {
            await fs.writeFile(filePath, JSON.stringify(opts.defaultValue))
            console.log(`[DEBUG] Reset corrupted file ${filePath} to default value`)
            return opts.defaultValue as T
        } catch (resetError) {
            console.error(`[ERROR] Failed to reset corrupted file ${filePath}:`, resetError)
        }
    }

    return opts.defaultValue as T
}

/**
 * Safely writes data to a JSON file
 * @param filePath Path to write the JSON file
 * @param data Data to write
 * @param pretty Whether to pretty print the JSON
 */
export async function writeJsonFile(filePath: string, data: any, pretty: boolean = false): Promise<void> {
    try {
        const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
        await fs.writeFile(filePath, content)
    } catch (error) {
        console.error(`[ERROR] Failed to write JSON file ${filePath}:`, error)
        throw error
    }
}

/**
 * Ensures a directory exists for JSON storage
 * @param dirPath Directory path to ensure exists
 */
export async function ensureJsonDirectory(dirPath: string): Promise<void> {
    try {
        await fs.mkdir(dirPath, { recursive: true })
    } catch (error) {
        console.error(`[ERROR] Failed to create directory ${dirPath}:`, error)
        throw error
    }
}
