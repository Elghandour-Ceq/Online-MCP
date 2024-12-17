import React from 'react';
import { ContentItem } from '../services/confluenceService';
import { 
    BiFolderOpen, 
    BiPaperclip, 
    BiComment, 
    BiLink, 
    BiNotepad, 
    BiFile 
} from 'react-icons/bi';

interface PageIconProps {
    type: ContentItem['type'];
}

export const PageIcon: React.FC<PageIconProps> = ({ type }) => {
    switch (type) {
        case 'folder':
            return (
                <BiFolderOpen className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
            );
        case 'attachment':
            return (
                <BiPaperclip className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            );
        case 'comment':
            return (
                <BiComment className="w-4 h-4 text-green-500 dark:text-green-400" />
            );
        case 'embed':
            return (
                <BiLink className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            );
        case 'whiteboard':
            return (
                <BiNotepad className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            );
        default: // page
            return (
                <BiFile className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            );
    }
};
