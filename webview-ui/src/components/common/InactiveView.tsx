import React from 'react';
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { vscode } from "../../utils/vscode";

const InactiveView: React.FC = () => {
    const handleRetryClick = () => {
        vscode.postMessage({
            type: "retryUpdate"
        });
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '20px',
            textAlign: 'center',
            gap: '20px'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxWidth: '400px'
            }}>
                <h2>Extension Update Required</h2>
                <p>The extension is currently inactive due to a failed update check. Please ensure you are connected to the CEQUENS VPN and try again.</p>
                <VSCodeButton onClick={handleRetryClick}>
                    Retry Update Check
                </VSCodeButton>
            </div>
        </div>
    );
};

export default InactiveView;
