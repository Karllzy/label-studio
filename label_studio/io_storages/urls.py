"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license."""

from django.conf import settings
from django.urls import include, path, re_path
from io_storages import proxy_api
from io_storages.all_api import (
    AllExportStorageListAPI,
    AllExportStorageTypesAPI,
    AllImportStorageListAPI,
    AllImportStorageTypesAPI,
)
from io_storages.api import ImportStorageListFilesAPI
from io_storages.localfiles.api import (
    LocalFilesBrowseAPI,
    LocalFilesExportStorageDetailAPI,
    LocalFilesExportStorageFormLayoutAPI,
    LocalFilesExportStorageListAPI,
    LocalFilesExportStorageSyncAPI,
    LocalFilesExportStorageValidateAPI,
    LocalFilesImportStorageDetailAPI,
    LocalFilesImportStorageFormLayoutAPI,
    LocalFilesImportStorageListAPI,
    LocalFilesImportStorageSerializer,
    LocalFilesImportStorageSyncAPI,
    LocalFilesImportStorageValidateAPI,
)
from io_storages.localfiles.views import localfiles_data
from io_storages.redis.api import (
    RedisExportStorageDetailAPI,
    RedisExportStorageFormLayoutAPI,
    RedisExportStorageListAPI,
    RedisExportStorageSyncAPI,
    RedisExportStorageValidateAPI,
    RedisImportStorageDetailAPI,
    RedisImportStorageFormLayoutAPI,
    RedisImportStorageListAPI,
    RedisImportStorageSerializer,
    RedisImportStorageSyncAPI,
    RedisImportStorageValidateAPI,
)
from io_storages.s3.api import (
    S3ExportStorageDetailAPI,
    S3ExportStorageFormLayoutAPI,
    S3ExportStorageListAPI,
    S3ExportStorageSyncAPI,
    S3ExportStorageValidateAPI,
    S3ImportStorageDetailAPI,
    S3ImportStorageFormLayoutAPI,
    S3ImportStorageListAPI,
    S3ImportStorageSerializer,
    S3ImportStorageSyncAPI,
    S3ImportStorageValidateAPI,
)

app_name = 'storages'

