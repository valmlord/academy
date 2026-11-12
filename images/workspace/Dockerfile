# The lesson workspace image, academy-workspace:<tag> (ADR-0002 item 10). Build context: images/workspace, an
# allowlist (.dockerignore). Built only by scripts/build-workspace-image.sh, which tags it after its smoke test.
# No syntax directive on purpose: the daemon's built-in frontend parses this file, and a directive would make
# every build fetch a frontend image from the registry.
#
# Every RUN runs under bash -euo pipefail and separates its commands with ";" only: in "a && b; c" a failing
# "a" does not stop the RUN, because set -e ignores a failing non-last command of an && list.
#
# Bumping a pin (a reviewer re-runs these steps to check a bumped value; none of them runs during the build):
# - BASE_IMAGE: the index digest of ubuntu:24.04 on Docker Hub; it must list linux/amd64 and linux/arm64/v8.
# - Go: the sha256 of each linux tarball in https://go.dev/dl/?mode=json&include=all.
# - Node: download SHASUMS256.txt and SHASUMS256.txt.asc from https://nodejs.org/dist/v<version>/, import the
#   release keys listed in the "Release keys" section of the nodejs/node README (or the nodejs/release-keys
#   repository), check that "gpg --verify SHASUMS256.txt.asc SHASUMS256.txt" prints "Good signature" from one of
#   them, and only then copy the linux-x64.tar.xz and linux-arm64.tar.xz lines. The signature check is what makes
#   a bumped sha trustworthy; the build itself trusts the pin.
# - Claude Code: the version in https://downloads.claude.ai/claude-code-releases/stable and the checksums in its
#   manifest.json (the build re-checks them against the signed manifest). A new signing key means a new
#   claude-code.asc and CLAUDE_KEY_FINGERPRINT in the same change.
# - apt: APT_SNAPSHOT and every package version from that snapshot's Packages.gz (main and universe).

# Global: both FROM lines read BASE_IMAGE, and the versions are read by both stages (download and label), so each
# value is written once here. A stage sees a global ARG only where it redeclares it.
#
# Every RUN after an ARG declaration in a stage gets that ARG as an environment variable, so a changed value is a
# cache miss for every RUN that follows it (Dockerfile reference, ARG, "Impact on build caching"). Each ARG is
# therefore declared right before the first instruction that reads it, and the steps run from the rarest bump to
# the most frequent one: a bump re-runs its own step and the steps after it, never the ones before.
ARG BASE_IMAGE=ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852
ARG GO_VERSION=1.27.3
ARG NODE_VERSION=22.23.4
ARG CLAUDE_VERSION=2.1.311

# Downloads and verifies the toolchains. Nothing of this stage ships except the trees copied from /out.
FROM ${BASE_IMAGE} AS fetch
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# From the live archive, not the snapshot: these tools never reach the final image and everything they fetch is
# checked against a pinned sha256. They also supply the CA bundle the final stage needs for the HTTPS-only snapshot.
# apt-download.sh fetches with retries (#130); --no-download then installs only what it fetched, so dpkg runs once
# and never touches the network. The incomplete-lists flag: these tools are unpinned, so any pocket that lists them
# will do, as before #130; the helper retries only when they do not resolve.
RUN --mount=type=bind,source=apt-download.sh,target=/run/apt-download.sh \
    packages=(ca-certificates curl gnupg python3 xz-utils); \
    bash /run/apt-download.sh --incomplete-lists-ok "${packages[@]}"; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends --no-download "${packages[@]}"; \
    rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
