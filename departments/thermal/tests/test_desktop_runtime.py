import codecs
import importlib
import os
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def load_launcher_module():
    original_app = sys.modules.get("app")
    fake_app = types.ModuleType("app")
    fake_app.run_server = lambda **kwargs: None

    sys.modules.pop("desktop_app.launcher", None)
    sys.modules["app"] = fake_app

    try:
        return importlib.import_module("desktop_app.launcher")
    finally:
        if original_app is None:
            sys.modules.pop("app", None)
        else:
            sys.modules["app"] = original_app


def test_wait_for_server_returns_true_when_probe_succeeds():
    from desktop_app.runtime import wait_for_server

    calls = {"count": 0}

    def fake_probe(url, timeout):
        calls["count"] += 1
        if calls["count"] < 3:
            raise OSError("not ready")
        return True

    result = wait_for_server(
        "http://127.0.0.1:5010/",
        timeout_seconds=1.0,
        poll_interval=0.01,
        probe=fake_probe,
    )

    assert result is True
    assert calls["count"] == 3


def test_wait_for_server_returns_false_on_timeout():
    from desktop_app.runtime import wait_for_server

    result = wait_for_server(
        "http://127.0.0.1:5010/",
        timeout_seconds=0.05,
        poll_interval=0.01,
        probe=lambda url, timeout: (_ for _ in ()).throw(OSError("down")),
    )

    assert result is False


def test_build_app_url_uses_localhost_defaults():
    launcher = load_launcher_module()

    assert launcher.build_app_url() == "http://127.0.0.1:5010/"
    assert launcher.build_app_url(port=5020, path="/modbus") == "http://127.0.0.1:5020/modbus"


def test_build_app_url_accepts_custom_host_and_path_without_leading_slash():
    launcher = load_launcher_module()

    assert launcher.build_app_url(host="0.0.0.0", port=6010, path="admin") == "http://0.0.0.0:6010/admin"


def test_main_starts_server_waits_and_opens_window():
    launcher = load_launcher_module()
    events = []
    fake_window = object()

    def fake_run_server(host, port):
        events.append(("run_server", host, port))

    def fake_wait_for_server(url):
        events.append(("wait", url))
        return True

    class FakeThread:
        def __init__(self, target, kwargs, daemon):
            events.append(("thread_init", target, kwargs, daemon))
            self.target = target
            self.kwargs = kwargs
            self.daemon = daemon

        def start(self):
            events.append(("thread_start", self.target, self.kwargs, self.daemon))

    class FakeWebview:
        @staticmethod
        def create_window(title, url, width, height):
            events.append(("create_window", title, url, width, height))
            return fake_window

        @staticmethod
        def start(**kwargs):
            events.append(("webview_start", kwargs))

    result = launcher.main(
        host="127.0.0.1",
        port=5010,
        path="/modbus",
        webview_module=FakeWebview,
        server_runner=fake_run_server,
        wait_for_server_fn=fake_wait_for_server,
        thread_class=FakeThread,
        webview2_checker=lambda: True,
    )

    assert result is fake_window
    assert events == [
        ("thread_init", fake_run_server, {"host": "127.0.0.1", "port": 5010}, True),
        ("thread_start", fake_run_server, {"host": "127.0.0.1", "port": 5010}, True),
        ("wait", "http://127.0.0.1:5010/modbus"),
        ("create_window", "传感监测平台", "http://127.0.0.1:5010/modbus", 1440, 900),
        ("webview_start", {"gui": "edgechromium"}),
    ]


def test_main_raises_when_webview2_runtime_is_missing():
    launcher = load_launcher_module()

    with pytest.raises(RuntimeError, match="WebView2 Runtime"):
        launcher.main(
            webview_module=object(),
            server_runner=lambda host, port: None,
            wait_for_server_fn=lambda url: True,
            thread_class=lambda *args, **kwargs: types.SimpleNamespace(start=lambda: None),
            webview2_checker=lambda: False,
        )


