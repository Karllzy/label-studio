"""Tests for review queue rules based on project membership role."""

import pytest
from organizations.models import OrganizationMember
from organizations.tests.factories import OrganizationFactory
from projects.models import ProjectMember
from projects.tests.factories import ProjectFactory
from core.permissions import all_permissions
from tasks.models import Annotation
from tasks.review_permissions import initial_review_status_for_annotation, user_annotation_needs_pending_review
from users.tests.factories import UserFactory


@pytest.fixture
def org_and_project():
    org = OrganizationFactory()
    project = ProjectFactory(organization=org, require_review=True)
    return org, project


@pytest.mark.django_db
def test_needs_pending_when_require_review_disabled(org_and_project):
    org, project = org_and_project
    project.require_review = False
    project.save(update_fields=['require_review'])
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)
    assert user_annotation_needs_pending_review(project, user) is False


@pytest.mark.django_db
def test_needs_pending_superuser_exempt(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org, is_superuser=True)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)
    assert user_annotation_needs_pending_review(project, user) is False


@pytest.mark.django_db
def test_needs_pending_project_annotator(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)
    assert user_annotation_needs_pending_review(project, user) is True


@pytest.mark.django_db
def test_needs_pending_project_reviewer_skipped(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_REVIEWER)
    assert user_annotation_needs_pending_review(project, user) is False


@pytest.mark.django_db
def test_needs_pending_project_admin_skipped(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ADMIN)
    assert user_annotation_needs_pending_review(project, user) is False


@pytest.mark.django_db
def test_needs_pending_no_project_member(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    assert user_annotation_needs_pending_review(project, user) is True


@pytest.mark.django_db
def test_needs_pending_disabled_member_treated_as_no_member(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(
        user=user, project=project, role=ProjectMember.PROJECT_ROLE_REVIEWER, enabled=False
    )
    assert user_annotation_needs_pending_review(project, user) is True


@pytest.mark.django_db
def test_org_admin_with_project_annotator_role_still_pending(org_and_project):
    """Regression: org OW/AD used to bypass pending via annotations.review permission."""
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    OrganizationMember.objects.filter(user=user, organization=org).update(role=OrganizationMember.ORG_ROLE_ADMIN)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)
    assert user.has_perm(all_permissions.annotations_review, project) is True
    assert user_annotation_needs_pending_review(project, user) is True


@pytest.mark.django_db
def test_initial_status_none_when_review_off(org_and_project):
    org, project = org_and_project
    project.require_review = False
    project.save(update_fields=['require_review'])
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)
    assert initial_review_status_for_annotation(project, user) is None


@pytest.mark.django_db
def test_initial_status_pending_for_annotator(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_ANNOTATOR)
    assert initial_review_status_for_annotation(project, user) == Annotation.ReviewStatus.PENDING


@pytest.mark.django_db
def test_initial_status_approved_for_reviewer(org_and_project):
    org, project = org_and_project
    user = UserFactory(active_organization=org)
    ProjectMember.objects.create(user=user, project=project, role=ProjectMember.PROJECT_ROLE_REVIEWER)
    assert initial_review_status_for_annotation(project, user) == Annotation.ReviewStatus.APPROVED
