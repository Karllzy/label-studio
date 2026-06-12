"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license."""

import csv
import io
import logging
import mimetypes
import os

try:
    import ujson as json
except:  # noqa: E722
    import json

from core.utils.common import timeit
from core.utils.exceptions import extract_message
from core.utils.io import ssrf_safe_get
from django.conf import settings
from django.core.files import File
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.exceptions import ValidationError

from .models import FileUpload

logger = logging.getLogger(__name__)
csv.field_size_limit(131072 * 10)


def is_binary(f):
    return isinstance(f, (io.RawIOBase, io.BufferedIOBase))


def csv_generate_header(file):
    """Generate column names for headless csv file"""
    file.seek(0)
    names = []
    line = file.readline()

    num_columns = len(line.split(b',' if isinstance(line, bytes) else ','))
    for i in range(num_columns):
        names.append('column' + str(i + 1))
    file.seek(0)
    return names


def check_max_task_number(tasks):
    # max tasks
    if len(tasks) > settings.TASKS_MAX_NUMBER:
        raise ValidationError(
            f'Maximum task number is {settings.TASKS_MAX_NUMBER}, current task number is {len(tasks)}'
        )


def check_tasks_max_file_size(value):
    if value >= settings.TASKS_MAX_FILE_SIZE:
        raise ValidationError(
            f'Maximum total size of all files is {settings.TASKS_MAX_FILE_SIZE} bytes, current size is {value} bytes'
        )


def check_extensions(files):
    for filename, file_obj in files.items():
        _, ext = os.path.splitext(file_obj.name)
        if ext.lower() not in settings.SUPPORTED_EXTENSIONS:
            raise ValidationError(f'{ext} extension is not supported')


def check_request_files_size(files):
    total = sum([file.size for _, file in files.items()])

    check_tasks_max_file_size(total)


def resolve_safe_path_under_document_root(relative_path):
    """Resolve a user-supplied relative path strictly under LOCAL_FILES_DOCUMENT_ROOT."""
    if not settings.ENABLE_SERVER_SIDE_LOCAL_IMPORT:
        raise ValidationError(
            'Server-side local import is disabled. Set environment variable ENABLE_SERVER_SIDE_LOCAL_IMPORT=1 to enable.'
        )
    if not settings.ENABLE_LOCAL_FILES_STORAGE:
        raise ValidationError('Local files storage is disabled.')
    rel = (relative_path or '').strip()
    if not rel:
        raise ValidationError('Path is empty.')
    normalized = rel.replace('/', os.sep)
    if os.path.isabs(normalized):
        raise ValidationError('Path must be relative to LOCAL_FILES_DOCUMENT_ROOT.')
    rel_norm = os.path.normpath(normalized)
    if rel_norm.startswith('..' + os.sep) or rel_norm == '..':
        raise ValidationError('Invalid path.')
    root = os.path.realpath(settings.LOCAL_FILES_DOCUMENT_ROOT)
    full = os.path.realpath(os.path.join(root, rel_norm))
    try:
        common = os.path.commonpath([full, root])
    except ValueError:
        raise ValidationError('Invalid path.')
    if common != root:
        raise ValidationError('Path must stay under LOCAL_FILES_DOCUMENT_ROOT.')
    return full


