import { describe, it, expect } from 'vitest';
import { rejectDangerousSql } from '@/lib/sql-guard';

describe('rejectDangerousSql', () => {
    describe('safe queries', () => {
        it.each([
            ['SELECT 1'],
            ['SELECT * FROM dbo.Users WHERE id = @p0'],
            ['UPDATE dbo.Orders SET total = 100 WHERE id = 1'],
            ['INSERT INTO dbo.Log (msg) VALUES (@msg)'],
            ['DELETE FROM dbo.Session WHERE expiresAt < GETDATE()'],
            ['SELECT COUNT(*) FROM dbo.Users'],
            ['WITH cte AS (SELECT id FROM dbo.T) SELECT * FROM cte'],
        ])('allows: %s', (q) => {
            expect(rejectDangerousSql(q)).toBeNull();
        });
    });

    describe('blocked keywords', () => {
        it.each([
            ['DROP TABLE users'],
            ['  drop   table   users  '],
            ['TRUNCATE TABLE Orders'],
            ['ALTER TABLE x ADD COLUMN y INT'],
            ['CREATE TABLE new_t (id INT)'],
            ['EXEC sp_addrolemember'],
            ['EXECUTE xp_cmdshell \'whoami\''],
            ['SELECT * FROM OPENROWSET(...)'],
            ['SELECT * FROM OPENQUERY(X, Y)'],
            ['BULK INSERT dbo.T FROM file'],
            ['BACKUP DATABASE mydb'],
            ['RESTORE DATABASE mydb'],
            ['SHUTDOWN'],
            ['GRANT ALL TO x'],
            ['REVOKE SELECT FROM x'],
            ['DENY SELECT ON dbo.T TO public'],
            ['DBCC CHECKDB'],
            ['WAITFOR DELAY \'00:00:10\''],
        ])('blocks: %s', (q) => {
            expect(rejectDangerousSql(q)).not.toBeNull();
        });
    });

    describe('bypass attempts', () => {
        it('blocks leading block-comment DROP', () => {
            expect(rejectDangerousSql('/* comment */ DROP TABLE users')).not.toBeNull();
        });

        it('blocks leading line-comment DROP', () => {
            expect(rejectDangerousSql('-- comment\nDROP TABLE users')).not.toBeNull();
        });

        it('blocks inline block-comment DROP', () => {
            expect(rejectDangerousSql('SELECT 1 /* nested */; /* go */ DROP TABLE x')).not.toBeNull();
        });

        it('blocks multi-statement batch where dangerous is second', () => {
            expect(rejectDangerousSql('SELECT 1; DROP TABLE users')).not.toBeNull();
        });

        it('blocks multi-statement with WAITFOR after allowed', () => {
            expect(rejectDangerousSql("UPDATE x SET a=1 WHERE id=2; WAITFOR DELAY '00:00:10'")).not.toBeNull();
        });

        it('blocks case-variant xp_cmdshell', () => {
            expect(rejectDangerousSql('select 1; Exec Xp_CmdShell \'dir\'')).not.toBeNull();
        });

        it('blocks whitespace-padded BULK INSERT', () => {
            expect(rejectDangerousSql('  BULK    INSERT  dbo.T  FROM  \'file\'  ')).not.toBeNull();
        });

        it('returns a trimmed offending segment', () => {
            const r = rejectDangerousSql('SELECT 1; DROP TABLE my_very_important_production_table_with_lots_of_data_and_more_columns');
            expect(r).not.toBeNull();
            expect(r!.length).toBeLessThanOrEqual(80);
            expect(r).toMatch(/DROP/i);
        });
    });

    describe('edge cases', () => {
        it('handles empty input', () => {
            expect(rejectDangerousSql('')).toBeNull();
        });
        it('handles only whitespace/comments', () => {
            expect(rejectDangerousSql('/* just a comment */')).toBeNull();
            expect(rejectDangerousSql('-- only a line comment')).toBeNull();
        });
        it('handles only semicolons', () => {
            expect(rejectDangerousSql(';;;')).toBeNull();
        });
    });
});
