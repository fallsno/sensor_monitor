import time
import urllib.request


def default_probe(url, timeout):
    with urllib.request.urlopen(url, timeout=timeout):
        return True


def wait_for_server(url, timeout_seconds=15.0, poll_interval=0.2, probe=default_probe):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            return probe(url, 1.0)
        except Exception:
            time.sleep(poll_interval)
    return False
