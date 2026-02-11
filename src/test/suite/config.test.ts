import * as assert from 'assert';
import { parseConfig, typeToIcon, updateConfigForProfile } from '../../config';

const miniConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[profile:p1]
username=p1
token_name=token-name
token=nbt-p1
`;

const mediumConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[profile:p1]
username=p1
api_root=https://api.foobar.com/v1/
token=nbt-p1
`;

const fullConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[app:vscode]
profile=p2

[profile:p1]
username=p1
api_root=https://api.foobar.com/v1/
token=nbt-p1

[profile:p2]
username=p2
token=nbt-p2
`;

// Additional test configs for comprehensive priority testing
const priorityTestConfig = `
[general]
profile=general_profile
api_root=https://general.api.com/v1/

[app:vscode]
profile=vscode_profile

[profile:general_profile]
username=general_user
api_root=https://general.profile.api.com/v1/
token=nbt-general

[profile:vscode_profile]
username=vscode_user
api_root=https://vscode.profile.api.com/v1/
token=nbt-vscode

[profile:standalone_profile]
username=standalone_user
token=nbt-standalone
`;

const emptyAppVscodeConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[app:vscode]

[profile:p1]
username=p1
token=nbt-p1
`;

const missingGeneralConfig = `
[app:vscode]
profile=p1

[profile:p1]
username=p1
api_root=https://api.profile.com/v1/
token=nbt-p1
`;

const realWorldConfig = `
[general]
api_root=https://api.neuf.dev/v1
profile=bsn

[app:vscode]

[profile:staging]
username=novem_demo
token=nbt-hHWlOBxn3W7t3yJirqNiCHtlp98XqO1SMqu2WAtz7vfhQXeELPrVg7HVYZgPmg2L
token_name=nt-maven-jcyfsem6
api_root=https://api.neuf.cloud/v1

[profile:bsn]
username=bsn
token=nbt-0W
token_name=nt-maven-b0kxt7f4
api_root=https://api.neuf.dev/v1

[profile:prod]
username=bjornars
token=nbt-SmRYVP6CbAQNLlw3qrqTdPFkuKyHfBcZs3HCxV7vlUJ3eRRdOZilApK1vcyVF5jA
token_name=nt-maven-pllxtire
api_root=https://api.novem.io/v1
`;

suite('config parsing basics', () => {
    test('can read api_root from [general]', () => {
        const config = parseConfig(miniConfig);
        assert.strictEqual(config.api_root, 'https://api.example.com/v1/');
    });

    test('can follow profile from [general]', () => {
        const config = parseConfig(miniConfig);
        assert.strictEqual(config.token, 'nbt-p1');
        assert.strictEqual(config.username, 'p1');
        assert.strictEqual(config.profile, 'p1');
    });

    test('api_root from [profile] takes precedence over [general]', () => {
        const config = parseConfig(mediumConfig);
        assert.strictEqual(config.api_root, 'https://api.foobar.com/v1/');
        assert.strictEqual(config.username, 'p1');
        assert.strictEqual(config.token, 'nbt-p1');
    });

    test('[app:vscode] profile takes precedence over [general]', () => {
        const config = parseConfig(fullConfig);
        assert.strictEqual(config.token, 'nbt-p2');
        assert.strictEqual(config.username, 'p2');
        assert.strictEqual(config.profile, 'p2');
        assert.strictEqual(config.api_root, 'https://api.example.com/v1/'); // from [general] since p2 has none
    });
});

