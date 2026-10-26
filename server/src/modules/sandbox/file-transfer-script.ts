/** 在容器内按目录描述符逐段打开路径，拒绝链接与特殊节点，避免检查后换链。 */
export const FILE_TRANSFER_SCRIPT = `
import os, shutil, stat, sys
try:
    root, relative, action = sys.argv[1:4]
    parts = relative.split('/')
    if action not in ('read', 'write') or any(p in ('', '.', '..') for p in parts):
        raise ValueError('invalid path')
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    for part in parts[:-1]:
        if action == 'write':
            try:
                os.mkdir(part, 0o755, dir_fd=directory)
            except FileExistsError:
                pass
        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
        os.close(directory)
        directory = child
    flags = os.O_RDONLY if action == 'read' else os.O_WRONLY | os.O_CREAT
    fd = os.open(parts[-1], flags | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=directory)
    os.close(directory)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ValueError('not a regular file')
    if action == 'write':
        os.ftruncate(fd, 0)
        with os.fdopen(fd, 'wb') as target:
            shutil.copyfileobj(sys.stdin.buffer, target, 65536)
            os.fchmod(target.fileno(), int(sys.argv[4], 8))
    else:
        with os.fdopen(fd, 'rb') as source:
            shutil.copyfileobj(source, sys.stdout.buffer, 65536)
except Exception:
    sys.exit(3)
`;
