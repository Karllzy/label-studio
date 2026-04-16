"""Review workflow helpers: pending vs approved annotation submissions."""

from tasks.models import Annotation


def user_annotation_needs_pending_review(project, user) -> bool:
    """Whether a new annotation from this user should enter the pending-review queue.

    When ``require_review`` is on, this follows **project membership role** (``ProjectMember``),
    not ``annotations.review`` permission. That way organization admins or project creators who
    are stored as annotators on the project still go through review like other annotators.

    Rules (``require_review`` must be True; otherwise this returns False):

    * Superuser: own submissions are not held for review (same as before).
    * ``ProjectMember`` with role Reviewer or Project Admin: auto-approved (no pending).
    * ``ProjectMember`` with role Annotator (or any other stored role): pending.
    * No enabled ``ProjectMember`` row: pending (no project role → treat like annotator work).
    """
    if not project.require_review:
        return False
    if user.is_superuser:
        return False

    from projects.models import ProjectMember

    member = ProjectMember.objects.filter(user=user, project=project, enabled=True).only('role').first()
    if member is None:
        return True
    if member.role in (ProjectMember.PROJECT_ROLE_REVIEWER, ProjectMember.PROJECT_ROLE_ADMIN):
        return False
    return True


def initial_review_status_for_annotation(project, user):
    """Return review_status for a newly created annotation (or None to leave default)."""
    if not project.require_review:
        return None
    if user_annotation_needs_pending_review(project, user):
        return Annotation.ReviewStatus.PENDING
    return Annotation.ReviewStatus.APPROVED
