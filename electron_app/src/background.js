'use strict'


import { app, protocol, net, BrowserWindow, nativeTheme, Menu} from 'electron'
import contextMenu from 'electron-context-menu'

const electronLocalshortcut = require('electron-localshortcut')
import settings from 'electron-settings';


import { start_bridge, bind_window_bridge } from './bridge.js'
import { bind_window_native_functions } from "./native_functions.js"

start_bridge();


let is_windows = process.platform.startsWith('win');

const path = require('path');

let win;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
	{ scheme: 'app', privileges: { secure: true, standard: true } }
])


import {menu_template} from "./menu_template"
Menu.setApplicationMenu(Menu.buildFromTemplate(menu_template))




function save_window_size() {
	if( !win || !win.savable )
		return;
	let windowState = win.getBounds();
	windowState.isMaximized = win.isMaximized();
	settings.set('windowPosState', windowState);
}

contextMenu({
	showSaveImageAs: true
});

async function createWindow() {
	// Create the browser window.
	win = new BrowserWindow({
		width: 800,
		height: 600,
		minWidth: 770,
		minHeight: 550,
		titleBarStyle : (is_windows ) ? 'default' : 'hidden' , 
		titleBarOverlay : is_windows, 
		maximizable : false,
		trafficLightPosition: { x: 18, y: 20 },
		webPreferences: {
			webSecurity: false,

			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			preload: path.join(__dirname, 'preload.js'),
		}
	});

    bind_window_bridge(win);
    bind_window_native_functions(win);
    win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    win.webContents.on('will-navigate', (event, url) => {
        const expected = process.env.WEBPACK_DEV_SERVER_URL || 'app://./index.html';
        if (url.split('#')[0] !== expected.split('#')[0]) event.preventDefault();
    });
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

	win.on('closed', () => { win = null; app.quit(); });
	win.removeMenu(); // remove the menu ( works for windows! )

	electronLocalshortcut.register(win, ['CommandOrControl+R','CommandOrControl+Shift+R', 'F5'], () => {}) //  make the refresh shortcuts blank

	
	win.setSize(770, 550);
	// win.setResizable(false);
	win.setMaximizable(false);

	// save the window state on resize , move, etc 
	['resize', 'move'].forEach(event => {
	  win.on(event, save_window_size);
	});


	win.on('close', function(e) {
		if(win.show_dialog_on_quit){

			let message = 'Are you sure you want to quit?';
			if(win.dialog_on_msg)
				message = win.dialog_on_msg;

			const choice = require('electron').dialog.showMessageBoxSync(this, {
				type: 'question',
				buttons: ['Yes', 'No'],
                defaultId: 1, cancelId: 1,
				title: 'Confirm',
				message: message
			});
			if (choice === 1) {
				e.preventDefault();
			}
		}
	});



	if(is_windows){
		nativeTheme.themeSource = 'light';
	} else {
		nativeTheme.themeSource = 'system';
	}
	

	if (process.env.WEBPACK_DEV_SERVER_URL) {
		// Load the url of the dev server if in development mode
		await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
		if (!process.env.IS_TEST) win.webContents.openDevTools()
	} else {
		if (!await protocol.isProtocolHandled('app')) {
            protocol.handle('app', request => {
                const relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
                const file = path.resolve(__dirname, relative);
                if (!file.startsWith(__dirname + path.sep)) return new Response('Forbidden', {status:403});
                return net.fetch(require('url').pathToFileURL(file).href);
            });
        }
		// Load the index.html when not in development
		win.loadURL('app://./index.html')
	}
}


app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})




// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
	createWindow();

})

// set the about panel 
app.setAboutPanelOptions({
	applicationName: require('../package.json').name, 
	applicationVersion: require('../package.json').version,
	version: require('../package.json').build_number,
	credits: require('../package.json').description,
	copyright: "Copyright © 2023 " + require('../package.json').name,
	website: require('../package.json').website
});





// Exit cleanly on request from parent process in development mode.
if (process.env.NODE_ENV !== 'production') {
	if (process.platform === 'win32') {
		process.on('message', (data) => {
			if (data === 'graceful-exit') {
				app.quit()
			}
		})
	} else {
		process.on('SIGTERM', () => {
			app.quit()
		})
	}
}