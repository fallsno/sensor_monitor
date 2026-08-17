import logging
import threading

from desktop_app.runtime import wait_for_server


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5010
WEBVIEW2_RUNTIME_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
PER_MONITOR_AWARE_V2 = -4
logger = logging.getLogger(__name__)


def build_app_url(host=DEFAULT_HOST, port=DEFAULT_PORT, path="/"):
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"http://{host}:{port}{normalized_path}"


def webview2_runtime_available(registry_module=None):
    if registry_module is None:
        try:
            import winreg as registry_module
        except ImportError:
            return False

    registry_locations = [
        (registry_module.HKEY_CURRENT_USER, rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_RUNTIME_GUID}"),
        (registry_module.HKEY_LOCAL_MACHINE, rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_RUNTIME_GUID}"),
        (registry_module.HKEY_LOCAL_MACHINE, rf"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_RUNTIME_GUID}"),
    ]

    for root_key, sub_key in registry_locations:
        try:
            with registry_module.OpenKey(root_key, sub_key) as registry_key:
                version, _ = registry_module.QueryValueEx(registry_key, "pv")
                if str(version).strip():
                    return True
        except OSError:
            continue

    return False


def enable_high_dpi_support(ctypes_module=None):
    if ctypes_module is None:
        try:
            import ctypes as ctypes_module
        except ImportError:
            return "unavailable"

    windll = getattr(ctypes_module, "windll", None)
    user32 = getattr(windll, "user32", None)
    shcore = getattr(windll, "shcore", None)

    if user32 and hasattr(user32, "SetProcessDpiAwarenessContext"):
        try:
            if user32.SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2):
                logger.info("Enabled Per Monitor V2 DPI awareness")
                return "per_monitor_v2"
        except Exception as exc:
            logger.warning("Failed to enable Per Monitor V2 DPI awareness: %s", exc)

    if shcore and hasattr(shcore, "SetProcessDpiAwareness"):
        try:
            shcore.SetProcessDpiAwareness(2)
            logger.info("Enabled Per Monitor DPI awareness")
            return "per_monitor"
        except Exception as exc:
            logger.warning("Failed to enable Per Monitor DPI awareness: %s", exc)

    if user32 and hasattr(user32, "SetProcessDPIAware"):
        try:
            if user32.SetProcessDPIAware():
                logger.info("Enabled System DPI awareness")
                return "system_aware"
        except Exception as exc:
            logger.warning("Failed to enable System DPI awareness: %s", exc)

    return "unsupported"


def ensure_webview2_runtime(webview2_checker=webview2_runtime_available):
    if webview2_checker():
        return

    raise RuntimeError(
        "Microsoft Edge WebView2 Runtime is required for the desktop app. "
        "Please install WebView2 Runtime and restart SensorMonitor."
    )


def main(
    host=DEFAULT_HOST,
    port=DEFAULT_PORT,
    path="/",
    webview_module=None,
    server_runner=None,
    wait_for_server_fn=wait_for_server,
    thread_class=threading.Thread,
    webview2_checker=webview2_runtime_available,
    display_setup=enable_high_dpi_support,
):
    url = build_app_url(host=host, port=port, path=path)
    display_mode = display_setup()
    logger.info("Desktop display compatibility mode: %s", display_mode)
    ensure_webview2_runtime(webview2_checker=webview2_checker)

    if server_runner is None:
        from app import run_server as server_runner

    server_thread = thread_class(
        target=server_runner,
        kwargs={"host": host, "port": port},
        daemon=True,
    )
    server_thread.start()

    if not wait_for_server_fn(url):
        raise RuntimeError(f"Local server failed to start: {url}")

    if webview_module is None:
        import webview as webview_module

    window = webview_module.create_window("传感监测平台", url, width=1440, height=900)
    logger.info("Using Edge Chromium for desktop rendering")
    webview_module.start(gui="edgechromium")
    return window


if __name__ == "__main__":
    main()
