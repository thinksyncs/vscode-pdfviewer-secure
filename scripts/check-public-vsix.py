"""Check the requested Marketplace artifact before extracting it for tests."""
import hashlib
import json
import stat
import sys
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

source, destination, version = sys.argv[1:]
with ZipFile(source) as archive:
    names = set()
    for entry in archive.infolist():
        name = entry.filename
        parts = PurePosixPath(name).parts
        if (not parts or name.startswith('/') or '\\' in name or ':' in name
                or '..' in parts or name != entry.orig_filename
                or name.casefold() in names
                or stat.S_IFMT(entry.external_attr >> 16) not in
                (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError('Unsafe or duplicate archive entry')
        names.add(name.casefold())
    if sum(entry.file_size for entry in archive.infolist()) > 256 * 1024 * 1024:
        raise ValueError('Archive exceeds the test extraction budget')
    if archive.testzip() is not None:
        raise ValueError('Archive integrity check failed')
    manifest = json.loads(archive.read('extension/package.json'))
    if (manifest['name'] != 'vscode-pdfviewer-secure'
            or manifest['publisher'] != 'ToppyMicroServices'
            or manifest['version'] != version):
        raise ValueError('Unexpected extension identity or version')
    print('PUBLIC_VSIX_VERIFIED', json.dumps({
        'version': version,
        'sha256': hashlib.sha256(Path(source).read_bytes()).hexdigest(),
        'bytes': Path(source).stat().st_size,
    }))
    archive.extractall(destination)
