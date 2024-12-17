import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import { parseSourceCodeForDefinitionsTopLevel } from '../services/tree-sitter';
import '../utils/path'; // Import path utilities for toPosix extension

describe('Source Code Parser', () => {
    it('should parse source code definitions from test-definitions directory', async () => {
        const testDir = path.join(__dirname, '../../test-definitions');
        const result = await parseSourceCodeForDefinitionsTopLevel(testDir,true);
        console.log('\nParser Output:\n', result);
        
        // // Test TypeScript definitions from test.ts
        // expect(result).toContain('interface UserInterface');
        // expect(result).toContain('class UserClass');
        // expect(result).toContain('function normalFunction');
        // expect(result).toContain('export async function asyncFunction');
        // expect(result).toContain('function outer');
        
        // // Test React/TSX definitions from test-react.tsx
        // expect(result).toContain('interface UserProps');
        // expect(result).toContain('interface UserState');
        // expect(result).toContain('export function UserProfile');
        // expect(result).toContain('export class UserSettings extends React.Component');
        // expect(result).toContain('export const UserList');
        // expect(result).toContain('function withUser');
        // expect(result).toContain('export const MemoizedUser');
        // expect(result).toContain('export const ForwardedButton');
        // expect(result).toContain('function useUser');
        // expect(result).toContain('export class UserProvider');
    });
});
