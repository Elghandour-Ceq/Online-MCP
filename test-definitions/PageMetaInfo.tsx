import React from 'react';
import { ContentItem } from '../services/confluenceService';

interface PageMetaInfoProps {
    item: ContentItem;
    childCount?: number;
    showChildCount?: boolean;
}

export const PageMetaInfo: React.FC<PageMetaInfoProps> = ({ 
    item, 
    childCount = 0, 
    showChildCount = false
}) => {
    const getTypeSpecificInfo = () => {
        switch (item.type) {
            case 'attachment':
                if ('mediaType' in item && item.mediaType) {
                    return (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                            {item.mediaType}
                            {item.fileSize && ` • ${(item.fileSize / 1024).toFixed(1)} KB`}
                        </span>
                    );
                }
                return null;
            case 'page':
            case 'folder':
            case 'embed':
            case 'whiteboard':
                if ('version' in item && item.version) {
                    return (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                            v{item.version.number} • {new Date(item.version.when).toLocaleDateString()}
                        </span>
                    );
                }
                return null;
            default:
                return null;
        }
    };

    return (
        <div className="flex items-center">
            {showChildCount && (
                <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    ({childCount} items)
                </span>
            )}
            {getTypeSpecificInfo()}
            {'status' in item && item.status !== 'current' && (
                <span className="ml-1.5 inline-flex rounded-full bg-green-100 dark:bg-green-900/50 
                               px-2 text-xs font-semibold leading-4 text-green-800 dark:text-green-300 flex-shrink-0">
                    {item.status}
                </span>
            )}
        </div>
    );
};