def collect_files_for_server_side_import(items, recursive):
    """Expand path/directory entries to a list of absolute file paths with allowed extensions."""
    if not isinstance(items, list) or not items:
        raise ValidationError('"items" must be a non-empty list of strings.')
    max_entries = settings.SERVER_SIDE_LOCAL_IMPORT_MAX_PATH_ENTRIES
    if len(items) > max_entries:
        raise ValidationError(f'Too many path entries (max {max_entries}).')
    max_files = settings.SERVER_SIDE_LOCAL_IMPORT_MAX_FILES
    root = os.path.realpath(settings.LOCAL_FILES_DOCUMENT_ROOT)
    collected = []
    seen = set()
    for raw in items:
        if not isinstance(raw, str) or not raw.strip():
            raise ValidationError('Each item must be a non-empty string path.')
        full = resolve_safe_path_under_document_root(raw)
        if os.path.isfile(full):
            candidates = [full]
        elif os.path.isdir(full):
            if recursive:
                candidates = []
                for dirpath, _dirnames, filenames in os.walk(full):
                    for name in filenames:
                        candidates.append(os.path.join(dirpath, name))
            else:
                candidates = []
                try:
                    for name in sorted(os.listdir(full)):
                        p = os.path.join(full, name)
                        if os.path.isfile(p):
                            candidates.append(p)
                except OSError as e:
                    raise ValidationError(f'Cannot read directory: {extract_message(e)}')
        else:
            raise ValidationError(f'Path not found: {raw}')
        for abs_path in candidates:
            abs_path = os.path.realpath(abs_path)
            try:
                if os.path.commonpath([abs_path, root]) != root:
                    raise ValidationError('A discovered file resolves outside LOCAL_FILES_DOCUMENT_ROOT.')
            except ValueError:
                raise ValidationError('A discovered file has an invalid path.')
            if abs_path in seen:
                continue
            _, ext = os.path.splitext(abs_path)
            if ext.lower() not in settings.SUPPORTED_EXTENSIONS:
                continue
            if not os.path.isfile(abs_path):
                continue
            if len(collected) >= max_files:
                raise ValidationError(f'Exceeded maximum of {max_files} files per request.')
            seen.add(abs_path)
            collected.append(abs_path)
    if not collected:
        raise ValidationError('No supported files found for the given paths.')
    return collected


def create_file_uploads_from_local_document_paths(user, project, items, recursive=False):
    """Copy files from LOCAL_FILES_DOCUMENT_ROOT into this project's upload directory and create FileUpload rows."""
    paths = collect_files_for_server_side_import(items, recursive)
    total_size = 0
    for p in paths:
        try:
            total_size += os.path.getsize(p)
        except OSError as e:
            raise ValidationError(f'Cannot read file size: {extract_message(e)}')
    check_tasks_max_file_size(total_size)

    file_upload_ids = []
    could_be_tasks_list = False
    for abs_path in paths:
        filename = os.path.basename(abs_path)
        with open(abs_path, 'rb') as fp:
            file_upload = create_file_upload(user, project, File(fp, name=filename))
        if file_upload.format_could_be_tasks_list:
            could_be_tasks_list = True
        file_upload_ids.append(file_upload.id)
    logger.debug('server-side local import: %s file uploads', file_upload_ids)
    return file_upload_ids, could_be_tasks_list


def create_file_upload(user, project, file):
    instance = FileUpload(user=user, project=project, file=file)
    if settings.SVG_SECURITY_CLEANUP:
        content_type, encoding = mimetypes.guess_type(str(instance.file.name))
        if content_type in ['image/svg+xml']:
            clean_xml = allowlist_svg(instance.file.read().decode())
            instance.file.seek(0)
            instance.file.write(clean_xml.encode())
            instance.file.truncate()
    instance.save()
    return instance


def allowlist_svg(dirty_xml):
    """Filter out malicious/harmful content from SVG files
    by defining allowed tags
    """
    from lxml.html import clean

    allow_tags = [
        'xml',
        'svg',
        'circle',
        'ellipse',
        'line',
        'path',
        'polygon',
        'vector',
        'rect',
    ]

    cleaner = clean.Cleaner(
        allow_tags=allow_tags,
        style=True,
        links=True,
        add_nofollow=False,
        page_structure=True,
        safe_attrs_only=False,
        remove_unknown_tags=False,
    )

    clean_xml = cleaner.clean_html(dirty_xml)
    return clean_xml


def str_to_json(data):
    try:
        json_acceptable_string = data.replace("'", '"')
        return json.loads(json_acceptable_string)
    except ValueError:
        return None


