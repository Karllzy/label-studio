"""Authentication backends for users."""

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q


class EmailOrUsernameBackend(ModelBackend):
    """Allow authentication with either username or email."""

    def authenticate(self, request, username=None, password=None, email=None, **kwargs):
        identifier = (email or username or kwargs.get('identifier') or '').strip()
        if not identifier or not password:
            return None

        user_model = get_user_model()
        queryset = user_model._default_manager.filter(Q(email__iexact=identifier) | Q(username__iexact=identifier))
        user = queryset.order_by('id').first()

        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user

        return None
