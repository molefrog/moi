#!/bin/sh
# moi standalone installer
#
#   curl -fsSL https://raw.githubusercontent.com/molefrog/moi/main/packaging/install.sh | sh
#
# Installs the self-contained runtime (pinned bun + app + dependencies) into
# $MOI_HOME (default ~/.moi) and puts the `moi` shim on PATH. No Bun, Node, or
# git required. Update later with `moi update`; remove with `moi uninstall`.
set -eu

REPO="molefrog/moi"
MOI_HOME="${MOI_HOME:-$HOME/.moi}"
tmp=""
lock_path=""
lock_owner=""
stage=""
next=""

err() { printf '\033[31merror\033[0m: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1"; }

case "$MOI_HOME" in
  /*) ;;
  *) err "MOI_HOME must be an absolute path" ;;
esac
case "/$MOI_HOME/" in
  */../*) err "MOI_HOME must not contain '..' path segments" ;;
esac
[ -n "$(printf '%s' "$MOI_HOME" | tr -d '/')" ] || err "MOI_HOME must not be the filesystem root"
[ "$MOI_HOME" != "$HOME" ] || err "MOI_HOME must not be your home directory"

shell_quote() {
  printf "'"
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
  printf "'"
}

release_lock() {
  [ -n "$lock_path" ] || return 0
  owner="$(readlink "$lock_path" 2>/dev/null || true)"
  if [ "$owner" = "$lock_owner" ]; then rm -f "$lock_path"; fi
  lock_path=""
}

cleanup() {
  release_lock
  if [ -n "$next" ]; then rm -f "$next"; fi
  if [ -n "$stage" ]; then rm -rf "$stage"; fi
  if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

acquire_lock() {
  runtime_dir="$1"
  lock_path="$runtime_dir/.install-lock"
  lock_owner="$$-$(date +%s)"
  deadline=$(($(date +%s) + 60))

  while ! ln -s "$lock_owner" "$lock_path" 2>/dev/null; do
    owner="$(readlink "$lock_path" 2>/dev/null || true)"
    owner_pid="${owner%%-*}"
    stale=0
    case "$owner_pid" in
      '' | *[!0-9]*) stale=1 ;;
      *) kill -0 "$owner_pid" 2>/dev/null || stale=1 ;;
    esac

    if [ "$stale" = 1 ]; then
      stale_path="$runtime_dir/.stale-lock-$$-$(date +%s)"
      if mv "$lock_path" "$stale_path" 2>/dev/null; then
        rm -rf "$stale_path"
        continue
      fi
    fi

    [ "$(date +%s)" -lt "$deadline" ] || err "another moi install or update is still running"
    sleep 1
  done
}

version_is_newer() {
  awk -v candidate="$1" -v current="$2" 'BEGIN {
    split(candidate, a, "."); split(current, b, ".")
    for (i = 1; i <= 3; i++) {
      if (length(a[i]) > length(b[i])) exit 0
      if (length(a[i]) < length(b[i])) exit 1
      if (("x" a[i]) > ("x" b[i])) exit 0
      if (("x" a[i]) < ("x" b[i])) exit 1
    }
    exit 1
  }'
}

command -v curl >/dev/null 2>&1 || err "curl is required"
command -v tar >/dev/null 2>&1 || err "tar is required"

# --- platform ---------------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) err "unsupported OS: $os (macOS and Linux only)" ;;
esac
case "$arch" in
  arm64 | aarch64) arch="arm64" ;;
  x86_64 | amd64) arch="x64" ;;
  *) err "unsupported architecture: $arch" ;;
esac
platform="$os-$arch"

# --- resolve latest release (redirect trick, no jq) -------------------------
info "Resolving latest release"
tag="$(curl --connect-timeout 30 --max-time 60 -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" | sed 's|.*/tag/||')"
[ -n "$tag" ] || err "could not resolve the latest release tag"
version="${tag#v}"
[ "$tag" = "v$version" ] || err "latest release tag is not a stable vX.Y.Z tag: $tag"
printf '%s\n' "$version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' ||
  err "latest release tag is not a stable vX.Y.Z tag: $tag"

asset="moi-standalone-$version-$platform.tar.gz"
base="https://github.com/$REPO/releases/download/$tag"

# --- download + verify ------------------------------------------------------
tmp="$(mktemp -d)"

info "Downloading $asset"
curl --connect-timeout 30 --max-time 1800 -fSL --progress-bar -o "$tmp/$asset" "$base/$asset" ||
  err "no standalone build for $platform in release $tag"

curl --connect-timeout 30 --max-time 60 -fsSL -o "$tmp/$asset.sha256" "$base/$asset.sha256" ||
  err "release $tag has no checksum for $asset — install unchanged"
expected="$(cut -d' ' -f1 <"$tmp/$asset.sha256" | tr '[:upper:]' '[:lower:]')"
printf '%s\n' "$expected" | grep -Eq '^[a-f0-9]{64}$' || err "published checksum is malformed"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | cut -d' ' -f1)"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)"
else
  err "sha256sum or shasum is required to verify the download"
