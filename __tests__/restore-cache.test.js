const core = require('@actions/core');
const { mountStickyDisk } = require('../stickydisk');
const { loadStickyDisk, setupBazel } = require('../index');

// Mock the stickydisk module
jest.mock('../stickydisk', () => ({
    mountStickyDisk: jest.fn()
}));

// Mock YAML parser
jest.mock('yaml', () => ({
    parse: jest.fn().mockImplementation((input) => {
        if (typeof input === 'object') {
            return input;
        }
        return {};
    })
}));

// Mock github context
jest.mock('@actions/github', () => ({
    context: {
        workflow: 'test-workflow',
        job: 'test-job',
        repo: {
            owner: 'test-owner',
            repo: 'test-repo'
        },
        sha: '1234567890abcdef',
        ref: 'refs/heads/main'
    }
}));

// Mock core with getInput
jest.mock('@actions/core', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    startGroup: jest.fn(),
    endGroup: jest.fn(),
    getState: jest.fn((name) => {
        const mockState = {
            'google-credentials-path': '',
            'sticky-disk-mounts': '{}'
        };
        return mockState[name] || '';
    }),
    saveState: jest.fn(),
    toPosixPath: jest.fn(path => path.replace(/\\/g, '/')),
    getInput: jest.fn((name) => {
        const mockInputs = {
            'bazelisk-version': '1.18.0',
            'cache-version': 'v1',
            'external-cache': '{}',
            'google-credentials': '',
            // Add other inputs as needed
        };
        return mockInputs[name] || '';
    }),
    getMultilineInput: jest.fn((name) => {
        const mockInputs = {
            'bazelrc': [],
        };
        return mockInputs[name] || [];
    }),
    getBooleanInput: jest.fn((name) => {
        const mockInputs = {
            'bazelisk-cache': true,
        };
        return mockInputs[name] || false;
    }),
    setFailed: jest.fn(),
}));

// Mock glob.hashFiles
jest.mock('@actions/glob', () => ({
    hashFiles: jest.fn().mockResolvedValue('testhash123')
}));

function setupTestConfig(inputs = {}) {
    // Reset all mocks
    jest.clearAllMocks();

    // Set default inputs
    core.getInput.mockImplementation((name) => {
        const defaultInputs = {
            'bazelisk-version': '1.18.0',
            'cache-version': 'v1',
            'external-cache': '{}',
            'google-credentials': '',
            ...inputs  // Override defaults with test-specific inputs
        };
        return defaultInputs[name] || '';
    });

    // Reset multiline inputs
    core.getMultilineInput.mockImplementation((name) => {
        const defaultInputs = {
            'bazelrc': [],
            ...(inputs.multiline || {})  // Allow overriding multiline inputs
        };
        return defaultInputs[name] || [];
    });

    // Re-import config to get fresh instance with new inputs
    let freshConfig;
    jest.isolateModules(() => {
        freshConfig = require('../config');
    });
    return freshConfig;
}

