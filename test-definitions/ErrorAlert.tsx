import React from 'react';
import { BiXCircle } from 'react-icons/bi';
import { BiRefresh } from 'react-icons/bi';

interface ErrorAlertProps {
    message: string;
    onRetry?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onRetry }) => (
    <div className="error-alert">
        <div className="flex items-center">
            <div className="flex-shrink-0">
                <BiXCircle className="error-alert-icon" />
            </div>
            <div className="ml-3 flex items-center flex-1">
                <h3 className="error-alert-message">{message}</h3>
                {onRetry && (
                    <button onClick={onRetry} className="error-alert-retry">
                        <BiRefresh className="error-alert-retry-icon" />
                        Retry
                    </button>
                )}
            </div>
        </div>
    </div>
);