fi
[ "$actual" = "$expected" ] || err "checksum mismatch — install unchanged"
info "Checksum verified"

# --- install ----------------------------------------------------------------
runtime_dir="$MOI_HOME/runtime"
info "Installing to $runtime_dir/$version"
mkdir -p "$runtime_dir" "$MOI_HOME/bin"
acquire_lock "$runtime_dir"

previous="$(readlink "$runtime_dir/current" 2>/dev/null || true)"
selected="$version"
install_runtime=1
if printf '%s\n' "$previous" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  if ! version_is_newer "$version" "$previous"; then
    selected="$previous"
    install_runtime=0
    info "Keeping installed moi $previous (latest published: $version)"
  fi
fi

if [ "$install_runtime" = 1 ]; then
  stage="$runtime_dir/.stage-$$"
  next="$runtime_dir/.current-next-$$"
  rm -rf "$stage"
  rm -f "$next"
  mkdir -p "$stage"
  tar -xzf "$tmp/$asset" -C "$stage"

  extracted="$stage/moi-runtime"
  [ -x "$extracted/bun" ] || err "release payload has no executable Bun runtime"
  [ -f "$extracted/app/server/cli.ts" ] || err "release payload has no moi CLI"
  payload_version="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$extracted/app/package.json" | head -n 1)"
  [ "$payload_version" = "$version" ] ||
    err "release payload version $payload_version does not match $version"

  rm -rf "$runtime_dir/$version"
  mv "$extracted" "$runtime_dir/$version"
  rm -rf "$stage"

  ln -s "$version" "$next"
  "$runtime_dir/$version/bun" -e \
    'const { rename } = await import("node:fs/promises"); await rename(process.argv[1], process.argv[2])' \
    "$next" "$runtime_dir/current"
  next=""

  stage=""
fi

# Keep the selected runtime and the version it replaced for rollback. This also
# repairs accumulated old versions during a same-version reinstall.
for entry in "$runtime_dir"/*; do
  [ -e "$entry" ] || [ -L "$entry" ] || continue
  name="$(basename "$entry")"
  case "$name" in
    current | "$selected" | "$previous" | "$version") continue ;;
  esac
  rm -rf "$entry"
done

# The chosen home is baked in as a shell-escaped default so a custom-MOI_HOME
# install works from fresh shells without interpreting characters in the path.
quoted_home="$(shell_quote "$MOI_HOME")"
cat >"$MOI_HOME/bin/moi" <<SHIM
#!/bin/sh
DEFAULT_MOI_HOME=$quoted_home
MOI_HOME="\${MOI_HOME:-\$DEFAULT_MOI_HOME}"
export MOI_HOME
export MOI_STANDALONE_HOME="\$MOI_HOME"
exec "\$MOI_HOME/runtime/current/bun" "\$MOI_HOME/runtime/current/app/server/cli.ts" "\$@"
SHIM
chmod +x "$MOI_HOME/bin/moi"
release_lock

# --- PATH -------------------------------------------------------------------
bin_dir="$MOI_HOME/bin"
case ":$PATH:" in
  *":$bin_dir:"*) on_path=1 ;;
  *) on_path=0 ;;
esac

if [ "$on_path" = 0 ] && [ "${MOI_NO_MODIFY_PATH:-}" = "" ]; then
  shell_name="$(basename "${SHELL:-sh}")"
  case "$shell_name" in
    zsh) rc="$HOME/.zshrc" ;;
    bash)
      if [ "$os" = "darwin" ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
      ;;
    fish) rc="" ;;
    *) rc="$HOME/.profile" ;;
  esac
  if [ "$shell_name" = "fish" ]; then
    mkdir -p "$HOME/.config/fish/conf.d"
    quoted_bin="$(shell_quote "$bin_dir")"
    printf 'set -gx PATH %s $PATH\n' "$quoted_bin" >"$HOME/.config/fish/conf.d/moi.fish"
    info "Added $bin_dir to PATH (fish conf.d)"
  elif [ -f "$rc" ] && grep -qF "$bin_dir" "$rc"; then
    : # PATH line already present from an earlier install — don't append again
  else
    quoted_bin="$(shell_quote "$bin_dir")"
    printf '\n# moi\nexport PATH=%s:"$PATH"\n' "$quoted_bin" >>"$rc"
    info "Added $bin_dir to PATH in $rc"
  fi
  info "Open a new terminal (or 'source' your shell profile) to pick it up"
elif [ "$on_path" = 0 ]; then
  info "$bin_dir is not on PATH; add it before running moi"
fi

info ""
info "moi $selected installed — run 'moi start' to launch"
