import React, { useState, useMemo } from 'react';
import { BiSearch, BiPlus } from 'react-icons/bi';
import { Space, ContentItem, Page, Folder } from '../services/confluenceService';
import { LoadingSpinner } from './LoadingSpinner';
import { SpaceListItem } from './SpaceListItem';

interface SpacesPanelProps {
    spaces: Space[];
    selectedSpace: Space | null;
    loading: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    content: ContentItem[];
    onSpaceSelect: (space: Space) => void;
}

// Helper function to check if item is expandable (Page or Folder)
const isExpandableItem = (item: ContentItem): item is Page | Folder => {
    return item.type === 'page' || item.type === 'folder';
};

// Helper function to count all items in a content tree
const countContentItems = (items: ContentItem[]): number => {
    return items.reduce((count, item) => {
        // Count the current item
        let itemCount = 1;
        // If the item is expandable and has children and is expanded, recursively count them
        if (isExpandableItem(item) && item.children && item.isExpanded) {
            itemCount += countContentItems(item.children);
        }
        return count + itemCount;
    }, 0);
};

export const SpacesPanel: React.FC<SpacesPanelProps> = ({
    spaces,
    selectedSpace,
    loading,
    loadingMore,
    hasMore,
    content,
    onSpaceSelect
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredSpaces = useMemo(() => {
        if (!searchQuery.trim()) return spaces;
        
        return spaces.filter(space => 
            space.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            space.key?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [spaces, searchQuery]);

    return (
        <div className="w-1/5 bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-3">
                    Spaces
                    {loading && <LoadingSpinner />}
                </h2>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Quick search spaces..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <BiSearch className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                </div>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-300px)]">
                <ul>
                    {filteredSpaces.map((space) => (
                        <SpaceListItem
                            key={space.id}
                            space={space}
                            isSelected={selectedSpace?.id === space.id}
                            selectedItemsCount={selectedSpace?.id === space.id ? countContentItems(content) : 0}
                            onSelect={() => onSpaceSelect(space)}
                        />
                    ))}
                    {hasMore && !loadingMore && searchQuery.trim() === '' && (
                        <li>
                            <button
                                onClick={() => onSpaceSelect({ type: 'LOAD_MORE_SPACES' } as Space)}
                                className="w-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                            >
                                <BiPlus className="h-5 w-5" />
                                Load more spaces
                            </button>
                        </li>
                    )}
                    {loadingMore && (
                        <li className="px-4 py-2 text-sm text-gray-500 flex items-center gap-2">
                            <LoadingSpinner size="small" />
                            Loading more spaces...
                        </li>
                    )}
                </ul>
                {!loading && filteredSpaces.length === 0 && (
                    <div className="p-4 text-center text-gray-500">
                        {searchQuery.trim() ? 'No matching spaces found' : 'No spaces found'}
                    </div>
                )}
            </div>
        </div>
    );
};