def test_enable_high_dpi_support_prefers_per_monitor_v2_context():
    launcher = load_launcher_module()
    calls = []

    class FakeShcore:
        @staticmethod
        def SetProcessDpiAwareness(value):
            calls.append(("shcore", value))
            return 0

    class FakeUser32:
        @staticmethod
        def SetProcessDPIAware():
            calls.append(("user32_legacy",))
            return 1

        @staticmethod
        def SetProcessDpiAwarenessContext(value):
            calls.append(("user32_context", value))
            return 1

    fake_ctypes = types.SimpleNamespace(
        windll=types.SimpleNamespace(user32=FakeUser32(), shcore=FakeShcore())
    )

    result = launcher.enable_high_dpi_support(ctypes_module=fake_ctypes)

    assert result == "per_monitor_v2"
    assert calls == [("user32_context", -4)]


def test_main_configures_display_compatibility_before_opening_window():
    launcher = load_launcher_module()
    events = []
    fake_window = object()

    def fake_run_server(host, port):
        events.append(("run_server", host, port))

    def fake_wait_for_server(url):
        events.append(("wait", url))
        return True

    class FakeThread:
        def __init__(self, target, kwargs, daemon):
            events.append(("thread_init", target, kwargs, daemon))
            self.target = target
            self.kwargs = kwargs
            self.daemon = daemon

        def start(self):
            events.append(("thread_start", self.target, self.kwargs, self.daemon))

    class FakeWebview:
        @staticmethod
        def create_window(title, url, width, height):
            events.append(("create_window", title, url, width, height))
            return fake_window

        @staticmethod
        def start(**kwargs):
            events.append(("webview_start", kwargs))

    def fake_display_setup():
        events.append(("display_setup",))
        return "per_monitor_v2"

    launcher.main(
        webview_module=FakeWebview,
        server_runner=fake_run_server,
        wait_for_server_fn=fake_wait_for_server,
        thread_class=FakeThread,
        webview2_checker=lambda: True,
        display_setup=fake_display_setup,
    )

    assert events[0] == ("display_setup",)
    assert ("webview_start", {"gui": "edgechromium"}) in events


def test_desktop_spec_does_not_exclude_email_stdlib():
    spec_path = Path(__file__).resolve().parents[1] / "sensor_monitor_desktop.spec"
    spec_text = spec_path.read_text(encoding="utf-8")

    assert '"email"' not in spec_text
    assert '"http.server"' not in spec_text


def test_build_installer_script_checks_webview2_runtime():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "build_installer.ps1"
    script_text = script_path.read_text(encoding="utf-8")

    assert "WebView2" in script_text
    assert "Test-WebView2Runtime" in script_text or "WebView2 Runtime" in script_text


def test_installer_definition_mentions_webview2_prerequisite():
    installer_path = Path(__file__).resolve().parents[1] / "installer" / "sensor_monitor.iss"
    installer_text = installer_path.read_text(encoding="utf-8")

    assert "WebView2" in installer_text


def test_installer_definition_starts_with_define_in_raw_bytes():
    installer_path = Path(__file__).resolve().parents[1] / "installer" / "sensor_monitor.iss"
    installer_bytes = installer_path.read_bytes()
    bom_prefix = codecs.BOM_UTF8

    assert not installer_bytes.startswith(bom_prefix + bom_prefix)
    if installer_bytes.startswith(bom_prefix):
        installer_bytes = installer_bytes[len(bom_prefix):]
    assert installer_bytes.startswith(b"#define MyAppName ")


def test_build_installer_script_reads_version_manifest():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "build_installer.ps1"
    script_text = script_path.read_text(encoding="utf-8")

    assert "version.json" in script_text
    assert "MyAppVersion" in script_text


def test_build_installer_script_reads_manifest_version_via_python():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "build_installer.ps1"
    script_text = script_path.read_text(encoding="utf-8")

    assert "python -c" in script_text
    assert "json.loads" in script_text


def test_build_installer_script_uses_safe_python_string_literals():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "build_installer.ps1"
    script_text = script_path.read_text(encoding="utf-8")

    assert "Path(r'" in script_text
    assert "encoding='utf-8'" in script_text
    assert "['version']" in script_text


def test_build_installer_script_updates_iss_via_utf8_python_io():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "build_installer.ps1"
    script_text = script_path.read_text(encoding="utf-8")

    assert "read_text(encoding='utf-8-sig')" in script_text
    assert "lstrip('\\ufeff')" in script_text
    assert "write_text(" in script_text
