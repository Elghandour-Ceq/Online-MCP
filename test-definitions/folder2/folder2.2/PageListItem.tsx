import React, { useState, useEffect, useCallback } from 'react';
import { BiShow } from 'react-icons/bi';
import { ContentItem, confluenceService } from '../services/confluenceService';
import { authService } from '../services/authService';
import { PageIcon } from './PageIcon';
import { PageMetaInfo } from './PageMetaInfo';
import { ExpandButton } from './ExpandButton';

interface PageListItemProps {
    item: ContentItem;
    level?: number;
    isSelected: boolean;
    selectedItems: Set<string>;
    onSelect: (itemId: string, selected: boolean) => void;
    onExpand: (item: ContentItem) => Promise<void>;
}

export const PageListItem: React.FC<PageListItemProps> = ({ 
    item, 
    level = 0,
    isSelected,
    selectedItems,
    onSelect,
    onExpand
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    const hasChildren: boolean = !!(
        ('hasUnloadedChildren' in item && item.hasUnloadedChildren) || 
        ('children' in item && item.children && item.children.length > 0)
    );

    const expandItem = useCallback(async () => {
        if (hasChildren && item.id) {
            setIsLoading(true);
            try {
                await onExpand(item);
                setIsExpanded(true);
            } catch (error) {
                console.error('[PageListItem] Failed to expand item:', error);
            } finally {
                setIsLoading(false);
            }
        }
    }, [hasChildren, item, onExpand]);

    useEffect(() => {
        const autoExpand = async () => {
            if (item.isFirstItem && hasChildren && !isExpanded && !isLoading) {
                await expandItem();
            }
        };

        requestAnimationFrame(() => {
            autoExpand();
        });
    }, [item, hasChildren, expandItem, isExpanded, isLoading]);

    const handleExpandClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!isExpanded && hasChildren) {
            await expandItem();
        } else {
            setIsExpanded(false);
        }
    };

    const handlePreviewClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await confluenceService.getPageHtml(item.id);
        } catch (error) {
            console.error('Failed to preview page:', error);
        }
    };

    const childCount = 'children' in item && item.children ? item.children.length : 0;
    const showChildCount = hasChildren && (!('hasUnloadedChildren' in item && item.hasUnloadedChildren) || childCount > 0);

    const getConfluenceUrl = () => {
        if ('_links' in item && item._links?.webui) {
            const credentials = authService.getCredentials();
            if (credentials) {
                const domain = credentials.domain.replace(/\/$/, '');
                const relativePath = item._links.webui.split('/wiki').pop();
                return `${domain}/wiki${relativePath}`;
            }
        }
        return null;
    };

    const pageUrl = getConfluenceUrl();

    return (
        <div className="content-item">
            <div 
                className="page-list-item"
                style={{ marginLeft: `${level * 1.25}rem` }}
            >
                <div className="px-1.5 py-0.5">
                    <div className="flex items-center min-w-0">
                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <ExpandButton
                                hasChildren={hasChildren}
                                isExpanded={isExpanded}
                                isLoading={isLoading}
                                onExpandClick={handleExpandClick}
                            />
                            <div className="flex-shrink-0">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 text-blue-600 dark:text-blue-500 
                                             rounded border-gray-300 dark:border-gray-600 
                                             focus:ring-blue-500 dark:focus:ring-blue-400
                                             dark:bg-gray-700 dark:checked:bg-blue-500"
                                    checked={isSelected}
                                    onChange={(e) => onSelect(item.id, e.target.checked)}
                                />
                            </div>
                            <PageIcon type={item.type} />
                        </div>
                        <div className="flex items-center min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                                <button 
                                    onClick={handlePreviewClick}
                                    className="text-sm font-medium text-gray-700 dark:text-gray-200 
                                             hover:text-blue-600 dark:hover:text-blue-400 truncate"
                                >
                                    {item.title}
                                </button>
                                {item.type === 'page' && pageUrl && (
                                    <a
                                        href={pageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 text-gray-400 dark:text-gray-500 
                                                 hover:text-gray-600 dark:hover:text-gray-300 
                                                 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600"
                                        title="Open in Confluence"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <BiShow className="h-3.5 w-3.5" />
                                    </a>
                                )}
                            </div>
                            <PageMetaInfo
                                item={item}
                                childCount={childCount}
                                showChildCount={showChildCount}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {hasChildren && isExpanded && 'children' in item && item.children && (
                <div className="children-container">
                    {item.children.map((childItem) => (
                        <PageListItem
                            key={childItem.id}
                            item={childItem}
                            level={level + 1}
                            isSelected={selectedItems.has(childItem.id)}
                            selectedItems={selectedItems}
                            onSelect={onSelect}
                            onExpand={onExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
