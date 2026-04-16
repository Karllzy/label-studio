import json
import logging
import os
import sys
from contextlib import nullcontext
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import cv2
import numpy as np
import requests
import torch
from PIL import Image

PACKAGE_ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = Path(os.getenv('SAM3_MODEL_DIR', r'C:\Users\Administrator\.cache\modelscope\hub\models\facebook\sam3___1'))
DEFAULT_SAM3_REPO = Path(os.getenv('SAM3_REPO_DIR', r'C:\Users\Administrator\Developer\sam3'))
DEFAULT_CHECKPOINT = Path(os.getenv('SAM3_CHECKPOINT_PATH', str(DEFAULT_MODEL_DIR / 'sam3.1_multiplex.pt')))
DEFAULT_PORT = int(os.getenv('SAM3_ML_PORT', '9090'))
DEFAULT_THRESHOLD = float(os.getenv('SAM3_SCORE_THRESHOLD', '0.25'))
DEFAULT_MAX_RESULTS = int(os.getenv('SAM3_MAX_RESULTS_PER_LABEL', '10'))
DEFAULT_BASE_DATA_DIR = Path(
    os.getenv('LABEL_STUDIO_BASE_DATA_DIR', r'C:\Users\Administrator\AppData\Local\label-studio\label-studio')
)
DEFAULT_LOG_DIR = Path(os.getenv('SAM3_LOG_DIR', str(PACKAGE_ROOT.parent)))

SAM3_REPO = Path(os.getenv('SAM3_REPO_DIR', str(DEFAULT_SAM3_REPO)))
if str(SAM3_REPO) not in sys.path:
    sys.path.insert(0, str(SAM3_REPO))

from sam3.model.sam3_image_processor import Sam3Processor  # noqa: E402
from sam3.model_builder import build_sam3_image_model  # noqa: E402


def _configure_logger():
    DEFAULT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    logfile = DEFAULT_LOG_DIR / 'sam3_ml_backend.log'
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(logfile, encoding='utf-8'),
        ],
    )
    return logging.getLogger('sam3_ml_backend')


logger = _configure_logger()


