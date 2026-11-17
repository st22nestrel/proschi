#!/usr/bin/env python3
"""Run a command in a pty, as if typed into this terminal, with a side door.

    ptyrelay.py <keys-fifo> <output-log> <command> [args...]

What the command prints goes to this terminal (so Ghostty draws it, pictures
and all) and is appended to <output-log>, where the recorder waits for text.
Bytes written to <keys-fifo> reach the command as if typed. The window size
follows this terminal's.
"""
import fcntl, os, pty, select, signal, struct, sys, termios, tty

keys_path, log_path, argv = sys.argv[1], sys.argv[2], sys.argv[3:]

pid, master = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)


def sync_size(*_):
    try:
        size = fcntl.ioctl(sys.stdin.fileno(), termios.TIOCGWINSZ, b"\0" * 8)
        fcntl.ioctl(master, termios.TIOCSWINSZ, size)
        os.kill(pid, signal.SIGWINCH)
    except OSError:
        pass


sync_size()
signal.signal(signal.SIGWINCH, sync_size)
stdin = sys.stdin.fileno()
saved = termios.tcgetattr(stdin)
tty.setraw(stdin)
keys = os.open(keys_path, os.O_RDWR | os.O_NONBLOCK)  # RDWR: never sees EOF
log = open(log_path, "ab", buffering=0)
try:
    while True:
        try:
            ready, _, _ = select.select([master, stdin, keys], [], [])
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(sys.stdout.fileno(), data)
            log.write(data)
        for fd in (stdin, keys):
            if fd in ready:
                data = os.read(fd, 65536)
                if data:
                    os.write(master, data)
finally:
    termios.tcsetattr(stdin, termios.TCSADRAIN, saved)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
