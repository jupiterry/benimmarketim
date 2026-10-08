#!/bin/bash
# Install root-owned at /usr/local/sbin/benimmarketim-deploy, never run via sudo
# from a checkout writable by the SSH account. No secrets or .env are copied.
set -Eeuo pipefail
export PATH=/opt/benimmarketim-node22/bin:/usr/local/bin:/usr/bin:/bin
export PM2_HOME=/root/.pm2
export GIT_TERMINAL_PROMPT=0
umask 022
APP=/var/www/benimmarketim
STATE=/var/lib/benimmarketim-deploy
PROCESS=benimmarketim-api
[[ $EUID == 0 && $# == 3 ]] || exit 1
mode=$1
target=$2
[[ $mode == deploy || $mode == rollback ]] || exit 1
[[ $target =~ ^[0-9a-f]{40}$ && $3 == "$APP" ]] || exit 1
mkdir -p "$STATE"
chmod 700 "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
cd "$APP"
[[ $(git rev-parse --show-toplevel) == "$APP" ]]
[[ $(git branch --show-current) == main ]]
[[ -z $(git status --porcelain --untracked-files=all) ]] || {
  echo 'Checkout has local changes. Deployment stopped.' >&2; exit 1;
}
for tool in git node npm pm2 curl tar flock; do command -v "$tool" >/dev/null; done
[[ $(node -p 'process.versions.node.split(".")[0]') == 22 ]] || {
  echo 'Node 22 is required (same as CI).' >&2; exit 1;
}
pm2 describe "$PROCESS" >/dev/null
run="$STATE/$(date -u +%Y%m%dT%H%M%SZ)-${target:0:12}"
mkdir "$run"
chmod 700 "$run"
exec 3>&1 4>&2
# Dependency/build diagnostics stay in a root-only log; never stream them to CI.
exec >"$run/deploy.log" 2>&1
stage="$run/stage"
old=$(git rev-parse HEAD)
printf '%s\n' "$old" > "$run/previous-commit"
armed=0
backend=0
rootdeps=0
health() {
  local deadline=$((SECONDS + 60)) web api
  while (( SECONDS < deadline )); do
    web=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://devrekbenimmarketim.com/ || true)
    api=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' https://devrekbenimmarketim.com/api/products || true)
    [[ $web == 200 && $api == 200 ]] && return 0
    sleep 2
  done
  return 1
}
recover() {
  local rc=$?
  (( rc != 0 )) || rc=1
  trap - ERR HUP INT TERM
  set +e
  if (( armed )); then
    local failed=0
    git reset --hard "$old" || failed=1
    if (( rootdeps )); then
      mv node_modules "$run/failed-node_modules" || failed=1
      mv "$run/previous-node_modules" node_modules || failed=1
    fi
    if [[ -d "$run/previous-dist" ]]; then
      mv frontend/dist "$run/failed-dist" || failed=1
      mv "$run/previous-dist" frontend/dist || failed=1
    fi
    if (( backend )); then pm2 reload "$PROCESS" --interpreter /opt/benimmarketim-node22/bin/node || failed=1; fi
    health || failed=1
    if (( failed )); then
      echo 'Deploy and recovery failed. Administrator intervention required.' >&4
    else
      echo 'Deploy failed; previous version restored.' >&4
    fi
  else
    echo 'Preflight/build failed; live files were not changed.' >&4
  fi
  echo "Root-only diagnostics: $run/deploy.log" >&4
  exit "${rc:-1}"
}
trap recover ERR HUP INT TERM
git fetch --no-tags origin main
if [[ $mode == deploy ]]; then
  [[ $(git rev-parse origin/main) == "$target" ]] # Never deploy an untested newer commit.
  git merge-base --is-ancestor "$old" "$target"
else
  git merge-base --is-ancestor "$target" origin/main
fi
# A tracked secret/upload would be overwritten by Git: refuse before modifying live files.
if git ls-tree -r --name-only "$target" | grep -E '(^|/)(\.env($|\.)|\.telegram\.env$|uploads/)' | grep -vE '(^|/)\.env\.example$' >/dev/null; then
  echo 'Protected files are tracked in target.'; false
fi
changes=$(git diff --name-only "$old" "$target")
if grep -Eq '^(backend/|package(-lock)?\.json$)' <<<"$changes"; then backend=1; fi
frontend=0
if grep -Eq '^(frontend/|package(-lock)?\.json$)' <<<"$changes"; then frontend=1; fi
[[ -d frontend/dist ]] # Bootstrap the existing live build before enabling automation.
[[ -d node_modules ]] # Initial dependencies must be installed during setup.
if ! git diff --quiet "$old" "$target" -- package-lock.json; then rootdeps=1; fi
mkdir "$stage"
git archive "$target" | tar -x -C "$stage"
if (( rootdeps )); then
  (cd "$stage" && npm ci --include=dev --no-audit --no-fund)
else
  cp -a node_modules "$stage/node_modules"
fi
if (( frontend )); then
  if [[ -d frontend/node_modules ]] && git diff --quiet "$old" "$target" -- frontend/package-lock.json; then
    cp -a frontend/node_modules "$stage/frontend/node_modules"
  else
    (cd "$stage" && npm ci --prefix frontend --include=dev --no-audit --no-fund)
  fi
  (cd "$stage" && npm run build --prefix frontend && node frontend/scripts/check-seo.mjs)
  # Retain all previous hashed assets; deliberately no automatic deletion.
  if [[ -d frontend/dist/assets ]]; then
    cp -an frontend/dist/assets/. "$stage/frontend/dist/assets/"
  fi
  chmod -R a+rX "$stage/frontend/dist"
fi
if (( frontend )); then cp -a frontend/dist "$run/previous-dist"; fi
if (( rootdeps )); then cp -a node_modules "$run/previous-node_modules"; fi
armed=1
if [[ $mode == deploy ]]; then
  git pull --ff-only origin "$target" # Exact tested main commit, even if main advances.
  [[ $(git rev-parse HEAD) == "$target" ]]
else
  git reset --hard "$target"
fi
if (( rootdeps )); then
  mv node_modules "$run/replaced-node_modules"
  mv "$stage/node_modules" node_modules
fi
if (( frontend )); then
  mv frontend/dist "$run/replaced-dist"
  mv "$stage/frontend/dist" frontend/dist
fi
if (( backend )); then pm2 reload "$PROCESS" --interpreter /opt/benimmarketim-node22/bin/node; fi
health
printf '%s\n' "$target" > "$STATE/current-commit"
armed=0
echo "Deployment OK: $target" >&3
# Keep the backup and logs for manual recovery. No .env, uploads or nginx writes.
