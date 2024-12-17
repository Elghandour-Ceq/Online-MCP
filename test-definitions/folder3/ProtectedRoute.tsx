import React from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/authService';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    if (!authService.isAuthenticated()) {
        return <Navigate to="/auth" replace />;
    }

    return <>{children}</>;
};