class Sam3Backend:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model_version = os.getenv('SAM3_MODEL_VERSION', 'sam3.1_multiplex')
        self.checkpoint_path = Path(os.getenv('SAM3_CHECKPOINT_PATH', str(DEFAULT_CHECKPOINT)))
        self.base_data_dir = Path(os.getenv('LABEL_STUDIO_BASE_DATA_DIR', str(DEFAULT_BASE_DATA_DIR)))
        self.media_dir = self.base_data_dir / 'media'
        self.score_threshold = DEFAULT_THRESHOLD
        self.max_results_per_label = DEFAULT_MAX_RESULTS
        self.model = None
        self.processor = None
        self.labels = []
        self.from_name = None
        self.to_name = None
        self.value_key = None
        self.result_type = None
        self.prompt_from_name = None
        self.prompt_type = None

    def ensure_model(self):
        if self.processor is not None:
            return

        logger.info('Loading SAM3 model from %s on %s', self.checkpoint_path, self.device)
        self.model = build_sam3_image_model(
            checkpoint_path=str(self.checkpoint_path),
            load_from_HF=False,
            device=self.device,
        )
        self.processor = Sam3Processor(self.model)
        logger.info('SAM3 model ready')

    def setup(self, schema):
        parsed = self._parse_label_config(schema)
        self.labels = parsed['labels']
        self.from_name = parsed['from_name']
        self.to_name = parsed['to_name']
        self.value_key = parsed['value_key']
        self.result_type = parsed['result_type']
        self.prompt_from_name = parsed.get('prompt_from_name')
        self.prompt_type = parsed.get('prompt_type')
        self.ensure_model()
        return {
            'model_version': self.model_version,
            'labels': self.labels,
            'from_name': self.from_name,
            'to_name': self.to_name,
            'value_key': self.value_key,
            'result_type': self.result_type,
            'prompt_from_name': self.prompt_from_name,
            'prompt_type': self.prompt_type,
        }

    def predict(self, tasks, label_config, context=None):
        if label_config:
            self.setup(label_config)
        elif not self.labels:
            raise ValueError('Model is not configured. Call /setup first.')

        if context:
            context_results = context.get('result') or []
            logger.info(
                'Interactive context received: annotation_id=%s draft_id=%s user_id=%s results=%s',
                context.get('annotation_id'),
                context.get('draft_id'),
                context.get('user_id'),
                len(context_results),
            )

        results = []
        for task in tasks:
            task_results = self._predict_task(task, context=context)
            results.append(
                {
                    'result': task_results,
                    'score': max([item['score'] for item in task_results], default=0.0),
                    'model_version': self.model_version,
                }
            )
        return {'results': results}

    def _predict_task(self, task, context=None):
        image = self._load_image(task)
        autocast_context = (
            torch.autocast(device_type='cuda', dtype=torch.float16)
            if self.device == 'cuda'
            else nullcontext()
        )

        with autocast_context:
            base_state = self.processor.set_image(image)
        width, height = image.size
        predictions = []
        used_ids = set()
        point_prompts = self._extract_point_prompts(context)
        target_labels = self._resolve_target_labels(context)

        if point_prompts:
            logger.info(
                'Applying %s interactive point prompts for task=%s labels=%s',
                len(point_prompts),
                task.get('id'),
                ','.join(target_labels) if target_labels else 'all',
            )

        for label in (target_labels or self.labels):
            state = self._clone_state(base_state)
            with autocast_context:
                if point_prompts:
                    self.processor.set_text_prompt(prompt=label, state=state)
                    output = self._run_prompted_inference(state, point_prompts)
                else:
                    output = self.processor.set_text_prompt(prompt=label, state=state)
            boxes = output['boxes'].detach().cpu().numpy() if len(output['boxes']) else np.empty((0, 4))
            scores = output['scores'].detach().cpu().numpy() if len(output['scores']) else np.empty((0,))
            masks = output['masks'].detach().cpu().numpy() if len(output['masks']) else np.empty((0, height, width))

            pairs = sorted(
                zip(boxes, scores, masks),
                key=lambda item: float(item[1]),
                reverse=True,
            )
            kept = 0
            for box, score, mask in pairs:
                if kept >= self.max_results_per_label:
                    break
                score = float(score)
                if score < self.score_threshold:
                    continue

                x0, y0, x1, y1 = [float(v) for v in box]
                region_key = (round(x0), round(y0), round(x1), round(y1), label)
                if region_key in used_ids:
                    continue
                used_ids.add(region_key)
                kept += 1

                result = self._build_prediction_result(
                    task_id=task.get('id', 'task'),
                    label=label,
                    index=kept,
                    score=score,
                    width=width,
                    height=height,
                    box=(x0, y0, x1, y1),
                    mask=mask,
                )
                if result:
                    predictions.append(result)

        return predictions

    @staticmethod
    def _clone_state(base_state):
        return {
            'original_height': base_state['original_height'],
            'original_width': base_state['original_width'],
            'backbone_out': dict(base_state['backbone_out']),
        }

    def _run_prompted_inference(self, state, point_prompts):
        if not point_prompts:
            return self.processor._forward_grounding(state)

        if 'geometric_prompt' not in state:
            state['geometric_prompt'] = self.model._get_dummy_prompt()

        points = torch.tensor(
            [[prompt['x'], prompt['y']] for prompt in point_prompts],
            device=self.device,
            dtype=torch.float32,
        ).view(-1, 1, 2)
        labels = torch.tensor(
            [prompt['label'] for prompt in point_prompts],
            device=self.device,
            dtype=torch.long,
        ).view(-1, 1)
        state['geometric_prompt'].append_points(points, labels)
        return self.processor._forward_grounding(state)

    def _extract_point_prompts(self, context):
        if not context:
            return []

        prompts = []
        for item in context.get('result') or []:
            if not isinstance(item, dict):
                continue
            item_type = item.get('type')
            if item_type not in {'keypoint', 'keypointlabels'}:
                continue

            value = item.get('value') or {}
            x = value.get('x')
            y = value.get('y')
            if x is None or y is None:
                continue

            is_positive = item.get('is_positive')
            if is_positive is None:
                is_positive = value.get('is_positive')

            prompts.append(
                {
                    'x': float(x) / 100.0,
                    'y': float(y) / 100.0,
                    'label': 1 if is_positive is not False else 0,
                    'state_labels': list(value.get('keypointlabels') or []),
                }
            )

        return prompts

    def _resolve_target_labels(self, context):
        if not context:
            return []

        matched = []
        for item in context.get('result') or []:
            if not isinstance(item, dict):
                continue
            state_labels = (item.get('value') or {}).get('keypointlabels') or []
            for label in state_labels:
                if label in self.labels and label not in matched:
                    matched.append(label)

        return matched

    def _build_prediction_result(self, task_id, label, index, score, width, height, box, mask):
        if self.result_type == 'rectanglelabels':
            return self._build_rectangle_prediction(task_id, label, index, score, width, height, box)
        if self.result_type == 'polygonlabels':
            return self._build_polygon_prediction(task_id, label, index, score, width, height, mask)
        if self.result_type == 'brushlabels':
            return self._build_brush_prediction(task_id, label, index, score, width, height, mask)
        raise ValueError(f'Unsupported result type: {self.result_type}')

    def _build_rectangle_prediction(self, task_id, label, index, score, width, height, box):
        x0, y0, x1, y1 = box
        width_px = max(x1 - x0, 1.0)
        height_px = max(y1 - y0, 1.0)
        return {
            'id': f'sam3_{task_id}_{label}_{index}',
            'from_name': self.from_name,
            'to_name': self.to_name,
            'type': 'rectanglelabels',
            'score': score,
            'original_width': width,
            'original_height': height,
            'image_rotation': 0,
            'value': {
                'x': x0 / width * 100.0,
                'y': y0 / height * 100.0,
                'width': width_px / width * 100.0,
                'height': height_px / height * 100.0,
                'rotation': 0,
                'rectanglelabels': [label],
            },
        }

    def _build_polygon_prediction(self, task_id, label, index, score, width, height, mask):
        polygons = self._mask_to_polygons(mask)
        if not polygons:
            return None

        points = polygons[0]
        return {
            'id': f'sam3_{task_id}_{label}_{index}',
            'from_name': self.from_name,
            'to_name': self.to_name,
            'type': 'polygonlabels',
            'score': score,
            'original_width': width,
            'original_height': height,
            'image_rotation': 0,
            'value': {
                'points': points,
                'polygonlabels': [label],
            },
        }

    def _build_brush_prediction(self, task_id, label, index, score, width, height, mask):
        rle = self._mask_to_ls_brush_rle(mask)
        if not rle:
            return None

        return {
            'id': f'sam3_{task_id}_{label}_{index}',
            'from_name': self.from_name,
            'to_name': self.to_name,
            'type': 'brushlabels',
            'score': score,
            'original_width': width,
            'original_height': height,
            'image_rotation': 0,
            'value': {
                'format': 'rle',
                'rle': rle,
                'brushlabels': [label],
            },
        }

    @staticmethod
    def _mask_to_polygons(mask):
        mask_array = np.asarray(mask).astype(np.uint8)
        if mask_array.ndim == 3:
            mask_array = np.squeeze(mask_array, axis=0)
        if mask_array.max() == 0:
            return []

        contours_info = cv2.findContours(mask_array, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        contours = contours_info[-2]
        polygons = []

        for contour in contours:
            if contour.shape[0] < 3:
                continue
            flattened = contour.reshape(-1, 2).astype(np.float32) + 0.5
            points = [[float(x / mask_array.shape[1] * 100.0), float(y / mask_array.shape[0] * 100.0)] for x, y in flattened]
            polygons.append(points)

        polygons.sort(key=len, reverse=True)
        return polygons

    @staticmethod
    def _mask_to_ls_brush_rle(mask):
        mask_array = np.asarray(mask).astype(np.uint8)
        if mask_array.ndim == 3:
            mask_array = np.squeeze(mask_array, axis=0)
        if mask_array.max() == 0:
            return []

        grayscale = mask_array * 255
        rgba = np.repeat(grayscale[:, :, None], 4, axis=2).reshape(-1)
        return Sam3Backend._encode_ls_rle(rgba)

    @staticmethod
    def _encode_ls_rle(src, word_size=8, rle_sizes=(3, 4, 8, 16)):
        values = [int(x) for x in np.asarray(src).reshape(-1).tolist()]
        if not values:
            return []

        writer = _BitWriter()
        writer.write(len(values), 32)
        writer.write(word_size - 1, 5)
        for size in rle_sizes:
            writer.write(size - 1, 4)

        rle0, rle1, rle2, rle3 = [1 << size for size in rle_sizes]
        chunk = []
        n1 = len(values) - 1
        val = None
        tail = True
        repeat_count = 0
        i = 0

        def write_rle():
            nonlocal repeat_count
            repeat_type = 0 if repeat_count < rle0 else 1 if repeat_count < rle1 else 2 if repeat_count < rle2 else 3
            writer.write_bit(1)
            writer.write(repeat_type, 2)
            writer.write(repeat_count, rle_sizes[repeat_type])
            writer.write(val, word_size)
            repeat_count = 0

        def write_chunk():
            chunk_len = len(chunk) - 1
            chunk_type = 0 if chunk_len < rle0 else 1 if chunk_len < rle1 else 2 if chunk_len < rle2 else 3
            writer.write_bit(0)
            writer.write(chunk_type, 2)
            writer.write(chunk_len, rle_sizes[chunk_type])
            for item in chunk:
                writer.write(item, word_size)
            chunk.clear()

        for current in values:
            if val is None:
                val = current
            elif current != val:
                if repeat_count > 0:
                    write_rle()
                else:
                    chunk.append(val)
                    if len(chunk) == rle3:
                        write_chunk()
                val = current
            else:
                if chunk:
                    write_chunk()
                repeat_count += 1
                if repeat_count == rle3:
                    repeat_count -= 1
                    write_rle()
                    tail = i < n1

            if i == n1:
                break
            i += 1

        if chunk:
            chunk.append(val)
            write_chunk()
        elif tail:
            write_rle()

        return writer.bytes()

    def _load_image(self, task):
        data = task.get('data') or {}
        image_value = self._extract_image_value(data)
        if not image_value:
            raise ValueError(f"Task {task.get('id')} does not contain an image-like field: {data}")

        if isinstance(image_value, str) and image_value.startswith('/data/upload/'):
            local_path = self.media_dir / image_value.removeprefix('/data/')
            if local_path.exists():
                return Image.open(local_path).convert('RGB')

        if isinstance(image_value, str) and Path(image_value).exists():
            return Image.open(image_value).convert('RGB')

        if isinstance(image_value, str) and image_value.startswith(('http://', 'https://')):
            response = requests.get(image_value, timeout=30)
            response.raise_for_status()
            return Image.open(BytesIO(response.content)).convert('RGB')

        raise ValueError(f"Unsupported image source for task {task.get('id')}: {image_value}")

    def _extract_image_value(self, data):
        if self.value_key:
            key = self.value_key.lstrip('$')
            if key in data and isinstance(data[key], str):
                return data[key]

        for value in data.values():
            if isinstance(value, str) and value.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp')):
                return value
        return None

    @staticmethod
    def _parse_label_config(schema):
        root = ET.fromstring(schema)
        image_tag = next((node for node in root.iter() if node.tag == 'Image'), None)
        result_tag = next(
            (
                node
                for node in root.iter()
                if node.tag in {'RectangleLabels', 'PolygonLabels', 'BrushLabels'}
            ),
            None,
        )
        prompt_tag = next(
            (node for node in root.iter() if node.tag in {'KeyPoint', 'KeyPointLabels'}),
            None,
        )
        if image_tag is None or result_tag is None:
            raise ValueError('Current backend supports Image projects with RectangleLabels, PolygonLabels, or BrushLabels.')

        labels = [node.attrib.get('value') for node in result_tag if node.tag == 'Label' and node.attrib.get('value')]
        if not labels:
            raise ValueError(f'No labels found in {result_tag.tag} config.')

        return {
            'labels': labels,
            'from_name': result_tag.attrib['name'],
            'to_name': result_tag.attrib['toName'],
            'value_key': image_tag.attrib.get('value'),
            'result_type': result_tag.tag.lower(),
            'prompt_from_name': prompt_tag.attrib.get('name') if prompt_tag is not None else None,
            'prompt_type': prompt_tag.tag if prompt_tag is not None else None,
        }


class _BitWriter:
    def __init__(self):
        self._bytes = bytearray()
        self._current = 0
        self._bit_count = 0

    def write_bit(self, bit):
        self._current = (self._current << 1) | (1 if bit else 0)
        self._bit_count += 1
        if self._bit_count == 8:
            self._bytes.append(self._current)
            self._current = 0
            self._bit_count = 0

    def write(self, value, width):
        for offset in range(width - 1, -1, -1):
            self.write_bit((value >> offset) & 1)

    def bytes(self):
        if self._bit_count:
            self._bytes.append(self._current << (8 - self._bit_count))
            self._current = 0
            self._bit_count = 0
        return list(self._bytes)


BACKEND = Sam3Backend()


class Handler(BaseHTTPRequestHandler):
    server_version = 'SAM3LabelStudioBackend/0.1'

    def _send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length else b'{}'
        return json.loads(raw.decode('utf-8'))

    def do_GET(self):
        path = urlparse(self.path).path.rstrip('/')
        if path == '/health':
            self._send_json(
                {
                    'status': 'UP',
                    'device': BACKEND.device,
                    'model_version': BACKEND.model_version,
                    'checkpoint_path': str(BACKEND.checkpoint_path),
                }
            )
            return

        if path == '/versions':
            self._send_json({'versions': [BACKEND.model_version]})
            return

        self._send_json({'error': f'Unknown GET endpoint: {path}'}, status=404)

    def do_POST(self):
        path = urlparse(self.path).path.rstrip('/')
        try:
            payload = self._read_json()

            if path == '/setup':
                result = BACKEND.setup(payload.get('schema', ''))
                self._send_json(result)
                return

            if path == '/predict':
                params = payload.get('params') or {}
                result = BACKEND.predict(
                    payload.get('tasks') or [],
                    payload.get('label_config'),
                    payload.get('context') or params.get('context'),
                )
                self._send_json(result)
                return

            if path == '/train':
                self._send_json({'job': None, 'status': 'not_implemented'})
                return

            if path == '/webhook':
                self._send_json({'ok': True})
                return

            self._send_json({'error': f'Unknown POST endpoint: {path}'}, status=404)
        except Exception as exc:
            logger.exception('Request failed')
            self._send_json({'error': str(exc)}, status=500)


def main():
    logger.info('Starting SAM3 ML backend on port %s', DEFAULT_PORT)
    server = ThreadingHTTPServer(('127.0.0.1', DEFAULT_PORT), Handler)
    server.serve_forever()


if __name__ == '__main__':
    main()
