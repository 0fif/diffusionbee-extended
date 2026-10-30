import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from runner import install


class InstallTests(unittest.TestCase):
    def test_partial_download_never_installed_and_retry_reuses_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            request = {'id':'mflux-flux2-klein-4b-4bit', 'models_dir':directory}
            target = Path(directory)/request['id']
            events = []
            def download(*args, **kwargs):
                target.mkdir(exist_ok=True)
                self.assertEqual(Path(kwargs['local_dir']), target)
                bar = kwargs['tqdm_class'](desc='Downloading bytes', unit='B', total=7)
                bar.update(7);bar.close()
                if not (target/'partial').exists():
                    (target/'partial').write_text('reuse')
                    raise RuntimeError('network interruption')
                (target/'weights.safetensors').write_text('weights')
            with patch('huggingface_hub.HfApi') as api, patch('huggingface_hub.snapshot_download', side_effect=download), patch('runner.emit', side_effect=lambda event, **values:events.append((event,values))):
                api.return_value.model_info.return_value = SimpleNamespace(sha='test-revision')
                with self.assertRaises(RuntimeError): install(request)
                self.assertFalse((target/'.installed.json').exists())
                install(request)
            marker = json.loads((target/'.installed.json').read_text())
            self.assertEqual(marker['files']['weights.safetensors'],7)
            self.assertTrue(any(event=='download' and values['transferred_bytes']==7 for event,values in events))
