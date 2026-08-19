# Windows development

The backend suite, the PWA build and the Android driver build all run natively
on Windows. One thing does not, and cannot: the regtest Lightning harness needs
a **Linux** container runtime, because the `polarlightning` images it uses are
Linux-only. That is a Docker fact, not a script problem — run it under WSL2.

Nothing here is Windows-specific tooling. The same commands are what Linux and
macOS run; the point of the work below was to stop the repository assuming a
POSIX shell, not to add a second way of doing things.

## What runs where

| | Windows | Linux / macOS |
|---|---|---|
| `npm test` (backend unit + integration) | Yes — but see [reserved ports](#reserved-port-ranges) | Yes |
| `npm run test:live` | Yes | Yes |
| `cd web && npm test`, `npm run build` | Yes | Yes |
| `npm run test:ui`, `test:ui:direct` (Chromium) | Yes | Yes |
| `npm run native:driver:android` + Gradle APK | Yes | Yes |
| `npm run test:regtest` | Only via WSL2 (see below) | Yes |
| `scripts/*.sh` (release/publish) | Git Bash or WSL | Yes |

## Why the npm scripts are Node, not shell

npm runs `scripts` through **cmd.exe** on Windows, which has no `find`, `rm`,
`cp`, `mktemp` or `seq`, no `VAR=value cmd` prefix and no glob expansion. Those
constructs made several scripts unrunnable rather than merely awkward, so the
logic moved into Node, which every contributor already has:

| Was | Now |
|---|---|
| `$(find tests -name '*.test.js' … \| sort)` | `tests/helpers/list-test-files.js` |
| `LIVE_RELAY_URL=${LIVE_RELAY_URL:-…} node --test` | `tests/helpers/run-live-tests.js` |
| `rm -rf`/`cp -r` staging the native driver bundle | `web/scripts/prepare-native-driver.mjs` |
| `VITE_x=y npm run build && … node server.js` in the Playwright configs | `web/scripts/e2e-webserver.mjs` |
| `tests/regtest/run.sh` | `tests/regtest/run.js` |

`tests/helpers/list-test-files.js` is worth one extra note. `npm test` and the
CI loop must select the **same** files — CI once hardcoded
`tests/integration/*.test.js`, so tests in other directories were silently never
run. Both used to spell out the same `find` expression, which stayed in step
only while nobody edited one copy. Both now call that module, so the selection
cannot drift.

There is no need to set `npm config set script-shell` to a bash path. If you
have done that previously, it is no longer required.

## Android driver build

`JAVA_HOME` must point at a JDK 17 or newer. Android Studio's bundled runtime
is fine and needs no separate install:

```
C:\Program Files\Android\Android Studio\jbr
```

`gradlew.bat` reads `JAVA_HOME` directly, so `java` on `PATH` is optional —
add `%JAVA_HOME%\bin` to `PATH` only if you want `java`/`javac` in a terminal.

You also need the Android SDK platform and build-tools matching
`web/android/variables.gradle` (`compileSdkVersion`/`targetSdkVersion`), plus
the Gradle wrapper's own download on first run. Then:

```powershell
cd web
npm run native:driver:android
cd android
.\gradlew.bat assembleDebug
```

The APK lands in `web\android\app\build\outputs\apk\debug\`.

## Regtest under WSL2

`npm run test:regtest` needs Docker with a Linux container runtime. Docker
Desktop in Linux-container mode works. Without Docker Desktop, install Docker
Engine inside a WSL2 distribution and run the harness there:

```powershell
wsl -d Ubuntu-24.04 --cd /mnt/c/path/to/DonkeyRide -- node tests/regtest/run.js
```

Ubuntu's `docker.io` package does **not** include Compose v2. If
`docker compose` reports `unknown command`, install the plugin for your user
(no root needed):

```bash
mkdir -p ~/.docker/cli-plugins
curl -fsSL -o ~/.docker/cli-plugins/docker-compose \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64
chmod +x ~/.docker/cli-plugins/docker-compose
```

Verify the download against the published `.sha256` before trusting it. The
Windows-side `docker.exe` cannot help here if its daemon is in Windows-container
mode — it will fail with `no matching manifest for windows/amd64`.

## Reserved port ranges

This one is environmental, not a script problem, and it is the most likely
thing to make a Windows run look broken.

Eighteen integration tests each pick a WebSocket port at random from a
hand-assigned band, e.g. `52000 + Math.floor(Math.random() * 400)`. Windows
reserves blocks of TCP ports for Hyper-V, WSL and Docker, and a process that
tries to bind one gets `EACCES: permission denied` — the file dies on
`require`, before any test runs, so it is reported as a failed file rather
than a failed assertion.

List the reservations:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

On one machine two bands were badly hit — 81% of `back-to-back`'s band and
66% of `dropoff-change`'s sat inside reserved ranges, while the other sixteen
were untouched. Those two files then failed on almost every run. Which bands
collide is specific to a machine's reservations, so the symptom looks
arbitrary and moves around.

Options, in order of preference:

1. Re-run. A different draw usually lands outside the reserved block, though
   that is luck rather than a fix.
2. Move Windows' dynamic port range away from the 41000–54500 band the tests
   use, in an elevated prompt, then reboot:
   `netsh int ipv4 set dynamicport tcp start=10000 num=16384`
3. Run the suite under WSL2, where the reservations do not apply.

A durable fix belongs in the tests: bind an ephemeral port and read back what
the OS assigned, instead of guessing one. It is not a one-line change, because
the port has to be known before `server.js` is required — the test sets
`process.env.WS_PORT` and the server binds at require time — so it is left
for its own change rather than smuggled in here.

## Line endings

`npx cap sync` rewrites the generated files `web/android/app/capacitor.build.gradle`
and `web/android/capacitor.settings.gradle` with CRLF. With `core.autocrlf=true`
(the Git for Windows default) they normalise back to LF on commit and produce
no diff. If you have `autocrlf=false`, check `git diff` before committing so
those two files do not turn up as whole-file changes.
