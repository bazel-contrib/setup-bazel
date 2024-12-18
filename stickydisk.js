const core = require('@actions/core');
const { promisify } = require('util');
const { exec } = require('child_process');
const { createStickyDiskClient } = require('./util');

const execAsync = promisify(exec);

/**
 * Gets a sticky disk from the service
 * @param {string} stickyDiskKey - Key to identify the sticky disk
 * @param {Object} options - Optional parameters
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
 * @returns {Promise<{expose_id: string, device: string}>}
 */
async function getStickyDisk(stickyDiskKey, options = {}) {
    const client = createStickyDiskClient();

    core.debug(`Getting sticky disk for ${stickyDiskKey}`);
    const response = await client.getStickyDisk({
        stickyDiskKey: stickyDiskKey,
        region: process.env.BLACKSMITH_REGION || 'eu-central',
        installationModelId: process.env.BLACKSMITH_INSTALLATION_MODEL_ID || '',
        vmId: process.env.VM_ID || '',
        stickyDiskType: 'stickydisk',
        stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN,
        repoName: process.env.GITHUB_REPO_NAME || ''
    }, {
        signal: options?.signal,
    });

    return {
        expose_id: response.exposeId,
        device: response.diskIdentifier
    };
}

/**
 * Formats a block device with ext4 if needed
 * @param {string} device - Path to the block device
 * @returns {Promise<string>} - Returns the device path
 */
async function maybeFormatBlockDevice(device) {
    try {
        // Check if device is formatted with ext4
        try {
            // Need sudo for blkid as it requires root to read block device metadata
            const { stdout } = await execAsync(`sudo blkid -o value -s TYPE ${device}`);
            if (stdout.trim() === 'ext4') {
                core.debug(`Device ${device} is already formatted with ext4`);
                try {
                    // Need sudo for resize2fs as it requires root to modify block device
                    // This operation preserves existing filesystem ownership and permissions
                    await execAsync(`sudo resize2fs -f ${device}`);
                    core.debug(`Resized ext4 filesystem on ${device}`);
                } catch (error) {
                    core.warning(`Error resizing ext4 filesystem on ${device}: ${error}`);
                }
                return device;
            }
        } catch {
            // blkid returns non-zero if no filesystem found, which is fine
            core.debug(`No filesystem found on ${device}, will format it`);
        }

        // Format device with ext4, setting default ownership to current user
        core.debug(`Formatting device ${device} with ext4`);
        // Need sudo for mkfs.ext4 as it requires root to format block device
        // -m0: Disable reserved blocks (all space available to non-root users)
        // root_owner=$(id -u):$(id -g): Sets filesystem root directory owner to current (runner) user
        // This ensures the filesystem is owned by runner user from the start
        await execAsync(`sudo mkfs.ext4 -m0 -E root_owner=$(id -u):$(id -g) -Enodiscard,lazy_itable_init=1,lazy_journal_init=1 -F ${device}`);
        core.debug(`Successfully formatted ${device} with ext4`);
        return device;
    } catch (error) {
        core.error(`Failed to format device ${device}: ${error}`);
        throw error;
    }
}

/**
 * Mounts a sticky disk at the specified path
 * @param {string} stickyDiskKey - Key to identify the sticky disk
 * @param {string} stickyDiskPath - Path where the disk should be mounted
 * @param {AbortSignal} signal - Signal for operation cancellation
 * @param {AbortController} controller - Controller for timeout management
 * @returns {Promise<{device: string, exposeId: string}>}
 */
