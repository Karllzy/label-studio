"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license."""

import logging

from core.permissions import all_permissions
from data_manager.actions import DataManagerAction
from data_manager.functions import filters_ordering_selected_items_exist
from projects.functions.next_task import get_next_task
from projects.functions.stream_history import add_stream_history
from rest_framework.exceptions import NotFound
from tasks.serializers import NextTaskSerializer

logger = logging.getLogger(__name__)


def _get_next_task_from_current_position(queryset, current_task_id):
    if not current_task_id:
        return queryset.first()

    try:
        current_task_id = int(current_task_id)
    except (TypeError, ValueError):
        return queryset.first()

    task_ids = list(queryset.values_list('id', flat=True))

    if not task_ids:
        return None

    try:
        current_index = task_ids.index(current_task_id)
    except ValueError:
        return queryset.first()

    next_index = current_index + 1

    if next_index >= len(task_ids):
        return None

    return queryset.filter(id=task_ids[next_index]).first()


def next_task(project, queryset, **kwargs):
    """Generate next task for labeling stream

    :param project: project
    :param queryset: task ids to sample from
    :param kwargs: arguments from api request
    """

    request = kwargs['request']
    dm_queue = filters_ordering_selected_items_exist(request.data)
    current_task_id = request.data.get('currentTaskId')

    if dm_queue:
        next_task = _get_next_task_from_current_position(queryset, current_task_id)
        queue_info = 'Data manager queue'

        if next_task is not None:
            next_task.set_lock(request.user)
            add_stream_history(next_task, request.user, project)
    else:
        next_task, queue_info = get_next_task(request.user, queryset, project, dm_queue)

    if next_task is None:
        raise NotFound(f'There are no tasks for {request.user}')

    # serialize task
    context = {'request': request, 'project': project, 'resolve_uri': True, 'annotations': False}
    serializer = NextTaskSerializer(next_task, context=context)
    response = serializer.data
    response['queue'] = queue_info
    return response


actions: list[DataManagerAction] = [
    {
        'entry_point': next_task,
        'permission': all_permissions.projects_view,
        'title': 'Generate Next Task',
        'order': 0,
        'hidden': True,
    }
]
