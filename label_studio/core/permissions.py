"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license."""

import logging  # noqa: I001
from typing import Optional

from pydantic import BaseModel, ConfigDict

import rules

logger = logging.getLogger(__name__)


class AllPermissions(BaseModel):
    model_config = ConfigDict(protected_namespaces=('__.*__', '_.*'))

    organizations_create: str = 'organizations.create'
    organizations_view: str = 'organizations.view'
    organizations_change: str = 'organizations.change'
    organizations_delete: str = 'organizations.delete'
    organizations_invite: str = 'organizations.invite'
    projects_create: str = 'projects.create'
    projects_view: str = 'projects.view'
    projects_change: str = 'projects.change'
    projects_delete: str = 'projects.delete'
    projects_reset_cache: str = 'projects.reset_cache'
    tasks_create: str = 'tasks.create'
    tasks_view: str = 'tasks.view'
    tasks_change: str = 'tasks.change'
    tasks_delete: str = 'tasks.delete'
    tasks_assign: str = 'tasks.assign'
    views_reset: str = 'views.reset'
    annotations_create: str = 'annotations.create'
    annotations_view: str = 'annotations.view'
    annotations_change: str = 'annotations.change'
    annotations_delete: str = 'annotations.delete'
    annotations_review: str = 'annotations.review'
    actions_perform: str = 'actions.perform'
    predictions_any: str = 'predictions.any'
    avatar_any: str = 'avatar.any'
    labels_create: str = 'labels.create'
    labels_view: str = 'labels.view'
    labels_change: str = 'labels.change'
    labels_delete: str = 'labels.delete'
    models_create: str = 'models.create'
    models_view: str = 'models.view'
    models_change: str = 'models.change'
    models_delete: str = 'models.delete'
    model_provider_connection_create: str = 'model_provider_connection.create'
    model_provider_connection_view: str = 'model_provider_connection.view'
    model_provider_connection_change: str = 'model_provider_connection.change'
    model_provider_connection_delete: str = 'model_provider_connection.delete'
    webhooks_view: str = 'webhooks.view'
    webhooks_change: str = 'webhooks.change'
    users_token_any: str = 'users.token.any'

    storages_view: str = 'storages.view'
    storages_change: str = 'storages.change'
    storages_sync: str = 'storages.sync'

    views_view: str = 'views.view'
    views_create: str = 'views.create'
    views_change: str = 'views.change'
    views_delete: str = 'views.delete'


all_permissions = AllPermissions()


class ViewClassPermission(BaseModel):
    GET: Optional[str] = None
    PATCH: Optional[str] = None
    PUT: Optional[str] = None
    DELETE: Optional[str] = None
    POST: Optional[str] = None


def make_perm(name, pred, overwrite=False):
    if rules.perm_exists(name):
        if overwrite:
            rules.remove_perm(name)
        else:
            return
    rules.add_perm(name, pred)


# ---------------------------------------------------------------------------
# Role-based predicates
# ---------------------------------------------------------------------------

@rules.predicate
def is_system_admin(user):
    return user.is_superuser


@rules.predicate
def is_org_owner_or_admin(user, obj=None):
    from organizations.models import OrganizationMember

    org = None
    if obj is not None:
        org = getattr(obj, 'organization', None)
        if org is None and hasattr(obj, 'project'):
            org = getattr(obj.project, 'organization', None)
        if org is None:
            org = obj if hasattr(obj, 'users') else None
    if org is None:
        org = getattr(user, 'active_organization', None)
    if org is None:
        return False
    return OrganizationMember.objects.filter(
        user=user, organization=org,
        role__in=['OW', 'AD'], deleted_at__isnull=True,
    ).exists()


@rules.predicate
def is_org_member(user, obj=None):
    from organizations.models import OrganizationMember

    org = None
    if obj is not None:
        org = getattr(obj, 'organization', None)
        if org is None:
            org = obj if hasattr(obj, 'users') else None
    if org is None:
        org = getattr(user, 'active_organization', None)
    if org is None:
        return False
    return OrganizationMember.objects.filter(
        user=user, organization=org, deleted_at__isnull=True,
    ).exists()


@rules.predicate
def is_project_admin(user, obj=None):
    from projects.models import ProjectMember

    project = _resolve_project(obj)
    if project is None:
        return False
    return ProjectMember.objects.filter(
        user=user, project=project, role='AD', enabled=True,
    ).exists()


