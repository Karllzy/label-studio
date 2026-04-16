"""Task.pending_review stays in sync with annotations."""

import pytest
from organizations.tests.factories import OrganizationFactory
from projects.models import ProjectMember
from projects.tests.factories import ProjectFactory
from tasks.models import Annotation
from tasks.tests.factories import AnnotationFactory, TaskFactory
from users.tests.factories import UserFactory


@pytest.mark.django_db
def test_task_pending_review_set_when_annotation_pending():
    org = OrganizationFactory()
    project = ProjectFactory(organization=org, require_review=True)
    task = TaskFactory(project=project)
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)

    AnnotationFactory(
        task=task,
        project=project,
        completed_by=user,
        review_status=Annotation.ReviewStatus.PENDING,
        was_cancelled=False,
    )

    task.refresh_from_db()
    assert task.pending_review is True


@pytest.mark.django_db
def test_task_pending_review_cleared_when_only_approved():
    org = OrganizationFactory()
    project = ProjectFactory(organization=org, require_review=True)
    task = TaskFactory(project=project, pending_review=True)
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)

    ann = AnnotationFactory(
        task=task,
        project=project,
        completed_by=user,
        review_status=Annotation.ReviewStatus.APPROVED,
        was_cancelled=False,
    )

    task.refresh_from_db()
    assert task.pending_review is False

    ann.review_status = Annotation.ReviewStatus.PENDING
    ann.save(update_fields=['review_status'])
    task.refresh_from_db()
    assert task.pending_review is True