async function mountStickyDisk(stickyDiskKey, stickyDiskPath, signal, controller) {
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const stickyDiskResponse = await getStickyDisk(stickyDiskKey, { signal });
    const device = stickyDiskResponse.device;
    const exposeId = stickyDiskResponse.expose_id;
    clearTimeout(timeoutId);

    await maybeFormatBlockDevice(device);

    // Create mount point WITHOUT sudo so the directory is owned by runner user
    // This is important because the mount point ownership affects access when nothing is mounted
    await execAsync(`mkdir -p ${stickyDiskPath}`);

    // Mount with specific options to ensure runner user can access:
    // - uid=$(id -u): Sets owner of all files to current (runner) user
    // - gid=$(id -g): Sets group of all files to current user's group
    // - umask=0022: Ensures new files get 644 perms and directories get 755 perms
    // Need sudo for mount as it requires root privileges
    await execAsync(`sudo mount -o uid=$(id -u),gid=$(id -g),umask=0022 ${device} ${stickyDiskPath}`);

    core.debug(`${device} has been mounted to ${stickyDiskPath} with expose ID ${exposeId}`);
    return { device, exposeId };
}

async function commitStickydisk(exposeId, stickyDiskKey) {
    core.info(`Committing sticky disk ${stickyDiskKey} with expose ID ${exposeId}`);
    if (!exposeId || !stickyDiskKey) {
        core.warning('No expose ID or sticky disk key found, cannot report sticky disk to Blacksmith');
        return;
    }

    try {
        const client = createStickyDiskClient();
        await client.commitStickyDisk({
            exposeId,
            stickyDiskKey,
            vmId: process.env.VM_ID || '',
            shouldCommit: true,
            repoName: process.env.GITHUB_REPO_NAME || '',
            stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || ''
        }, {
            timeoutMs: 30000
        });
        core.info(`Successfully committed sticky disk ${stickyDiskKey} with expose ID ${exposeId}`);
    } catch (error) {
        core.warning(`Error committing sticky disk: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function cleanupStickyDiskWithoutCommit(exposeId, stickyDiskKey) {
    core.info(`Cleaning up sticky disk ${stickyDiskKey} with expose ID ${exposeId}`);
    if (!exposeId || !stickyDiskKey) {
        core.warning('No expose ID or sticky disk key found, cannot report sticky disk to Blacksmith');
        return;
    }

    try {
        const client = createStickyDiskClient();
        await client.commitStickyDisk({
            exposeId,
            stickyDiskKey,
            vmId: process.env.VM_ID || '',
            shouldCommit: false,
            repoName: process.env.GITHUB_REPO_NAME || '',
            stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || ''
        }, {
            timeoutMs: 30000
        });
    } catch (error) {
        core.warning(`Error reporting build failed: ${error instanceof Error ? error.message : String(error)}`);
        // We don't want to fail the build if this fails so we swallow the error.
    }
}

async function unmountAndCommitStickyDisk(path, { device, exposeId }, stickyDiskKey) {
    try {
        // Check if path is mounted
        try {
            const { stdout: mountOutput } = await execAsync(`mount | grep ${path}`);
            if (!mountOutput) {
                core.debug(`${path} is not mounted, skipping unmount`);
                return;
            }
        } catch {
            // grep returns non-zero if no match found
            core.debug(`${path} is not mounted, skipping unmount`);
            return;
        }

        // First try to unmount with retries
        for (let attempt = 1; attempt <= 10; attempt++) {
            try {
                await execAsync(`sudo umount ${path}`);
                core.info(`Successfully unmounted ${path}`);
                break;
            } catch (error) {
                if (attempt === 10) {
                    throw error;
                }
                core.warning(`Unmount failed, retrying (${attempt}/10)...`);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        const actionFailed = core.getState('action-failed') === 'true';
        if (!actionFailed) {
            await commitStickydisk(exposeId, stickyDiskKey);
        } else {
            await cleanupStickyDiskWithoutCommit(exposeId, stickyDiskKey);
        }
    } catch (error) {
        if (error instanceof Error) {
            core.error(`Failed to cleanup and commit sticky disk at ${path}: ${error}`);
        }
    }
}

module.exports = {
    getStickyDisk,
    maybeFormatBlockDevice,
    mountStickyDisk,
    unmountAndCommitStickyDisk,
    commitStickydisk,
    cleanupStickyDiskWithoutCommit
}; 