import React from 'react';
import { BiChevronRight } from 'react-icons/bi';
import { LoadingSpinner } from './LoadingSpinner';

interface ExpandButtonProps {
    hasChildren: boolean;
    isExpanded: boolean;
    isLoading: boolean;
    onExpandClick: (e: React.MouseEvent) => void;
}

export const ExpandButton: React.FC<ExpandButtonProps> = ({
    hasChildren,
    isExpanded,
    isLoading,
    onExpandClick
}) => {
    if (!hasChildren) {
        return <span className="w-4 h-4 inline-block" />;
    }

    return (
        <button
            onClick={onExpandClick}
            className="w-4 h-4 inline-flex items-center justify-center 
                     hover:bg-gray-100 dark:hover:bg-gray-700 
                     text-gray-500 dark:text-gray-400
                     hover:text-gray-700 dark:hover:text-gray-300 
                     rounded-sm transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
            {isLoading ? (
                <LoadingSpinner size="small" />
            ) : (
                <BiChevronRight 
                    className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
            )}
        </button>
    );
};
