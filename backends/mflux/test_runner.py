import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from runner import validate_request, model_entry
from diagnostics import parse_vm_stat, memory_delta

class RequestTests(unittest.TestCase):
    def test_native_edit_requires_aligned_mask_and_passes_it_to_model(self):
        model = {'model_meta_data': {'tasks':['txt2img','img2img','inpainting'], 'mask_mode':'native', 'edit_mode':'instruction'}}
        with tempfile.TemporaryDirectory() as directory, patch('runner.model_entry', return_value=model):
            source, mask = Path(directory)/'source.png', Path(directory)/'mask.png'
            Image.new('RGB', (768,512)).save(source)
            request = {'selected_sd_model':'test', 'prompt':'Make the cup blue',
                       'applet_name':'inpainting', 'input_img':str(source), 'mask_image_path':str(mask)}
            with self.assertRaisesRegex(ValueError, 'mask is missing'): validate_request(request)
            Image.new('L', (512,512)).save(mask)
            with self.assertRaisesRegex(ValueError, 'dimensions'): validate_request(request)
            Image.new('L', (768,512)).save(mask)
            _, options = validate_request(request)
            self.assertEqual(options['mask_path'], str(mask))
            self.assertEqual(options['image_paths'], [str(source)])
            _, options = validate_request(dict(request, edit_operation='retouch', mask_image_path='/missing'))
            self.assertNotIn('mask_path', options)
            self.assertEqual(options['image_paths'], [str(source)])
            with self.assertRaisesRegex(ValueError, 'Unknown edit mode'):
                validate_request(dict(request, edit_operation='invalid'))
            _, options = validate_request(dict(request, applet_name='img2img'))
            self.assertNotIn('mask_path', options)
            _, options = validate_request(dict(request, applet_name='txt2img'))
            self.assertNotIn('image_paths', options)

    def test_qwen_edit_dimensions_and_mask_routing(self):
        model = {'model_meta_data': {'sd_type':'qwen_image_21_turbo', 'tasks':['img2img','inpainting'],
                 'mask_mode':'native', 'edit_mode':'instruction', 'min_edit_resolution':1024,
                 'dimension_multiple':32, 'steps':8}}
        with tempfile.TemporaryDirectory() as directory, patch('runner.model_entry', return_value=model):
            source, mask = Path(directory)/'source.png', Path(directory)/'mask.png'
            Image.new('RGB',(1024,576)).save(source);Image.new('L',(1024,576)).save(mask)
            request = {'selected_sd_model':'test','prompt':'Make the cup blue','applet_name':'inpainting',
                       'input_img':str(source),'mask_image_path':str(mask),'img_width':1024,'img_height':576}
            _, options = validate_request(request)
            self.assertEqual(options['mask_image'],str(mask));self.assertNotIn('mask_path',options)
            self.assertEqual(options['num_inference_steps'],8)
            _, options = validate_request(dict(request,edit_operation='retouch'))
            self.assertNotIn('mask_image',options)
            for dims in [(512,320),(1024,560)]:
                with self.assertRaisesRegex(ValueError,'working size'):
                    validate_request(dict(request,img_width=dims[0],img_height=dims[1]))

    def test_system_memory_observations(self):
        before = parse_vm_stat('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPageouts: 2.\nSwapouts: 3.\nCompressions: 5.')
        self.assertEqual(before['Swapouts'], 3*16384)
        self.assertEqual(memory_delta(before, dict(before, Swapouts=4*16384))['Swapouts'], 16384)
        self.assertIsNone(parse_vm_stat('unavailable'))
        self.assertIsNone(memory_delta(None, before))

    def test_supported_image_request(self):
        model, options = validate_request({'selected_sd_model':'mflux-flux2-klein-4b-4bit',
            'prompt':'A café in rain', 'img_width':768, 'img_height':512})
        self.assertEqual(options['prompt'], 'A café in rain')
        self.assertEqual((options['width'],options['height']),(768,512))
        self.assertEqual(model['model_meta_data']['engine'],'mflux')

    def test_unsupported_model_rejected(self):
        with self.assertRaisesRegex(ValueError, 'not supported'): model_entry('some-chat-model')

    def test_bad_inputs_rejected(self):
        for extra in [{'prompt':''},{'img_width':769},{'num_steps':0},{'applet_name':'chat'},{'applet_name':'img2img','input_img':'/missing.png'}]:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                validate_request({'selected_sd_model':'mflux-flux2-klein-4b-4bit','prompt':'test',**extra})

if __name__ == '__main__': unittest.main()