suite('priority hierarchy comprehensive tests', () => {
    test('honors full priority chain: general < app:vscode < profile < kwargs', () => {
        // Test 1: No kwargs - should use vscode profile with its specific api_root
        const config1 = parseConfig(priorityTestConfig);
        assert.strictEqual(config1.api_root, 'https://vscode.profile.api.com/v1/');
        assert.strictEqual(config1.username, 'vscode_user');
        assert.strictEqual(config1.token, 'nbt-vscode');
        assert.strictEqual(config1.profile, 'vscode_profile');

        // Test 2: Profile override via kwargs
        const config2 = parseConfig(priorityTestConfig, {
            profile: 'standalone_profile',
        });
        assert.strictEqual(config2.api_root, 'https://general.api.com/v1/'); // from [general] since standalone has none
        assert.strictEqual(config2.username, 'standalone_user');
        assert.strictEqual(config2.token, 'nbt-standalone');
        assert.strictEqual(config2.profile, 'standalone_profile');

        // Test 3: Full kwargs override
        const config3 = parseConfig(priorityTestConfig, {
            api_root: 'https://override.api.com/v1/',
            profile: 'general_profile',
            token: 'override-token',
        });
        assert.strictEqual(config3.api_root, 'https://override.api.com/v1/');
        assert.strictEqual(config3.token, 'override-token');
        assert.strictEqual(config3.username, 'general_user');
        assert.strictEqual(config3.profile, 'general_profile');
    });

    test('falls back to [general] when [app:vscode] has no profile', () => {
        const config = parseConfig(emptyAppVscodeConfig);
        assert.strictEqual(config.api_root, 'https://api.example.com/v1/');
        assert.strictEqual(config.username, 'p1');
        assert.strictEqual(config.token, 'nbt-p1');
        assert.strictEqual(config.profile, 'p1');
    });

    test('works without [general] section', () => {
        const config = parseConfig(missingGeneralConfig);
        assert.strictEqual(config.api_root, 'https://api.profile.com/v1/');
        assert.strictEqual(config.username, 'p1');
        assert.strictEqual(config.token, 'nbt-p1');
        assert.strictEqual(config.profile, 'p1');
    });

    test('api_root precedence: profile > general, but kwargs wins all', () => {
        // Profile api_root should override general
        const config1 = parseConfig(priorityTestConfig, { profile: 'vscode_profile' });
        assert.strictEqual(config1.api_root, 'https://vscode.profile.api.com/v1/');

        // General api_root should be used when profile has none
        const config2 = parseConfig(priorityTestConfig, { profile: 'standalone_profile' });
        assert.strictEqual(config2.api_root, 'https://general.api.com/v1/');

        // kwargs api_root should override everything
        const config3 = parseConfig(priorityTestConfig, {
            profile: 'vscode_profile',
            api_root: 'https://kwargs-wins.com/v1/',
        });
        assert.strictEqual(config3.api_root, 'https://kwargs-wins.com/v1/');
    });

    test('real world config from user attachment', () => {
        // Test that it honors [general] settings
        const config = parseConfig(realWorldConfig);
        assert.strictEqual(config.profile, 'bsn'); // from [general]
        assert.strictEqual(config.username, 'bsn'); // from profile:bsn
        assert.strictEqual(config.api_root, 'https://api.neuf.dev/v1'); // from profile:bsn (overrides general) - no trailing slash
        assert.strictEqual(config.token, 'nbt-0W');

        // Test that [app:vscode] would override if it had a profile
        // Currently it's empty so should fall back to general
        const emptyVscodeConfig = realWorldConfig.replace(
            '[app:vscode]',
            '[app:vscode]\nprofile=staging',
        );
        const config2 = parseConfig(emptyVscodeConfig);
        assert.strictEqual(config2.profile, 'staging');
        assert.strictEqual(config2.username, 'novem_demo');
        assert.strictEqual(config2.api_root, 'https://api.neuf.cloud/v1'); // no trailing slash in source config
    });
});

suite('edge case handling', () => {
    test('handles missing profile gracefully', () => {
        const config = parseConfig(miniConfig, { profile: 'nonexistent' });
        assert.strictEqual(config.api_root, 'https://api.example.com/v1/');
        // Profile is set in kwargs but doesn't exist, so it returns early with just api_root
        assert.strictEqual(config.username, undefined);
        assert.strictEqual(config.token, undefined);
    });

    test('handles empty config', () => {
        const config = parseConfig('');
        assert.strictEqual(Object.keys(config).length, 0);
    });

    test('handles config with only [general]', () => {
        const simpleConfig = `[general]
api_root=https://simple.com/v1/
profile=nonexistent`;
        const config = parseConfig(simpleConfig);
        assert.strictEqual(config.api_root, 'https://simple.com/v1/');
        // Profile is referenced but doesn't have a [profile:nonexistent] section, so returns early
        assert.strictEqual(config.username, undefined);
    });

    test('handles config with profile but no general', () => {
        const profileOnlyConfig = `[profile:solo]
username=solo_user
token=solo-token
api_root=https://solo.api.com/v1/`;

        const config = parseConfig(profileOnlyConfig, { profile: 'solo' });
        assert.strictEqual(config.api_root, 'https://solo.api.com/v1/');
        assert.strictEqual(config.username, 'solo_user');
        assert.strictEqual(config.token, 'solo-token');
        assert.strictEqual(config.profile, 'solo');
    });

    test('handles malformed config sections gracefully', () => {
        const malformedConfig = `[general]
api_root=https://api.com/v1/

[profile:test]
username=test
# Missing token, but should still work`;

        const config = parseConfig(malformedConfig, { profile: 'test' });
        assert.strictEqual(config.api_root, 'https://api.com/v1/');
        assert.strictEqual(config.username, 'test');
        assert.strictEqual(config.token, undefined);
    });
});

suite('kwargs overrides', () => {
    test('token override from kwargs', () => {
        const config = parseConfig(miniConfig, { token: 'override-token' });
        assert.strictEqual(config.token, 'override-token');
        assert.strictEqual(config.username, 'p1'); // other fields unchanged
    });

    test('api_root override from kwargs', () => {
        const config = parseConfig(miniConfig, { api_root: 'https://override.api.com/v1/' });
        assert.strictEqual(config.api_root, 'https://override.api.com/v1/');
        assert.strictEqual(config.username, 'p1'); // other fields unchanged
    });

    test('multiple kwargs override', () => {
        const config = parseConfig(fullConfig, {
            api_root: 'https://multi.override.com/v1/',
            token: 'multi-token',
            profile: 'p1',
        });
        assert.strictEqual(config.api_root, 'https://multi.override.com/v1/');
        assert.strictEqual(config.token, 'multi-token');
        assert.strictEqual(config.username, 'p1'); // from profile p1
        assert.strictEqual(config.profile, 'p1');
    });
});

