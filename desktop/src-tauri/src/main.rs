// moi desktop shell — a thin Tauri v2 wrapper around the standalone runtime.
//
// All product code lives in the main codebase (server/ + client/); this shell
// only (1) provisions the same ~/.moi runtime tree the CLI installer uses,
// extracting the bundled moi-runtime.tar.gz on first launch, (2) starts the
// server if none is running, and (3) points a webview at it. `moi update`
// updates the runtime for both the CLI and this app; the shell itself should
// almost never need changes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{Manager, RunEvent, WindowEvent};

const BOOT_TIMEOUT: Duration = Duration::from_secs(60);
const LOCK_TIMEOUT: Duration = Duration::from_secs(60);

// Honor the server's PORT env seam (server/constants.ts) so an isolated
// instance — e.g. first-launch testing beside a dev server — works end to
// end: the same env var steers this shell's probe/URL and, inherited by the
// spawned child, the server itself.
fn port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(13337)
}

// The server child process, present only when this app spawned it (an already
// running server — e.g. started from the CLI — is left untouched on quit).
struct SpawnedServer(Mutex<Option<Child>>);

// The retry button can be invoked from JavaScript, so keep repeated requests
// from racing runtime extraction or starting more than one server.
struct Booting(AtomicBool);

fn normalize_moi_home(path: &Path, user_home: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("MOI_HOME must be an absolute path".into());
    }

    let mut normalized = PathBuf::from("/");
    for component in path.components() {
        match component {
            std::path::Component::RootDir | std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::Normal(part) => normalized.push(part),
            std::path::Component::Prefix(_) => return Err("MOI_HOME must be a Unix path".into()),
        }
    }
    if normalized == Path::new("/") || normalized == user_home {
        return Err(format!(
            "Refusing to use unsafe MOI_HOME: {}",
            normalized.display()
        ));
    }
    Ok(normalized)
}

fn moi_home() -> Result<PathBuf, String> {
    let user_home = PathBuf::from(
        std::env::var("HOME").map_err(|_| "HOME is not set for the desktop app".to_string())?,
    );
    let requested = std::env::var("MOI_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| user_home.join(".moi"));
    normalize_moi_home(&requested, &user_home)
}

fn port_open() -> bool {
    port_open_at(port())
}

fn port_open_at(target_port: u16) -> bool {
    TcpStream::connect_timeout(
        &([127, 0, 0, 1], target_port).into(),
        Duration::from_millis(300),
    )
    .is_ok()
}

// Do not treat an arbitrary process on PORT as moi. Besides opening the wrong
// page in the webview, that would skip first-launch provisioning entirely.
fn moi_server_alive() -> bool {
    moi_server_alive_at(port())
}

fn moi_server_alive_at(target_port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &([127, 0, 0, 1], target_port).into(),
        Duration::from_millis(300),
    ) else {
        return false;
    };
    let timeout = Some(Duration::from_millis(500));
    if stream.set_read_timeout(timeout).is_err() || stream.set_write_timeout(timeout).is_err() {
        return false;
    }
    let request = b"GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }
    let mut response = Vec::new();
    let mut chunk = [0_u8; 1024];
    while response.len() < 4096 {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => {
                response.extend_from_slice(&chunk[..read]);
                if response
                    .windows(b"moi server status\n".len())
                    .any(|window| window == b"moi server status\n")
                {
                    break;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                break
            }
            Err(_) => return false,
        }
    }
    let response = String::from_utf8_lossy(&response);
    response.starts_with("HTTP/1.1 200") && response.contains("moi server status\n")
}

// Version of the runtime a `current` symlink points at, read from its
// app/package.json. None when nothing is provisioned (or the tree is torn).
fn installed_version(current: &Path) -> Option<String> {
    let pkg = fs::read_to_string(current.join("app/package.json")).ok()?;
    serde_json::from_str::<serde_json::Value>(&pkg)
        .ok()?
        .get("version")?
        .as_str()
        .map(String::from)
}