ARG GO_VERSION
ARG GO_SHA256_AMD64=65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40
ARG GO_SHA256_ARM64=a06e99309dbcbdca1a8ccd2282c3ee146e55930886e26b4f1193269587165f49
RUN case "$TARGETARCH" in \
      amd64) sha="$GO_SHA256_AMD64" ;; \
      arm64) sha="$GO_SHA256_ARM64" ;; \
      *) echo "workspace image: unsupported TARGETARCH '${TARGETARCH}' (BuildKit sets it; amd64 and arm64 are supported)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o /tmp/go.tgz "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz"; \
    echo "${sha}  /tmp/go.tgz" | sha256sum -c -; \
    mkdir -p /out/usr/local; \
    tar -C /out/usr/local -xzf /tmp/go.tgz; \
    test "$(/out/usr/local/go/bin/go version)" = "go version go${GO_VERSION} linux/${TARGETARCH}"; \
    rm /tmp/go.tgz

# The whole official build is kept, npm and npx as its own symlinks (#44).
ARG NODE_VERSION
ARG NODE_SHA256_X64=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
ARG NODE_SHA256_ARM64=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b
RUN case "$TARGETARCH" in \
      amd64) arch=x64; sha="$NODE_SHA256_X64" ;; \
      arm64) arch=arm64; sha="$NODE_SHA256_ARM64" ;; \
      *) echo "workspace image: unsupported TARGETARCH '${TARGETARCH}' (BuildKit sets it; amd64 and arm64 are supported)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o /tmp/node.txz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz"; \
    echo "${sha}  /tmp/node.txz" | sha256sum -c -; \
    mkdir -p /out/opt/node; \
    tar -C /out/opt/node --strip-components=1 -xJf /tmp/node.txz; \
    test "$(/out/opt/node/bin/node --version)" = "v${NODE_VERSION}"; \
    rm /tmp/node.txz

# --ignore-scripts: none of the six packages has an install script (F4).
# --userconfig /dev/null and --globalconfig /tmp/npm-empty-globalconfig, an empty file this RUN creates and
# removes: npm reads no user or global npmrc. The two paths differ because npm refuses to load one file as two
# config levels. No project .npmrc can exist here because the context allowlist admits none, npm's builtin
# config comes from the sha-verified Node tarball, and the build environment holds no npm_config_* variable
# because the build takes no --build-arg.
# The lockfile guard runs first: an entry without integrity, or resolved from anywhere but the public registry
# (a lockfile generated against a mirror, a tarball URL), would otherwise install from elsewhere.
COPY package.json package-lock.json /out/opt/academy/node/
RUN python3 -I -c 'import json, sys; lock = json.load(open(sys.argv[1])); bad = [name for name, entry in lock["packages"].items() if name != "" and (not entry.get("integrity") or not str(entry.get("resolved", "")).startswith("https://registry.npmjs.org/"))]; sys.exit("workspace image: lockfile entries without integrity or not from https://registry.npmjs.org/: %s" % ", ".join(bad) if bad else 0)' /out/opt/academy/node/package-lock.json; \
    cd /out/opt/academy/node; \
    : > /tmp/npm-empty-globalconfig; \
    PATH=/out/opt/node/bin:$PATH npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache --userconfig /dev/null --globalconfig /tmp/npm-empty-globalconfig --registry https://registry.npmjs.org/; \
    rm -rf /tmp/npm-cache /tmp/npm-empty-globalconfig; \
    test -f node_modules/@typespec/compiler/cmd/tsp.js; \
    test -f node_modules/openapi-typescript/bin/cli.js; \
    test -f node_modules/typescript/bin/tsc

