"""Keep Task.pending_review in sync with Annotation.review_status."""

from __future__ import annotations


def refresh_task_pending_review_flags(*task_ids: int) -> None:
    """Recompute pending_review for each task id from current annotations."""
    from tasks.models import Annotation, Task

    unique = {tid for tid in task_ids if tid is not None}
    if not unique:
        return

    for task_id in unique:
        has_pending = Annotation.objects.filter(
            task_id=task_id,
            was_cancelled=False,
            review_status=Annotation.ReviewStatus.PENDING,
        ).exists()
        Task.objects.filter(pk=task_id).update(pending_review=has_pending)