fn stable_version(version: &str) -> Option<[u64; 3]> {
    let parts = version.split('.').collect::<Vec<_>>();
    if parts.len() != 3
        || parts.iter().any(|part| {
            part.is_empty()
                || (part.len() > 1 && part.starts_with('0'))
                || !part.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return None;
    }
    Some([
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ])
}

fn process_is_alive(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as i32, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

fn lock_is_stale(lock: &Path) -> bool {
    let Ok(owner) = fs::read_link(lock) else {
        return true;
    };
    let owner = owner.to_string_lossy();
    let Some(pid) = owner.split('-').next().and_then(|value| value.parse().ok()) else {
        return true;
    };
    !process_is_alive(pid)
}

struct RuntimeLock {
    path: PathBuf,
    owner: String,
}

impl Drop for RuntimeLock {
    fn drop(&mut self) {
        if fs::read_link(&self.path).ok().as_deref() == Some(Path::new(&self.owner)) {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn acquire_runtime_lock(runtime: &Path) -> Result<RuntimeLock, String> {
    fs::create_dir_all(runtime).map_err(|e| e.to_string())?;
    let lock = runtime.join(".install-lock");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let owner = format!("{}-{nonce}", std::process::id());
    let deadline = Instant::now() + LOCK_TIMEOUT;

    loop {
        match std::os::unix::fs::symlink(&owner, &lock) {
            Ok(()) => return Ok(RuntimeLock { path: lock, owner }),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(format!("could not acquire the runtime lock: {error}")),
        }

        if lock_is_stale(&lock) {
            let stale = runtime.join(format!(
                ".stale-lock-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ));
            if fs::rename(&lock, &stale).is_ok() {
                let _ = remove_path(&stale);
                continue;
            }
        }

        if Instant::now() >= deadline {
            return Err("another moi install or update is still running".into());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn remove_path(path: &Path) -> Result<(), String> {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return Ok(());
    };
    if metadata.file_type().is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

struct CleanupPath(PathBuf);

impl Drop for CleanupPath {
    fn drop(&mut self) {
        let _ = remove_path(&self.0);
    }
}

fn prune_versions(runtime: &Path, keep: &[&str]) -> Result<(), String> {
    for entry in fs::read_dir(runtime).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "current" || name.starts_with('.') || keep.contains(&name.as_str()) {
            continue;
        }
        remove_path(&entry.path())?;
    }
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn write_shim(home: &Path) -> Result<(), String> {
    let bin = home.join("bin");
    fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
    let shim = bin.join("moi");
    let default_home = shell_quote(&home.to_string_lossy());
    fs::write(
        &shim,
        format!(
            "#!/bin/sh\nDEFAULT_MOI_HOME={default_home}\nMOI_HOME=\"${{MOI_HOME:-$DEFAULT_MOI_HOME}}\"\nexport MOI_HOME\nexport MOI_STANDALONE_HOME=\"$MOI_HOME\"\nexec \"$MOI_HOME/runtime/current/bun\" \"$MOI_HOME/runtime/current/app/server/cli.ts\" \"$@\"\n"
        ),
    )
    .map_err(|e| e.to_string())?;
    let mut permissions = fs::metadata(&shim)
        .map_err(|e| e.to_string())?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&shim, permissions).map_err(|e| e.to_string())
}

// Provision ~/.moi/runtime/current from the bundled tarball when nothing is
// installed, or when this app bundles a newer runtime than `current` (a newer
// .app must not keep silently running the old runtime). Never downgrades a
// runtime that `moi update` moved past the bundle. Mirrors
// packaging/install.sh: stage, version dir, atomic `current` flip, and the
// CLI shim (so the `moi` command works after installing the app).
fn ensure_runtime(resource_dir: &Path, home: &Path, bundled: &str) -> Result<PathBuf, String> {
    let runtime = home.join("runtime");
    let current = runtime.join("current");
    let tarball = resource_dir.join("resources/moi-runtime.tar.gz");
    if !tarball.exists() {
        return Err(format!("bundled runtime missing at {}", tarball.display()));
    }
    let bundled_version = stable_version(bundled)
        .ok_or_else(|| format!("bundled runtime version is not stable semver: {bundled}"))?;

    let _lock = acquire_runtime_lock(&runtime)?;
    let installed_before = installed_version(&current);
    if let Some(installed) = &installed_before {
        if stable_version(installed).is_some_and(|version| bundled_version <= version) {
            write_shim(home)?;
            return Ok(current);
        }
    }

    // Pid-scoped so two racing launches can't wipe each other's extraction.
    let stage = runtime.join(format!(".stage-{}", std::process::id()));
    let _ = fs::remove_dir_all(&stage);
    fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
    let _stage_cleanup = CleanupPath(stage.clone());

    let status = Command::new("tar")
        .args(["-xzf"])
        .arg(&tarball)
        .arg("-C")
        .arg(&stage)
        .status()
        .map_err(|e| format!("tar failed to start: {e}"))?;
    if !status.success() {
        return Err("could not extract the bundled runtime".into());
    }

    let extracted = stage.join("moi-runtime");
    let pkg = fs::read_to_string(extracted.join("app/package.json")).map_err(|e| e.to_string())?;
    let version = serde_json::from_str::<serde_json::Value>(&pkg)
        .ok()
        .and_then(|v| v["version"].as_str().map(String::from))
        .ok_or("could not read the runtime version")?;
    if version != bundled {
        return Err(format!(
            "bundled payload version {version} does not match desktop version {bundled}"
        ));
    }
    let bun = extracted.join("bun");
    let bun_metadata = fs::metadata(&bun).map_err(|e| e.to_string())?;
    if !bun_metadata.is_file() || bun_metadata.permissions().mode() & 0o111 == 0 {
        return Err("bundled payload has no executable Bun runtime".into());
    }
    if !extracted.join("app/server/cli.ts").is_file() {
        return Err("bundled payload has no moi CLI".into());
    }

    let dest = runtime.join(&version);
    remove_path(&dest)?;
    fs::rename(&extracted, &dest).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&stage);

    let next = runtime.join(format!(".current-next-{}", std::process::id()));
    let _ = fs::remove_file(&next);
    let _next_cleanup = CleanupPath(next.clone());
    std::os::unix::fs::symlink(&version, &next).map_err(|e| e.to_string())?;
    fs::rename(&next, &current).map_err(|e| e.to_string())?;

    write_shim(home)?;
    let mut keep = vec![version.as_str()];
    if let Some(previous) = installed_before.as_deref() {
        if stable_version(previous).is_some() {
            keep.push(previous);
        }
    }
    prune_versions(&runtime, &keep)?;

    Ok(current)
}

// A Finder-launched app inherits launchd's bare PATH (/usr/bin:/bin:…), which
// the server would pass on to agent sessions — stripping the user's tools and
// the `moi` shim agents shell out to. Resolve the login shell's PATH instead
// and put $MOI_HOME/bin on it.
fn server_path(home: &Path) -> String {
    let inherited = std::env::var("PATH").unwrap_or_default();
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let login_path = Command::new(&shell)
        .args(["-lc", "printf %s \"$PATH\""])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|path| !path.is_empty())
        .unwrap_or(inherited);
    format!("{}/bin:{login_path}", home.display())
}

fn moi_command(current: &Path, home: &Path) -> Command {
    let mut command = Command::new(current.join("bun"));
    command
        .arg(current.join("app/server/cli.ts"))
        .env("MOI_HOME", home)
        .env("MOI_STANDALONE_HOME", home)
        .env("PATH", server_path(home));
    command
}

fn service_install_command(current: &Path, home: &Path) -> Command {
    let mut command = moi_command(current, home);
    command.args(["service", "install"]);
    command
}

fn install_service(current: &Path, home: &Path) -> Result<(), String> {
    let output = service_install_command(current, home)
        .output()
        .map_err(|e| format!("could not run moi service install: {e}"))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    Err(if detail.is_empty() {
        format!("moi service install exited with {}", output.status)
    } else {
        detail
    })
}

fn spawn_server(current: &Path, home: &Path) -> Result<Child, String> {
    moi_command(current, home)
        .arg("start")
        .spawn()
        .map_err(|e| format!("could not start the moi server: {e}"))
}

fn status(window: &tauri::WebviewWindow, text: &str) {
    let _ = window.eval(format!(
        "window.__moiStatus && window.__moiStatus({})",
        js_str(text)
    ));
}

fn fail(window: &tauri::WebviewWindow, text: &str) {
    let _ = window.eval(format!(
        "window.__moiError && window.__moiError({})",
        js_str(text)
    ));
}

fn js_str(text: &str) -> String {
    serde_json::Value::String(text.into()).to_string()
}

fn boot(handle: tauri::AppHandle) {
    let window = handle
        .get_webview_window("main")
        .expect("main window from config");

    // Server already running (CLI-started or a previous launch): just attach
    // to it. Otherwise provision the shared runtime and prefer main's service.
    if !moi_server_alive() {
        if port_open() {
            return fail(
                &window,
                &format!(
                    "Port {} is in use by another application. Stop that application, then try again.",
                    port()
                ),
            );
        }
        let home = match moi_home() {
            Ok(home) => home,
            Err(e) => return fail(&window, &e),
        };
        let resource_dir = match handle.path().resource_dir() {
            Ok(dir) => dir,
            Err(e) => return fail(&window, &format!("resource dir: {e}")),
        };

        let bundled = handle.package_info().version.to_string();
        match installed_version(&home.join("runtime/current")) {
            None => status(&window, "Unpacking the moi runtime (first launch)"),
            Some(installed)
                if stable_version(&bundled)
                    .zip(stable_version(&installed))
                    .is_some_and(|(bundled, installed)| bundled > installed) =>
            {
                status(&window, "Updating the moi runtime")
            }
            _ => {}
        }
        let current = match ensure_runtime(&resource_dir, &home, &bundled) {
            Ok(dir) => dir,
            Err(e) => return fail(&window, &e),
        };

        status(&window, "Starting moi in the background");
        if let Err(service_error) = install_service(&current, &home) {
            eprintln!(
                "moi desktop: background service unavailable, using an app-owned server: {service_error}"
            );
            status(
                &window,
                "Background service unavailable; starting while the app is open",
            );
            match spawn_server(&current, &home) {
                Ok(child) => *handle.state::<SpawnedServer>().0.lock().unwrap() = Some(child),
                Err(e) => return fail(&window, &e),
            }
        }
    }

    let deadline = Instant::now() + BOOT_TIMEOUT;
    while !moi_server_alive() {
        if Instant::now() > deadline {
            return fail(
                &window,
                "moi did not finish starting. Try again. If it keeps failing, run `moi start` in a terminal to see its output.",
            );
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    let url = format!("http://localhost:{}", port());
    let _ = window.eval(format!("window.location.replace({})", js_str(&url)));
}

fn start_boot(handle: tauri::AppHandle) {
    if handle.state::<Booting>().0.swap(true, Ordering::AcqRel) {
        return;
    }
    std::thread::spawn(move || {
        boot(handle.clone());
        handle.state::<Booting>().0.store(false, Ordering::Release);
    });
}

#[tauri::command]
fn retry_boot(app: tauri::AppHandle) {
    start_boot(app);
}

fn main() {
    tauri::Builder::default()
        .manage(SpawnedServer(Mutex::new(None)))
        .manage(Booting(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![retry_boot])
        .setup(|app| {
            start_boot(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // One window is the whole app: closing it quits (and tears down a
            // server we spawned via the Exit handler below).
            if let WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building moi")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<SpawnedServer>().0.lock().unwrap().take() {
                    // SIGTERM first so the server closes sockets and kills its
                    // function workers; SIGKILL only if it lingers.
                    unsafe { libc::kill(child.id() as i32, libc::SIGTERM) };
                    let deadline = Instant::now() + Duration::from_secs(5);
                    loop {
                        match child.try_wait() {
                            Ok(Some(_)) => break,
                            Ok(None) if Instant::now() > deadline => {
                                let _ = child.kill();
                                break;
                            }
                            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                            Err(_) => break,
                        }
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn serve_once(body: &'static str) -> u16 {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        port
    }

    #[test]
    fn stable_versions_are_exact_triplets() {
        assert_eq!(stable_version("1.2.3"), Some([1, 2, 3]));
        assert_eq!(stable_version("1.2"), None);
        assert_eq!(stable_version("01.2.3"), None);
        assert_eq!(stable_version("1.2.3-next.1"), None);
        assert_eq!(stable_version("not-a-version"), None);
    }

    #[test]
    fn shell_quote_preserves_shell_metacharacters() {
        assert_eq!(shell_quote("/tmp/a'b$HOME"), "'/tmp/a'\\''b$HOME'");
    }

    #[test]
    fn moi_home_rejects_broad_and_relative_paths() {
        let home = Path::new("/Users/test");
        assert!(normalize_moi_home(Path::new("/"), home).is_err());
        assert!(normalize_moi_home(home, home).is_err());
        assert!(normalize_moi_home(Path::new("relative"), home).is_err());
        assert_eq!(
            normalize_moi_home(Path::new("/Users/test/tools/../.moi"), home).unwrap(),
            Path::new("/Users/test/.moi")
        );
    }

    #[test]
    fn service_install_runs_through_the_bundled_runtime() {
        let command =
            service_install_command(Path::new("/runtime/current"), Path::new("/Users/test/.moi"));
        assert_eq!(command.get_program(), Path::new("/runtime/current/bun"));
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            vec![
                std::ffi::OsStr::new("/runtime/current/app/server/cli.ts"),
                std::ffi::OsStr::new("service"),
                std::ffi::OsStr::new("install")
            ]
        );
    }

    #[test]
    fn health_probe_rejects_an_unrelated_local_service() {
        assert!(!moi_server_alive_at(serve_once("not moi\n")));
        assert!(moi_server_alive_at(serve_once("moi server status\n")));
    }
}