# The key is committed, so the build never trusts a key fetched from the host whose manifest it verifies. The pinned
# checksum must also agree with the signed manifest: a re-signed manifest with another checksum fails the build,
# and so does a pin edited without a matching signed release. The binary is never executed here (it would write
# state under HOME and may use the network).
COPY claude-code.asc /tmp/claude-code.asc
ARG CLAUDE_VERSION
ARG CLAUDE_SHA256_LINUX_X64=86dc1fcc69498159eaf15f446613e847010f9036bfbbdffd4c49350be8489ada
ARG CLAUDE_SHA256_LINUX_ARM64=2e2496c9a8065df93acb0fca2d341f59a6b8777649b2e025ab8c9bcd5eef61f3
ARG CLAUDE_KEY_FINGERPRINT=31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE
RUN case "$TARGETARCH" in \
      amd64) platform=linux-x64; sha="$CLAUDE_SHA256_LINUX_X64" ;; \
      arm64) platform=linux-arm64; sha="$CLAUDE_SHA256_LINUX_ARM64" ;; \
      *) echo "workspace image: unsupported TARGETARCH '${TARGETARCH}' (BuildKit sets it; amd64 and arm64 are supported)" >&2; exit 1 ;; \
    esac; \
    GNUPGHOME=$(mktemp -d); \
    export GNUPGHOME; \
    fpr=$(gpg --batch --with-colons --import-options show-only --import /tmp/claude-code.asc | awk -F: '$1 == "fpr" && !n++ { print $10 }'); \
    test "$fpr" = "$CLAUDE_KEY_FINGERPRINT" || { echo "workspace image: claude-code.asc fingerprint '${fpr}' is not the pinned '${CLAUDE_KEY_FINGERPRINT}'" >&2; exit 1; }; \
    gpg --batch --import /tmp/claude-code.asc; \
    curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o /tmp/manifest.json "https://downloads.claude.ai/claude-code-releases/${CLAUDE_VERSION}/manifest.json"; \
    curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o /tmp/manifest.json.sig "https://downloads.claude.ai/claude-code-releases/${CLAUDE_VERSION}/manifest.json.sig"; \
    gpg --batch --status-fd 1 --verify /tmp/manifest.json.sig /tmp/manifest.json | grep -E "^\[GNUPG:\] VALIDSIG .* ${CLAUDE_KEY_FINGERPRINT}\$" >/dev/null; \
    python3 -I -c 'import json, sys; manifest = json.load(open(sys.argv[1])); version, platform, sha = sys.argv[2:5]; got_version = manifest.get("version"); got_sha = manifest.get("platforms", {}).get(platform, {}).get("checksum"); sys.exit(0 if (got_version, got_sha) == (version, sha) else "workspace image: signed manifest %s has version %r checksum %r; pinned version %r checksum %r" % (platform, got_version, got_sha, version, sha))' /tmp/manifest.json "$CLAUDE_VERSION" "$platform" "$sha"; \
    curl -fsSL --proto '=https' --proto-redir '=https' --tlsv1.2 -o /tmp/claude "https://downloads.claude.ai/claude-code-releases/${CLAUDE_VERSION}/${platform}/claude"; \
    echo "${sha}  /tmp/claude" | sha256sum -c -; \
    install -D -m 0755 /tmp/claude /out/opt/claude/bin/claude; \
    rm -rf "$GNUPGHOME" /tmp/claude /tmp/manifest.json /tmp/manifest.json.sig

FROM ${BASE_IMAGE}
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
ARG APT_SNAPSHOT=20261104T000000Z
ARG TZDATA_VERSION=2026e-0ubuntu0.24.04.1

