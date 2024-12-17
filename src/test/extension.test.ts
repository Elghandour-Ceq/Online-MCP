import * as assert from 'assert';
import * as vscode from 'vscode';
import { describe, it } from '@jest/globals';

describe('Extension Test Suite', () => {
    it('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});
