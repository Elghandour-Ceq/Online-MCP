import axios from "axios"
import * as path from "path"
import * as vscode from "vscode"
import { ApiProvider, ModelInfo } from "../../../shared/api"
import { readJsonFile, writeJsonFile, ensureJsonDirectory } from "../../../utils/json-storage"
import { buildApiHandler } from "../../../api"
import { Cline } from "../../cline/Cline"
import { StateManager } from "../state/StateManager"

export class ApiProviderManager {
    constructor(
        private readonly stateManager: StateManager,
        private readonly globalStoragePath: string,
        private readonly globalFileNames: { openRouterModels: string }
    ) {}

    async getOllamaModels(baseUrl?: string): Promise<string[]> {
        try {
            if (!baseUrl) {
                baseUrl = "http://localhost:11434"
            }
            if (!URL.canParse(baseUrl)) {
                return []
            }
            const response = await axios.get(`${baseUrl}/api/tags`)
            const modelsArray = response.data?.models?.map((model: any) => model.name) || []
            const models = [...new Set<string>(modelsArray)]
            return models
        } catch (error) {
            return []
        }
    }

    async getLmStudioModels(baseUrl?: string): Promise<string[]> {
        try {
            if (!baseUrl) {
                baseUrl = "http://localhost:1234"
            }
            if (!URL.canParse(baseUrl)) {
                return []
            }
            const response = await axios.get(`${baseUrl}/v1/models`)
            const modelsArray = response.data?.data?.map((model: any) => model.id) || []
            const models = [...new Set<string>(modelsArray)]
            return models
        } catch (error) {
            return []
        }
    }

    async handleOpenRouterCallback(code: string, cline?: Cline): Promise<{ apiKey: string; provider: ApiProvider }> {
        let apiKey: string
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/auth/keys", { code })
            if (response.data && response.data.key) {
                apiKey = response.data.key
            } else {
                throw new Error("Invalid response from OpenRouter API")
            }
        } catch (error) {
            console.error("Error exchanging code for API key:", error)
            throw error
        }

        const openrouter: ApiProvider = "openrouter"
        await this.stateManager.updateGlobalState("apiProvider", openrouter)
        await this.stateManager.storeSecret("openRouterApiKey", apiKey)

        if (cline) {
            cline.api = buildApiHandler({ apiProvider: openrouter, openRouterApiKey: apiKey })
        }

        return { apiKey, provider: openrouter }
    }

    async ensureCacheDirectoryExists(): Promise<string> {
        const cacheDir = path.join(this.globalStoragePath, "cache")
        await ensureJsonDirectory(cacheDir)
        return cacheDir
    }

    getCachePath(): string {
        return this.globalStoragePath
    }

    async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
        const openRouterModelsFilePath = path.join(
            await this.ensureCacheDirectoryExists(),
            this.globalFileNames.openRouterModels
        )
        
        return await readJsonFile<Record<string, ModelInfo>>(openRouterModelsFilePath, {
            warningMessage: "OpenRouter models cache is corrupted. Models will be refreshed from the API.",
            defaultValue: undefined,
            createBackup: true,
            deleteOnError: true // Delete corrupted cache to force refresh
        })
    }

    async refreshOpenRouterModels(): Promise<Record<string, ModelInfo>> {
        const openRouterModelsFilePath = path.join(
            await this.ensureCacheDirectoryExists(),
            this.globalFileNames.openRouterModels
        )

        let models: Record<string, ModelInfo> = {}
        try {
            const response = await axios.get("https://openrouter.ai/api/v1/models")
            if (response.data?.data) {
                const rawModels = response.data.data
                const parsePrice = (price: any) => {
                    if (price) {
                        return parseFloat(price) * 1_000_000
                    }
                    return undefined
                }
                for (const rawModel of rawModels) {
                    const modelInfo: ModelInfo = {
                        maxTokens: rawModel.top_provider?.max_completion_tokens,
                        contextWindow: rawModel.context_length,
                        supportsImages: rawModel.architecture?.modality?.includes("image"),
                        supportsPromptCache: false,
                        inputPrice: parsePrice(rawModel.pricing?.prompt),
                        outputPrice: parsePrice(rawModel.pricing?.completion),
                        description: rawModel.description,
                    }

                    switch (rawModel.id) {
                        case "anthropic/claude-3.5-sonnet":
                        case "anthropic/claude-3.5-sonnet:beta":
                            modelInfo.supportsComputerUse = true
                            modelInfo.supportsPromptCache = true
                            modelInfo.cacheWritesPrice = 3.75
                            modelInfo.cacheReadsPrice = 0.3
                            break
                        case "anthropic/claude-3.5-sonnet-20240620":
                        case "anthropic/claude-3.5-sonnet-20240620:beta":
                            modelInfo.supportsPromptCache = true
                            modelInfo.cacheWritesPrice = 3.75
                            modelInfo.cacheReadsPrice = 0.3
                            break
                        case "anthropic/claude-3-5-haiku":
                        case "anthropic/claude-3-5-haiku:beta":
                        case "anthropic/claude-3-5-haiku-20241022":
                        case "anthropic/claude-3-5-haiku-20241022:beta":
                        case "anthropic/claude-3.5-haiku":
                        case "anthropic/claude-3.5-haiku:beta":
                        case "anthropic/claude-3.5-haiku-20241022":
                        case "anthropic/claude-3.5-haiku-20241022:beta":
                            modelInfo.supportsPromptCache = true
                            modelInfo.cacheWritesPrice = 1.25
                            modelInfo.cacheReadsPrice = 0.1
                            break
                        case "anthropic/claude-3-opus":
                        case "anthropic/claude-3-opus:beta":
                            modelInfo.supportsPromptCache = true
                            modelInfo.cacheWritesPrice = 18.75
                            modelInfo.cacheReadsPrice = 1.5
                            break
                        case "anthropic/claude-3-haiku":
                        case "anthropic/claude-3-haiku:beta":
                            modelInfo.supportsPromptCache = true
                            modelInfo.cacheWritesPrice = 0.3
                            modelInfo.cacheReadsPrice = 0.03
                            break
                    }

                    models[rawModel.id] = modelInfo
                }
            } else {
                console.error("Invalid response from OpenRouter API")
            }
            await writeJsonFile(openRouterModelsFilePath, models, true)
            console.log("OpenRouter models fetched and saved", models)
        } catch (error) {
            console.error("Error fetching OpenRouter models:", error)
        }

        return models
    }
}
