import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BiGlobe, BiUser } from 'react-icons/bi';
import { Space } from '../services/confluenceService';

interface SpaceListItemProps {
    space: Space;
    isSelected: boolean;
    selectedItemsCount: number;
    onSelect: (space: Space) => void;
}

interface TooltipProps {
    space: Space;
    position: { top: number; left: number } | null;
    onClose: () => void;
}

const Tooltip: React.FC<TooltipProps> = ({ space, position, onClose }) => {
    if (!position) return null;

    return createPortal(
        <div 
            className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 w-72"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: 'translateY(-50%)',
                zIndex: 9999,
            }}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={onClose}
        >
            <div className="absolute -left-2 top-1/2 transform -translate-y-1/2">
                <div className="w-2 h-2 bg-white dark:bg-gray-800 rotate-45 border-l border-b border-gray-200 dark:border-gray-700" />
            </div>
            <div className="space-y-3">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                        {space.type?.toLowerCase() === 'global' ? (
                            <BiGlobe className="h-5 w-5 text-blue-500" />
                        ) : (
                            <BiUser className="h-5 w-5 text-green-500" />
                        )}
                    </div>
                    <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-base mb-1">{space.name}</h4>
                        <div className="space-y-2">
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                <span className="font-medium min-w-[3rem]">Key:</span>
                                <span className="ml-2">{space.key}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                <span className="font-medium min-w-[3rem]">Type:</span>
                                <span className="ml-2 capitalize">{space.type?.toLowerCase()}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                <span className="font-medium min-w-[3rem]">ID:</span>
                                <span className="ml-2 font-mono text-xs">{space.id}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const SpaceListItem: React.FC<SpaceListItemProps> = ({ 
    space, 
    isSelected, 
    selectedItemsCount,
    onSelect 
}) => {
    const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
    const itemRef = useRef<HTMLLIElement>(null);
    const tooltipTimeout = useRef<number>();

    const showTooltip = () => {
        if (tooltipTimeout.current) {
            clearTimeout(tooltipTimeout.current);
        }

        if (itemRef.current) {
            const rect = itemRef.current.getBoundingClientRect();
            setTooltipPosition({
                top: rect.top + (rect.height / 2),
                left: rect.right + 12, // Slightly closer to the item
            });
        }
    };

    const hideTooltip = () => {
        if (tooltipTimeout.current) {
            clearTimeout(tooltipTimeout.current);
        }
        tooltipTimeout.current = window.setTimeout(() => {
            setTooltipPosition(null);
        }, 100); // Small delay to prevent flickering
    };

    useEffect(() => {
        const handleScroll = () => {
            if (tooltipTimeout.current) {
                clearTimeout(tooltipTimeout.current);
            }
            setTooltipPosition(null);
        };
        
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            if (tooltipTimeout.current) {
                clearTimeout(tooltipTimeout.current);
            }
        };
    }, []);

    const isGlobal = space.type?.toLowerCase() === 'global';

    return (
        <>
            <li
                ref={itemRef}
                onClick={() => onSelect(space)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(space);
                    }
                }}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                className={`space-list-item ${isSelected ? 'space-list-item-selected' : 'space-list-item-default'}`}
            >
                <div className="px-4 py-2 relative z-10">
                    <div className="flex items-center gap-2">
                        {/* Space Type Icon */}
                        {isGlobal ? (
                            <BiGlobe className="h-4 w-4 text-blue-500" />
                        ) : (
                            <BiUser className="h-4 w-4 text-green-500" />
                        )}
                        
                        {/* Space Name */}
                        <p className="truncate text-sm font-medium flex-1 text-gray-700 dark:text-gray-200">
                            {space.name}
                        </p>
                        
                        {/* Selected Items Count Badge */}
                        {selectedItemsCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 
                                           text-xs font-medium rounded-full bg-blue-50 dark:bg-blue-900/20 
                                           text-blue-600 dark:text-blue-400">
                                {selectedItemsCount}
                            </span>
                        )}
                    </div>
                </div>
            </li>
            <Tooltip 
                space={space} 
                position={tooltipPosition} 
                onClose={hideTooltip}
            />
        </>
    );
};