def tasks_from_url(file_upload_ids, project, user, url, could_be_tasks_list):
    """Download file using URL and read tasks from it"""
    # process URL with tasks
    try:
        filename = url.rsplit('/', 1)[-1]

        response = ssrf_safe_get(
            url, verify=project.organization.should_verify_ssl_certs(), stream=True, headers={'Accept-Encoding': None}
        )

        # Try to get filename from resolved URL after redirects
        resolved_url = response.url if hasattr(response, 'url') else url
        if resolved_url != url:
            # Parse filename from the resolved URL after redirect
            from urllib.parse import unquote, urlparse

            parsed_url = urlparse(resolved_url)
            path = unquote(parsed_url.path)
            resolved_filename = path.rsplit('/', 1)[-1]
            # Remove query parameters
            if '?' in resolved_filename:
                resolved_filename = resolved_filename.split('?')[0]
            _, resolved_ext = os.path.splitext(resolved_filename)
            filename = resolved_filename

        # Check file extension
        _, ext = os.path.splitext(filename)
        if ext and ext.lower() not in settings.SUPPORTED_EXTENSIONS:
            raise ValidationError(f'{ext} extension is not supported')

        # Check file size before downloading
        content_length = response.headers.get('content-length')
        if content_length:
            check_tasks_max_file_size(int(content_length))

        file_content = response.content
        file_upload = create_file_upload(user, project, SimpleUploadedFile(filename, file_content))
        if file_upload.format_could_be_tasks_list:
            could_be_tasks_list = True
        file_upload_ids.append(file_upload.id)
        tasks, found_formats, data_keys = FileUpload.load_tasks_from_uploaded_files(project, file_upload_ids)

    except ValidationError as e:
        raise e
    except Exception as e:
        raise ValidationError(extract_message(e))
    return data_keys, found_formats, tasks, file_upload_ids, could_be_tasks_list


@timeit
def create_file_uploads(user, project, FILES):
    could_be_tasks_list = False
    file_upload_ids = []
    check_request_files_size(FILES)
    check_extensions(FILES)
    for _, file in FILES.items():
        file_upload = create_file_upload(user, project, file)
        if file_upload.format_could_be_tasks_list:
            could_be_tasks_list = True
        file_upload_ids.append(file_upload.id)

    logger.debug(f'created file uploads: {file_upload_ids} could_be_tasks_list: {could_be_tasks_list}')
    return file_upload_ids, could_be_tasks_list


def load_tasks_for_async_import(project_import, user):
    """Load tasks from different types of request.data / request.files saved in project_import model"""
    file_upload_ids, found_formats, data_keys = [], [], set()

    if project_import.file_upload_ids:
        file_upload_ids = project_import.file_upload_ids
        tasks, found_formats, data_keys = FileUpload.load_tasks_from_uploaded_files(
            project_import.project, file_upload_ids
        )

    # take tasks from url address
    elif project_import.url:
        url = project_import.url
        # try to load json with task or tasks from url as string
        json_data = str_to_json(url)
        if json_data:
            file_upload = create_file_upload(
                user,
                project_import.project,
                SimpleUploadedFile('inplace.json', url.encode()),
            )
            file_upload_ids.append(file_upload.id)
            tasks, found_formats, data_keys = FileUpload.load_tasks_from_uploaded_files(
                project_import.project, file_upload_ids
            )

        # download file using url and read tasks from it
        else:
            could_be_tasks_list = False
            (
                data_keys,
                found_formats,
                tasks,
                file_upload_ids,
                could_be_tasks_list,
            ) = tasks_from_url(file_upload_ids, project_import.project, user, url, could_be_tasks_list)
            if could_be_tasks_list:
                project_import.could_be_tasks_list = True
                project_import.save(update_fields=['could_be_tasks_list'])

    elif project_import.tasks:
        tasks = project_import.tasks

    # check is data root is list
    if not isinstance(tasks, list):
        raise ValidationError('load_tasks: Data root must be list')

    # empty tasks error
    if not tasks:
        raise ValidationError('load_tasks: No tasks added')

    check_max_task_number(tasks)
    return tasks, file_upload_ids, found_formats, list(data_keys)


