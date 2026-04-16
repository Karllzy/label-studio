# Generated manually for Task.pending_review denormalization

from django.db import migrations, models


def backfill_pending_review(apps, schema_editor):
    Task = apps.get_model('tasks', 'Task')
    Annotation = apps.get_model('tasks', 'Annotation')
    Task.objects.all().update(pending_review=False)
    task_ids = list(
        Annotation.objects.filter(was_cancelled=False, review_status='pending')
        .exclude(task_id__isnull=True)
        .values_list('task_id', flat=True)
        .distinct()
    )
    batch_size = 500
    for i in range(0, len(task_ids), batch_size):
        Task.objects.filter(pk__in=task_ids[i : i + batch_size]).update(pending_review=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0062_annotation_review_comment_annotation_review_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='pending_review',
            field=models.BooleanField(
                default=False,
                help_text='True if the task has at least one non-cancelled annotation awaiting review',
                verbose_name='pending review',
            ),
        ),
        migrations.AddIndex(
            model_name='task',
            index=models.Index(fields=['project', 'pending_review'], name='task_project_pending_rev_idx'),
        ),
        migrations.RunPython(backfill_pending_review, noop_reverse),
    ]
