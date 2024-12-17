module.exports = {
    globby: async (path) => {
        // Return test files that we know exist
        return [
            'test-definitions\\ErrorAlert.tsx',
            'test-definitions\\folder1',
            'test-definitions\\folder2',
            'test-definitions\\folder3',
            'test-definitions\\PageMetaInfo.tsx',
            'test-definitions\\PagesPanel.tsx',
            'test-definitions\\PreviewPanel.tsx',
            'test-definitions\\test-react.tsx',
            'test-definitions\\folder1\\test.ts',
            'test-definitions\\folder1\\test2.ts',
            'test-definitions\\folder1\\test3.ts',
            'test-definitions\\folder2\\ExpandButton.tsx',
            'test-definitions\\folder2\\folder2.2',
            'test-definitions\\folder2\\HelpModal.tsx',
            'test-definitions\\folder2\\folder2.2\\LoadingSpinner.tsx',
            'test-definitions\\folder2\\folder2.2\\PageIcon.tsx',
            'test-definitions\\folder2\\folder2.2\\PageListItem.tsx',
            'test-definitions\\folder3\\ProtectedRoute.tsx',
            'test-definitions\\folder3\\SpaceListItem.tsx',
            'test-definitions\\folder3\\SpacesPanel.tsx',
            'test-definitions\\routes\\auth.js',
            'test-definitions\\routes\\confluence.js',
            'test-definitions\\routes\\user.js',
        ];
    }
};
