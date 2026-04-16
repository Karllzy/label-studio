"""Signals for tasks app."""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from tasks.models import Annotation, post_bulk_create
from tasks.pending_review_sync import refresh_task_pending_review_flags


@receiver(post_save, sender=Annotation)
def annotation_post_save_sync_pending_review(sender, instance, **kwargs):
    if instance.task_id:
        refresh_task_pending_review_flags(instance.task_id)


@receiver(post_delete, sender=Annotation)
def annotation_post_delete_sync_pending_review(sender, instance, **kwargs):
    if instance.task_id:
        refresh_task_pending_review_flags(instance.task_id)


@receiver(post_bulk_create, sender=Annotation)
def annotation_post_bulk_create_sync_pending_review(sender, objs, **kwargs):
    task_ids = [o.task_id for o in objs if getattr(o, 'task_id', None)]
    if task_ids:
        refresh_task_pending_review_flags(*task_ids)
