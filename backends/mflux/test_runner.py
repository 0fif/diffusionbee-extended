import unittest
from runner import validate_request, model_entry

class RequestTests(unittest.TestCase):
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