# Exact versions from a dated snapshot, so a rebuild months later installs the same packages on both
# architectures. The base has no CA bundle and the snapshot is HTTPS-only: the fetch stage's bundle is bind-mounted,
# so it lands in no layer. DEBIAN_FRONTEND is set per command, never as ENV, so it does not reach the runtime.
# less: git log and git diff page through it.
# apt-download.sh fetches from the snapshot with retries and never switches to another source (#130); the
# install uses only those downloads. No incomplete-lists flag here: the dependencies are not pinned, so every index
# of the snapshot must arrive.
RUN --mount=type=bind,from=fetch,source=/etc/ssl/certs/ca-certificates.crt,target=/run/bootstrap-ca.crt \
    --mount=type=bind,source=apt-download.sh,target=/run/apt-download.sh \
    packages=(ca-certificates=20260816ubuntu0.24.04.1 git=1:2.43.0-1ubuntu7.4 less=590-2ubuntu2.1 make=4.3-4.1build2 python3=3.12.3-0ubuntu2.1 ripgrep=14.1.0-1 "tzdata=${TZDATA_VERSION}"); \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s/\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "$APT_SNAPSHOT" > /etc/apt/sources.list.d/ubuntu.sources; \
    bash /run/apt-download.sh --cainfo /run/bootstrap-ca.crt "${packages[@]}"; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends --no-download "${packages[@]}"; \
    test "$(dpkg-query -W -f='${Version}' python3.12)" = 3.12.3-1ubuntu0.17; \
    rm -rf /var/lib/apt/lists/* /var/log/apt /var/log/dpkg.log /var/cache/debconf/*-old

# uid/gid 1000 is the base's "ubuntu"; renamed rather than a second user, because --user 1000:1000 resolves to it.
# --groups '': docker exec --user learner, or --user 1000 without a group, adds the supplementary groups /etc/group
# lists for that name, and ubuntu is in adm, sudo and seven more; the service's --user 1000:1000 adds none. No home
# is created: /workspace must stay empty in the image (the volume is NoCopy).
RUN usermod --login learner --home /workspace/home --comment learner --groups '' ubuntu; \
    groupmod --new-name learner ubuntu; \
    rm -rf /home/ubuntu; \
    test "$(getent passwd 1000)" = "learner:x:1000:1000:learner:/workspace/home:/bin/bash"; \
    test "$(getent group 1000)" = "learner:x:1000:"; \
    members=$(getent group | awk -F: '$4 ~ /(^|,)(learner|ubuntu)(,|$)/ { print $1 }'); \
    test -z "$members" || { echo "workspace image: learner is still in groups: ${members}" >&2; exit 1; }

# Ordered by how rarely each changes, so a Claude Code bump rebuilds only the last big layer. Every tree is
# root-owned and the root filesystem is read-only at runtime: npm -g and claude update fail instead of drifting.
COPY --from=fetch /out/usr/local/go /usr/local/go
COPY --from=fetch /out/opt/node /opt/node
COPY --from=fetch /out/opt/academy/node /opt/academy/node
COPY bin/tsp bin/openapi-typescript /opt/academy/bin/
RUN test -x /opt/academy/bin/tsp && test -x /opt/academy/bin/openapi-typescript
COPY --from=fetch /out/opt/claude/bin/claude /opt/claude/bin/claude

# /opt/claude/bin is the only directory holding the real claude: never /usr/bin, /bin or the python3 directory,
# which the lesson checks put on their own PATH (#43 E5). The first three entries are #44's learner PATH order; the
# tail is the base image's PATH. HOME is set here too, so a plain docker run behaves like the service, which sets
# only HOME. Labels use academy.image.*, because containers inherit image labels and academy.workspace.* belongs
# to the service; academy.image.context is added by the build script, which knows the git tree.
ENV PATH=/opt/academy/bin:/opt/node/bin:/usr/local/go/bin:/opt/claude/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/workspace/home \
    LANG=C.UTF-8 \
    DISABLE_AUTOUPDATER=1
# Read only by LABEL, so declared after the last RUN: no RUN of this stage sees them.
ARG BASE_IMAGE
ARG GO_VERSION
ARG NODE_VERSION
ARG CLAUDE_VERSION
LABEL org.opencontainers.image.title=academy-workspace \
      org.opencontainers.image.source=https://github.com/valmlord/academy \
      academy.image.base="${BASE_IMAGE}" academy.image.apt-snapshot="${APT_SNAPSHOT}" \
      academy.image.go="${GO_VERSION}" academy.image.node="${NODE_VERSION}" \
      academy.image.claude-code="${CLAUDE_VERSION}" academy.image.tzdata="${TZDATA_VERSION}"
USER 1000:1000
CMD ["sleep", "infinity"]
