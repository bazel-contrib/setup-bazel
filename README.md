# setup-bazel

This action allows to properly configure Bazelisk and Bazel on all operating systems
and provides an advanced fine-grained caching to improve workflows performance.

## Usage

```yaml
- uses: bazel-contrib/setup-bazel@0.16.0
  with:
    # Avoid downloading Bazel every time.
    bazelisk-cache: true
    # Store build cache per workflow.
    disk-cache: ${{ github.workflow }}
    # Share repository cache between workflows.
    repository-cache: true
```

## Inputs

### `bazelisk-cache`

Cache [`bazelisk`][1] downloads based on contents of a `.bazelversion` file.

Default `false`.

### `bazelisk-version`

[`bazelisk`][1] version to download and use.

Supports semver specification and ranges.
Leave empty to use [pre-installed Bazelisk][8].

Default `""`.

<details>
  <summary>Examples</summary>

  #### Install Bazelisk 1.x

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      bazelisk-version: 1.x
  ```

  #### Install exact Bazelisk version

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      bazelisk-version: 1.19.0
  ```
</details>

### `bazelrc`

Extra contents to write to a user's [`bazelrc`][4] file.

You can use multiline YAML strings.

Default `""`.

<details>
  <summary>Examples</summary>

  #### Enable Bzlmod

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      bazelrc: common --enable_bzlmod
  ```

  #### Add colors and timestamps

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      bazelrc: |
        build --color=yes
        build --show_timestamps
  ```
</details>

### `disk-cache`

Enable [`disk_cache`][2] and store it on GitHub based on contents of `BUILD` files.

You can also pass a string to use as a cache key to separate caches from different workflows.

Default `false`.

<details>
  <summary>Examples</summary>

  #### Share a single disk cache

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      disk-cache: true
  ```

  #### Separate disk caches between workflows

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      disk-cache: ${{ github.workflow }}}
  ```
</details>

### `external-cache`

Cache `external/` repositories based on contents of `MODULE.bazel` and `WORKSPACE` files.
Only repositories exceeding 10MB are being cached.
Each repository is stored in a separate cache.

You can also pass a `manifest` object where key is the name of the external repository
and value is a file (or list of files) which contents are used to calculate cache key.
If the value is `false`, the external repository won't be cached.

Default `false`.

<details>
  <summary>Examples</summary>

  #### Enable external repositories caches

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      external-cache: true
  ```

  #### Cache NPM repositories based on `package-lock.json` contents

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      external-cache: |
        manifest:
          npm: package-lock.json
  ```

  #### Do not cache Ruby on Windows

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      external-cache: |
        manifest:
          ruby: ${{ runner.os == 'Windows' && 'false' || 'true' }}
  ```
</details>

### `google-credentials`

Google Cloud account key to use for [remote caching authentication][9].

Default `""`.

<details>
  <summary>Examples</summary>

  #### Authenticate via key

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      google-credentials: ${{ secrets.GOOGLE_CLOUD_KEY }}
  ```
</details>

### `module-root`

Bazel module root directory, where `MODULE.bazel` and `WORKSPACE` is found.

Change this value to the module root if it's not the repository root.

Default `"."`.

### `output-base`

Change Bazel output base directory.

You might want to change it when running on self-hosted runners with a custom directory layout.

Default is one of the following:

- `$HOME/.bazel` on Linux and macOS
- `D:/_bazel` on Windows

<details>
  <summary>Examples</summary>

  #### Use `C` drive letter

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      output-base: C:/_bazel
  ```
</details>

### `repository-cache`

Enable [`repository_cache`][3] and store it on GitHub based on contents of `MODULE.bazel` and `WORKSPACE` files.

You can also pass a file (or list of files) which contents are used to calculate cache key.

Default `false`.

<details>
  <summary>Examples</summary>

  #### Store a single repository cache

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      repository-cache: true
  ```

  #### Store a repository cache from a custom location

  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      repository-cache: examples/gem/WORKSPACE
  ```

  #### Store a repository cache from a list of custom locations
  ```yaml
  - uses: bazel-contrib/setup-bazel@0.16.0
    with:
      repository-cache: |
        - MODULE.bazel
        - requirements_locked.txt
  ```
</details>

## Migrating from [`bazelbuild/setup-bazelisk`][6]

You can simply replace `bazelbuild/setup-bazelisk` action with `bazel-contrib/setup-bazel`.
However, if you used a `bazel-version` input before, you will need to remove it in favor
[other ways to specify Bazel version][7].

## Development

To build action, run the following command:

```sh
$ npm run build
```

## Release

Use [Release][10] workflow to cut a new release.


[1]: https://github.com/bazelbuild/bazelisk
[2]: https://bazel.build/remote/caching#disk-cache
[3]: https://docs-staging.bazel.build/2338/versions/main/guide.html#the-repository-cache
[4]: https://bazel.build/run/bazelrc
[5]: https://docs.github.com/en/actions/learn-github-actions/contexts#github-context
[6]: https://github.com/bazelbuild/setup-bazelisk
[7]: https://github.com/bazelbuild/bazelisk/blob/master/README.md#how-does-bazelisk-know-which-bazel-version-to-run
[8]: https://github.com/actions/runner-images/pull/490
[9]: https://bazel.build/reference/command-line-reference#flag--google_credentials
[10]: https://github.com/bazel-contrib/setup-bazel/actions/workflows/release.yml
