import json
import tempfile

from data_import.models import ChunkedUpload, FileUpload
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from organizations.models import Organization, OrganizationMember
from projects.models import Project
from rest_framework.test import APIClient
from tasks.models import Task
from users.models import User


class ChunkedUploadAPITest(TestCase):
    def setUp(self):
        self.media_root = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root.name)
        self.settings_override.enable()

        self.user = User.objects.create_user(email='chunked@example.com', password='test')
        self.organization = Organization.objects.create(title='Chunked upload', created_by=self.user)
        OrganizationMember.objects.create(
            organization=self.organization,
            user=self.user,
            role=OrganizationMember.ORG_ROLE_OWNER,
        )
        self.user.active_organization = self.organization
        self.user.save(update_fields=['active_organization'])
        self.project = Project.objects.create(
            organization=self.organization,
            created_by=self.user,
            title='Chunked upload project',
            label_config='<View><Text name="text" value="$text"/></View>',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.urls = {
            'init': reverse(
                'data_import:api-projects:project-chunked-upload-init',
                kwargs={'pk': self.project.id},
            ),
            'upload': reverse(
                'data_import:api-projects:project-chunked-upload-part',
                kwargs={'pk': self.project.id},
            ),
            'complete': reverse(
                'data_import:api-projects:project-chunked-upload-complete',
                kwargs={'pk': self.project.id},
            ),
        }

    def tearDown(self):
        self.settings_override.disable()
        self.media_root.cleanup()

    def test_rejects_path_filename(self):
        response = self.client.post(
            self.urls['init'],
            {'filename': '../tasks.json', 'total_size': 10, 'total_chunks': 1},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ChunkedUpload.objects.count(), 0)

    def test_counts_unique_chunks_and_validates_index(self):
        init = self.client.post(
            self.urls['init'],
            {'filename': 'tasks.json', 'total_size': 4, 'total_chunks': 2},
            format='json',
        )
        upload_id = init.json()['upload_id']

        first = self.client.post(
            self.urls['upload'],
            {
                'upload_id': upload_id,
                'chunk_index': 0,
                'chunk': SimpleUploadedFile('chunk-0', b'ab'),
            },
            format='multipart',
        )
        repeated = self.client.post(
            self.urls['upload'],
            {
                'upload_id': upload_id,
                'chunk_index': 0,
                'chunk': SimpleUploadedFile('chunk-0', b'ab'),
            },
            format='multipart',
        )
        invalid = self.client.post(
            self.urls['upload'],
            {
                'upload_id': upload_id,
                'chunk_index': 2,
                'chunk': SimpleUploadedFile('chunk-2', b'cd'),
            },
            format='multipart',
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json()['uploaded_chunks'], 1)
        self.assertEqual(invalid.status_code, 400)

    def test_complete_commits_tasks(self):
        content = json.dumps([{'data': {'text': 'hello'}}]).encode()
        midpoint = len(content) // 2
        chunks = [content[:midpoint], content[midpoint:]]
        init = self.client.post(
            self.urls['init'],
            {'filename': 'tasks.json', 'total_size': len(content), 'total_chunks': len(chunks)},
            format='json',
        )
        upload_id = init.json()['upload_id']

        for index, chunk in enumerate(chunks):
            response = self.client.post(
                self.urls['upload'],
                {
                    'upload_id': upload_id,
                    'chunk_index': index,
                    'chunk': SimpleUploadedFile(f'chunk-{index}', chunk),
                },
                format='multipart',
            )
            self.assertEqual(response.status_code, 200)

        complete = self.client.post(
            self.urls['complete'],
            {'upload_id': upload_id, 'commit_to_project': True},
            format='json',
        )

        self.assertEqual(complete.status_code, 201)
        self.assertEqual(complete.json()['task_count'], 1)
        self.assertTrue(complete.json()['file_upload_ids'])
        self.assertTrue(Task.objects.filter(project=self.project, data={'text': 'hello'}).exists())
        self.assertEqual(FileUpload.objects.filter(project=self.project).count(), 1)
        self.assertEqual(
            ChunkedUpload.objects.get(upload_id=upload_id).status,
            ChunkedUpload.Status.COMPLETED,
        )
