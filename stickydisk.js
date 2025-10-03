const core = require("@actions/core");
const { promisify } = require("util");
const { exec } = require("child_process");
const { createStickyDiskClient } = require("./util");

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
  const response = await client.getStickyDisk(
    {
      stickyDiskKey: stickyDiskKey,
      region: process.env.BLACKSMITH_REGION || "eu-central",
      installationModelId: process.env.BLACKSMITH_INSTALLATION_MODEL_ID || "",
      vmId: process.env.VM_ID || "",
      stickyDiskType: "stickydisk",
      stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN,
      repoName: process.env.GITHUB_REPO_NAME || "",
    },
    {
      signal: options?.signal,
    }
  );

  return {
    expose_id: response.exposeId,
    device: response.diskIdentifier,
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
      const { stdout } = await execAsync(
        `sudo blkid -o value -s TYPE ${device}`
      );
      if (stdout.trim() === "ext4") {
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
    await execAsync(
      `sudo mkfs.ext4 -m0 -E root_owner=$(id -u):$(id -g) -Enodiscard,lazy_itable_init=1,lazy_journal_init=1 -F ${device}`
    );
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
async function mountStickyDisk(
  stickyDiskKey,
  stickyDiskPath,
  signal,
  controller
) {
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const stickyDiskResponse = await getStickyDisk(stickyDiskKey, { signal });
  const device = stickyDiskResponse.device;
  const exposeId = stickyDiskResponse.expose_id;
  clearTimeout(timeoutId);

  await maybeFormatBlockDevice(device);

  // Create mount point WITHOUT sudo so the directory is owned by runner user
  // This is important because the mount point ownership affects access when nothing is mounted.
  await execAsync(`mkdir -p ${stickyDiskPath}`);

  // Mount the device with default options
  await execAsync(`sudo mount ${device} ${stickyDiskPath}`);

  // After mounting, set the ownership of the mount point
  await execAsync(`sudo chown $(id -u):$(id -g) ${stickyDiskPath}`);

  core.debug(
    `${device} has been mounted to ${stickyDiskPath} with expose ID ${exposeId}`
  );
  return { device, exposeId };
}

async function commitStickydisk(
  exposeId,
  stickyDiskKey,
  fsDiskUsageBytes = null
) {
  core.info(
    `Committing sticky disk ${stickyDiskKey} with expose ID ${exposeId}`
  );
  if (!exposeId || !stickyDiskKey) {
    core.warning(
      "No expose ID or sticky disk key found, cannot report sticky disk to Blacksmith"
    );
    return;
  }

  try {
    const client = createStickyDiskClient();

    const commitRequest = {
      exposeId,
      stickyDiskKey,
      vmId: process.env.VM_ID || "",
      shouldCommit: true,
      repoName: process.env.GITHUB_REPO_NAME || "",
      stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || "",
    };

    // Only include fsDiskUsageBytes if we have valid data (> 0)
    // This allows storage agent to fall back to previous sizing logic when data is unavailable
    if (fsDiskUsageBytes !== null && fsDiskUsageBytes > 0) {
      commitRequest.fsDiskUsageBytes = BigInt(fsDiskUsageBytes);
      core.debug(`Reporting fs usage: ${fsDiskUsageBytes} bytes`);
    } else {
      core.debug(
        "No fs usage data available, storage agent will use fallback sizing"
      );
    }

    await client.commitStickyDisk(commitRequest, {
      timeoutMs: 30000,
    });
    core.info(
      `Successfully committed sticky disk ${stickyDiskKey} with expose ID ${exposeId}`
    );
  } catch (error) {
    core.warning(
      `Error committing sticky disk: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function cleanupStickyDiskWithoutCommit(exposeId, stickyDiskKey) {
  core.info(
    `Cleaning up sticky disk ${stickyDiskKey} with expose ID ${exposeId}`
  );
  if (!exposeId || !stickyDiskKey) {
    core.warning(
      "No expose ID or sticky disk key found, cannot report sticky disk to Blacksmith"
    );
    return;
  }

  try {
    const client = createStickyDiskClient();
    await client.commitStickyDisk(
      {
        exposeId,
        stickyDiskKey,
        vmId: process.env.VM_ID || "",
        shouldCommit: false,
        repoName: process.env.GITHUB_REPO_NAME || "",
        stickyDiskToken: process.env.BLACKSMITH_STICKYDISK_TOKEN || "",
      },
      {
        timeoutMs: 30000,
      }
    );
  } catch (error) {
    core.warning(
      `Error reporting build failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    // We don't want to fail the build if this fails so we swallow the error.
  }
}

async function unmountAndCommitStickyDisk(
  path,
  { device, exposeId },
  stickyDiskKey
) {
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
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    const actionFailed = core.getState("action-failed") === "true";
    if (!actionFailed) {
      // Get filesystem usage of the mounted sticky disk path
      let fsDiskUsageBytes = null;
      try {
        const { stdout } = await execAsync(
          `df -B1 --output=used ${path} | tail -n1`
        );
        const parsedValue = parseInt(stdout.trim(), 10);

        if (isNaN(parsedValue) || parsedValue <= 0) {
          core.warning(
            `Invalid filesystem usage value from df: "${stdout.trim()}". Will not report fs usage.`
          );
        } else {
          fsDiskUsageBytes = parsedValue;
          core.info(
            `Filesystem usage: ${fsDiskUsageBytes} bytes (${(
              fsDiskUsageBytes /
              (1 << 30)
            ).toFixed(2)} GB)`
          );
        }
      } catch (error) {
        core.warning(
          `Failed to get filesystem usage: ${
            error instanceof Error ? error.message : String(error)
          }. Will not report fs usage.`
        );
      }

      await commitStickydisk(exposeId, stickyDiskKey, fsDiskUsageBytes);
    } else {
      await cleanupStickyDiskWithoutCommit(exposeId, stickyDiskKey);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.error(
        `Failed to cleanup and commit sticky disk at ${path}: ${error}`
      );
    }
  }
}

module.exports = {
  getStickyDisk,
  maybeFormatBlockDevice,
  mountStickyDisk,
  unmountAndCommitStickyDisk,
  commitStickydisk,
  cleanupStickyDiskWithoutCommit,
};