describe('loadStickyDisk', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should accumulate multiple sticky disk mounts', async () => {
        const testConfig = setupTestConfig({
            'disk-cache': true,
            'repository-cache': true,
            'bazelisk-cache': true,
        });

        mountStickyDisk.mockResolvedValue({
            device: '/dev/sda1',
            exposeId: 'test-expose-id'
        });

        // Mount all caches
        const bazeliskMounts = await loadStickyDisk(testConfig.bazeliskCache);
        const diskMounts = await loadStickyDisk(testConfig.diskCache);
        const repoMounts = await loadStickyDisk(testConfig.repositoryCache);

        const allMounts = {
            ...bazeliskMounts,
            ...diskMounts,
            ...repoMounts
        };

        // Verify all three mounts are present
        expect(Object.keys(allMounts)).toHaveLength(3);

        // Verify each type of mount exists
        const mountPaths = Object.keys(allMounts);
        expect(mountPaths.some(path => path.includes('bazel-disk'))).toBe(true);
        expect(mountPaths.some(path => path.includes('bazel-repo'))).toBe(true);
        expect(mountPaths.some(path => path.includes('bazelisk'))).toBe(true);

        // Verify each mount has the correct structure
        Object.values(allMounts).forEach(mount => {
            expect(mount).toEqual({
                device: '/dev/sda1',
                exposeId: 'test-expose-id',
                stickyDiskKey: expect.stringMatching(/testhash123-[a-f0-9]{8}/)
            });
        });
    });

    it('should mount sticky disk for repository cache when enabled', async () => {
        const testConfig = setupTestConfig({
            'repository-cache': true,
        });

        const repositoryCache = testConfig.repositoryCache;

        mountStickyDisk.mockResolvedValue({
            device: '/dev/sda1',
            exposeId: 'test-expose-id'
        });

        const mounts = await loadStickyDisk(repositoryCache);

        // Verify mountStickyDisk was called with correct parameters
        expect(mountStickyDisk).toHaveBeenCalledWith(
            expect.stringMatching(/repository-testhash123-[a-f0-9]{8}/),
            expect.stringMatching(/.*\/\.cache\/bazel-repo/),
            expect.any(AbortSignal),
            expect.any(AbortController)
        );

        // Verify mount was added correctly
        const mountPath = Object.keys(mounts)[0];
        expect(mountPath).toMatch(/.*\/\.cache\/bazel-repo/);
        expect(mounts[mountPath]).toEqual({
            device: '/dev/sda1',
            exposeId: 'test-expose-id',
            stickyDiskKey: expect.stringMatching(/repository-testhash123-[a-f0-9]{8}/)
        });

        // Verify bazelrc was updated with repository cache path
        expect(testConfig.bazelrc).toContain(`build --repository_cache=${testConfig.repositoryCache.paths[0]}`);
    });

    it('should mount sticky disk for disk cache when enabled', async () => {
        const testConfig = setupTestConfig({
            'disk-cache': true,
        });

        const diskCache = testConfig.diskCache;

        mountStickyDisk.mockResolvedValue({
            device: '/dev/sda1',
            exposeId: 'test-expose-id'
        });

        const mounts = await loadStickyDisk(diskCache);

        // Verify mountStickyDisk was called with correct parameters
        expect(mountStickyDisk).toHaveBeenCalledWith(
            expect.stringMatching(/disk-true-testhash123-[a-f0-9]{8}/),
            expect.stringMatching(/.*\/\.cache\/bazel-disk/),
            expect.any(AbortSignal),
            expect.any(AbortController)
        );

        // Verify mount was added correctly
        const mountPath = Object.keys(mounts)[0];
        expect(mountPath).toMatch(/.*\/\.cache\/bazel-disk/);
        expect(mounts[mountPath]).toEqual({
            device: '/dev/sda1',
            exposeId: 'test-expose-id',
            stickyDiskKey: expect.stringMatching(/disk-true-testhash123-[a-f0-9]{8}/)
        });

        // Verify bazelrc was updated with disk cache path
        expect(testConfig.bazelrc).toContain(`build --disk_cache=${testConfig.diskCache.paths[0]}`);
    });

    it('should mount sticky disk for bazelisk cache when enabled', async () => {
        const testConfig = setupTestConfig({
            'bazelisk-cache': true,
        });

        const bazeliskCache = testConfig.bazeliskCache;

        mountStickyDisk.mockResolvedValue({
            device: '/dev/sda1',
            exposeId: 'test-expose-id'
        });

        const mounts = await loadStickyDisk(bazeliskCache);

        // Verify mountStickyDisk was called with correct parameters
        expect(mountStickyDisk).toHaveBeenCalledWith(
            expect.stringMatching(/bazelisk-testhash123-[a-f0-9]{8}/),
            expect.stringMatching(/.*\/bazelisk/),
            expect.any(AbortSignal),
            expect.any(AbortController)
        );

        // Verify mount was added correctly
        const mountPath = Object.keys(mounts)[0];
        expect(mountPath).toMatch(/.*\/bazelisk/);
        expect(mounts[mountPath]).toEqual({
            device: '/dev/sda1',
            exposeId: 'test-expose-id',
            stickyDiskKey: expect.stringMatching(/bazelisk-testhash123-[a-f0-9]{8}/)
        });
    });

    it('should not mount sticky disk for bazelisk cache when disabled', async () => {
        // Override getBooleanInput to return false for bazelisk-cache
        core.getBooleanInput.mockImplementation((name) => {
            const mockInputs = {
                'bazelisk-cache': false,
            };
            return mockInputs[name] || false;
        });

        const testConfig = setupTestConfig({
            'bazelisk-cache': false,
        });

        const bazeliskCache = testConfig.bazeliskCache;

        const mounts = await loadStickyDisk(bazeliskCache);

        // Verify mountStickyDisk was not called
        expect(mountStickyDisk).not.toHaveBeenCalled();

        // Verify no mounts were added
        expect(Object.keys(mounts)).toHaveLength(0);
    });

    it('should mount sticky disks for all caches when enabled', async () => {
        // Override getBooleanInput to return true for bazelisk-cache
        core.getBooleanInput.mockImplementation((name) => {
            const mockInputs = {
                'bazelisk-cache': true,
            };
            return mockInputs[name] || false;
        });

        const testConfig = setupTestConfig({
            'disk-cache': 'true',
            'repository-cache': 'true',
            'bazelisk-cache': true
        });

        mountStickyDisk.mockResolvedValue({
            device: '/dev/sda1',
            exposeId: 'test-expose-id'
        });

        // Mount all caches
        const bazeliskMounts = await loadStickyDisk(testConfig.bazeliskCache);
        const diskMounts = await loadStickyDisk(testConfig.diskCache);
        const repoMounts = await loadStickyDisk(testConfig.repositoryCache);

        const allMounts = {
            ...bazeliskMounts,
            ...diskMounts,
            ...repoMounts
        };

        // Verify mountStickyDisk was called 3 times
        expect(mountStickyDisk).toHaveBeenCalledTimes(3);

        // Verify calls for each cache type
        expect(mountStickyDisk).toHaveBeenCalledWith(
            expect.stringMatching(/disk-testhash123-[a-f0-9]{8}/),
            expect.stringMatching(/.*\/_bazel-disk|.*\/\.cache\/bazel-disk/),
            expect.any(AbortSignal),
            expect.any(AbortController)
        );

        expect(mountStickyDisk).toHaveBeenCalledWith(
            expect.stringMatching(/repository-testhash123-[a-f0-9]{8}/),
            expect.stringMatching(/.*\/_bazel-repo|.*\/\.cache\/bazel-repo/),
            expect.any(AbortSignal),
            expect.any(AbortController)
        );

        expect(mountStickyDisk).toHaveBeenCalledWith(
            expect.stringMatching(/bazelisk-testhash123-[a-f0-9]{8}/),
            expect.stringMatching(/.*\/bazelisk/),
            expect.any(AbortSignal),
            expect.any(AbortController)
        );

        // Verify all three mounts are present
        expect(Object.keys(allMounts)).toHaveLength(3);

        // Verify each type of mount exists
        const mountPaths = Object.keys(allMounts);
        expect(mountPaths.some(path => path.includes('bazel-disk') || path.includes('_bazel-disk'))).toBe(true);
        expect(mountPaths.some(path => path.includes('bazel-repo') || path.includes('_bazel-repo'))).toBe(true);
        expect(mountPaths.some(path => path.includes('bazelisk'))).toBe(true);

        // Verify each mount has the correct structure
        Object.values(allMounts).forEach(mount => {
            expect(mount).toEqual({
                device: '/dev/sda1',
                exposeId: 'test-expose-id',
                stickyDiskKey: expect.stringMatching(/testhash123-[a-f0-9]{8}/)
            });
        });
    });
});