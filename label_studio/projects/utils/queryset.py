from django.db.models import Q

from organizations.models import OrganizationMember
from projects.models import Project


def projects_for_user(user, org=None):
    """Return a Project queryset scoped to what this user is allowed to see.

    - Superusers see all projects in the org.
    - Org owners / admins see all projects in their org.
    - Regular org members see only projects where they are a ProjectMember.
    """
    if org is None:
        org = user.active_organization
    if org is None:
        return Project.objects.none()

    base_qs = Project.objects.filter(organization=org)

    if user.is_superuser:
        return base_qs

    org_member = OrganizationMember.objects.filter(
        user=user, organization=org, deleted_at__isnull=True,
    ).first()

    if org_member is None:
        return Project.objects.none()

    if org_member.role in (OrganizationMember.ORG_ROLE_OWNER, OrganizationMember.ORG_ROLE_ADMIN):
        return base_qs

    return base_qs.filter(
        Q(members__user=user, members__enabled=True)
    ).distinct()
