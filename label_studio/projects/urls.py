"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license."""

from django.urls import include, path

from . import api, views
from tasks import api as tasks_api

app_name = 'projects'

# reverse for projects:name
_urlpatterns = [
    path('', views.project_list, name='project-index'),
    path('<int:pk>/settings/', views.project_settings, name='project-settings', kwargs={'sub_path': ''}),
    path('<int:pk>/settings/<sub_path>', views.project_settings, name='project-settings-anything'),
]

# reverse for projects:api:name
_api_urlpatterns = [
    # CRUD
    path('', api.ProjectListAPI.as_view(), name='project-list'),
    path('<int:pk>/', api.ProjectAPI.as_view(), name='project-detail'),
    path('counts/', api.ProjectCountsListAPI.as_view(), name='project-counts-list'),
    # Get next task
    path('<int:pk>/next/', api.ProjectNextTaskAPI.as_view(), name='project-next'),
    # Label stream history
    path('<int:pk>/label-stream-history/', api.LabelStreamHistoryAPI.as_view(), name='label-stream-history'),
    # Validate label config in general
    path('validate/', api.LabelConfigValidateAPI.as_view(), name='label-config-validate'),
    # Validate label config for project
    path('<int:pk>/validate/', api.ProjectLabelConfigValidateAPI.as_view(), name='project-label-config-validate'),
    # Project summary
    path('<int:pk>/summary/', api.ProjectSummaryAPI.as_view(), name='project-summary'),
    # Project summary
    path(
        '<int:pk>/summary/reset/',
        api.ProjectSummaryResetAPI.as_view(),
        name='project-summary-reset',
    ),
    # Project import
    path('<int:pk>/imports/<int:import_pk>/', api.ProjectImportAPI.as_view(), name='project-imports'),
    # Project reimport
    path('<int:pk>/reimports/<int:reimport_pk>/', api.ProjectReimportAPI.as_view(), name='project-reimports'),
    # Tasks list for the project: get and destroy
    path('<int:pk>/tasks/', api.ProjectTaskListAPI.as_view(), name='project-tasks-list'),
    # Generate sample task for this project
    path('<int:pk>/sample-task/', api.ProjectSampleTask.as_view(), name='project-sample-task'),
    # List available model versions
    path('<int:pk>/model-versions/', api.ProjectModelVersions.as_view(), name='project-model-versions'),
    # List all annotators for project
    path('<int:pk>/annotators/', api.ProjectAnnotatorsAPI.as_view(), name='project-annotators'),
    # Project members management
    path('<int:pk>/members/', api.ProjectMemberListCreateAPI.as_view(), name='project-members'),
    path('<int:pk>/members/<int:member_pk>/', api.ProjectMemberDetailAPI.as_view(), name='project-member-detail'),
    # Project workflow settings
    path('<int:pk>/workflow/', api.ProjectWorkflowAPI.as_view(), name='project-workflow'),
    # Annotation review workflow
    path('<int:pk>/pending-reviews/', tasks_api.PendingReviewListAPI.as_view(), name='project-pending-reviews'),
    # Task assignment
    path('<int:pk>/assign-tasks/', tasks_api.TaskAssignmentAPI.as_view(), name='project-assign-tasks'),
]

_api_urlpatterns_templates = [
    path('', api.TemplateListAPI.as_view(), name='template-list'),
]


urlpatterns = [
    path('projects/', include(_urlpatterns)),
    path('api/projects/', include((_api_urlpatterns, app_name), namespace='api')),
    path('api/templates/', include((_api_urlpatterns_templates, app_name), namespace='api-templates')),
]
