

function native_confirm(message){
	return window.ipcRenderer.sendSync('native_confirm', message );
}

function native_alert(message){
	return window.ipcRenderer.sendSync('native_alert', message );
}

function save_image_data(encoded, temporary = false) {
    const filename = window.ipcRenderer.sendSync('save_b64_image', encoded, temporary);
    if (!filename) throw new Error('Could not save image data. Check available disk space and folder permissions.');
    return filename;
}

export { native_confirm , native_alert, save_image_data }
