import React, { useMemo } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"

const TotalCostDisplay: React.FC = () => {
    const { apiConfiguration, taskHistory } = useExtensionState()

    const historicalTotalCost = useMemo(() => {
        if (!taskHistory) return 0
        return taskHistory.reduce((sum, task) => sum + (task.totalCost || 0), 0)
    }, [taskHistory])

    const isCostAvailable = useMemo(() => {
        return (
            apiConfiguration?.apiProvider !== "openai" &&
            apiConfiguration?.apiProvider !== "ollama" &&
            apiConfiguration?.apiProvider !== "lmstudio" &&
            apiConfiguration?.apiProvider !== "gemini"
        )
    }, [apiConfiguration?.apiProvider])

    if (!isCostAvailable || historicalTotalCost === 0) {
        return null
    }

    return (
        <div
            style={{
                backgroundColor: "var(--vscode-badge-background)",
                color: "var(--vscode-badge-foreground)",
                borderRadius: "3px",
                padding: "6px 10px",
                marginBottom: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}>
            <span style={{ fontWeight: "bold" }}>Total Historical Cost:</span>
            <span>${historicalTotalCost.toFixed(4)}</span>
        </div>
    )
}

export default TotalCostDisplay
