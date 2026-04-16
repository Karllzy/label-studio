#!/usr/bin/env python3
"""
Bulk file uploader CLI for Label Studio.

Supports chunked upload for large files, recursive directory scanning,
resume from interrupted uploads, and parallel file processing.

Usage:
    python ls_upload.py --url http://localhost:8080 --project 1 --token <TOKEN> --path /data/images/
    python ls_upload.py --url http://localhost:8080 --project 1 --token <TOKEN> --path /data/ --include "*.jpg,*.png" --parallel 4
"""

import argparse
import glob
import hashlib
import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

DEFAULT_CHUNK_SIZE = 50 * 1024 * 1024  # 50 MB
CHUNKED_THRESHOLD = 50 * 1024 * 1024  # 50 MB
STATE_FILE = '.upload-state.json'


def parse_args():
    parser = argparse.ArgumentParser(
        description='Bulk file uploader for Label Studio',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--url', required=True, help='Label Studio base URL (e.g. http://localhost:8080)')
    parser.add_argument('--project', required=True, type=int, help='Project ID')
    parser.add_argument('--token', required=True, help='API token for authentication')
    parser.add_argument('--path', required=True, help='Path to file or directory to upload')
    parser.add_argument('--include', default='', help='Comma-separated file patterns to include (e.g. "*.jpg,*.png")')
    parser.add_argument('--exclude', default='', help='Comma-separated file patterns to exclude (e.g. "*.tmp")')
    parser.add_argument('--chunk-size', type=int, default=DEFAULT_CHUNK_SIZE, help='Chunk size in bytes (default: 50MB)')
    parser.add_argument('--parallel', type=int, default=1, help='Number of parallel uploads (default: 1)')
    parser.add_argument('--recursive', action='store_true', default=True, help='Recursively scan directories')
    parser.add_argument('--resume', action='store_true', default=True, help='Resume from previous state')
    parser.add_argument('--commit', action='store_true', default=True, help='Commit uploaded files to project')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be uploaded without uploading')
    return parser.parse_args()


def get_headers(token):
    return {'Authorization': f'Token {token}'}


def file_md5(filepath):
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def scan_files(path, include_patterns, exclude_patterns, recursive=True):
    """Scan directory for files matching patterns."""
    path = Path(path)

    if path.is_file():
        return [str(path)]

    if not path.is_dir():
        print(f'Error: {path} is not a file or directory')
        sys.exit(1)

    files = []
    if recursive:
        all_files = list(path.rglob('*'))
    else:
        all_files = list(path.glob('*'))

    for f in sorted(all_files):
        if not f.is_file():
            continue
        if f.name.startswith('.'):
            continue

        if include_patterns:
            matched = any(f.match(p) for p in include_patterns)
            if not matched:
                continue

        if exclude_patterns:
            excluded = any(f.match(p) for p in exclude_patterns)
            if excluded:
                continue

        files.append(str(f))

    return files


def load_state(state_path):
    """Load upload state for resume."""
    if os.path.exists(state_path):
        with open(state_path, 'r') as f:
            return json.load(f)
    return {'completed': {}, 'failed': []}


def save_state(state_path, state):
    """Save upload state."""
    with open(state_path, 'w') as f:
        json.dump(state, f, indent=2)


def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f'{size:.1f} {unit}'
        size /= 1024
    return f'{size:.1f} TB'


def format_speed(bytes_per_sec):
    return f'{format_size(bytes_per_sec)}/s'


def upload_small_file(base_url, project_id, filepath, headers, commit=False):
    """Upload a small file using standard multipart upload."""
    url = f'{base_url}/api/projects/{project_id}/import'
    params = {}
    if not commit:
        params['commit_to_project'] = 'false'

    filename = os.path.basename(filepath)
    with open(filepath, 'rb') as f:
        files = {filename: (filename, f)}
        resp = requests.post(url, files=files, headers=headers, params=params, timeout=300)

    resp.raise_for_status()
    return resp.json()


def upload_chunked_file(base_url, project_id, filepath, headers, chunk_size=DEFAULT_CHUNK_SIZE, on_progress=None):
    """Upload a large file using chunked upload API."""
    file_size = os.path.getsize(filepath)
    total_chunks = math.ceil(file_size / chunk_size)
    filename = os.path.basename(filepath)

    # Init
    init_url = f'{base_url}/api/projects/{project_id}/import/chunked/init'
    resp = requests.post(init_url, json={
        'filename': filename,
        'total_size': file_size,
        'total_chunks': total_chunks,
    }, headers=headers, timeout=30)
    resp.raise_for_status()
    upload_id = resp.json()['upload_id']

    # Upload chunks
    upload_url = f'{base_url}/api/projects/{project_id}/import/chunked/upload'
    with open(filepath, 'rb') as f:
        for i in range(total_chunks):
            chunk_data = f.read(chunk_size)

            retries = 3
            for attempt in range(retries):
                try:
                    files = {'chunk': (f'chunk_{i}', chunk_data)}
                    data = {'upload_id': upload_id, 'chunk_index': str(i)}
                    resp = requests.post(upload_url, files=files, data=data, headers=headers, timeout=120)
                    resp.raise_for_status()
                    break
                except Exception as e:
                    if attempt == retries - 1:
                        raise
                    time.sleep(2 ** attempt)

            if on_progress:
                on_progress(i + 1, total_chunks)

    # Complete
    complete_url = f'{base_url}/api/projects/{project_id}/import/chunked/complete'
    resp = requests.post(complete_url, json={
        'upload_id': upload_id,
        'commit_to_project': False,
    }, headers=headers, timeout=300)
    resp.raise_for_status()
    return resp.json()


def upload_file(base_url, project_id, filepath, headers, chunk_size, state, state_path):
    """Upload a single file, choosing standard or chunked method."""
    file_size = os.path.getsize(filepath)
    md5 = file_md5(filepath)

    if md5 in state['completed']:
        return 'skipped', filepath

    filename = os.path.basename(filepath)
    start_time = time.time()

    try:
        if file_size > CHUNKED_THRESHOLD:
            def on_progress(chunk_num, total):
                elapsed = time.time() - start_time
                speed = (chunk_num * chunk_size) / elapsed if elapsed > 0 else 0
                pct = chunk_num / total * 100
                print(f'\r  [{pct:5.1f}%] {filename} - {format_size(file_size)} @ {format_speed(speed)}', end='', flush=True)

            result = upload_chunked_file(base_url, project_id, filepath, headers, chunk_size, on_progress)
            print()
        else:
            result = upload_small_file(base_url, project_id, filepath, headers)

        elapsed = time.time() - start_time
        speed = file_size / elapsed if elapsed > 0 else 0
        print(f'  OK: {filename} ({format_size(file_size)}, {elapsed:.1f}s, {format_speed(speed)})')

        state['completed'][md5] = {
            'path': filepath,
            'size': file_size,
            'uploaded_at': time.time(),
        }
        save_state(state_path, state)
        return 'ok', filepath

    except Exception as e:
        print(f'  FAIL: {filename} - {str(e)}')
        state['failed'].append({'path': filepath, 'error': str(e)})
        save_state(state_path, state)
        return 'failed', filepath


def main():
    args = parse_args()
    base_url = args.url.rstrip('/')
    headers = get_headers(args.token)

    include_patterns = [p.strip() for p in args.include.split(',') if p.strip()] if args.include else []
    exclude_patterns = [p.strip() for p in args.exclude.split(',') if p.strip()] if args.exclude else []

    print(f'Scanning: {args.path}')
    files = scan_files(args.path, include_patterns, exclude_patterns, args.recursive)
    total_size = sum(os.path.getsize(f) for f in files)

    print(f'Found {len(files)} files ({format_size(total_size)})')

    if not files:
        print('No files to upload.')
        return

    if args.dry_run:
        print('\nDry run - files that would be uploaded:')
        for f in files:
            print(f'  {f} ({format_size(os.path.getsize(f))})')
        return

    # Verify connection
    try:
        resp = requests.get(f'{base_url}/api/projects/{args.project}', headers=headers, timeout=10)
        resp.raise_for_status()
        project_info = resp.json()
        print(f'Project: {project_info.get("title", "Unknown")} (ID: {args.project})')
    except Exception as e:
        print(f'Error connecting to Label Studio: {e}')
        sys.exit(1)

    state_path = os.path.join(os.path.dirname(args.path) or '.', STATE_FILE)
    state = load_state(state_path) if args.resume else {'completed': {}, 'failed': []}

    already_done = sum(1 for f in files if file_md5(f) in state['completed'])
    if already_done > 0:
        print(f'Resuming: {already_done} files already uploaded, {len(files) - already_done} remaining')

    print(f'\nStarting upload (parallel={args.parallel}, chunk_size={format_size(args.chunk_size)})')
    print('-' * 60)

    start_time = time.time()
    ok_count = 0
    fail_count = 0
    skip_count = 0

    if args.parallel > 1:
        with ThreadPoolExecutor(max_workers=args.parallel) as executor:
            futures = {
                executor.submit(
                    upload_file, base_url, args.project, f, headers, args.chunk_size, state, state_path
                ): f for f in files
            }
            for future in as_completed(futures):
                result, filepath = future.result()
                if result == 'ok':
                    ok_count += 1
                elif result == 'failed':
                    fail_count += 1
                else:
                    skip_count += 1
    else:
        for f in files:
            result, filepath = upload_file(base_url, args.project, f, headers, args.chunk_size, state, state_path)
            if result == 'ok':
                ok_count += 1
            elif result == 'failed':
                fail_count += 1
            else:
                skip_count += 1

    elapsed = time.time() - start_time
    print('-' * 60)
    print(f'Done in {elapsed:.1f}s')
    print(f'  Uploaded: {ok_count}')
    print(f'  Skipped:  {skip_count}')
    print(f'  Failed:   {fail_count}')

    if fail_count > 0:
        print(f'\nFailed files are recorded in {state_path}')
        print('Re-run with --resume to retry failed uploads.')

    # Cleanup state file on full success
    if fail_count == 0 and os.path.exists(state_path):
        os.remove(state_path)


if __name__ == '__main__':
    main()
