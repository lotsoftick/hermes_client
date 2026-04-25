#!/usr/bin/env python3
"""Tiny PTY bridge for the Node.js API.

Replaces our previous dependency on `node-pty` (whose `spawn-helper`
binary kept losing its +x bit on deploy and breaking every interactive
terminal session). Hermes itself is a Python CLI so `python3` is always
already installed on every host where this client runs — that means we
get a portable, native-build-free PTY layer for free.

Usage:
    python3 pty-bridge.py <argv0> [args...]

Wire protocol (relative to *this* process):

  * stdin  — newline-delimited JSON commands FROM the parent:
        {"t": "in",     "d": "<utf8 string>"}      forward keystrokes/paste
        {"t": "resize", "c": <cols>, "r": <rows>}  TIOCSWINSZ on the PTY
        {"t": "kill"}                               SIGTERM the child

  * stdout — RAW PTY output bytes (binary safe). The parent should pipe
    these straight to its WebSocket without interpretation.

  * stderr — newline-delimited JSON status events TO the parent:
        {"t": "ready"}                              spawn succeeded
        {"t": "exit",  "code": <int|null>, "signal": <int|null>}
        {"t": "error", "msg": "..."}                fatal bridge error
"""
from __future__ import annotations

import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios

DEFAULT_COLS = 100
DEFAULT_ROWS = 30
READ_CHUNK = 4096


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        # Window-size ioctl can fail on some pseudo-fds; not fatal.
        pass


def _emit(event: dict) -> None:
    """Write a control event to stderr as a single JSON line."""
    try:
        sys.stderr.write(json.dumps(event, separators=(",", ":")) + "\n")
        sys.stderr.flush()
    except (BrokenPipeError, ValueError):
        pass


def _exit_status_to_code(status: int) -> tuple[int | None, int | None]:
    """Decompose a wait() status into (exit_code, term_signal)."""
    if hasattr(os, "waitstatus_to_exitcode"):
        try:
            code = os.waitstatus_to_exitcode(status)
        except ValueError:
            code = None
        if isinstance(code, int) and code < 0:
            return None, -code
        return code, None
    if os.WIFSIGNALED(status):
        return None, os.WTERMSIG(status)
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status), None
    return None, None


def _drain(fd: int) -> None:
    """Drain whatever the child wrote between its exit and our wait()."""
    while True:
        try:
            chunk = os.read(fd, READ_CHUNK)
        except OSError:
            return
        if not chunk:
            return
        try:
            os.write(1, chunk)
        except OSError:
            return


def _handle_stdin_chunk(buf: bytes, fd: int, child_pid: int) -> bytes:
    """Consume any complete JSON commands present in *buf*.

    Returns the residual bytes that did not yet form a full line.
    """
    while True:
        nl = buf.find(b"\n")
        if nl < 0:
            return buf
        line = buf[:nl].strip()
        buf = buf[nl + 1 :]
        if not line:
            continue
        try:
            msg = json.loads(line.decode("utf-8", errors="replace"))
        except ValueError:
            continue
        t = msg.get("t")
        if t == "in":
            data = msg.get("d", "")
            if isinstance(data, str) and data:
                try:
                    os.write(fd, data.encode("utf-8"))
                except OSError as err:
                    if err.errno not in (errno.EAGAIN, errno.EWOULDBLOCK):
                        raise
        elif t == "resize":
            try:
                cols = max(20, int(msg.get("c", DEFAULT_COLS)))
                rows = max(5, int(msg.get("r", DEFAULT_ROWS)))
            except (TypeError, ValueError):
                continue
            _set_winsize(fd, rows, cols)
        elif t == "kill":
            try:
                os.kill(child_pid, signal.SIGTERM)
            except ProcessLookupError:
                pass


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        _emit({"t": "error", "msg": "pty-bridge: missing command"})
        return 2

    # `pty.fork()` returns (pid, master_fd). In the child it returns (0, fd)
    # where the child is *already* attached to the slave PTY.
    try:
        pid, fd = pty.fork()
    except OSError as err:
        _emit({"t": "error", "msg": f"pty.fork failed: {err}"})
        return 1

    if pid == 0:
        # --- child ---
        try:
            os.execvp(argv[0], argv)
        except FileNotFoundError:
            sys.stderr.write(f"pty-bridge: command not found: {argv[0]}\n")
            os._exit(127)
        except PermissionError:
            sys.stderr.write(f"pty-bridge: permission denied: {argv[0]}\n")
            os._exit(126)
        except OSError as err:
            sys.stderr.write(f"pty-bridge: exec failed: {err}\n")
            os._exit(1)
        return 0  # unreachable

    # --- parent ---
    _set_winsize(fd, DEFAULT_ROWS, DEFAULT_COLS)
    _emit({"t": "ready", "pid": pid})

    # Make our own stdin non-blocking so a slow control message never
    # stalls PTY -> stdout forwarding.
    try:
        flags = fcntl.fcntl(0, fcntl.F_GETFL)
        fcntl.fcntl(0, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    except OSError:
        pass

    stdin_buf = b""
    child_alive = True
    exit_event: dict | None = None

    while True:
        watch = [fd]
        if child_alive:
            watch.append(0)
        try:
            ready, _, _ = select.select(watch, [], [], 0.25)
        except (OSError, select.error) as err:
            if getattr(err, "errno", None) == errno.EINTR:
                continue
            break

        if fd in ready:
            try:
                chunk = os.read(fd, READ_CHUNK)
            except OSError as err:
                if err.errno == errno.EIO:
                    chunk = b""
                else:
                    chunk = b""
            if chunk:
                try:
                    os.write(1, chunk)
                except OSError:
                    break
            else:
                # EOF on the master fd → child closed its terminal.
                pass

        if 0 in ready:
            try:
                chunk = os.read(0, READ_CHUNK)
            except OSError as err:
                if err.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                    chunk = b""
                else:
                    chunk = b""
            if not chunk and 0 in ready:
                # Parent closed our stdin — translate into a SIGTERM so
                # the child gets a chance to flush, then break out.
                try:
                    os.kill(pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            else:
                stdin_buf += chunk
                stdin_buf = _handle_stdin_chunk(stdin_buf, fd, pid)

        # Reap the child without blocking. We only emit `exit` *after*
        # we've flushed everything still queued on the master fd.
        try:
            wpid, status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            wpid, status = pid, 0
        if wpid == pid:
            code, sig = _exit_status_to_code(status)
            exit_event = {"t": "exit", "code": code, "signal": sig}
            _drain(fd)
            break

    try:
        os.close(fd)
    except OSError:
        pass

    if exit_event is None:
        # We never observed the child exit (e.g. EOF on stdin then loop
        # broke). Wait briefly to capture the actual status.
        try:
            _, status = os.waitpid(pid, 0)
            code, sig = _exit_status_to_code(status)
            exit_event = {"t": "exit", "code": code, "signal": sig}
        except (ChildProcessError, OSError):
            exit_event = {"t": "exit", "code": None, "signal": None}

    _emit(exit_event)
    return exit_event.get("code") if isinstance(exit_event.get("code"), int) else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
