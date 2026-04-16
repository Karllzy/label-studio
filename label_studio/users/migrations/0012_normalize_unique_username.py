from django.db import migrations, models


def normalize_username(value: str) -> str:
    return '_'.join((value or '').strip().lower().split())


def populate_unique_usernames(apps, schema_editor):
    User = apps.get_model('users', 'User')
    seen = set()

    for user in User.objects.all().order_by('id'):
        base_username = normalize_username(user.username) or normalize_username((user.email or '').split('@', 1)[0]) or 'user'
        username = base_username
        suffix = 1

        while username in seen:
            username = f'{base_username}{suffix}'
            suffix += 1

        seen.add(username)
        user.username = username
        user.save(update_fields=['username'])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_user_custom_hotkeys'),
    ]

    operations = [
        migrations.RunPython(populate_unique_usernames, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='username',
            field=models.CharField(max_length=256, unique=True, verbose_name='username'),
        ),
    ]