suite('typeToIcon utility', () => {
    test('returns "mail" for mails type', () => {
        assert.strictEqual(typeToIcon('any', 'mails'), 'mail');
    });

    test('returns "graph" for all plot types', () => {
        assert.strictEqual(typeToIcon('bar'), 'graph');
        assert.strictEqual(typeToIcon('line'), 'graph');
        assert.strictEqual(typeToIcon('pie'), 'graph');
        assert.strictEqual(typeToIcon('table'), 'graph');
        assert.strictEqual(typeToIcon('scatter'), 'graph');
        assert.strictEqual(typeToIcon('text'), 'graph');
        assert.strictEqual(typeToIcon('unknown'), 'graph');
    });

    test('handles undefined inputs', () => {
        assert.strictEqual(typeToIcon(''), 'graph');
        assert.strictEqual(typeToIcon('anything'), 'graph');
    });
});

suite('updateConfigForProfile (business logic)', () => {
    test('writes to profile specified in profile parameter', () => {
        const result = updateConfigForProfile(null, {
            username: 'testuser',
            token: 'test-token-123',
            token_name: 'test-token-name',
            api_root: 'https://test.api.com/v1',
            profile: 'my-profile',
        });

        assert.ok(result.includes('[profile:my-profile]'));
        assert.ok(result.includes('username = testuser'));
        assert.ok(result.includes('token = test-token-123'));
        assert.ok(result.includes('token_name = test-token-name'));
    });

    test('falls back to username when profile parameter not provided', () => {
        const result = updateConfigForProfile(null, {
            username: 'fallback-user',
            token: 'fallback-token',
            token_name: 'fallback-token-name',
        });

        assert.ok(result.includes('[profile:fallback-user]'));
        assert.ok(result.includes('username = fallback-user'));
    });

    test('preserves existing profiles when updating different profile', () => {
        const existingConfig = `[general]
api_root = https://api.example.com/v1
profile = profile1

[profile:profile1]
username = user1
token = token1
token_name = token-name-1
`;

        const result = updateConfigForProfile(existingConfig, {
            username: 'user2',
            token: 'token2',
            token_name: 'token-name-2',
            profile: 'profile2',
        });

        // Both profiles should exist
        assert.ok(result.includes('[profile:profile1]'));
        assert.ok(result.includes('username = user1'));
        assert.ok(result.includes('token = token1'));

        assert.ok(result.includes('[profile:profile2]'));
        assert.ok(result.includes('username = user2'));
        assert.ok(result.includes('token = token2'));
    });

    test('updates existing profile when profile name matches', () => {
        const existingConfig = `[general]
api_root = https://api.example.com/v1
profile = update-me

[profile:update-me]
username = initial-user
token = initial-token
token_name = initial-token-name
`;

        const result = updateConfigForProfile(existingConfig, {
            username: 'updated-user',
            token: 'updated-token',
            token_name: 'updated-token-name',
            profile: 'update-me',
        });

        // Should have only one instance of the profile with updated values
        const matches = result.match(/\[profile:update-me\]/g);
        assert.strictEqual(matches?.length, 1);
        assert.ok(result.includes('username = updated-user'));
        assert.ok(result.includes('token = updated-token'));
        assert.ok(!result.includes('initial-token'));
    });

    test('preserves general and app:vscode sections', () => {
        const existingConfig = `[general]
api_root = https://general.api.com/v1
profile = profile1

[app:vscode]
profile = profile1

[profile:profile1]
username = user1
token = token1
token_name = token-name-1
`;

        const result = updateConfigForProfile(existingConfig, {
            username: 'user2',
            token: 'token2',
            token_name: 'token-name-2',
            profile: 'profile2',
        });

        // General and app:vscode should still exist
        assert.ok(result.includes('[general]'));
        assert.ok(result.includes('api_root = https://general.api.com/v1'));
        assert.ok(result.includes('[app:vscode]'));

        // Original profile should still exist
        assert.ok(result.includes('[profile:profile1]'));

        // New profile should be added
        assert.ok(result.includes('[profile:profile2]'));
        assert.ok(result.includes('username = user2'));
    });

    test('handles profile name with special characters', () => {
        const result = updateConfigForProfile(null, {
            username: 'user',
            token: 'token',
            token_name: 'token-name',
            profile: 'staging-env-2024',
        });

        assert.ok(result.includes('[profile:staging-env-2024]'));
    });

    test('profile parameter takes precedence over username for profile key', () => {
        const result = updateConfigForProfile(null, {
            username: 'john',
            token: 'token',
            token_name: 'token-name',
            profile: 'john-production',
        });

        // Profile should be named after the profile parameter, not username
        assert.ok(result.includes('[profile:john-production]'));
        assert.ok(!result.includes('[profile:john]'));

        // But username should still be 'john' inside the profile
        assert.ok(result.includes('username = john'));
    });
});
