#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for NS Marks The Spot.
#
# This prepares the Linux-runnable parts of the project's development
# experience: the Ruby/Fastlane release-metadata tooling and the Python
# documentation-automation tooling. Building or testing the iOS app itself
# requires macOS + Xcode and is not possible in a Linux Cloud Agent VM.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUBY_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.ruby-version")"

# Fastlane wants a UTF-8 locale; en_US.UTF-8 ships in the base image.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# --- 1. System build dependencies (only if a Ruby build toolchain is missing) --
ensure_build_deps() {
  if dpkg -s build-essential >/dev/null 2>&1 && [ -f /usr/include/openssl/ssl.h ]; then
    return 0
  fi
  log "Installing system build dependencies via apt"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential autoconf patch rustc \
    libssl-dev libyaml-dev libreadline6-dev zlib1g-dev libgmp-dev \
    libncurses-dev libffi-dev libgdbm6t64 libgdbm-dev libdb-dev uuid-dev \
    git curl ca-certificates
}

# --- 2. rbenv + ruby-build ---------------------------------------------------
ensure_rbenv() {
  if [ ! -d "$HOME/.rbenv" ]; then
    log "Cloning rbenv"
    git clone --depth 1 https://github.com/rbenv/rbenv.git "$HOME/.rbenv"
  fi
  mkdir -p "$HOME/.rbenv/plugins"
  if [ ! -d "$HOME/.rbenv/plugins/ruby-build" ]; then
    log "Cloning ruby-build"
    git clone --depth 1 https://github.com/rbenv/ruby-build.git "$HOME/.rbenv/plugins/ruby-build"
  fi
  export PATH="$HOME/.rbenv/bin:$HOME/.rbenv/shims:$PATH"
  eval "$(rbenv init - bash)"

  # Make rbenv available in interactive agent shells too.
  if ! grep -q 'rbenv init' "$HOME/.bashrc" 2>/dev/null; then
    log "Wiring rbenv into ~/.bashrc"
    cat >> "$HOME/.bashrc" <<'BASHRC'

# rbenv (NS Marks The Spot Ruby toolchain)
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export PATH="$HOME/.rbenv/bin:$HOME/.rbenv/shims:$PATH"
if command -v rbenv >/dev/null 2>&1; then
  eval "$(rbenv init - bash)"
fi
BASHRC
  fi
}

# --- 3. Pinned Ruby ----------------------------------------------------------
ensure_ruby() {
  if ! rbenv versions --bare | grep -qx "$RUBY_VERSION"; then
    log "Installing Ruby $RUBY_VERSION (compiles from source; this can take a few minutes)"
    ensure_build_deps
    rbenv install -s "$RUBY_VERSION"
  fi
  rbenv global "$RUBY_VERSION"
  rbenv rehash
}

# --- 4. Bundler + gems -------------------------------------------------------
ensure_gems() {
  if ! gem list -i bundler >/dev/null 2>&1; then
    log "Installing bundler"
    gem install bundler --no-document
  fi
  rbenv rehash
  log "Installing Ruby gems (fastlane) via bundle install"
  ( cd "$REPO_ROOT" && bundle install )
}

ensure_rbenv
ensure_ruby
ensure_gems

log "Verifying toolchain"
ruby --version
bundle --version
( cd "$REPO_ROOT" && bundle exec fastlane --version | tail -1 )
python3 --version

log "Bootstrap complete. Linux-runnable checks:"
cat <<'USAGE'
  - Ruby/Fastlane metadata lint : bundle exec fastlane ios lint_metadata
  - Python doc-automation tests : make doc-automation-test
  - Regenerate weekly devlog    : make devlog-update
The iOS app (xcodebuild / fastlane build|test|beta|release) requires macOS + Xcode
and cannot run in a Linux Cloud Agent VM.
USAGE
