import React from 'react';
import { BiLoaderAlt } from 'react-icons/bi';

interface LoadingSpinnerProps {
    size?: 'small' | 'medium' | 'large';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'medium' }) => {
    const sizeClasses = {
        small: 'h-4 w-4',
        medium: 'h-5 w-5',
        large: 'h-6 w-6'
    };

    return (
        <BiLoaderAlt 
            className={`inline-block ml-2 ${sizeClasses[size]} text-gray-400 animate-spin`}
        />
    );
};