# IO Storages CRUD
_api_urlpatterns = [
    # All storages
    path('', AllImportStorageListAPI.as_view(), name='storage-list'),
    path('export', AllExportStorageListAPI.as_view(), name='export-storage-list'),
    path('types', AllImportStorageTypesAPI.as_view(), name='storage-types'),
    path('export/types', AllExportStorageTypesAPI.as_view(), name='export-storage-types'),
    # Amazon S3
    path('s3/', S3ImportStorageListAPI.as_view(), name='storage-s3-list'),
    path('s3/<int:pk>', S3ImportStorageDetailAPI.as_view(), name='storage-s3-detail'),
    path('s3/<int:pk>/sync', S3ImportStorageSyncAPI.as_view(), name='storage-s3-sync'),
    path('s3/validate', S3ImportStorageValidateAPI.as_view(), name='storage-s3-validate'),
    path('s3/form', S3ImportStorageFormLayoutAPI.as_view(), name='storage-s3-form'),
    path(
        's3/files',
        ImportStorageListFilesAPI().as_view(serializer_class=S3ImportStorageSerializer),
        name='storage-s3-list-files',
    ),
    path('export/s3', S3ExportStorageListAPI.as_view(), name='export-storage-s3-list'),
    path('export/s3/<int:pk>', S3ExportStorageDetailAPI.as_view(), name='export-storage-s3-detail'),
    path('export/s3/<int:pk>/sync', S3ExportStorageSyncAPI.as_view(), name='export-storage-s3-sync'),
    path('export/s3/validate', S3ExportStorageValidateAPI.as_view(), name='export-storage-s3-validate'),
    path('export/s3/form', S3ExportStorageFormLayoutAPI.as_view(), name='export-storage-s3-form'),
    # Redis DB
    path('redis/', RedisImportStorageListAPI.as_view(), name='storage-redis-list'),
    path('redis/<int:pk>', RedisImportStorageDetailAPI.as_view(), name='storage-redis-detail'),
    path('redis/<int:pk>/sync', RedisImportStorageSyncAPI.as_view(), name='storage-redis-sync'),
    path('redis/validate', RedisImportStorageValidateAPI.as_view(), name='storage-redis-validate'),
    path('redis/form', RedisImportStorageFormLayoutAPI.as_view(), name='storage-redis-form'),
    path(
        'redis/files',
        ImportStorageListFilesAPI().as_view(serializer_class=RedisImportStorageSerializer),
        name='storage-redis-list-files',
    ),
    path('export/redis', RedisExportStorageListAPI.as_view(), name='export-storage-redis-list'),
    path('export/redis/<int:pk>', RedisExportStorageDetailAPI.as_view(), name='export-storage-redis-detail'),
    path('export/redis/<int:pk>/sync', RedisExportStorageSyncAPI.as_view(), name='export-storage-redis-sync'),
    path('export/redis/validate', RedisExportStorageValidateAPI.as_view(), name='export-storage-redis-validate'),
    path('export/redis/form', RedisExportStorageFormLayoutAPI.as_view(), name='export-storage-redis-form'),
    # Local files
    path('localfiles/', LocalFilesImportStorageListAPI.as_view(), name='storage-localfiles-list'),
    path('localfiles/<int:pk>', LocalFilesImportStorageDetailAPI.as_view(), name='storage-localfiles-detail'),
    path('localfiles/<int:pk>/sync', LocalFilesImportStorageSyncAPI.as_view(), name='storage-localfiles-sync'),
    path('localfiles/validate', LocalFilesImportStorageValidateAPI.as_view(), name='storage-localfiles-validate'),
    path('localfiles/form', LocalFilesImportStorageFormLayoutAPI.as_view(), name='storage-localfiles-form'),
    path(
        'localfiles/files',
        ImportStorageListFilesAPI().as_view(serializer_class=LocalFilesImportStorageSerializer),
        name='storage-localfiles-list-files',
    ),
    path('localfiles/browse', LocalFilesBrowseAPI.as_view(), name='storage-localfiles-browse'),
    path('export/localfiles', LocalFilesExportStorageListAPI.as_view(), name='export-storage-localfiles-list'),
    path(
        'export/localfiles/<int:pk>',
        LocalFilesExportStorageDetailAPI.as_view(),
        name='export-storage-localfiles-detail',
    ),
    path(
        'export/localfiles/<int:pk>/sync',
        LocalFilesExportStorageSyncAPI.as_view(),
        name='export-storage-localfiles-sync',
    ),
    path(
        'export/localfiles/validate',
        LocalFilesExportStorageValidateAPI.as_view(),
        name='export-storage-localfiles-validate',
    ),
    path(
        'export/localfiles/form',
        LocalFilesExportStorageFormLayoutAPI.as_view(),
        name='export-storage-localfiles-form',
    ),
]

urlpatterns = [
    path('api/storages/', include((_api_urlpatterns, app_name), namespace='api')),
]

# URI Resolving: proxy or redirect to presigned URLs
urlpatterns += [
    # resolving storage URIs endpoints: proxy or redirect to presigned URLs
    path('tasks/<int:task_id>/resolve/', proxy_api.TaskResolveStorageUri.as_view(), name='task-storage-data-resolve'),
    path(
        'projects/<int:project_id>/resolve/',
        proxy_api.ProjectResolveStorageUri.as_view(),
        name='project-storage-data-resolve',
    ),
    # keep /presign/ for backwards compatibility
    path('tasks/<int:task_id>/presign/', proxy_api.TaskResolveStorageUri.as_view(), name='task-storage-data-presign'),
    path(
        'projects/<int:project_id>/presign/',
        proxy_api.ProjectResolveStorageUri.as_view(),
        name='project-storage-data-presign',
    ),
]

urlpatterns += [
    re_path(r'data/local-files/', localfiles_data, name='localfiles_data'),
]
