"""Assign project creator to legacy views with no owner so per-user tab isolation can apply."""

from django.db import migrations


def backfill_view_users(apps, schema_editor):
    View = apps.get_model('data_manager', 'View')
    Project = apps.get_model('projects', 'Project')

    for view in View.objects.filter(user__isnull=True).iterator(chunk_size=500):
        try:
            project = Project.objects.only('created_by_id').get(pk=view.project_id)
        except Project.DoesNotExist:
            continue
        if project.created_by_id:
            View.objects.filter(pk=view.pk).update(user_id=project.created_by_id)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('data_manager', '0018_remove_allow_skip'),
    ]

    operations = [
        migrations.RunPython(backfill_view_users, noop_reverse),
    ]