@rules.predicate
def is_project_member(user, obj=None):
    from projects.models import ProjectMember

    project = _resolve_project(obj)
    if project is None:
        return False
    return ProjectMember.objects.filter(
        user=user, project=project, enabled=True,
    ).exists()


@rules.predicate
def is_project_annotator_or_above(user, obj=None):
    from projects.models import ProjectMember

    project = _resolve_project(obj)
    if project is None:
        return False
    return ProjectMember.objects.filter(
        user=user, project=project, enabled=True,
        role__in=['AD', 'AN', 'RE'],
    ).exists()


@rules.predicate
def is_project_owner(user, obj=None):
    project = _resolve_project(obj)
    if project is None:
        return False
    return project.created_by_id == user.id


@rules.predicate
def is_project_reviewer(user, obj=None):
    from projects.models import ProjectMember

    project = _resolve_project(obj)
    if project is None:
        return False
    return ProjectMember.objects.filter(
        user=user, project=project, role=ProjectMember.PROJECT_ROLE_REVIEWER, enabled=True,
    ).exists()


def _resolve_project(obj):
    """Resolve a project from various object types."""
    if obj is None:
        return None
    from projects.models import Project
    if isinstance(obj, Project):
        return obj
    project = getattr(obj, 'project', None)
    if project is not None:
        return project
    return None


# ---------------------------------------------------------------------------
# Register permissions with role-based predicates
# ---------------------------------------------------------------------------

# Superuser or org admin can manage organizations
_org_manage = is_system_admin | is_org_owner_or_admin
make_perm('organizations.create', is_system_admin)
make_perm('organizations.view', is_system_admin | is_org_member)
make_perm('organizations.change', _org_manage)
make_perm('organizations.delete', is_system_admin | is_org_owner_or_admin)
make_perm('organizations.invite', _org_manage)

# Project permissions
_project_manage = is_system_admin | is_org_owner_or_admin | is_project_admin
_project_view = is_system_admin | is_org_owner_or_admin | is_project_member
_assign_review_tasks = (
    is_system_admin | is_org_owner_or_admin | is_project_owner | is_project_reviewer | is_project_admin
)
_task_delete = _project_manage | is_project_owner | is_project_reviewer
make_perm('projects.create', is_system_admin | is_org_owner_or_admin)
make_perm('projects.view', _project_view)
make_perm('projects.change', _project_manage)
make_perm('projects.delete', is_system_admin | is_project_owner, overwrite=True)
make_perm('projects.reset_cache', _project_manage)

# Task permissions
make_perm('tasks.create', _project_manage)
make_perm('tasks.view', _project_view)
make_perm('tasks.change', _project_manage)
make_perm('tasks.delete', _task_delete, overwrite=True)
make_perm('tasks.assign', _assign_review_tasks)
make_perm('views.reset', _project_manage)

# Annotation permissions — annotators can create/view their own
make_perm('annotations.create', is_system_admin | is_org_owner_or_admin | is_project_annotator_or_above)
make_perm('annotations.view', _project_view)
make_perm('annotations.change', is_system_admin | is_org_owner_or_admin | is_project_annotator_or_above)
make_perm('annotations.delete', _project_manage)
make_perm('annotations.review', _assign_review_tasks)

# Other resource permissions
make_perm('actions.perform', _project_manage)
make_perm('predictions.any', _project_view)
make_perm('avatar.any', rules.is_authenticated)
make_perm('labels.create', _project_manage)
make_perm('labels.view', _project_view)
make_perm('labels.change', _project_manage)
make_perm('labels.delete', _project_manage)
make_perm('models.create', _project_manage)
make_perm('models.view', _project_view)
make_perm('models.change', _project_manage)
make_perm('models.delete', _project_manage)
make_perm('model_provider_connection.create', _org_manage)
make_perm('model_provider_connection.view', _project_view)
make_perm('model_provider_connection.change', _org_manage)
make_perm('model_provider_connection.delete', _org_manage)
make_perm('webhooks.view', _project_view)
make_perm('webhooks.change', _project_manage)
make_perm('users.token.any', rules.is_authenticated)
make_perm('storages.view', _project_view)
make_perm('storages.change', _project_manage)
make_perm('storages.sync', _project_manage)
make_perm('views.view', _project_view)
make_perm('views.create', _project_view)
make_perm('views.change', _project_view)
make_perm('views.delete', _project_manage)
