# setup-bazel

This action allows to properly configure Bazel on all supported operating systems
and provides an advanced fine-grained caching to improve workflows performance.

## Inputs

### `bazelisk-cache`

Cache [`bazelisk`][1] downloads based on contents of a `.bazelversion` file.

Default `false`.

### `bazelrc`

Extra contents to write to a user's [`bazelrc`][4] file.

Default `""`.

### `disk-cache`

Enable [`disk_cache`][2] and store it on GitHub based on contents of `BUILD` files.

You can also pass a string to use as a cache key to separate caches from different workflows.

Default `false`.

### `external-cache`

Cache `external/` repositories based on contents of a `WORKSPACE` file.
Only repositories exceeding 10MB are being cached.

You can also pass a YAML object where key is the name of the external repository
and value is the list of files which contents are used to calculate cache key.

Default `false`.

### `repository-cache`

Enable [`repository_cache`][3] and store it on GitHub based on contents of a `WORKSPACE` file.

Default `false`.

### `token`

GitHub API token used by `external-cache` to fetch all available caches.
Not used when external cache is disabled.

Default [`${{ github.token }}`][5].

## Examples

### Simple configuration

```yaml
- uses: p0deje/setup-bazel@0.1.0
```

### Additional `.bazelrc` options

```yaml
- uses: p0deje/setup-bazel@0.1.0
  with:
    bazelrc: |
      build --show_timestamps
```

### Full caching enabled

```yaml
- uses: p0deje/setup-bazel@0.1.0
  with:
    bazelisk-cache: true
    disk-cache: true
    external-cache: true
    repository-cache: true
```

### Separate disk cache between workflows

```yaml
- uses: p0deje/setup-bazel@0.1.0
  with:
    disk-cache: ${{ github.workflow }}}
```

### Cache external repository based on different files

```yaml
- uses: p0deje/setup-bazel@0.1.0
  with:
    external-cache: |
      npm: package-lock.json
```

[1]: https://github.com/bazelbuild/bazelisk
[2]: https://bazel.build/remote/caching#disk-cache
[3]: https://docs-staging.bazel.build/2338/versions/main/guide.html#the-repository-cache
[4]: https://bazel.build/run/bazelrc
[5]: https://docs.github.com/en/actions/learn-github-actions/contexts#github-context
