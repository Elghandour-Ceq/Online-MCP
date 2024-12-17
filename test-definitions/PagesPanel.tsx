import React, { useState, useEffect, useCallback } from 'react';
import { Space, ContentItem, Page, Folder } from '../services/confluenceService';
import { LoadingSpinner } from './LoadingSpinner';
import { PageListItem } from './PageListItem';

interface PagesPanelProps {
    content: ContentItem[];
    selectedSpace: Space | null;
    loading: boolean;
    onReload?: () => void;
    onContentExpand: (item: ContentItem) => Promise<void>;
    onContentSelect: (item: ContentItem) => void;
    selectedContent: ContentItem[];
}

export const PagesPanel: React.FC<PagesPanelProps> = ({
    content,
    selectedSpace,
    loading,
    onReload,
    onContentExpand,
    onContentSelect,
    selectedContent
}) => {
    const [filters, setFilters] = useState({
        whiteboard: true,
        attachment: false,
        embed: true
    });

    // Debug logs for content
    useEffect(() => {
        if (content.length > 0) {
            console.log('[PagesPanel] Content array:', content);
            console.log('[PagesPanel] First item:', content[0]);
        }
    }, [content]);

    const logContentHierarchy = useCallback((item: ContentItem, level: number = 0) => {
        const indent = '  '.repeat(level);
        let icon = '📄';
        switch (item.type) {
            case 'folder':
                icon = '📁';
                break;
            case 'attachment':
                icon = '📎';
                break;
            case 'comment':
                icon = '💬';
                break;
            case 'embed':
                icon = '🔗';
                break;
            case 'whiteboard':
                icon = '🎨';
                break;
        }
        console.log(`${indent}${icon} ${item.title} (${item.type}, ID: ${item.id})`);
        if ('children' in item && item.children && item.children.length > 0) {
            console.group(`${indent}Children:`);
            item.children.forEach(child => {
                logContentHierarchy(child, level + 1);
            });
            console.groupEnd();
        }
    }, []);

    useEffect(() => {
        // Log the content hierarchy when content is loaded
        if (content.length > 0) {
            console.group('Content Hierarchy');
            content.forEach(item => {
                logContentHierarchy(item);
            });
            console.groupEnd();
        }
    }, [content, logContentHierarchy]);

    const handleItemSelect = (itemId: string) => {
        const item = getAllItems(content[0]).find(item => item.id === itemId);
        if (item) {
            onContentSelect(item);
        }
    };

    const toggleFilter = (filterType: keyof typeof filters) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: !prev[filterType]
        }));
    };

    // Get all items in the hierarchy
    const getAllItems = (item: ContentItem): ContentItem[] => {
        const result: ContentItem[] = [item];
        if ('children' in item && item.children) {
            item.children.forEach(child => {
                result.push(...getAllItems(child));
            });
        }
        return result;
    };

    // Filter content based on active filters
    const filteredContent = content.map(item => {
        const filterItem = (item: ContentItem): ContentItem | null => {
            if (!filters[item.type as keyof typeof filters] && 
                (item.type === 'whiteboard' || item.type === 'attachment' || item.type === 'embed')) {
                return null;
            }

            if ((item.type === 'page' || item.type === 'folder') && 'children' in item && item.children) {
                const filteredChildren = item.children
                    .map(child => filterItem(child))
                    .filter((child): child is ContentItem => child !== null);
                
                if (item.type === 'page') {
                    return {
                        ...item,
                        children: filteredChildren
                    } as Page;
                } else {
                    return {
                        ...item,
                        children: filteredChildren
                    } as Folder;
                }
            }

            return item;
        };

        return filterItem(item);
    }).filter((item): item is ContentItem => item !== null);

    // Count items by type
    const getSelectionSummary = () => {
        const counts = {
            folder: 0,
            page: 0,
            attachment: 0,
            comment: 0,
            embed: 0,
            whiteboard: 0
        };

        selectedContent.forEach(item => {
            counts[item.type] += 1;
        });

        const parts: string[] = [];
        if (counts.folder > 0) {
            parts.push(`${counts.folder} folder${counts.folder !== 1 ? 's' : ''}`);
        }
        if (counts.page > 0) {
            parts.push(`${counts.page} page${counts.page !== 1 ? 's' : ''}`);
        }
        if (counts.attachment > 0) {
            parts.push(`${counts.attachment} attachment${counts.attachment !== 1 ? 's' : ''}`);
        }
        if (counts.comment > 0) {
            parts.push(`${counts.comment} comment${counts.comment !== 1 ? 's' : ''}`);
        }
        if (counts.embed > 0) {
            parts.push(`${counts.embed} embed${counts.embed !== 1 ? 's' : ''}`);
        }
        if (counts.whiteboard > 0) {
            parts.push(`${counts.whiteboard} whiteboard${counts.whiteboard !== 1 ? 's' : ''}`);
        }

        return parts.join(', ');
    };

    // Debug log for filtered content
    useEffect(() => {
        console.log('[PagesPanel] Filtered content:', filteredContent);
    }, [filteredContent]);

    return (
        <div className="w-4/5 bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                            {selectedSpace && (
                                <>
                                    <span>{selectedSpace.name}</span>
                                    {content.length === 1 && content[0].type === 'page' && (
                                        <span className="text-gray-500">
                                            {' › '}{content[0].title}
                                        </span>
                                    )}
                                </>
                            )}
                            {loading && <LoadingSpinner />}
                        </h2>
                        {onReload && !loading && (
                            <button
                                onClick={onReload}
                                className="ml-2 p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                                title="Reload content"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => toggleFilter('whiteboard')}
                            className={`p-1.5 rounded-full ${filters.whiteboard ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-300 bg-gray-100'}`}
                            title="Toggle whiteboards"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button
                            onClick={() => toggleFilter('attachment')}
                            className={`p-1.5 rounded-full ${filters.attachment ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-300 bg-gray-100'}`}
                            title="Toggle attachments"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button
                            onClick={() => toggleFilter('embed')}
                            className={`p-1.5 rounded-full ${filters.embed ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-300 bg-gray-100'}`}
                            title="Toggle embeds"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-300px)]">
                <ul className="divide-y divide-gray-200">
                    {filteredContent.map((item) => {
                        console.log(`[PagesPanel] Rendering item:`, {
                            id: item.id,
                            title: item.title,
                            isFirstItem: item.isFirstItem
                        });
                        return (
                            <PageListItem
                                key={item.id}
                                item={item}
                                level={0}
                                isSelected={selectedContent.some(content => content.id === item.id)}
                                selectedItems={new Set(selectedContent.map(item => item.id))}
                                onSelect={handleItemSelect}
                                onExpand={onContentExpand}
                            />
                        );
                    })}
                </ul>
                {filteredContent.length === 0 && !loading && (
                    <div className="p-4 text-center text-gray-500">
                        No content found in this space
                    </div>
                )}
            </div>
            {selectedContent.length > 0 && (
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                            {getSelectionSummary()}
                        </span>
                        <button
                            onClick={() => selectedContent.forEach(item => onContentSelect(item))}
                            className="text-sm text-gray-600 hover:text-gray-900"
                        >
                            Clear selection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