def load_tasks_for_async_import_streaming(project_import, user, batch_size=1000):
    """Load tasks from different types of request.data / request.files saved in project_import model,
    yielding tasks in batches to reduce memory usage"""
    from django.conf import settings

    if not batch_size:
        batch_size = settings.IMPORT_BATCH_SIZE

    all_file_upload_ids = []
    all_found_formats = {}
    all_data_keys = set()

    if project_import.file_upload_ids:
        file_upload_ids = project_import.file_upload_ids
        all_file_upload_ids = file_upload_ids.copy()

        for batch_tasks, batch_formats, batch_data_keys in FileUpload.load_tasks_from_uploaded_files_streaming(
            project_import.project, file_upload_ids, batch_size=batch_size
        ):
            all_found_formats.update(batch_formats)
            all_data_keys.update(batch_data_keys)

            # Validate each batch
            if not isinstance(batch_tasks, list):
                raise ValidationError('load_tasks: Data root must be list')
            if not batch_tasks:
                continue  # Skip empty batches

            check_max_task_number(batch_tasks)
            yield batch_tasks, file_upload_ids, batch_formats, list(batch_data_keys)

    elif project_import.url:
        # For URL imports, we still need to load everything at once
        # since we don't have streaming support for URL-based imports yet
        url = project_import.url
        file_upload_ids, found_formats, data_keys = [], [], set()

        # try to load json with task or tasks from url as string
        json_data = str_to_json(url)
        if json_data:
            file_upload = create_file_upload(
                user,
                project_import.project,
                SimpleUploadedFile('inplace.json', url.encode()),
            )
            file_upload_ids.append(file_upload.id)
            tasks, found_formats, data_keys = FileUpload.load_tasks_from_uploaded_files(
                project_import.project, file_upload_ids
            )
        else:
            could_be_tasks_list = False
            (
                data_keys,
                found_formats,
                tasks,
                file_upload_ids,
                could_be_tasks_list,
            ) = tasks_from_url(file_upload_ids, project_import.project, user, url, could_be_tasks_list)
            if could_be_tasks_list:
                project_import.could_be_tasks_list = True
                project_import.save(update_fields=['could_be_tasks_list'])

        if not isinstance(tasks, list):
            raise ValidationError('load_tasks: Data root must be list')
        if not tasks:
            raise ValidationError('load_tasks: No tasks added')

        check_max_task_number(tasks)

        all_file_upload_ids = file_upload_ids.copy()
        all_found_formats = found_formats.copy()
        all_data_keys = data_keys.copy()

        for i in range(0, len(tasks), batch_size):
            batch_tasks = tasks[i : i + batch_size]
            yield batch_tasks, file_upload_ids, found_formats, list(data_keys)

    elif project_import.tasks:
        tasks = project_import.tasks

        if not isinstance(tasks, list):
            raise ValidationError('load_tasks: Data root must be list')
        if not tasks:
            raise ValidationError('load_tasks: No tasks added')

        check_max_task_number(tasks)

        for i in range(0, len(tasks), batch_size):
            batch_tasks = tasks[i : i + batch_size]
            yield batch_tasks, [], {}, []

    else:
        raise ValidationError('load_tasks: No tasks added')

    return all_file_upload_ids, all_found_formats, list(all_data_keys)


def load_tasks(request, project):
    """Load tasks from different types of request.data / request.files"""
    file_upload_ids, found_formats, data_keys = [], [], set()
    could_be_tasks_list = False

    # take tasks from request FILES
    if len(request.FILES):
        check_request_files_size(request.FILES)
        check_extensions(request.FILES)
        for filename, file in request.FILES.items():
            file_upload = create_file_upload(request.user, project, file)
            if file_upload.format_could_be_tasks_list:
                could_be_tasks_list = True
            file_upload_ids.append(file_upload.id)
        tasks, found_formats, data_keys = FileUpload.load_tasks_from_uploaded_files(project, file_upload_ids)

    # take tasks from url address
    elif 'application/x-www-form-urlencoded' in request.content_type:
        # empty url
        url = request.data.get('url')
        if not url:
            raise ValidationError('"url" is not found in request data')

        # try to load json with task or tasks from url as string
        json_data = str_to_json(url)
        if json_data:
            file_upload = create_file_upload(request.user, project, SimpleUploadedFile('inplace.json', url.encode()))
            file_upload_ids.append(file_upload.id)
            tasks, found_formats, data_keys = FileUpload.load_tasks_from_uploaded_files(project, file_upload_ids)

        # download file using url and read tasks from it
        else:
            (
                data_keys,
                found_formats,
                tasks,
                file_upload_ids,
                could_be_tasks_list,
            ) = tasks_from_url(file_upload_ids, project, request.user, url, could_be_tasks_list)

    # take one task from request DATA
    elif 'application/json' in request.content_type and isinstance(request.data, dict):
        tasks = [request.data]

    # take many tasks from request DATA
    elif 'application/json' in request.content_type and isinstance(request.data, list):
        tasks = request.data

    # incorrect data source
    else:
        raise ValidationError('load_tasks: No data found in DATA or in FILES')

    # check is data root is list
    if not isinstance(tasks, list):
        raise ValidationError('load_tasks: Data root must be list')

    # empty tasks error
    if not tasks:
        raise ValidationError('load_tasks: No tasks added')

    check_max_task_number(tasks)
    return tasks, file_upload_ids, could_be_tasks_list, found_formats, list(data_keys)
